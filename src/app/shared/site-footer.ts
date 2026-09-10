import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RETENTION_MONTHS, SCHOOL_NAME } from '../core/config';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  template: `
    <footer class="mt-16 border-t border-line bg-card">
      <div
        class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="max-w-md">
          {{ schoolName }} · Das gesammelte Material wird
          {{ retentionMonths }} Monate nach der Abiturfeier vollständig gelöscht.
        </p>
        <nav aria-label="Rechtliches" class="flex gap-4 font-semibold">
          <a routerLink="/datenschutz" class="text-primary-ink hover:underline">Datenschutz</a>
          <a routerLink="/impressum" class="text-primary-ink hover:underline">Impressum</a>
        </nav>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  protected readonly schoolName = SCHOOL_NAME;
  protected readonly retentionMonths = RETENTION_MONTHS;
}
