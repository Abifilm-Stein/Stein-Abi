import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/account/session.service';
import { CONTACT, gradeLabel } from '../../core/config';
import { MediaGateway } from '../../core/media/media-gateway';
import { MediaItem, REVIEW_STATUS_HINTS } from '../../core/models';
import { formatBytes } from '../../core/upload/file-validation';

@Component({
  selector: 'app-my-submissions',
  imports: [RouterLink],
  template: `
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Meine Dateien</h1>
        <p class="text-muted">Angemeldet als {{ session.account()?.displayName }}</p>
      </div>
      <a routerLink="/upload" class="btn btn-primary btn-sm">Weitere hochladen</a>
    </div>

    @if (loading()) {
      <div class="space-y-3">
        @for (row of [1, 2]; track row) {
          <div class="card h-24 animate-pulse"></div>
        }
      </div>
    } @else if (loadError()) {
      <div class="card border-danger p-6" role="alert">
        <p class="font-semibold" style="color: var(--danger)">
          Deine Dateien konnten nicht geladen werden.
        </p>
        <button type="button" class="btn btn-ghost btn-sm mt-3" (click)="reload()">
          Erneut versuchen
        </button>
      </div>
    } @else if (items().length === 0) {
      <div class="card p-10 text-center">
        <p class="mb-1 font-semibold">Noch nichts hochgeladen</p>
        <p class="mb-6 text-sm text-muted">
          Sobald du Fotos oder Videos abgeschickt hast, erscheinen sie hier.
        </p>
        <a routerLink="/upload" class="btn btn-primary">Jetzt hochladen</a>
      </div>
    } @else {
      <p class="mb-4 text-sm text-muted" role="status">
        {{ items().length }} {{ items().length === 1 ? 'Datei' : 'Dateien' }} ·
        {{ totalSizeLabel() }}
      </p>

      <ul class="space-y-3">
        @for (item of items(); track item.id) {
          <li class="card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-bold">{{ item.title }}</p>
                <p class="mt-0.5 text-sm text-muted">
                  {{ item.type === 'video' ? 'Video' : 'Foto' }} · {{ item.category }} ·
                  {{ gradeLabel(item.grade) }} · {{ bytes(item.fileSize) }}
                </p>
                @if (item.description) {
                  <p class="mt-2 text-sm">{{ item.description }}</p>
                }
                <p class="mt-2 text-xs text-muted">
                  Hochgeladen am {{ formatDate(item.createdAt) }}
                </p>
              </div>

              <div class="flex shrink-0 flex-col items-end gap-2">
                <span
                  class="rounded-full px-2.5 py-1 text-xs font-semibold"
                  [class.bg-primary-soft]="item.reviewStatus === 'verwendet'"
                  [class.text-primary-ink]="item.reviewStatus === 'verwendet'"
                  [class.bg-surface]="item.reviewStatus !== 'verwendet'"
                  [class.text-muted]="item.reviewStatus !== 'verwendet'"
                >
                  {{ statusHints[item.reviewStatus] }}
                </span>

                <div class="flex gap-2">
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    [disabled]="busy() === item.id"
                    (click)="open(item)"
                  >
                    Ansehen
                  </button>
                  @if (!item.openWithdrawal) {
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      (click)="openRequest(item.id)"
                    >
                      Rückzug beantragen
                    </button>
                  }
                </div>
              </div>
            </div>

            @if (item.openWithdrawal) {
              <div class="mt-3 rounded-lg bg-warn-soft p-3 text-sm" style="color: var(--warn)">
                <p class="font-semibold">
                  Rückzug beantragt am {{ formatDate(item.openWithdrawal.createdAt) }}
                </p>
                <p class="mt-1">
                  Das Abifilm-Team meldet sich bei dir. Bis dahin wird die Datei nicht
                  weiterverwendet.
                </p>
                <p class="mt-2 italic">{{ item.openWithdrawal.reason }}</p>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm mt-3"
                  [disabled]="busy() === item.id"
                  (click)="cancelRequest(item)"
                >
                  Antrag zurücknehmen
                </button>
              </div>
            } @else if (requesting() === item.id) {
              <form
                class="mt-3 rounded-lg border border-line p-3"
                (submit)="submitRequest($event, item)"
              >
                <label [attr.for]="'reason-' + item.id" class="field-label">
                  Warum möchtest du die Datei zurückziehen?
                </label>
                <textarea
                  [attr.id]="'reason-' + item.id"
                  class="field-input"
                  rows="3"
                  required
                  [value]="reason()"
                  (input)="reason.set(readValue($event))"
                ></textarea>
                <p class="mt-1.5 text-xs text-muted">
                  Die Datei wird nicht sofort gelöscht. Das Team nimmt Kontakt auf und
                  entfernt sie dann — der Film ist unter Umständen schon darum herum
                  geschnitten.
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="submit"
                    class="btn btn-primary btn-sm"
                    [disabled]="busy() === item.id || reason().trim().length < 3"
                  >
                    {{ busy() === item.id ? 'Wird gesendet…' : 'Antrag stellen' }}
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="closeRequest()">
                    Abbrechen
                  </button>
                </div>
              </form>
            }
          </li>
        }
      </ul>

      @if (openError()) {
        <p class="field-error mt-4" role="alert">
          <span aria-hidden="true">⚠</span><span>{{ openError() }}</span>
        </p>
      }

      <div class="card mt-8 p-5 text-sm text-muted">
        <h2 class="mb-2 font-bold text-ink">Warum öffnet sich die Datei in einem neuen Tab?</h2>
        <p class="mb-3">
          Deine Dateien liegen nicht öffentlich im Netz. „Ansehen“ holt eine Adresse, die nur
          für dich und nur für kurze Zeit gilt — danach läuft sie ab.
        </p>
        <h2 class="mb-2 font-bold text-ink">Und warum kann ich nicht direkt löschen?</h2>
        <p>
          Weil der Film zum Zeitpunkt deiner Anfrage schon um eine Aufnahme herum geschnitten
          sein kann. Ein Antrag stellt sicher, dass das Team es mitbekommt und mit dir
          bespricht. <strong class="text-ink">Ablehnen kann es den Rückzug nicht</strong> —
          deine Einwilligung darfst du jederzeit zurückziehen. Bei Problemen:
          <a [href]="'mailto:' + contact.email" class="font-semibold text-primary-ink underline">{{
            contact.email
          }}</a>
        </p>
      </div>
    }
  `,
})
export class MySubmissions implements OnInit {
  protected readonly session = inject(SessionService);
  private readonly gateway = inject(MediaGateway);

  protected readonly statusHints = REVIEW_STATUS_HINTS;
  protected readonly contact = CONTACT;
  protected readonly gradeLabel = gradeLabel;

  protected readonly items = signal<MediaItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly openError = signal<string | null>(null);

  protected readonly requesting = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal<string | null>(null);

  protected readonly totalSizeLabel = computed(() =>
    formatBytes(this.items().reduce((sum, item) => sum + item.fileSize, 0)),
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
      this.items.set(await this.gateway.listMine(account.id));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Fetch a short-lived link and open it.
   *
   * The URL is deliberately never stored: it expires, and keeping it around
   * would turn a temporary permission into a lasting one.
   */
  protected async open(item: MediaItem): Promise<void> {
    this.openError.set(null);
    this.busy.set(item.id);
    try {
      window.open(await this.gateway.signedUrl(item.id), '_blank', 'noopener');
    } catch {
      this.openError.set('Die Datei konnte nicht geöffnet werden.');
    } finally {
      this.busy.set(null);
    }
  }

  protected openRequest(id: string): void {
    this.reason.set('');
    this.requesting.set(id);
  }

  protected closeRequest(): void {
    this.requesting.set(null);
    this.reason.set('');
  }

  protected readValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected async submitRequest(event: Event, item: MediaItem): Promise<void> {
    event.preventDefault();

    const account = this.session.account();
    const reason = this.reason().trim();
    if (!account || reason.length < 3) return;

    this.busy.set(item.id);
    try {
      await this.gateway.requestWithdrawal(item.id, account.id, reason);
      this.closeRequest();
      await this.reload();
    } catch {
      this.loadError.set(true);
    } finally {
      this.busy.set(null);
    }
  }

  protected async cancelRequest(item: MediaItem): Promise<void> {
    const account = this.session.account();
    const request = item.openWithdrawal;
    if (!account || !request) return;

    this.busy.set(item.id);
    try {
      await this.gateway.cancelWithdrawal(request.id, account.id);
      await this.reload();
    } catch {
      this.loadError.set(true);
    } finally {
      this.busy.set(null);
    }
  }

  protected bytes(value: number): string {
    return formatBytes(value);
  }

  protected formatDate(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(parsed);
  }
}
