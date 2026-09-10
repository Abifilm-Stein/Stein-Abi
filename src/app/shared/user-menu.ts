import { Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../core/account/session.service';

@Component({
  selector: 'app-user-menu',
  imports: [RouterLink],
  template: `
    @if (session.isSignedIn()) {
      <div class="relative">
        <button
          type="button"
          class="flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-1.5 text-sm font-semibold hover:bg-primary-soft"
          [attr.aria-expanded]="open()"
          aria-haspopup="menu"
          (click)="open.set(!open())"
        >
          <span
            class="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-card"
            aria-hidden="true"
            >{{ initials() }}</span
          >
          <span class="hidden max-w-32 truncate sm:block">{{ name() }}</span>
          <svg
            viewBox="0 0 24 24"
            class="size-4 text-muted"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        @if (open()) {
          <div
            class="card absolute right-0 z-40 mt-2 w-60 p-1.5 shadow-lg"
            role="menu"
            aria-label="Benutzermenü"
          >
            <div class="border-b border-line px-3 py-2">
              <p class="truncate font-semibold">{{ name() }}</p>
              <p class="text-xs text-muted">{{ session.account()?.schoolClass }}</p>
            </div>

            <a
              routerLink="/meine-beitraege"
              role="menuitem"
              class="mt-1.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-primary-soft"
              (click)="open.set(false)"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              Meine Beiträge
            </a>

            <a
              routerLink="/upload"
              role="menuitem"
              class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-primary-soft"
              (click)="open.set(false)"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                aria-hidden="true"
              >
                <path d="M12 16V4m0 0L8 8m4-4 4 4" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke-linecap="round" />
              </svg>
              Weitere hochladen
            </a>

            <button
              type="button"
              role="menuitem"
              class="mt-1.5 flex w-full items-center gap-2.5 rounded-lg border-t border-line px-3 py-2 pt-3 text-left text-sm font-semibold hover:bg-danger-soft"
              (click)="signOut()"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                aria-hidden="true"
              >
                <path d="M15 17l5-5-5-5M20 12H9" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" stroke-linecap="round" />
              </svg>
              Abmelden
            </button>
          </div>
        }
      </div>
    } @else {
      <a routerLink="/anmelden" class="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-primary-soft">
        Anmelden
      </a>
    }
  `,
})
export class UserMenu {
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);

  protected readonly name = computed(() => this.session.account()?.displayName ?? '');

  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );

  /** Close on an outside click, the behaviour every menu is expected to have. */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }

  protected signOut(): void {
    this.open.set(false);
    this.session.signOut();
    void this.router.navigate(['/']);
  }
}
