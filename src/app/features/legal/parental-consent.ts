import { Component } from '@angular/core';
import { CONTACT, RETENTION_MONTHS, SCHOOL_NAME } from '../../core/config';

/**
 * Printable parental consent form (Art. 8 GDPR).
 *
 * Delivered as a print-optimised page rather than a PDF on purpose: it needs
 * no build step, no binary in the repo, and stays editable in one place. The
 * browser's "save as PDF" covers the case where a file has to be sent by
 * e-mail.
 */
@Component({
  selector: 'app-parental-consent',
  host: { class: 'block' },
  styles: `
    @media print {
      :host {
        font-size: 11pt;
      }
    }
  `,
  template: `
    <div class="mx-auto max-w-2xl">
      <div class="no-print card mb-8 p-4">
        <h1 class="mb-2 text-xl font-bold">Einwilligung der Erziehungsberechtigten</h1>
        <p class="mb-4 text-sm text-muted">
          Für Personen unter 16 Jahren verlangt Art. 8 DSGVO die Einwilligung der
          Erziehungsberechtigten. Diesen Vordruck ausdrucken, unterschreiben lassen und beim
          Abifilm-Team abgeben.
        </p>
        <button type="button" class="btn btn-primary" (click)="print()">
          Vordruck drucken
        </button>
      </div>

      <article class="card p-6 leading-relaxed sm:p-8">
        <h2 class="mb-1 text-lg font-bold">Einwilligung in die Verwendung von Bild- und Videoaufnahmen</h2>
        <p class="mb-6 text-sm text-muted">Abifilm des {{ schoolName }}</p>

        <p class="mb-6 text-sm">
          Der Abiturjahrgang erstellt einen Abschlussfilm. Dafür werden Fotos und Videos aus
          der Schulzeit gesammelt, auf denen Schülerinnen und Schüler erkennbar sind. Die
          Aufnahmen werden ausschließlich für diesen Film verwendet, auf Servern innerhalb der
          EU gespeichert und spätestens {{ retentionMonths }} Monate nach der Abiturfeier
          gelöscht. Die Einwilligung kann jederzeit ohne Nachteile widerrufen werden.
        </p>

        <div class="mb-6 space-y-6 text-sm">
          <p>
            Name des Kindes:
            <span class="ml-2 inline-block w-64 border-b border-ink align-bottom"></span>
          </p>
          <p>
            Klasse:
            <span class="ml-2 inline-block w-32 border-b border-ink align-bottom"></span>
          </p>
          <p>
            Name des / der Erziehungsberechtigten:
            <span class="ml-2 inline-block w-56 border-b border-ink align-bottom"></span>
          </p>
        </div>

        <p class="mb-6 text-sm">
          Hiermit willige ich ein, dass Bild- und Videoaufnahmen meines Kindes im Rahmen des
          oben beschriebenen Abifilms verarbeitet und im Film gezeigt werden dürfen.
        </p>

        <div class="mb-8 flex flex-wrap gap-x-10 gap-y-8 text-sm">
          <p>
            Ort, Datum:
            <span class="ml-2 inline-block w-48 border-b border-ink align-bottom"></span>
          </p>
          <p>
            Unterschrift:
            <span class="ml-2 inline-block w-56 border-b border-ink align-bottom"></span>
          </p>
        </div>

        <p class="text-xs text-muted">
          Verantwortlich: {{ contact.name }}, {{ contact.role }}, {{ contact.postal }} ·
          Widerruf und Rückfragen: {{ contact.email }}
        </p>
      </article>
    </div>
  `,
})
export class ParentalConsent {
  protected readonly schoolName = SCHOOL_NAME;
  protected readonly retentionMonths = RETENTION_MONTHS;
  protected readonly contact = CONTACT;

  protected print(): void {
    window.print();
  }
}
