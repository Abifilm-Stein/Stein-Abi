import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CATEGORIES, gradeLabel } from '../../core/config';
import { MediaGateway } from '../../core/media/media-gateway';
import { MediaItem, REVIEW_STATUS_LABELS, ReviewStatus } from '../../core/models';
import { isDemoMode } from '../../core/runtime-config';
import { formatBytes } from '../../core/upload/file-validation';

const STATUSES: ReviewStatus[] = ['neu', 'gesichtet', 'verwendet', 'aussortiert'];

@Component({
  selector: 'app-team-dashboard',
  imports: [RouterLink],
  template: `
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Dateien</h1>
        <p class="text-muted">{{ items().length }} insgesamt</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <a routerLink="/team/rueckzuege" class="btn btn-ghost btn-sm">
          Rückzugsanträge
          @if (openWithdrawals() > 0) {
            <span
              class="ml-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold"
              style="color: var(--warn)"
              >{{ openWithdrawals() }}</span
            >
          }
        </a>
        <button type="button" class="btn btn-ghost btn-sm" (click)="signOut()">Abmelden</button>
      </div>
    </div>

    @if (openWithdrawals() > 0) {
      <div class="card mb-6 border-warn p-4 text-sm" role="status" style="color: var(--warn)">
        <strong>
          {{ openWithdrawals() }}
          {{ openWithdrawals() === 1 ? 'offener Rückzugsantrag' : 'offene Rückzugsanträge' }}.
        </strong>
        Betroffenes Material darf bis zur Klärung nicht weiter im Film verwendet werden.
        <a routerLink="/team/rueckzuege" class="font-semibold underline">Jetzt bearbeiten</a>
      </div>
    }

    <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ items().length }}</p>
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
          placeholder="Name, Titel oder Beschreibung"
          [value]="searchFilter()"
          (input)="searchFilter.set(readValue($event))"
        />
      </div>
    </div>

    @if (isDemoMode) {
      <p class="mb-6 rounded-lg bg-warn-soft p-3 text-sm" style="color: var(--warn)">
        Demo-Modus: Die Einträge stammen aus dem lokalen Browserspeicher. Ansehen und
        Herunterladen brauchen ein konfiguriertes Backend.
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
        <p class="font-semibold">Nichts gefunden</p>
        <p class="mt-1 text-sm text-muted">
          {{ items().length === 0 ? 'Es wurde noch nichts hochgeladen.' : 'Passt kein Filter?' }}
        </p>
      </div>
    } @else {
      <ul class="space-y-3">
        @for (item of filtered(); track item.id) {
          <li class="card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-bold">{{ item.title }}</p>
                <p class="mt-0.5 text-sm text-muted">
                  {{ item.uploaderName }} · {{ item.uploaderClass }} ·
                  {{ item.type === 'video' ? 'Video' : 'Foto' }} · {{ item.category }} ·
                  {{ gradeLabel(item.grade) }} · {{ bytes(item.fileSize) }}
                </p>
                @if (item.description) {
                  <p class="mt-2 text-sm">{{ item.description }}</p>
                }
                <p class="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  @if (item.openWithdrawal) {
                    <span
                      class="rounded bg-warn-soft px-2 py-0.5 font-bold"
                      style="color: var(--warn)"
                      >Rückzug beantragt — nicht verwenden</span
                    >
                  }
                  <span class="rounded bg-surface px-2 py-0.5">
                    Einwilligung {{ item.consentVersion }}
                  </span>
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <button type="button" class="btn btn-ghost btn-sm" (click)="open(item)">
                  Ansehen
                </button>
                <label class="sr-only" [attr.for]="'status-' + item.id">
                  Status von {{ item.title }}
                </label>
                <select
                  [attr.id]="'status-' + item.id"
                  class="field-input btn-sm w-auto"
                  [value]="item.reviewStatus"
                  (change)="changeStatus(item, readValue($event))"
                >
                  @for (status of statuses; track status) {
                    <option [value]="status">{{ statusLabels[status] }}</option>
                  }
                </select>
              </div>
            </div>
          </li>
        }
      </ul>

      @if (actionError()) {
        <p class="field-error mt-4" role="alert">
          <span aria-hidden="true">⚠</span><span>{{ actionError() }}</span>
        </p>
      }
    }
  `,
})
export class TeamDashboard implements OnInit {
  private readonly gateway = inject(MediaGateway);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly categories = CATEGORIES;
  protected readonly gradeLabel = gradeLabel;
  protected readonly statuses = STATUSES;
  protected readonly statusLabels = REVIEW_STATUS_LABELS;
  protected readonly isDemoMode = isDemoMode;

  protected readonly items = signal<MediaItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly actionError = signal<string | null>(null);

  // Signals, not plain properties: `filtered` is a computed, and a computed
  // only recomputes when a signal it read has changed.
  protected readonly categoryFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly searchFilter = signal('');

  protected readonly filtered = computed(() => {
    const category = this.categoryFilter();
    const status = this.statusFilter();
    const needle = this.searchFilter().trim().toLowerCase();

    return this.items().filter((item) => {
      if (category && item.category !== category) return false;
      if (status && item.reviewStatus !== status) return false;
      if (needle) {
        const haystack = `${item.uploaderName} ${item.title} ${item.description}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  });

  protected readonly openWithdrawals = computed(
    () => this.items().filter((item) => item.openWithdrawal).length,
  );

  protected readonly totalSizeLabel = computed(() =>
    formatBytes(this.items().reduce((sum, item) => sum + item.fileSize, 0)),
  );

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.items.set(await this.gateway.listAll());
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected countByStatus(status: ReviewStatus): number {
    return this.items().filter((item) => item.reviewStatus === status).length;
  }

  protected bytes(value: number): string {
    return formatBytes(value);
  }

  protected readValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected async open(item: MediaItem): Promise<void> {
    this.actionError.set(null);
    try {
      window.open(await this.gateway.adminSignedUrl(item.id), '_blank', 'noopener');
    } catch {
      this.actionError.set('Die Datei konnte nicht geöffnet werden.');
    }
  }

  protected async changeStatus(item: MediaItem, value: string): Promise<void> {
    const status = STATUSES.find((candidate) => candidate === value);
    if (!status) return;

    this.actionError.set(null);
    try {
      await this.gateway.setReviewStatus(item.id, status);
      this.items.update((entries) =>
        entries.map((entry) => (entry.id === item.id ? { ...entry, reviewStatus: status } : entry)),
      );
    } catch {
      // The server refuses 'verwendet' while a withdrawal request is open.
      this.actionError.set(
        'Status konnte nicht gesetzt werden. Bei offenem Rückzugsantrag ist „Im Film verwendet“ gesperrt.',
      );
    }
  }

  protected signOut(): void {
    this.auth.signOut();
    void this.router.navigate(['/team']);
  }
}
