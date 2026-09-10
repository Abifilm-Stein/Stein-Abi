import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ABI_YEAR } from '../core/config';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="border-b border-line bg-card">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <a routerLink="/" class="flex items-center gap-2.5 font-bold tracking-tight">
          <span
            class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-card"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="5" width="14" height="14" rx="2.5" />
              <path d="m16 10 5.2-2.6a.6.6 0 0 1 .8.55v8.1a.6.6 0 0 1-.8.55L16 14z" />
            </svg>
          </span>
          <span class="leading-tight">
            Abifilm
            <span class="block text-xs font-medium text-muted">Jahrgang {{ abiYear }}</span>
          </span>
        </a>

        <nav aria-label="Hauptnavigation" class="flex items-center gap-1 text-sm font-semibold">
          <a
            routerLink="/upload"
            routerLinkActive="bg-primary-soft text-primary-ink"
            class="rounded-lg px-3 py-2 hover:bg-primary-soft"
            >Hochladen</a
          >
          <a
            routerLink="/team"
            routerLinkActive="bg-primary-soft text-primary-ink"
            class="rounded-lg px-3 py-2 text-muted hover:bg-primary-soft hover:text-ink"
            >Team</a
          >
        </nav>
      </div>
    </header>
  `,
})
export class SiteHeader {
  protected readonly abiYear = ABI_YEAR;
}
