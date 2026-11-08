import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ABI_YEAR, CONTACT, LEGAL, LEGAL_INCOMPLETE, SCHOOL_NAME } from '../../core/config';

/**
 * Mandatory in Germany under § 5 DDG (formerly § 5 TMG). The provider details
 * come from `CONTACT` and `LEGAL` in `core/config.ts`.
 */
@Component({
  selector: 'app-imprint',
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl">
      <h1 class="mb-8 text-3xl font-bold">Impressum</h1>

      @if (incomplete) {
        <div class="card mb-8 border-warn p-4 text-sm" style="color: var(--warn)">
          <strong>Hinweis für das Projektteam:</strong> Angaben nach § 5 DDG sind Pflicht. Alle
          ⟨Platzhalter⟩ vor dem Livegang durch echte Daten ersetzen (siehe
          <code>core/config.ts</code>). Dieser Hinweis verschwindet dann von selbst.
        </div>
      }

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Angaben nach § 5 DDG</h2>
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
          }}</a
          ><br />
          Wir antworten in der Regel innerhalb weniger Tage.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Inhaltlich verantwortlich</h2>
        <p class="text-muted">
          Verantwortlich für die Inhalte nach § 18 Abs. 2 MStV ist die oben genannte Person.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Art des Angebots und Bezug zur Schule</h2>
        <p class="mb-2 text-muted">
          Nicht kommerzielles, zeitlich befristetes Projekt des Abiturjahrgangs
          {{ abiYear }} am {{ schoolName }}. Das Angebot dient dem Sammeln von Fotos und
          Videos für den Abifilm und richtet sich ausschließlich an Angehörige der Schule. Es
          ist nicht für die allgemeine Öffentlichkeit bestimmt. Es werden keine Einnahmen
          erzielt, es gibt keine Werbung.
        </p>
        <p class="text-muted">
          Schule: {{ schoolName }}, {{ legal.schoolAddress }}<br />
          Schulleitung: {{ legal.headteacher }}<br />
          Das Projekt wird von Schülerinnen und Schülern des Jahrgangs betrieben und ist keine
          offizielle Seite der Schule oder der Schulverwaltung.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Haftung für Inhalte</h2>
        <p class="text-muted">
          Die hochgeladenen Inhalte stammen von den Teilnehmenden. Sie sind nicht öffentlich
          abrufbar und werden vom Abifilm-Team vor der Verwendung gesichtet. Wir übernehmen
          keine Gewähr für Inhalte, die Dritte einstellen. Bei Kenntnis von Rechtsverstößen
          entfernen wir die betroffenen Inhalte unverzüglich. Hinweise bitte an die oben
          genannte E-Mail-Adresse.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Haftung für Links</h2>
        <p class="text-muted">
          Diese Seite verlinkt nur auf eigene Unterseiten. Auf Inhalte externer Seiten haben
          wir keinen Einfluss. Sollten wir künftig externe Links setzen, prüfen wir sie vor
          der Verlinkung und entfernen sie bei bekannt gewordenen Rechtsverstößen.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">Urheberrecht und Rechte an Aufnahmen</h2>
        <p class="text-muted">
          Die Rechte an hochgeladenen Fotos und Videos bleiben bei den Urheberinnen und
          Urhebern. Wir nutzen sie nur im Rahmen der Einwilligung, die beim Upload erteilt
          wird, und nur für den Abifilm. Die Texte und das Design dieser Seite sind für diesen
          Zweck erstellt und dürfen nicht ohne Rücksprache kopiert werden.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xl font-bold">Datenschutz</h2>
        <p class="text-muted">
          Wie wir mit personenbezogenen Daten umgehen, steht in der
          <a routerLink="/datenschutz" class="text-primary-ink underline"
            >Datenschutzerklärung</a
          >.
        </p>
      </section>
    </article>
  `,
})
export class Imprint {
  protected readonly contact = CONTACT;
  protected readonly legal = LEGAL;
  protected readonly incomplete = LEGAL_INCOMPLETE;
  protected readonly schoolName = SCHOOL_NAME;
  protected readonly abiYear = ABI_YEAR;
}
