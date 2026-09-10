import { Component, computed, input, output, signal } from '@angular/core';
import { formatBytes } from '../../core/upload/file-validation';
import { UploadItem } from '../../core/upload/upload-queue';

@Component({
  selector: 'app-upload-row',
  template: `
    <li class="flex items-center gap-3 p-3">
      <!-- Thumbnail. HEIC renders in Safari but not in Chrome/Firefox, so we
           try the preview and fall back on the error event rather than
           guessing from the file extension. -->
      <div
        class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface"
      >
        @if (item().previewUrl && !previewBroken() && item().kind === 'image') {
          <img
            [src]="item().previewUrl"
            alt=""
            class="size-full object-cover"
            (error)="previewBroken.set(true)"
          />
        } @else if (item().previewUrl && !previewBroken() && item().kind === 'video') {
          <video
            [src]="item().previewUrl"
            class="size-full object-cover"
            muted
            playsinline
            preload="metadata"
            (error)="previewBroken.set(true)"
          ></video>
        } @else {
          <svg
            viewBox="0 0 24 24"
            class="size-6 text-muted"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <path d="M14 3v5h5" stroke-linejoin="round" />
            <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
          </svg>
        }
      </div>

      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold" [title]="item().name">{{ item().name }}</p>

        <p class="mt-0.5 text-xs text-muted">
          {{ sizeLabel() }}
          @if (item().status === 'uploading') {
            · {{ percent() }}%
            @if (item().bytesPerSecond > 0) {
              · {{ rateLabel() }}
            }
          } @else {
            · {{ statusLabel() }}
          }
        </p>

        @if (item().status === 'uploading' || item().status === 'paused') {
          <div
            class="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            [attr.aria-valuenow]="percent()"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-label]="'Fortschritt ' + item().name"
          >
            <div
              class="h-full rounded-full bg-primary transition-[width] duration-200"
              [style.width.%]="percent()"
            ></div>
          </div>
        }

        @if (item().error) {
          <p class="field-error">
            <span aria-hidden="true">⚠</span>
            <span>{{ item().error }}</span>
          </p>
        }
      </div>

      <div class="flex shrink-0 items-center gap-1">
        @switch (item().status) {
          @case ('uploading') {
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              (click)="pause.emit()"
              [attr.aria-label]="'Upload von ' + item().name + ' pausieren'"
            >
              Pause
            </button>
          }
          @case ('paused') {
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              (click)="resume.emit()"
              [attr.aria-label]="'Upload von ' + item().name + ' fortsetzen'"
            >
              Fortsetzen
            </button>
          }
          @case ('error') {
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              (click)="resume.emit()"
              [attr.aria-label]="'Upload von ' + item().name + ' wiederholen'"
            >
              Erneut
            </button>
          }
          @case ('done') {
            <span class="px-1 text-primary-ink" aria-label="Fertig" title="Fertig">
              <svg
                viewBox="0 0 24 24"
                class="size-5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true"
              >
                <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          }
        }

        @if (item().status !== 'done') {
          <button
            type="button"
            class="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
            (click)="cancel.emit()"
            [attr.aria-label]="item().name + ' entfernen'"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" />
            </svg>
          </button>
        }
      </div>
    </li>
  `,
})
export class UploadRow {
  readonly item = input.required<UploadItem>();

  readonly pause = output<void>();
  readonly resume = output<void>();
  readonly cancel = output<void>();

  protected readonly previewBroken = signal(false);

  protected readonly percent = computed(() => {
    const { bytesSent, size } = this.item();
    return size === 0 ? 0 : Math.min(100, Math.round((bytesSent / size) * 100));
  });

  protected readonly sizeLabel = computed(() => formatBytes(this.item().size));

  protected readonly rateLabel = computed(() => `${formatBytes(this.item().bytesPerSecond)}/s`);

  protected readonly statusLabel = computed(() => {
    switch (this.item().status) {
      case 'queued':
        return 'Wartet';
      case 'paused':
        return `Pausiert bei ${this.percent()}%`;
      case 'done':
        return 'Hochgeladen';
      case 'error':
        return 'Fehlgeschlagen';
      case 'cancelled':
        return 'Entfernt';
      default:
        return '';
    }
  });
}
