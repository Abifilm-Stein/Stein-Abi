import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTACT } from '../../core/config';

@Component({
  selector: 'app-thanks',
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-xl text-center">
      <div
        class="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-primary-soft text-primary-ink"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" class="size-8" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      <h1 class="mb-3 text-3xl font-bold">Angekommen. Danke!</h1>

      <p class="mb-8 text-muted">
        @if (fileCount > 0) {
          {{ fileCount }} {{ fileCount === 1 ? 'Datei liegt' : 'Dateien liegen' }} jetzt beim
          Abifilm-Team.
        } @else {
          Dein Beitrag liegt jetzt beim Abifilm-Team.
        }
        Wenn wir Fragen zu einer Aufnahme haben, melden wir uns.
      </p>

      <div class="flex flex-col justify-center gap-3 sm:flex-row">
        <a routerLink="/upload" class="btn btn-primary">Weitere Dateien hochladen</a>
        <a routerLink="/" class="btn btn-ghost">Zur Startseite</a>
      </div>

      <p class="mt-10 text-sm text-muted">
        Du möchtest einen Beitrag zurückziehen? Schreib an
        <a [href]="'mailto:' + contact.email" class="font-semibold text-primary-ink underline">{{
          contact.email
        }}</a
        >, wir löschen ihn dann.
      </p>
    </div>
  `,
})
export class Thanks {
  protected readonly contact = CONTACT;
  /** Passed via router state on submit; zero on a direct visit. */
  protected readonly fileCount: number = history.state?.fileCount ?? 0;
}
