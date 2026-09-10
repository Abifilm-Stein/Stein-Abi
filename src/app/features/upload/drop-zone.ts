import { Component, output, signal } from '@angular/core';
import { ACCEPT_ATTRIBUTE, MAX_FILES_PER_SUBMISSION, MAX_VIDEO_BYTES } from '../../core/config';
import { formatBytes } from '../../core/upload/file-validation';

/**
 * File intake.
 *
 * The <input type="file"> is the PRIMARY path -- most students are on a phone,
 * where drag & drop does not exist. Drag & drop is the desktop addition on
 * top, not the other way round. The whole zone is a <button> so it is
 * reachable and operable by keyboard.
 */
@Component({
  selector: 'app-drop-zone',
  template: `
    <div
      class="rounded-card border-2 border-dashed p-6 text-center transition-colors sm:p-10"
      [class.border-line]="!isDragging()"
      [class.border-primary]="isDragging()"
      [class.bg-primary-soft]="isDragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <svg
        viewBox="0 0 24 24"
        class="mx-auto mb-4 size-10 text-primary"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        aria-hidden="true"
      >
        <path d="M12 16V4m0 0L8 8m4-4 4 4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke-linecap="round" />
      </svg>

      <p class="mb-1 text-lg font-bold">Fotos & Videos auswählen</p>
      <p class="mx-auto mb-5 max-w-sm text-sm text-muted">
        Bis zu {{ maxFiles }} Dateien gleichzeitig, Videos bis {{ maxVideoSize }}.
        iPhone-Formate (HEIC, MOV) sind kein Problem.
      </p>

      <div class="flex flex-col justify-center gap-2 sm:flex-row">
        <button type="button" class="btn btn-primary" (click)="picker.click()">
          Dateien auswählen
        </button>
        <button type="button" class="btn btn-ghost" (click)="camera.click()">
          Direkt aufnehmen
        </button>
      </div>

      <p class="mt-4 hidden text-xs text-muted sm:block">
        …oder Dateien einfach hierher ziehen
      </p>

      <!-- Two inputs: the capture attribute opens the camera directly, which
           is wrong for picking existing material, so it gets its own button. -->
      <input
        #picker
        type="file"
        multiple
        class="sr-only"
        [accept]="accept"
        (change)="onPicked($event)"
      />
      <input
        #camera
        type="file"
        multiple
        capture="environment"
        class="sr-only"
        [accept]="accept"
        (change)="onPicked($event)"
      />
    </div>
  `,
})
export class DropZone {
  readonly filesPicked = output<File[]>();

  protected readonly isDragging = signal(false);

  protected readonly accept = ACCEPT_ATTRIBUTE;
  protected readonly maxFiles = MAX_FILES_PER_SUBMISSION;
  protected readonly maxVideoSize = formatBytes(MAX_VIDEO_BYTES);

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) this.filesPicked.emit(files);
    // Reset so picking the same file twice in a row still fires `change`.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) this.filesPicked.emit(files);
  }
}
