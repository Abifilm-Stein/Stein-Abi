import { Injectable } from '@angular/core';
import {
  UploadAbortedError,
  UploadRequest,
  UploadResult,
  UploadTarget,
  UploadTask,
} from './upload-target';

/** Simulated throughput. Roughly a decent school wifi connection. */
const BYTES_PER_SECOND = 12 * 1024 * 1024;
const TICK_MS = 120;

/** Session offsets, so pause/resume behaves like a real tus server. */
const sessions = new Map<string, number>();

/**
 * Stand-in used while no backend is configured (demo mode).
 *
 * It does no network I/O but reproduces the behaviour the UI has to cope
 * with: byte-level progress, resumable offsets, abort, and -- when
 * `window.__steinabiFailureRate` is set -- random failures for exercising the
 * retry path by hand.
 */
@Injectable()
export class MockUploadTarget implements UploadTarget {
  start(request: UploadRequest): UploadTask {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fail: ((error: Error) => void) | undefined;

    const done = new Promise<UploadResult>((resolve, reject) => {
      fail = reject;
      const sessionUrl = request.resumeUrl ?? `mock://${crypto.randomUUID()}`;
      if (!request.resumeUrl) {
        sessions.set(sessionUrl, 0);
        request.onSession(sessionUrl);
      }

      let sent = sessions.get(sessionUrl) ?? 0;
      const total = request.file.size;

      request.onProgress({ bytesSent: sent, bytesTotal: total, bytesPerSecond: 0 });

      const tick = () => {
        const failureRate = window.__steinabiFailureRate ?? 0;
        if (failureRate > 0 && Math.random() < failureRate) {
          sessions.set(sessionUrl, sent);
          reject(new Error('Simulierter Netzwerkfehler.'));
          return;
        }

        sent = Math.min(total, sent + (BYTES_PER_SECOND * TICK_MS) / 1000);
        sessions.set(sessionUrl, sent);
        request.onProgress({
          bytesSent: sent,
          bytesTotal: total,
          bytesPerSecond: BYTES_PER_SECOND,
        });

        if (sent >= total) {
          sessions.delete(sessionUrl);
          resolve({ storagePath: `demo/${sessionUrl.replace('mock://', '')}` });
          return;
        }
        timer = setTimeout(tick, TICK_MS);
      };

      timer = setTimeout(tick, TICK_MS);
    });

    return {
      done,
      // Clearing the timer alone would leave `done` pending forever and stall
      // the queue slot, so the promise is rejected explicitly.
      abort: () => {
        if (timer !== undefined) clearTimeout(timer);
        fail?.(new UploadAbortedError());
      },
    };
  }
}

declare global {
  interface Window {
    /** Set from the console (e.g. `0.3`) to exercise retry handling. */
    __steinabiFailureRate?: number;
  }
}
