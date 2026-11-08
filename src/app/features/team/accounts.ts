import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaGateway } from '../../core/media/media-gateway';
import { AccountSummary } from '../../core/models';
import { formatBytes } from '../../core/upload/file-validation';

type Filter = 'alle' | 'nie' | 'ohne' | 'mit';

@Component({
  selector: 'app-accounts',
  imports: [RouterLink],
  template: `
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Konten</h1>
        <p class="text-muted">{{ accounts().length }} Personen</p>
      </div>
      <a routerLink="/team/uebersicht" class="btn btn-ghost btn-sm">Alle Dateien</a>
    </div>

    <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ signedIn() }} / {{ accounts().length }}</p>
        <p class="text-xs text-muted">haben sich angemeldet</p>
      </div>
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ uploaders() }}</p>
        <p class="text-xs text-muted">haben hochgeladen</p>
      </div>
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ totalPhotos() }}</p>
        <p class="text-xs text-muted">Fotos</p>
      </div>
      <div class="card p-4">
        <p class="text-2xl font-bold">{{ totalVideos() }}</p>
        <p class="text-xs text-muted">Videos</p>
      </div>
    </div>

    <div class="card mb-6 grid gap-4 p-4 sm:grid-cols-2">
      <div>
        <label for="acc-filter" class="field-label">Anzeigen</label>
        <select
          id="acc-filter"
          class="field-input"
          [value]="filter()"
          (change)="filter.set(readFilter($event))"
        >
          <option value="alle">Alle</option>
          <option value="nie">Noch nie angemeldet</option>
          <option value="ohne">Angemeldet, nichts hochgeladen</option>
          <option value="mit">Mit Uploads</option>
        </select>
      </div>
      <div>
        <label for="acc-search" class="field-label">Suche</label>
        <input
          id="acc-search"
          class="field-input"
          placeholder="Name"
          [value]="search()"
          (input)="search.set(readValue($event))"
        />
      </div>
    </div>

    @if (loading()) {
      <div class="card h-32 animate-pulse p-4"></div>
    } @else if (failed()) {
      <p class="card p-6 text-sm" role="alert">Die Konten konnten nicht geladen werden.</p>
    } @else {
      <div class="card overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-muted">
            <tr>
              <th class="p-3">Name</th>
              <th class="p-3">Stufe</th>
              <th class="p-3">Zuletzt angemeldet</th>
              <th class="p-3">Fotos</th>
              <th class="p-3">Videos</th>
              <th class="p-3">Volumen</th>
            </tr>
          </thead>
          <tbody>
            @for (a of filtered(); track a.id) {
              <tr class="border-t border-line">
                <td class="p-3 font-semibold">
                  @if (a.photos + a.videos > 0) {
                    <a
                      class="underline"
                      routerLink="/team/uebersicht"
                      [queryParams]="{ suche: a.name }"
                      >{{ a.name }}</a
                    >
                  } @else {
                    {{ a.name }}
                  }
                  @if (a.revoked) {
                    <span class="ml-1 text-xs text-muted">(gesperrt)</span>
                  }
                </td>
                <td class="p-3">{{ a.schoolClass }}</td>
                <td class="p-3">{{ seen(a) }}</td>
                <td class="p-3">{{ a.photos }}</td>
                <td class="p-3">{{ a.videos }}</td>
                <td class="p-3">{{ bytes(a.bytes) }}</td>
              </tr>
            } @empty {
              <tr>
                <td class="p-6 text-center text-muted" colspan="6">Nichts gefunden</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class Accounts implements OnInit {
  private readonly gateway = inject(MediaGateway);

  protected readonly accounts = signal<AccountSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly filter = signal<Filter>('alle');
  protected readonly search = signal('');
  protected readonly bytes = formatBytes;

  protected readonly signedIn = computed(() => this.accounts().filter((a) => a.lastSeenAt).length);
  protected readonly uploaders = computed(
    () => this.accounts().filter((a) => a.photos + a.videos > 0).length,
  );
  protected readonly totalPhotos = computed(() =>
    this.accounts().reduce((sum, a) => sum + a.photos, 0),
  );
  protected readonly totalVideos = computed(() =>
    this.accounts().reduce((sum, a) => sum + a.videos, 0),
  );

  protected readonly filtered = computed(() => {
    const mode = this.filter();
    const needle = this.search().trim().toLowerCase();
    return this.accounts().filter((a) => {
      const uploads = a.photos + a.videos;
      if (mode === 'nie' && a.lastSeenAt) return false;
      if (mode === 'ohne' && (!a.lastSeenAt || uploads > 0)) return false;
      if (mode === 'mit' && uploads === 0) return false;
      return !needle || a.name.toLowerCase().includes(needle);
    });
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.accounts.set(await this.gateway.listAccounts());
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected seen(account: AccountSummary): string {
    if (!account.lastSeenAt) return 'noch nie';
    return new Date(account.lastSeenAt).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected readValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected readFilter(event: Event): Filter {
    return (event.target as HTMLSelectElement).value as Filter;
  }
}
