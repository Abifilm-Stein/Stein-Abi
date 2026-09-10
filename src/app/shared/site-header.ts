import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ABI_YEAR } from '../core/config';
import { Logo } from './logo';
import { UserMenu } from './user-menu';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, Logo, UserMenu],
  template: `
    <header class="border-b border-line bg-card">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <a
          routerLink="/"
          class="flex shrink-0 items-center gap-3 font-bold tracking-tight"
          aria-label="SteinAbi, zur Startseite"
        >
          <!-- Mark inherits the brand green; the wordmark next to it supplies
               the accessible name, so the SVG itself stays decorative. -->
          <app-logo class="w-16 shrink-0 text-brand sm:w-20" />
          <span class="leading-tight">
            SteinAbi
            <span class="block text-xs font-medium text-muted">Jahrgang {{ abiYear }}</span>
          </span>
        </a>

        <div class="flex items-center gap-1">
          <nav aria-label="Hauptnavigation" class="flex items-center text-sm font-semibold">
            <a
              routerLink="/upload"
              routerLinkActive="bg-primary-soft text-primary-ink"
              class="rounded-lg px-3 py-2 hover:bg-primary-soft"
              >Hochladen</a
            >
          </nav>
          <app-user-menu />
        </div>
      </div>
    </header>
  `,
})
export class SiteHeader {
  protected readonly abiYear = ABI_YEAR;
}
