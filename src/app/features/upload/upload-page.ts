import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/account/session.service';
import { SubmissionMetadata } from '../../core/models';
import { SubmissionGateway } from '../../core/submissions/submission-gateway';
import { formatBytes } from '../../core/upload/file-validation';
import { UploadQueue } from '../../core/upload/upload-queue';
import { DropZone } from './drop-zone';
import { SubmissionForm } from './submission-form';
import { UploadRow } from './upload-row';

@Component({
  selector: 'app-upload-page',
  imports: [DropZone, UploadRow, SubmissionForm, RouterLink],
  template: `
    @if (session.account(); as account) {
      <h1 class="mb-2 text-3xl font-bold sm:text-4xl">Material hochladen</h1>
      <p class="mb-8 max-w-2xl text-muted">
        Originaldateien bitte, nicht per WhatsApp geschickte Versionen — die sind
        komprimiert und im Film unbrauchbar. Was du schon abgeschickt hast, findest du
        unter
        <a routerLink="/meine-beitraege" class="font-semibold text-primary-ink underline"
          >Meine Beiträge</a
        >.
      </p>

      @if (queue.restoredCount() > 0) {
        <div class="card mb-6 border-primary bg-primary-soft p-4" role="status">
          <p class="mb-3 text-sm font-semibold">
            {{ queue.restoredCount() }}
            {{ queue.restoredCount() === 1 ? 'Upload' : 'Uploads' }} aus einer früheren
            Sitzung gefunden. Fortsetzen?
          </p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-primary btn-sm" (click)="queue.resumeRestored()">
              Fortsetzen
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="queue.discardRestored()">
              Verwerfen
            </button>
          </div>
        </div>
      }

      <app-drop-zone (filesPicked)="onFilesPicked($event)" />

      @if (rejections().length > 0) {
        <div class="card mt-4 border-danger p-4" role="alert">
          <p class="mb-2 text-sm font-bold" style="color: var(--danger)">
            {{ rejections().length }}
            {{ rejections().length === 1 ? 'Datei wurde' : 'Dateien wurden' }} nicht übernommen
          </p>
          <ul class="space-y-1 text-sm text-muted">
            @for (rejection of rejections(); track rejection.name) {
              <li><span class="font-semibold">{{ rejection.name }}</span> — {{ rejection.reason }}</li>
            }
          </ul>
          <button type="button" class="btn btn-ghost btn-sm mt-3" (click)="rejections.set([])">
            Verstanden
          </button>
        </div>
      }

      @if (visibleItems().length > 0) {
        <section class="mt-6" aria-labelledby="queue-heading">
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="queue-heading" class="text-lg font-bold">
              {{ visibleItems().length }}
              {{ visibleItems().length === 1 ? 'Datei' : 'Dateien' }}
            </h2>

            @if (queue.pending().length > 0) {
              <div class="flex gap-2">
                @if (queue.activeCount() > 0) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="queue.pauseAll()">
                    Alle pausieren
                  </button>
                } @else {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="queue.resumeAll()">
                    Alle fortsetzen
                  </button>
                }
              </div>
            }
          </div>

          @if (queue.isBusy() || queue.overallPercent() > 0) {
            <div class="card mb-3 p-4">
              <div class="mb-2 flex items-baseline justify-between gap-3 text-sm">
                <span class="font-semibold">{{ queue.overallPercent() }}% übertragen</span>
                <span class="text-muted">
                  {{ sentLabel() }} von {{ totalLabel() }}
                  @if (etaLabel()) {
                    · ca. {{ etaLabel() }} übrig
                  }
                </span>
              </div>
              <div
                class="h-2 overflow-hidden rounded-full bg-line"
                role="progressbar"
                [attr.aria-valuenow]="queue.overallPercent()"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Gesamtfortschritt"
              >
                <div
                  class="h-full rounded-full bg-primary transition-[width] duration-300"
                  [style.width.%]="queue.overallPercent()"
                ></div>
              </div>
            </div>
          }

          <ul class="card divide-y divide-line">
            @for (item of visibleItems(); track item.id) {
              <app-upload-row
                [item]="item"
                (pause)="queue.pause(item.id)"
                (resume)="queue.resume(item.id)"
                (cancel)="queue.cancel(item.id)"
              />
            }
          </ul>

          <!-- Announced to screen readers without stealing focus. -->
          <p class="sr-only" role="status" aria-live="polite">{{ liveMessage() }}</p>
        </section>

        <section class="mt-8">
          <app-submission-form
            [account]="account"
            [completedCount]="queue.completed().length"
            [pendingCount]="queue.pending().length"
            [saving]="saving()"
            [suggestedMonth]="suggestedMonth()"
            (submitted)="onSubmitted($event)"
          />
        </section>

        @if (saveError()) {
          <p class="field-error mt-4" role="alert">
            <span aria-hidden="true">⚠</span>
            <span>{{ saveError() }}</span>
          </p>
        }
      }
    }
  `,
})
export class UploadPage implements OnInit {
  protected readonly session = inject(SessionService);
  protected readonly queue = inject(UploadQueue);
  private readonly gateway = inject(SubmissionGateway);
  private readonly router = inject(Router);

  protected readonly rejections = signal<{ name: string; reason: string }[]>([]);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  private readonly earliestModified = signal<number | undefined>(undefined);

  protected readonly visibleItems = computed(() =>
    this.queue.items().filter((item) => item.status !== 'cancelled'),
  );

  protected readonly sentLabel = computed(() => formatBytes(this.queue.sentBytes()));
  protected readonly totalLabel = computed(() => formatBytes(this.queue.totalBytes()));

  protected readonly etaLabel = computed(() => {
    const seconds = this.queue.secondsRemaining();
    if (seconds === undefined || seconds <= 0) return null;
    if (seconds < 60) return `${seconds} Sekunden`;
    const minutes = Math.round(seconds / 60);
    return `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`;
  });

  /**
   * `lastModified` as a stand-in for EXIF capture time. Not exact -- a copied
   * file carries the copy date -- but free, and the student can correct it.
   */
  protected readonly suggestedMonth = computed(() => {
    const earliest = this.earliestModified();
    return earliest === undefined ? undefined : new Date(earliest).toISOString().slice(0, 7);
  });

  protected readonly liveMessage = computed(() => {
    const done = this.queue.completed().length;
    const pending = this.queue.pending().length;
    const failed = this.queue.failed().length;

    if (pending > 0) return `${done} von ${done + pending} Dateien hochgeladen.`;
    if (failed > 0) return `${done} Dateien hochgeladen, ${failed} fehlgeschlagen.`;
    if (done > 0) return `Alle ${done} Dateien hochgeladen. Formular ausfüllen und abschicken.`;
    return '';
  });

  ngOnInit(): void {
    void this.queue.restore();
  }

  protected onFilesPicked(files: File[]): void {
    const earliest = files.reduce(
      (min, file) => Math.min(min, file.lastModified),
      Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(earliest)) {
      this.earliestModified.update((current) =>
        current === undefined ? earliest : Math.min(current, earliest),
      );
    }

    const result = this.queue.add(files);
    this.rejections.set(result.rejected);
  }

  protected async onSubmitted(metadata: SubmissionMetadata): Promise<void> {
    const account = this.session.account();
    if (!account) return;

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const assets = this.queue.completedAssets();
      await this.gateway.create({
        ...metadata,
        assets,
        accountId: account.id,
        // Denormalised so the team can still attribute a submission even if
        // the account is removed later.
        uploaderName: account.displayName,
        uploaderClass: account.schoolClass,
      });
      this.queue.reset();
      await this.router.navigate(['/upload/danke'], {
        state: { fileCount: assets.length },
      });
    } catch {
      this.saveError.set(
        'Der Beitrag konnte nicht gespeichert werden. Die Dateien sind aber übertragen — bitte versuche es gleich noch einmal.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
