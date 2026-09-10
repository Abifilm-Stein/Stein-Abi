import { TestBed } from '@angular/core/testing';
import { MAX_CONCURRENT_UPLOADS, MAX_VIDEO_BYTES } from '../config';
import { UploadQueue } from './upload-queue';
import {
  UploadAbortedError,
  UploadRejectedError,
  UploadRequest,
  UploadResult,
  UploadTarget,
  UploadTask,
} from './upload-target';

interface Started {
  request: UploadRequest;
  resolve: (result: UploadResult) => void;
  reject: (error: unknown) => void;
  aborted: boolean;
}

/** Target under test control: nothing completes until the test says so. */
class ControllableTarget implements UploadTarget {
  readonly started: Started[] = [];

  start(request: UploadRequest): UploadTask {
    let resolve!: (result: UploadResult) => void;
    let reject!: (error: unknown) => void;
    const done = new Promise<UploadResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const entry: Started = { request, resolve, reject, aborted: false };
    this.started.push(entry);

    return {
      done,
      abort: () => {
        entry.aborted = true;
        reject(new UploadAbortedError());
      },
    };
  }

  /** Most recent start for a given file name. */
  last(name: string): Started {
    const matches = this.started.filter((entry) => entry.request.file.name === name);
    return matches[matches.length - 1];
  }
}

function fakeFile(name: string, size = 1000, type = 'image/jpeg'): File {
  const file = new File([], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** Lets pending promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('UploadQueue', () => {
  let queue: UploadQueue;
  let target: ControllableTarget;

  beforeEach(() => {
    target = new ControllableTarget();
    TestBed.configureTestingModule({
      providers: [{ provide: UploadTarget, useValue: target }],
    });
    queue = TestBed.inject(UploadQueue);
  });

  it('accepts valid files and reports the rejected ones with a reason', () => {
    const oversized = fakeFile('riesig.mp4', MAX_VIDEO_BYTES + 1, 'video/mp4');
    const result = queue.add([fakeFile('ok.jpg'), oversized, fakeFile('brief.pdf', 10, 'application/pdf')]);

    expect(result.accepted).toBe(1);
    expect(result.rejected.length).toBe(2);
    expect(result.rejected[0].name).toBe('riesig.mp4');
  });

  it('refuses the same file twice', () => {
    const file = fakeFile('doppelt.jpg');
    expect(queue.add([file]).accepted).toBe(1);

    const second = queue.add([file]);
    expect(second.accepted).toBe(0);
    expect(second.rejected[0].reason).toContain('bereits');
  });

  it('never runs more transfers than the concurrency limit', () => {
    queue.add([
      fakeFile('1.jpg'),
      fakeFile('2.jpg'),
      fakeFile('3.jpg'),
      fakeFile('4.jpg'),
      fakeFile('5.jpg'),
    ]);

    expect(target.started.length).toBe(MAX_CONCURRENT_UPLOADS);
    expect(queue.activeCount()).toBe(MAX_CONCURRENT_UPLOADS);
  });

  it('starts the next queued file when one finishes', async () => {
    queue.add([fakeFile('1.jpg'), fakeFile('2.jpg'), fakeFile('3.jpg'), fakeFile('4.jpg')]);

    target.last('1.jpg').resolve({ storagePath: 'a/1.jpg' });
    await flush();

    expect(target.started.length).toBe(MAX_CONCURRENT_UPLOADS + 1);
    expect(queue.completed().length).toBe(1);
  });

  it('tracks progress reported by the target', () => {
    queue.add([fakeFile('gross.mp4', 1_000_000, 'video/mp4')]);

    target.last('gross.mp4').request.onProgress({
      bytesSent: 250_000,
      bytesTotal: 1_000_000,
      bytesPerSecond: 500_000,
    });

    expect(queue.sentBytes()).toBe(250_000);
    expect(queue.overallPercent()).toBe(25);
  });

  it('keeps the transferred offset when paused, so a resume continues', async () => {
    queue.add([fakeFile('film.mp4', 1_000_000, 'video/mp4')]);
    const first = target.last('film.mp4');

    first.request.onSession('https://tus.example/session-1');
    first.request.onProgress({ bytesSent: 600_000, bytesTotal: 1_000_000, bytesPerSecond: 1 });

    queue.pause(queue.items()[0].id);
    await flush();

    const paused = queue.items()[0];
    expect(paused.status).toBe('paused');
    expect(paused.bytesSent).toBe(600_000);
    expect(first.aborted).toBe(true);

    // Resuming must hand the session back to the target rather than restart.
    queue.resume(paused.id);
    await flush();

    expect(target.last('film.mp4').request.resumeUrl).toBe('https://tus.example/session-1');
  });

  it('re-queues for another attempt after a network error', async () => {
    queue.add([fakeFile('wackelig.jpg')]);

    target.last('wackelig.jpg').reject(new Error('Netzwerkfehler bei der Übertragung.'));
    await flush();

    const item = queue.items()[0];
    expect(item.attempts).toBe(1);
    expect(item.status).toBe('queued');
  });

  it('fails immediately without retrying when the server rejects the file', async () => {
    queue.add([fakeFile('abgelehnt.jpg')]);

    target.last('abgelehnt.jpg').reject(new UploadRejectedError('Zugangscode abgelaufen.'));
    await flush();

    const item = queue.items()[0];
    expect(item.status).toBe('error');
    expect(item.error).toBe('Zugangscode abgelaufen.');
  });

  it('drops a cancelled file from the totals', () => {
    queue.add([fakeFile('a.jpg', 1000), fakeFile('b.jpg', 3000)]);
    expect(queue.totalBytes()).toBe(4000);

    queue.cancel(queue.items()[0].id);
    expect(queue.totalBytes()).toBe(3000);
  });

  it('exposes finished uploads as asset references for the submission', async () => {
    queue.add([fakeFile('foto.jpg', 2048, 'image/jpeg')]);
    target.last('foto.jpg').resolve({ storagePath: 'uploads/abc.jpg' });
    await flush();

    expect(queue.isReadyToSubmit()).toBe(true);
    expect(queue.completedAssets()).toEqual([
      {
        storagePath: 'uploads/abc.jpg',
        originalFilename: 'foto.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
      },
    ]);
  });

  it('is not submittable while a transfer is still running', () => {
    queue.add([fakeFile('a.jpg'), fakeFile('b.jpg')]);
    expect(queue.isReadyToSubmit()).toBe(false);
    expect(queue.isBusy()).toBe(true);
  });
});
