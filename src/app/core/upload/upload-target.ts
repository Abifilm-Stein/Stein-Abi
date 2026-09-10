/**
 * Transport abstraction for a single file upload.
 *
 * Two rules the implementations must honour, because they are what makes the
 * upload survive real conditions (school wifi, 2 GB phone videos):
 *
 *  1. Bytes go DIRECTLY to object storage. They never pass through an
 *     application server -- that is what blows up serverless request limits.
 *  2. Transfers are resumable. `abort()` keeps the session alive so a paused
 *     or dropped upload continues at its byte offset instead of restarting.
 */

export interface UploadProgress {
  bytesSent: number;
  bytesTotal: number;
  bytesPerSecond: number;
}

export interface UploadResult {
  /** Path of the stored object, referenced later by the submission record. */
  storagePath: string;
}

export interface UploadRequest {
  file: File;
  /** Session URL from a previous attempt. Present when resuming. */
  resumeUrl?: string;
  /** Called once a resumable session exists, so it can be persisted. */
  onSession(resumeUrl: string): void;
  onProgress(progress: UploadProgress): void;
}

export interface UploadTask {
  /** Resolves on completion; rejects with `UploadAbortedError` when stopped. */
  readonly done: Promise<UploadResult>;
  /** Stop transferring. The session URL remains valid for resuming. */
  abort(): void;
}

/** Thrown when a transfer is stopped on purpose (pause or cancel). */
export class UploadAbortedError extends Error {
  constructor() {
    super('Upload abgebrochen');
    this.name = 'UploadAbortedError';
  }
}

/** Non-recoverable: retrying will not help (rejected file, expired code). */
export class UploadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}

/** Injection token. Bound to a concrete target in `app.config.ts`. */
export abstract class UploadTarget {
  abstract start(request: UploadRequest): UploadTask;
}
