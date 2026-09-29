import { inject, Injectable } from '@angular/core';
import { SessionService } from '../account/session.service';
import { runtimeConfig } from '../runtime-config';
import {
  UploadAbortedError,
  UploadRejectedError,
  UploadRequest,
  UploadResult,
  UploadTarget,
  UploadTask,
} from './upload-target';

/**
 * Google Cloud Storage requires every chunk except the last to be a multiple
 * of 256 KiB. 6 MiB satisfies that (24 x 256 KiB) and keeps a resume from
 * losing much work.
 */
const CHUNK_SIZE = 6 * 1024 * 1024;

/**
 * Resumable upload straight to Google Cloud Storage.
 *
 * Replaces the tus implementation: GCS speaks its own resumable protocol,
 * which is structurally the same idea -- a session URI plus byte offsets --
 * so the queue, retry and pause/resume logic above it is untouched. That is
 * what the `UploadTarget` seam was for.
 *
 * Flow:
 *   1. ask our API for an upload session (the only authenticated step)
 *   2. PUT the bytes directly to the session URI, in chunks
 *
 * The session URI is a capability for exactly one object and expires after a
 * week, so the browser never holds credentials and the bytes never pass
 * through Cloud Run.
 */
@Injectable()
export class GcsUploadTarget implements UploadTarget {
  private readonly session = inject(SessionService);

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

    let sessionUri = request.resumeUrl;
    let offset = 0;

    if (sessionUri) {
      const resumed = await this.queryOffset(sessionUri, file.size, signal);
      if (resumed === undefined) sessionUri = undefined;
      else offset = resumed;
    }

    if (!sessionUri) {
      sessionUri = await this.createSession(file, signal);
      request.onSession(sessionUri);
      offset = 0;
    }

    request.onProgress({ bytesSent: offset, bytesTotal: file.size, bytesPerSecond: 0 });

    // A zero-byte file would produce an invalid Content-Range; the queue
    // rejects those before they get here, but be explicit.
    if (file.size === 0) throw new UploadRejectedError('Die Datei ist leer.');

    while (offset < file.size) {
      if (signal.aborted) throw new UploadAbortedError();

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const chunkStart = offset;
      const startedAt = performance.now();

      const result = await this.putChunk(
        sessionUri,
        file.slice(chunkStart, end),
        chunkStart,
        end - 1,
        file.size,
        signal,
        trackXhr,
        (bytesInChunk) => {
          const seconds = (performance.now() - startedAt) / 1000;
          request.onProgress({
            bytesSent: chunkStart + bytesInChunk,
            bytesTotal: file.size,
            bytesPerSecond: seconds > 0.2 ? bytesInChunk / seconds : 0,
          });
        },
      );

      if (result.complete) {
        request.onProgress({
          bytesSent: file.size,
          bytesTotal: file.size,
          bytesPerSecond: 0,
        });
        return { storagePath: objectNameFrom(sessionUri) };
      }

      if (result.nextOffset <= offset) {
        throw new Error('Der Server hat den Upload nicht weitergezählt.');
      }
      offset = result.nextOffset;
    }

    return { storagePath: objectNameFrom(sessionUri) };
  }

  /** Asks our API to open a session. The only step that needs the token. */
  private async createSession(file: File, signal: AbortSignal): Promise<string> {
    const token = this.session.token();
    if (!token) throw new UploadRejectedError('Du bist nicht mehr angemeldet.');

    const base = runtimeConfig.apiBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${base}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      }),
      signal,
    });

    if (response.status === 401) {
      throw new UploadRejectedError('Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.');
    }
    if (response.status === 429) {
      throw new UploadRejectedError(
        'Stundenlimit erreicht. Bitte lade die restlichen Dateien später hoch.',
      );
    }
    if (!response.ok) {
      throw new Error(`Upload konnte nicht gestartet werden (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as { sessionUri?: string };
    if (!body.sessionUri) throw new Error('Der Server hat keine Upload-Adresse zurückgegeben.');
    return body.sessionUri;
  }

  /**
   * Ask GCS how much it already has.
   *
   * A PUT with `Content-Range: bytes *​/total` and no body is the status
   * query. 308 means incomplete and the `Range` header gives the last byte
   * received; 200/201 means it is already done; 404/410 means the session is
   * gone and we start over.
   *
   * @returns the next byte offset, or `undefined` if the session expired
   */
  private async queryOffset(
    sessionUri: string,
    total: number,
    signal: AbortSignal,
  ): Promise<number | undefined> {
    const response = await fetch(sessionUri, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes */${total}` },
      signal,
    });

    if (response.status === 200 || response.status === 201) return total;
    if (response.status === 404 || response.status === 410) return undefined;

    // 308 Resume Incomplete. `fetch` surfaces it as a normal response.
    if (response.status === 308) {
      const range = response.headers.get('Range');
      if (!range) return 0; // Nothing stored yet.
      const match = /bytes=0-(\d+)/.exec(range);
      return match?.[1] ? Number(match[1]) + 1 : 0;
    }

    return undefined;
  }

  /**
   * Upload one chunk.
   *
   * XHR rather than `fetch` because `fetch` cannot report upload progress. On
   * a 6 MiB chunk that means the bar freezing for seconds on a phone
   * connection, which reads as "stuck" and gets the upload cancelled.
   */
  private putChunk(
    sessionUri: string,
    chunk: Blob,
    start: number,
    end: number,
    total: number,
    signal: AbortSignal,
    trackXhr: (xhr: XMLHttpRequest) => void,
    onProgress: (bytesInChunk: number) => void,
  ): Promise<{ complete: boolean; nextOffset: number }> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new UploadAbortedError());
        return;
      }

      const xhr = new XMLHttpRequest();
      trackXhr(xhr);

      xhr.open('PUT', sessionUri, true);
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${total}`);

      const onAbortSignal = () => xhr.abort();
      signal.addEventListener('abort', onAbortSignal, { once: true });
      const cleanup = () => signal.removeEventListener('abort', onAbortSignal);

      xhr.upload.onprogress = (event) => onProgress(event.loaded);

      xhr.onload = () => {
        cleanup();

        if (xhr.status === 200 || xhr.status === 201) {
          resolve({ complete: true, nextOffset: total });
          return;
        }

        if (xhr.status === 308) {
          const range = xhr.getResponseHeader('Range');
          const match = range ? /bytes=0-(\d+)/.exec(range) : null;
          resolve({
            complete: false,
            nextOffset: match?.[1] ? Number(match[1]) + 1 : end + 1,
          });
          return;
        }

        if (xhr.status === 403 || xhr.status === 404 || xhr.status === 410) {
          reject(new Error('Die Upload-Sitzung ist abgelaufen.'));
          return;
        }

        reject(new Error(`Übertragung fehlgeschlagen (HTTP ${xhr.status}).`));
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

/**
 * The object path is carried in the session URI's `name` parameter, so it
 * survives a reload without the queue having to persist a second field.
 */
export function objectNameFrom(sessionUri: string): string {
  try {
    const name = new URL(sessionUri).searchParams.get('name');
    if (name) return name;
  } catch {
    // Fall through to the id below.
  }
  // Should not happen with a GCS session URI, but a submission without a
  // usable path is worse than a synthetic one the team can still match up.
  return `unknown/${sessionUri.slice(-24)}`;
}
