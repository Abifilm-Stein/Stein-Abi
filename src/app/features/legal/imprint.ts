import { Component } from '@angular/core';
import { CONTACT, SCHOOL_NAME } from '../../core/config';

/**
 * Mandatory in Germany under § 5 DDG (formerly § 5 TMG). A site without one
 * is a liability, so the route exists from day one -- only the placeholders
 * need filling.
 */
@Component({
  selector: 'app-imprint',
  template: `
    <article class="mx-auto max-w-2xl">
      <h1 class="mb-8 text-3xl font-bold">Impressum</h1>

      <div class="card mb-8 border-warn p-4 text-sm" style="color: var(--warn)">
        <strong>Hinweis für das Projektteam:</strong> Angaben nach § 5 DDG sind Pflicht. Alle
        ⟨Platzhalter⟩ vor dem Livegang durch echte Daten der verantwortlichen Person ersetzen.
      </div>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Anbieter und inhaltlich Verantwortlicher</h2>
        <p class="text-muted">
          {{ contact.name }}<br />
          {{ contact.role }}<br />
          {{ contact.postal }}
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Kontakt</h2>
        <p class="text-muted">
          E-Mail:
          <a [href]="'mailto:' + contact.email" class="text-primary-ink underline">{{
            contact.email
          }}</a>
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Art des Angebots</h2>
        <p class="text-muted">
          Nicht kommerzielles, zeitlich befristetes Projekt des Abiturjahrgangs am
          {{ schoolName }}. Das Angebot richtet sich ausschließlich an Angehörige der Schule
          und ist nicht für die allgemeine Öffentlichkeit bestimmt.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xl font-bold">Haftung für Inhalte</h2>
        <p class="text-muted">
          Die hochgeladenen Inhalte stammen von Nutzerinnen und Nutzern. Wir prüfen sie vor
          der Verwendung, übernehmen aber keine Gewähr für von Dritten eingestellte Inhalte.
          Bei Kenntnis von Rechtsverstößen entfernen wir die betroffenen Inhalte unverzüglich.
        </p>
      </section>
    </article>
  `,
})
export class Imprint {
  protected readonly contact = CONTACT;
  protected readonly schoolName = SCHOOL_NAME;
}
