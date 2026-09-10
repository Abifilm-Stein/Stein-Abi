import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CATEGORIES, gradeLabel } from '../../core/config';
import { ReviewStatus, REVIEW_STATUS_LABELS, Submission } from '../../core/models';
import { isDemoMode } from '../../core/runtime-config';
import { SubmissionGateway } from '../../core/submissions/submission-gateway';
import { formatBytes } from '../../core/upload/file-validation';

const STATUSES: ReviewStatus[] = ['neu', 'gesichtet', 'verwendet', 'aussortiert'];

@Component({
  selector: 'app-team-dashboard',
  template: `
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Beiträge</h1>
        <p class="text-muted">{{ submissions().length }} Einsendungen insgesamt</p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" (click)="signOut()">Abmelden</button>
    </div>

    <!-- Key figures -->
    <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ assetCount() }}</p>
        <p class="text-xs text-muted">Dateien</p>
      </div>
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ totalSizeLabel() }}</p>
        <p class="text-xs text-muted">Gesamtvolumen</p>
      </div>
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ countByStatus('neu') }}</p>
        <p class="text-xs text-muted">Noch ungesichtet</p>
      </div>
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ countByStatus('verwendet') }}</p>
        <p class="text-xs text-muted">Im Film verwendet</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-6 grid gap-4 p-4 sm:grid-cols-3">
      <div>
        <label for="filter-category" class="field-label">Anlass</label>
        <select
          id="filter-category"
          class="field-input"
          [value]="categoryFilter()"
          (change)="categoryFilter.set(readValue($event))"
        >
          <option value="">Alle</option>
          @for (category of categories; track category) {
            <option [value]="category">{{ category }}</option>
          }
        </select>
      </div>
      <div>
        <label for="filter-status" class="field-label">Status</label>
        <select
          id="filter-status"
          class="field-input"
          [value]="statusFilter()"
          (change)="statusFilter.set(readValue($event))"
        >
          <option value="">Alle</option>
          @for (status of statuses; track status) {
            <option [value]="status">{{ statusLabels[status] }}</option>
          }
        </select>
      </div>
      <div>
        <label for="filter-search" class="field-label">Suche</label>
        <input
          id="filter-search"
          class="field-input"
          placeholder="Name oder Beschreibung"
          [value]="searchFilter()"
          (input)="searchFilter.set(readValue($event))"
        />
      </div>
    </div>

    @if (isDemoMode) {
      <p class="mb-6 rounded-lg bg-warn-soft p-3 text-sm" style="color: var(--warn)">
        Demo-Modus: Die Beiträge stammen aus dem lokalen Browserspeicher. Download der
        Originaldateien und ZIP-Export brauchen ein konfiguriertes Backend.
      </p>
    }

    @if (loading()) {
      <div class="card space-y-3 p-4">
        @for (row of [1, 2, 3]; track row) {
          <div class="h-16 animate-pulse rounded-lg bg-line"></div>
        }
      </div>
    } @else if (filtered().length === 0) {
      <div class="card p-10 text-center">
        <p class="font-semibold">Keine Beiträge gefunden</p>
        <p class="mt-1 text-sm text-muted">
          {{ submissions().length === 0 ? 'Es wurde noch nichts hochgeladen.' : 'Passt kein Filter?' }}
        </p>
      </div>
    } @else {
      <ul class="space-y-3">
        @for (submission of filtered(); track submission.id) {
          <li class="card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-bold">
                  {{ submission.uploaderName }}
                  <span class="font-normal text-muted">· {{ submission.uploaderClass }}</span>
                </p>
                <p class="mt-0.5 text-sm text-muted">
                  {{ submission.category }} · {{ gradeLabel(submission.grade) }} ·
                  {{ submission.assets.length }}
                  {{ submission.assets.length === 1 ? 'Datei' : 'Dateien' }} ·
                  {{ sizeOf(submission) }}
                </p>
                @if (submission.description) {
                  <p class="mt-2 text-sm">{{ submission.description }}</p>
                }
                <p class="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  <span class="rounded bg-surface px-2 py-0.5">
                    Einwilligung {{ submission.consentVersion }}
                  </span>
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <label class="sr-only" [attr.for]="'status-' + submission.id">
                  Status von {{ submission.uploaderName }}
                </label>
                <select
                  [attr.id]="'status-' + submission.id"
                  class="field-input btn-sm w-auto"
                  [value]="submission.reviewStatus"
                  (change)="changeStatus(submission, readValue($event))"
                >
                  @for (status of statuses; track status) {
                    <option [value]="status">{{ statusLabels[status] }}</option>
                  }
                </select>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  style="color: var(--danger)"
                  (click)="remove(submission)"
                >
                  Löschen
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
    }
  `,
})
export class TeamDashboard implements OnInit {
  private readonly gateway = inject(SubmissionGateway);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly categories = CATEGORIES;
  protected readonly gradeLabel = gradeLabel;
  protected readonly statuses = STATUSES;
  protected readonly statusLabels = REVIEW_STATUS_LABELS;
  protected readonly isDemoMode = isDemoMode;

  protected readonly submissions = signal<Submission[]>([]);
  protected readonly loading = signal(true);

  // Signals, not plain properties: `filtered` is a computed, and a computed
  // only recomputes when a signal it read has changed. Plain fields written by
  // ngModel would leave the filters permanently inert.
  protected readonly categoryFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly searchFilter = signal('');

  protected readonly filtered = computed(() => {
    const category = this.categoryFilter();
    const status = this.statusFilter();
    const needle = this.searchFilter().trim().toLowerCase();

    return this.submissions().filter((submission) => {
      if (category && submission.category !== category) return false;
      if (status && submission.reviewStatus !== status) return false;
      if (needle) {
        const haystack = `${submission.uploaderName} ${submission.description}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  });

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
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.submissions.set(await this.gateway.list());
    } catch {
      this.submissions.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected countByStatus(status: ReviewStatus): number {
    return this.submissions().filter((entry) => entry.reviewStatus === status).length;
  }

  protected sizeOf(submission: Submission): string {
    return formatBytes(submission.assets.reduce((sum, asset) => sum + asset.sizeBytes, 0));
  }

  protected bytes(value: number): string {
    return formatBytes(value);
  }

  /** Reads the current value out of an input/select change event. */
  protected readValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected async changeStatus(submission: Submission, value: string): Promise<void> {
    const status = STATUSES.find((candidate) => candidate === value);
    if (!status) return;

    await this.gateway.setReviewStatus(submission.id, status);
    this.submissions.update((entries) =>
      entries.map((entry) => (entry.id === submission.id ? { ...entry, reviewStatus: status } : entry)),
    );
  }

  protected async remove(submission: Submission): Promise<void> {
    const confirmed = confirm(
      `Beitrag von ${submission.uploaderName} mit ${submission.assets.length} Datei(en) endgültig löschen?`,
    );
    if (!confirmed) return;

    await this.gateway.remove(submission.id);
    this.submissions.update((entries) => entries.filter((entry) => entry.id !== submission.id));
  }

  protected signOut(): void {
    this.auth.signOut();
    void this.router.navigate(['/team']);
  }
}
