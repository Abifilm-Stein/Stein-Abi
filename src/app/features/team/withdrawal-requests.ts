import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { gradeLabel } from '../../core/config';
import { WITHDRAWAL_STATUS_LABELS, WithdrawalRequest } from '../../core/models';
import { SubmissionGateway } from '../../core/submissions/submission-gateway';

@Component({
  selector: 'app-withdrawal-requests',
  imports: [RouterLink],
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Rückzugsanträge</h1>
        <p class="text-muted">
          {{ open().length }} offen · {{ requests().length }} insgesamt
        </p>
      </div>
      <a routerLink="/team/uebersicht" class="btn btn-ghost btn-sm">Zu den Beiträgen</a>
    </div>

    <div class="card mb-6 border-warn p-4 text-sm" style="color: var(--warn)">
      <p class="mb-1 font-bold">Ein Rückzug kann nicht abgelehnt werden.</p>
      <p>
        Eine Einwilligung darf nach Art. 7 Abs. 3 DSGVO jederzeit zurückgezogen werden.
        Dieser Bereich dient dazu, die Entfernung zu koordinieren — nicht dazu, über sie
        zu entscheiden. Bis ein Antrag erledigt ist, darf das Material
        <strong>nicht weiter im Film verwendet</strong> werden. „Zurückgenommen“ ist nur
        zulässig, wenn die Person selbst zugestimmt hat, das Material doch zu behalten.
      </p>
    </div>

    @if (loading()) {
      <div class="space-y-3">
        @for (row of [1, 2]; track row) {
          <div class="card h-32 animate-pulse"></div>
        }
      </div>
    } @else if (loadError()) {
      <div class="card border-danger p-6" role="alert">
        <p class="font-semibold" style="color: var(--danger)">
          Die Anträge konnten nicht geladen werden.
        </p>
        <button type="button" class="btn btn-ghost btn-sm mt-3" (click)="reload()">
          Erneut versuchen
        </button>
      </div>
    } @else if (requests().length === 0) {
      <div class="card p-10 text-center">
        <p class="font-semibold">Keine Anträge</p>
        <p class="mt-1 text-sm text-muted">
          Hier erscheinen Anträge, wenn jemand einen Beitrag zurückziehen möchte.
        </p>
      </div>
    } @else {
      <ul class="space-y-3">
        @for (request of requests(); track request.id) {
          <li
            class="card p-4"
            [class.border-warn]="request.status === 'offen'"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-bold">
                  {{ request.uploaderName }}
                  <span class="font-normal text-muted">· {{ request.uploaderClass }}</span>
                </p>
                <p class="mt-0.5 text-sm text-muted">
                  {{ request.assetCount }}
                  {{ request.assetCount === 1 ? 'Datei' : 'Dateien' }} · beantragt am
                  {{ formatDate(request.createdAt) }}
                </p>
                <p class="mt-2 text-sm italic">„{{ request.reason }}“</p>
              </div>

              <span
                class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                [class.bg-warn-soft]="request.status === 'offen'"
                [class.bg-surface]="request.status !== 'offen'"
                [class.text-muted]="request.status !== 'offen'"
                [style.color]="request.status === 'offen' ? 'var(--warn)' : null"
              >
                {{ statusLabels[request.status] }}
              </span>
            </div>

            @if (request.status === 'offen') {
              <form class="mt-4 border-t border-line pt-4" (submit)="resolve($event, request)">
                <label [attr.for]="'note-' + request.id" class="field-label">
                  Notiz zum Abschluss
                  <span class="font-normal text-muted">(wird protokolliert)</span>
                </label>
                <input
                  [attr.id]="'note-' + request.id"
                  class="field-input"
                  placeholder="z. B. „Mit Lena telefoniert, Clip aus Szene 4 entfernt.“"
                  [value]="noteFor(request.id)"
                  (input)="setNote(request.id, readValue($event))"
                />

                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="submit"
                    class="btn btn-primary btn-sm"
                    [disabled]="busy() === request.id"
                    (click)="outcome.set('erledigt')"
                  >
                    {{ busy() === request.id ? 'Wird gelöscht…' : 'Material löschen und erledigen' }}
                  </button>
                  <button
                    type="submit"
                    class="btn btn-ghost btn-sm"
                    [disabled]="busy() === request.id"
                    (click)="outcome.set('zurueckgenommen')"
                  >
                    Person hat Antrag zurückgenommen
                  </button>
                </div>
                <p class="mt-2 text-xs text-muted">
                  „Löschen und erledigen“ entfernt den Beitrag samt Dateien endgültig.
                </p>
              </form>
            } @else {
              <div class="mt-3 border-t border-line pt-3 text-sm text-muted">
                @if (request.resolvedAt) {
                  <p>Abgeschlossen am {{ formatDate(request.resolvedAt) }}</p>
                }
                @if (request.resolutionNote) {
                  <p class="mt-1">{{ request.resolutionNote }}</p>
                }
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class WithdrawalRequests implements OnInit {
  private readonly gateway = inject(SubmissionGateway);

  protected readonly statusLabels = WITHDRAWAL_STATUS_LABELS;
  protected readonly gradeLabel = gradeLabel;

  protected readonly requests = signal<WithdrawalRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly busy = signal<string | null>(null);

  /** Which button was pressed; both submit the same form. */
  protected readonly outcome = signal<'erledigt' | 'zurueckgenommen'>('erledigt');
  private readonly notes = signal<Record<string, string>>({});

  protected readonly open = computed(() =>
    this.requests().filter((request) => request.status === 'offen'),
  );

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.requests.set(await this.gateway.listWithdrawalRequests());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected noteFor(id: string): string {
    return this.notes()[id] ?? '';
  }

  protected setNote(id: string, value: string): void {
    this.notes.update((current) => ({ ...current, [id]: value }));
  }

  protected readValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async resolve(event: Event, request: WithdrawalRequest): Promise<void> {
    event.preventDefault();

    const outcome = this.outcome();
    const note = this.noteFor(request.id).trim();

    const confirmed =
      outcome === 'erledigt'
        ? confirm(
            `Beitrag von ${request.uploaderName} mit ${request.assetCount} Datei(en) endgültig löschen?`,
          )
        : confirm(
            `Antrag von ${request.uploaderName} als zurückgenommen schließen? Das ist nur zulässig, wenn ${request.uploaderName} dem zugestimmt hat.`,
          );
    if (!confirmed) return;

    this.busy.set(request.id);
    try {
      await this.gateway.resolveWithdrawal(request.id, outcome, note);
      await this.reload();
    } catch {
      this.loadError.set(true);
    } finally {
      this.busy.set(null);
    }
  }

  protected formatDate(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(parsed);
  }
}
