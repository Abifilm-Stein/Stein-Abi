import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  MAX_CONCURRENT_UPLOADS,
  MAX_FILES_PER_SUBMISSION,
  MAX_UPLOAD_RETRIES,
} from '../config';
import { AssetRef } from '../models';
import { detectKind, FileKind, isProbablyUndisplayable, validateFile } from './file-validation';
import * as store from './queue-store';
import {
  UploadAbortedError,
  UploadRejectedError,
  UploadTarget,
  UploadTask,
} from './upload-target';

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'done' | 'error' | 'cancelled';

export interface UploadItem {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mimeType: string;
  readonly kind: FileKind;
  /** Object URL for the thumbnail, or undefined when none can be made. */
  readonly previewUrl?: string;
  /** True for HEIC and friends -- the UI expects the preview may fail. */
  readonly previewRisky: boolean;
  status: UploadStatus;
  bytesSent: number;
  bytesPerSecond: number;
  attempts: number;
  error?: string;
  storagePath?: string;
  /** True when the item came back from IndexedDB after a reload. */
  restored: boolean;
}

export interface AddResult {
  accepted: number;
  rejected: { name: string; reason: string }[];
}

/** Per-item runtime state kept out of signals -- Files must not be cloned. */
interface Runtime {
  file: File;
  resumeUrl?: string;
  task?: UploadTask;
  /** Set while the user paused, to tell a pause apart from a cancel. */
  intent?: 'pause' | 'cancel';
  /** Epoch ms before which this item must not be retried (backoff). */
  retryAfter?: number;
}

@Injectable({ providedIn: 'root' })
export class UploadQueue {
  private readonly target = inject(UploadTarget);
  private readonly runtime = new Map<string, Runtime>();

  private readonly _items = signal<UploadItem[]>([]);
  readonly items = this._items.asReadonly();

  private readonly _restoredCount = signal(0);
  /** How many transfers were recovered from a previous session. */
  readonly restoredCount = this._restoredCount.asReadonly();

  readonly activeCount = computed(
    () => this.items().filter((item) => item.status === 'uploading').length,
  );

  readonly pending = computed(() =>
    this.items().filter(
      (item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'paused',
    ),
  );

  readonly completed = computed(() => this.items().filter((item) => item.status === 'done'));

  readonly failed = computed(() => this.items().filter((item) => item.status === 'error'));

  /** True while transfers are in flight -- blocks navigation away. */
  readonly isBusy = computed(() =>
    this.items().some((item) => item.status === 'uploading' || item.status === 'queued'),
  );

  /** Everything picked has finished, and at least one file succeeded. */
  readonly isReadyToSubmit = computed(
    () => this.completed().length > 0 && this.pending().length === 0,
  );

  readonly totalBytes = computed(() =>
    this.trackedItems().reduce((sum, item) => sum + item.size, 0),
  );

  readonly sentBytes = computed(() =>
    this.trackedItems().reduce((sum, item) => sum + item.bytesSent, 0),
  );

  readonly overallPercent = computed(() => {
    const total = this.totalBytes();
    return total === 0 ? 0 : Math.min(100, Math.round((this.sentBytes() / total) * 100));
  });

  /** Aggregate rate across active transfers, for the ETA. */
  readonly bytesPerSecond = computed(() =>
    this.items()
      .filter((item) => item.status === 'uploading')
      .reduce((sum, item) => sum + item.bytesPerSecond, 0),
  );

  readonly secondsRemaining = computed(() => {
    const rate = this.bytesPerSecond();
    if (rate <= 0) return undefined;
    const left = this.totalBytes() - this.sentBytes();
    return left <= 0 ? 0 : Math.round(left / rate);
  });

  /** Asset references for the submission record, once transfers finished. */
  readonly completedAssets = computed<AssetRef[]>(() =>
    this.completed()
      .filter((item) => !!item.storagePath)
      .map((item) => ({
        storagePath: item.storagePath as string,
        originalFilename: item.name,
        mimeType: item.mimeType,
        sizeBytes: item.size,
      })),
  );

  constructor() {
    this.installUnloadGuard();
  }

  private trackedItems(): UploadItem[] {
    return this.items().filter((item) => item.status !== 'cancelled');
  }

  /* -----------------------------------------------------------------------
   * Adding files
   * -------------------------------------------------------------------- */

  add(files: readonly File[]): AddResult {
    const rejected: AddResult['rejected'] = [];
    let accepted = 0;

    const slotsLeft = MAX_FILES_PER_SUBMISSION - this.trackedItems().length;

    for (const file of files) {
      if (accepted >= slotsLeft) {
        rejected.push({
          name: file.name,
          reason: `Maximal ${MAX_FILES_PER_SUBMISSION} Dateien pro Vorgang.`,
        });
        continue;
      }

      if (this.isDuplicate(file)) {
        rejected.push({ name: file.name, reason: 'Diese Datei ist bereits in der Liste.' });
        continue;
      }

      const check = validateFile(file);
      if (!check.ok) {
        rejected.push({ name: file.name, reason: check.reason });
        continue;
      }

      this.enqueue(file);
      accepted++;
    }

    this.pump();
    return { accepted, rejected };
  }

  /** Cheap duplicate guard: same name, size and mtime. No hashing needed. */
  private isDuplicate(file: File): boolean {
    return this.items().some((item) => {
      if (item.status === 'cancelled') return false;
      const existing = this.runtime.get(item.id)?.file;
      return (
        !!existing &&
        existing.name === file.name &&
        existing.size === file.size &&
        existing.lastModified === file.lastModified
      );
    });
  }

  private enqueue(file: File, id = crypto.randomUUID()): void {
    const kind = detectKind(file);
    this.runtime.set(id, { file });

    const item: UploadItem = {
      id,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      kind,
      previewUrl: this.makePreviewUrl(file, kind),
      previewRisky: isProbablyUndisplayable(file),
      status: 'queued',
      bytesSent: 0,
      bytesPerSecond: 0,
      attempts: 0,
      restored: false,
    };

    this._items.update((items) => [...items, item]);
    void store.saveUpload({ id, file, bytesSent: 0, createdAt: Date.now() });
  }

  private makePreviewUrl(file: File, kind: FileKind): string | undefined {
    if (kind === 'unknown') return undefined;
    try {
      return URL.createObjectURL(file);
    } catch {
      return undefined;
    }
  }

  /* -----------------------------------------------------------------------
   * Restoring an interrupted session
   * -------------------------------------------------------------------- */

  /**
   * Reload persisted transfers without starting them. The upload page asks
   * the student first -- silently resuming a large upload on a mobile data
   * plan is not ours to decide.
   */
  async restore(): Promise<number> {
    const rows = await store.loadUploads();
    const fresh = rows.filter((row) => !this.runtime.has(row.id));

    for (const row of fresh) {
      const kind = detectKind(row.file);
      this.runtime.set(row.id, { file: row.file, resumeUrl: row.resumeUrl });
      this._items.update((items) => [
        ...items,
        {
          id: row.id,
          name: row.file.name,
          size: row.file.size,
          mimeType: row.file.type,
          kind,
          previewUrl: this.makePreviewUrl(row.file, kind),
          previewRisky: isProbablyUndisplayable(row.file),
          status: 'paused',
          bytesSent: row.bytesSent,
          bytesPerSecond: 0,
          attempts: 0,
          restored: true,
        },
      ]);
    }

    this._restoredCount.set(fresh.length);
    return fresh.length;
  }

  resumeRestored(): void {
    for (const item of this.items()) {
      if (item.restored && item.status === 'paused') {
        this.patch(item.id, { status: 'queued', restored: false });
      }
    }
    this._restoredCount.set(0);
    this.pump();
  }

  discardRestored(): void {
    for (const item of this.items()) {
      if (item.restored) this.cancel(item.id);
    }
    this._restoredCount.set(0);
  }

  /* -----------------------------------------------------------------------
   * Per-item controls
   * -------------------------------------------------------------------- */

  pause(id: string): void {
    const runtime = this.runtime.get(id);
    if (!runtime) return;
    runtime.intent = 'pause';
    runtime.task?.abort();
    this.patch(id, { status: 'paused', bytesPerSecond: 0 });
  }

  resume(id: string): void {
    const item = this.find(id);
    if (!item || (item.status !== 'paused' && item.status !== 'error')) return;

    // A manual retry is deliberate, so it skips any pending backoff.
    const runtime = this.runtime.get(id);
    if (runtime) runtime.retryAfter = undefined;

    this.patch(id, { status: 'queued', error: undefined, attempts: 0 });
    this.pump();
  }

  retry(id: string): void {
    this.resume(id);
  }

  cancel(id: string): void {
    const runtime = this.runtime.get(id);
    if (runtime) {
      runtime.intent = 'cancel';
      runtime.task?.abort();
    }
    const item = this.find(id);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);

    this.patch(id, { status: 'cancelled', bytesPerSecond: 0 });
    this.runtime.delete(id);
    void store.removeUpload(id);
    this.pump();
  }

  pauseAll(): void {
    for (const item of this.items()) {
      if (item.status === 'uploading' || item.status === 'queued') this.pause(item.id);
    }
  }

  resumeAll(): void {
    for (const item of this.items()) {
      if (item.status === 'paused' || item.status === 'error') this.resume(item.id);
    }
  }

  /** Drop finished items after a submission was recorded. */
  reset(): void {
    for (const item of this.items()) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      this.runtime.get(item.id)?.task?.abort();
    }
    this.runtime.clear();
    this._items.set([]);
    this._restoredCount.set(0);
    void store.clearUploads();
  }

  /* -----------------------------------------------------------------------
   * Scheduler
   * -------------------------------------------------------------------- */

  private pump(): void {
    let free = MAX_CONCURRENT_UPLOADS - this.activeCount();
    if (free <= 0) return;

    const now = Date.now();

    for (const item of this.items()) {
      if (free <= 0) break;
      if (item.status !== 'queued') continue;

      // Respect the backoff. Without this, a full network outage fails all
      // concurrent transfers at once and their mutual pump() calls burn every
      // retry within milliseconds -- exactly when waiting would have helped.
      const retryAfter = this.runtime.get(item.id)?.retryAfter;
      if (retryAfter !== undefined && now < retryAfter) continue;

      void this.transfer(item.id);
      free--;
    }
  }

  private async transfer(id: string): Promise<void> {
    const runtime = this.runtime.get(id);
    if (!runtime) return;

    runtime.intent = undefined;
    this.patch(id, { status: 'uploading', error: undefined });

    const task = this.target.start({
      file: runtime.file,
      resumeUrl: runtime.resumeUrl,
      onSession: (resumeUrl) => {
        runtime.resumeUrl = resumeUrl;
        void store.saveUpload({
          id,
          file: runtime.file,
          resumeUrl,
          bytesSent: this.find(id)?.bytesSent ?? 0,
          createdAt: Date.now(),
        });
      },
      onProgress: ({ bytesSent, bytesPerSecond }) => {
        this.patch(id, { bytesSent, bytesPerSecond });
      },
    });

    runtime.task = task;

    try {
      const result = await task.done;
      this.patch(id, {
        status: 'done',
        storagePath: result.storagePath,
        bytesSent: runtime.file.size,
        bytesPerSecond: 0,
      });
      void store.removeUpload(id);
    } catch (error) {
      await this.handleFailure(id, error);
    } finally {
      runtime.task = undefined;
      this.pump();
    }
  }

  private async handleFailure(id: string, error: unknown): Promise<void> {
    const runtime = this.runtime.get(id);
    if (!runtime) return;

    // Deliberate stop: pause/cancel already set the right status.
    if (error instanceof UploadAbortedError || runtime.intent) {
      if (runtime.intent === 'pause') this.patch(id, { status: 'paused', bytesPerSecond: 0 });
      return;
    }

    if (error instanceof UploadRejectedError) {
      this.patch(id, { status: 'error', error: error.message, bytesPerSecond: 0 });
      return;
    }

    const item = this.find(id);
    const attempts = (item?.attempts ?? 0) + 1;
    this.patch(id, { attempts, bytesPerSecond: 0 });

    if (attempts <= MAX_UPLOAD_RETRIES) {
      // Exponential backoff: 1s, 2s, 4s. School wifi usually comes back.
      const delay = 1000 * 2 ** (attempts - 1);
      runtime.retryAfter = Date.now() + delay;
      this.patch(id, { status: 'queued' });

      await new Promise((resolve) => setTimeout(resolve, delay));
      runtime.retryAfter = undefined;
      return;
    }

    this.patch(id, {
      status: 'error',
      error:
        error instanceof Error
          ? error.message
          : 'Unbekannter Fehler bei der Übertragung.',
    });
  }

  /* -----------------------------------------------------------------------
   * Helpers
   * -------------------------------------------------------------------- */

  private find(id: string): UploadItem | undefined {
    return this.items().find((item) => item.id === id);
  }

  private patch(id: string, changes: Partial<UploadItem>): void {
    this._items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  /**
   * Warn before leaving with transfers in flight. Browsers show their own
   * generic wording; the custom string is ignored but required by the spec.
   */
  private installUnloadGuard(): void {
    if (typeof window === 'undefined') return;

    const handler = (event: BeforeUnloadEvent) => {
      if (!this.isBusy()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    effect(() => {
      // Re-registering is cheap and keeps the listener attached only while
      // there is something to lose.
      if (this.isBusy()) {
        window.addEventListener('beforeunload', handler);
      } else {
        window.removeEventListener('beforeunload', handler);
      }
    });
  }
}
