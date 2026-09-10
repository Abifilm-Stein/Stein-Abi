import { Injectable } from '@angular/core';
import { runtimeConfig } from '../runtime-config';
import {
  UploadAbortedError,
  UploadRejectedError,
  UploadRequest,
  UploadResult,
  UploadTarget,
  UploadTask,
} from './upload-target';

const TUS_VERSION = '1.0.0';

/**
 * Minimum part size for S3-backed tus servers (Supabase Storage included).
 * Every chunk except the last must be at least 5 MiB, so 6 MiB gives headroom
 * without making a resume lose much work.
 */
const CHUNK_SIZE = 6 * 1024 * 1024;

/**
 * Resumable upload over the tus 1.0.0 core protocol, implemented on
 * `fetch` + `XMLHttpRequest` with no third-party client.
 *
 * Why XHR for the data chunks: `fetch` cannot report upload progress. On a
 * 6 MiB chunk that would mean the progress bar freezing for seconds at a
 * time on a phone connection, which reads as "stuck" and gets the upload
 * cancelled by the user. XHR's `upload.onprogress` gives byte-level feedback.
 */
@Injectable()
export class TusUploadTarget implements UploadTarget {
  start(request: UploadRequest): UploadTask {
    const controller = new AbortController();
    let activeXhr: XMLHttpRequest | undefined;

    const done = this.run(request, controller.signal, (xhr) => (activeXhr = xhr));

    return {
      done,
      abort: () => {
        controller.abort();
        activeXhr?.abort();
      },
    };
  }

  private async run(
    request: UploadRequest,
    signal: AbortSignal,
    trackXhr: (xhr: XMLHttpRequest) => void,
  ): Promise<UploadResult> {
    const { file } = request;

    let sessionUrl = request.resumeUrl;
    let offset = 0;

    if (sessionUrl) {
      const resumed = await this.headOffset(sessionUrl, signal);
      if (resumed === undefined) {
        // Session expired or was garbage-collected server side: start over.
        sessionUrl = undefined;
      } else {
        offset = resumed;
      }
    }

    if (!sessionUrl) {
      sessionUrl = await this.createSession(file, signal);
      request.onSession(sessionUrl);
      offset = 0;
    }

    request.onProgress({ bytesSent: offset, bytesTotal: file.size, bytesPerSecond: 0 });

    while (offset < file.size) {
      throwIfAborted(signal);

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const chunkStart = offset;
      const startedAt = performance.now();

      const newOffset = await this.patchChunk(
        sessionUrl,
        file.slice(chunkStart, end),
        chunkStart,
        signal,
        trackXhr,
        (bytesInChunk) => {
          const sent = chunkStart + bytesInChunk;
          const seconds = (performance.now() - startedAt) / 1000;
          request.onProgress({
            bytesSent: sent,
            bytesTotal: file.size,
            bytesPerSecond: seconds > 0.2 ? bytesInChunk / seconds : 0,
          });
        },
      );

      if (newOffset <= offset) {
        throw new Error('Der Server hat den Upload nicht weitergezählt.');
      }
      offset = newOffset;
    }

    return { storagePath: storagePathFrom(sessionUrl, file) };
  }

  /** Returns the current offset, or `undefined` if the session is gone. */
  private async headOffset(sessionUrl: string, signal: AbortSignal): Promise<number | undefined> {
    const response = await fetch(sessionUrl, {
      method: 'HEAD',
      headers: { 'Tus-Resumable': TUS_VERSION },
      signal,
    });

    if (response.status === 404 || response.status === 410 || response.status === 403) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Upload konnte nicht fortgesetzt werden (HTTP ${response.status}).`);
    }

    const offset = Number(response.headers.get('Upload-Offset'));
    return Number.isFinite(offset) && offset >= 0 ? offset : undefined;
  }

  private async createSession(file: File, signal: AbortSignal): Promise<string> {
    const response = await fetch(runtimeConfig.uploadEndpoint, {
      method: 'POST',
      headers: {
        'Tus-Resumable': TUS_VERSION,
        'Upload-Length': String(file.size),
        'Upload-Metadata': encodeMetadata({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      },
      signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new UploadRejectedError(
        'Der Zugangscode wurde nicht akzeptiert. Bitte lade die Seite neu.',
      );
    }
    if (response.status === 413) {
      throw new UploadRejectedError('Die Datei ist für den Server zu groß.');
    }
    if (!response.ok) {
      throw new Error(`Upload konnte nicht gestartet werden (HTTP ${response.status}).`);
    }

    const location = response.headers.get('Location');
    if (!location) {
      throw new Error('Der Server hat keine Upload-Adresse zurückgegeben.');
    }
    return new URL(location, runtimeConfig.uploadEndpoint).toString();
  }

  private patchChunk(
    sessionUrl: string,
    chunk: Blob,
    offset: number,
    signal: AbortSignal,
    trackXhr: (xhr: XMLHttpRequest) => void,
    onProgress: (bytesInChunk: number) => void,
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      if (signal.aborted) {
        reject(new UploadAbortedError());
        return;
      }

      const xhr = new XMLHttpRequest();
      trackXhr(xhr);

      xhr.open('PATCH', sessionUrl, true);
      xhr.setRequestHeader('Tus-Resumable', TUS_VERSION);
      xhr.setRequestHeader('Upload-Offset', String(offset));
      xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');

      const onAbortSignal = () => xhr.abort();
      signal.addEventListener('abort', onAbortSignal, { once: true });

      const cleanup = () => signal.removeEventListener('abort', onAbortSignal);

      xhr.upload.onprogress = (event) => onProgress(event.loaded);

      xhr.onload = () => {
        cleanup();
        if (xhr.status === 409) {
          // Offset conflict: the caller re-reads the offset and retries.
          reject(new Error('Der Upload-Stand hat nicht übereingestimmt.'));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Übertragung fehlgeschlagen (HTTP ${xhr.status}).`));
          return;
        }
        const next = Number(xhr.getResponseHeader('Upload-Offset'));
        if (!Number.isFinite(next)) {
          reject(new Error('Der Server hat keinen gültigen Upload-Stand gemeldet.'));
          return;
        }
        resolve(next);
      };

      xhr.onerror = () => {
        cleanup();
        reject(new Error('Netzwerkfehler bei der Übertragung.'));
      };
      xhr.ontimeout = () => {
        cleanup();
        reject(new Error('Zeitüberschreitung bei der Übertragung.'));
      };
      xhr.onabort = () => {
        cleanup();
        reject(new UploadAbortedError());
      };

      xhr.send(chunk);
    });
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new UploadAbortedError();
}

/** tus wants `key <base64>` pairs, comma separated, values UTF-8 safe. */
function encodeMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${base64Utf8(value)}`)
    .join(',');
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function storagePathFrom(sessionUrl: string, file: File): string {
  const id = sessionUrl.split('/').pop() || crypto.randomUUID();
  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  // Never reuse the original filename for the stored object -- it is
  // user-controlled. It is kept as metadata on the asset record instead.
  return `${id}${extension.toLowerCase()}`;
}
