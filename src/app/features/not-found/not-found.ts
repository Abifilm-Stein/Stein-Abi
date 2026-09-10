import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-md py-10 text-center">
      <p class="mb-2 text-5xl font-bold text-primary-ink">404</p>
      <h1 class="mb-3 text-2xl font-bold">Diese Seite gibt es nicht</h1>
      <p class="mb-8 text-muted">
        Vielleicht ist der Link veraltet. Zum Hochladen geht es hier weiter.
      </p>
      <div class="flex flex-col justify-center gap-3 sm:flex-row">
        <a routerLink="/upload" class="btn btn-primary">Zum Upload</a>
        <a routerLink="/" class="btn btn-ghost">Startseite</a>
      </div>
    </div>
  `,
})
export class NotFound {}
