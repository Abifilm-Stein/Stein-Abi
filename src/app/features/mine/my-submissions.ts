import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/account/session.service';
import { CONTACT } from '../../core/config';
import { REVIEW_STATUS_HINTS, Submission } from '../../core/models';
import { SubmissionGateway } from '../../core/submissions/submission-gateway';
import { formatBytes } from '../../core/upload/file-validation';

@Component({
  selector: 'app-my-submissions',
  imports: [RouterLink],
  template: `
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Meine Beiträge</h1>
        <p class="text-muted">
          Angemeldet als {{ session.account()?.displayName }}
        </p>
      </div>
      <a routerLink="/upload" class="btn btn-primary btn-sm">Weitere hochladen</a>
    </div>

    @if (loading()) {
      <div class="space-y-3">
        @for (row of [1, 2]; track row) {
          <div class="card h-28 animate-pulse"></div>
        }
      </div>
    } @else if (loadError()) {
      <div class="card border-danger p-6" role="alert">
        <p class="font-semibold" style="color: var(--danger)">
          Deine Beiträge konnten nicht geladen werden.
        </p>
        <button type="button" class="btn btn-ghost btn-sm mt-3" (click)="reload()">
          Erneut versuchen
        </button>
      </div>
    } @else if (submissions().length === 0) {
      <div class="card p-10 text-center">
        <p class="mb-1 font-semibold">Noch nichts hochgeladen</p>
        <p class="mb-6 text-sm text-muted">
          Sobald du Fotos oder Videos abgeschickt hast, erscheinen sie hier.
        </p>
        <a routerLink="/upload" class="btn btn-primary">Jetzt hochladen</a>
      </div>
    } @else {
      <p class="mb-4 text-sm text-muted" role="status">
        {{ submissions().length }} {{ submissions().length === 1 ? 'Beitrag' : 'Beiträge' }} ·
        {{ assetCount() }} {{ assetCount() === 1 ? 'Datei' : 'Dateien' }} ·
        {{ totalSizeLabel() }}
      </p>

      <ul class="space-y-3">
        @for (submission of submissions(); track submission.id) {
          <li class="card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-bold">{{ submission.category }}</p>
                <p class="mt-0.5 text-sm text-muted">
                  {{ formatMonth(submission.takenAt) }} ·
                  {{ submission.assets.length }}
                  {{ submission.assets.length === 1 ? 'Datei' : 'Dateien' }} ·
                  {{ sizeOf(submission) }}
                </p>
                @if (submission.description) {
                  <p class="mt-2 text-sm">{{ submission.description }}</p>
                }
                <p class="mt-2 text-xs text-muted">
                  Hochgeladen am {{ formatDate(submission.createdAt) }}
                </p>
              </div>

              <div class="flex shrink-0 flex-col items-end gap-2">
                <span
                  class="rounded-full px-2.5 py-1 text-xs font-semibold"
                  [class.bg-primary-soft]="submission.reviewStatus === 'verwendet'"
                  [class.text-primary-ink]="submission.reviewStatus === 'verwendet'"
                  [class.bg-surface]="submission.reviewStatus !== 'verwendet'"
                  [class.text-muted]="submission.reviewStatus !== 'verwendet'"
                >
                  {{ statusHints[submission.reviewStatus] }}
                </span>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  style="color: var(--danger)"
                  [disabled]="withdrawing() === submission.id"
                  (click)="withdraw(submission)"
                >
                  {{ withdrawing() === submission.id ? 'Wird entfernt…' : 'Zurückziehen' }}
                </button>
              </div>
            </div>

            <ul class="mt-3 flex flex-wrap gap-2 border-t border-line pt-3 text-xs">
              @for (asset of submission.assets; track asset.storagePath) {
                <li class="rounded bg-surface px-2 py-1 text-muted">
                  {{ asset.originalFilename }} · {{ bytes(asset.sizeBytes) }}
                </li>
              }
            </ul>
          </li>
        }
      </ul>

      <div class="card mt-8 p-5 text-sm text-muted">
        <h2 class="mb-2 font-bold text-ink">Warum sehe ich hier keine Vorschaubilder?</h2>
        <p class="mb-3">
          Deine Dateien liegen bewusst nicht öffentlich abrufbar im Netz — nur das
          Abifilm-Team kann sie öffnen. Deshalb siehst du hier die Dateinamen statt der
          Bilder.
        </p>
        <p>
          „Zurückziehen“ löscht den Beitrag samt Dateien endgültig. Wenn du dabei Hilfe
          brauchst, schreib an
          <a [href]="'mailto:' + contact.email" class="font-semibold text-primary-ink underline">{{
            contact.email
          }}</a
          >.
        </p>
      </div>
    }
  `,
})
export class MySubmissions implements OnInit {
  protected readonly session = inject(SessionService);
  private readonly gateway = inject(SubmissionGateway);

  protected readonly statusHints = REVIEW_STATUS_HINTS;
  protected readonly contact = CONTACT;

  protected readonly submissions = signal<Submission[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly withdrawing = signal<string | null>(null);

  protected readonly assetCount = computed(() =>
    this.submissions().reduce((sum, entry) => sum + entry.assets.length, 0),
  );

  protected readonly totalSizeLabel = computed(() =>
    formatBytes(
      this.submissions().reduce(
        (sum, entry) => sum + entry.assets.reduce((inner, a) => inner + a.sizeBytes, 0),
        0,
      ),
    ),
  );

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    const account = this.session.account();
    if (!account) return;

    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.submissions.set(await this.gateway.listMine(account.id));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async withdraw(submission: Submission): Promise<void> {
    const account = this.session.account();
    if (!account) return;

    const fileCount = submission.assets.length;
    const confirmed = confirm(
      `Diesen Beitrag mit ${fileCount} ${fileCount === 1 ? 'Datei' : 'Dateien'} endgültig zurückziehen? Das lässt sich nicht rückgängig machen.`,
    );
    if (!confirmed) return;

    this.withdrawing.set(submission.id);
    try {
      await this.gateway.withdraw(submission.id, account.id);
      this.submissions.update((entries) => entries.filter((entry) => entry.id !== submission.id));
    } catch {
      this.loadError.set(true);
    } finally {
      this.withdrawing.set(null);
    }
  }

  protected sizeOf(submission: Submission): string {
    return formatBytes(submission.assets.reduce((sum, asset) => sum + asset.sizeBytes, 0));
  }

  protected bytes(value: number): string {
    return formatBytes(value);
  }

  protected formatMonth(value: string): string {
    // `YYYY-MM` -- Date parsing needs a day component to be reliable.
    const parsed = new Date(`${value}-01T00:00:00`);
    return Number.isNaN(parsed.getTime())
      ? value
      : new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(parsed);
  }

  protected formatDate(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(parsed);
  }
}
