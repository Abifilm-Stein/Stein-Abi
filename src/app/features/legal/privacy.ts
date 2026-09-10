import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONSENT_VERSION, CONTACT, RETENTION_MONTHS, SCHOOL_NAME } from '../../core/config';

/**
 * !! LEGAL REVIEW REQUIRED before going live.
 *
 * This is a structurally complete draft covering the information duties of
 * Art. 13 GDPR for this specific use case. It is not legal advice. The school
 * administration and its data protection officer must sign it off, and every
 * ⟨placeholder⟩ has to be filled in.
 *
 * Whenever the wording below changes materially, bump CONSENT_VERSION in
 * `core/config.ts` so existing consents stay traceable to what was agreed.
 */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl">
      <h1 class="mb-2 text-3xl font-bold">Datenschutzerklärung</h1>
      <p class="mb-8 text-sm text-muted">Fassung {{ consentVersion }}</p>

      <div class="card mb-8 border-warn p-4 text-sm" style="color: var(--warn)">
        <strong>Hinweis für das Projektteam:</strong> Dieser Text ist ein vollständiger
        Entwurf, aber noch nicht juristisch geprüft. Vor dem Livegang von Schulleitung und
        Datenschutzbeauftragten freigeben lassen und alle ⟨Platzhalter⟩ ersetzen.
      </div>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">1. Verantwortlich für die Datenverarbeitung</h2>
        <p class="text-muted">
          {{ contact.name }}<br />
          {{ contact.role }}<br />
          {{ contact.postal }}<br />
          E-Mail:
          <a [href]="'mailto:' + contact.email" class="text-primary-ink underline">{{
            contact.email
          }}</a>
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">2. Welche Daten wir verarbeiten</h2>
        <ul class="list-disc space-y-1 pl-5 text-muted">
          <li>
            die von dir hochgeladenen Fotos und Videos einschließlich technischer Metadaten
            (z. B. Aufnahmezeit)
          </li>
          <li>dein Name und deine Stufe bzw. Rolle</li>
          <li>Anlass, Zeitraum und deine Beschreibung zur Aufnahme</li>
          <li>deine Einwilligungen samt Zeitpunkt und Fassung dieses Textes</li>
          <li>
            eine gekürzte, nicht rückführbare Prüfsumme deiner IP-Adresse zum Schutz vor
            Missbrauch
          </li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">3. Dein Zugangscode</h2>
        <p class="mb-2 text-muted">
          Für den Upload bekommst du vom Abifilm-Team einen persönlichen Code. Er ist deine
          Anmeldung: Wir speichern dafür
          <strong class="text-ink">keine E-Mail-Adresse und kein Passwort</strong>, sondern
          nur deinen Namen, deine Stufe und eine Prüfsumme des Codes. Aus dieser Prüfsumme
          lässt sich der Code nicht zurückrechnen.
        </p>
        <p class="text-muted">
          Über den Code sehen wir, welche Beiträge zu dir gehören — das ist die Grundlage
          dafür, dass du sie unter „Meine Beiträge“ einsehen und selbst zurückziehen kannst.
          Andere Personen können deine Beiträge nicht sehen. Gib deinen Code niemandem
          weiter, und melde dich an fremden Geräten wieder ab.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">4. Zweck und Rechtsgrundlage</h2>
        <p class="mb-2 text-muted">
          Die Daten werden ausschließlich zur Erstellung des Abifilms des {{ schoolName }}
          verarbeitet. Rechtsgrundlage ist deine Einwilligung nach Art. 6 Abs. 1 lit. a
          DSGVO.
        </p>
        <p class="text-muted">
          Auf Aufnahmen sind regelmäßig weitere Personen erkennbar. Deren Einwilligung
          bestätigst du beim Upload. Für Personen unter 16 Jahren ist zusätzlich die
          Einwilligung der Erziehungsberechtigten erforderlich (Art. 8 DSGVO) — dafür gibt es
          einen
          <a routerLink="/einwilligung" class="text-primary-ink underline"
            >Vordruck zum Ausdrucken</a
          >.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">5. Wer die Daten sehen kann</h2>
        <p class="text-muted">
          Zugriff hat ausschließlich das namentlich benannte Abifilm-Team des Jahrgangs. Die
          Uploads sind untereinander nicht sichtbar: Unter „Meine Beiträge“ siehst du nur,
          was du selbst hochgeladen hast — das wird nicht nur in der Website, sondern in der
          Datenbank selbst durchgesetzt. Eine Weitergabe an Dritte findet nicht statt.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">6. Speicherort</h2>
        <p class="text-muted">
          Dateien und Datenbank liegen bei ⟨Anbieter⟩ in einem Rechenzentrum innerhalb der
          Europäischen Union (⟨Region, z. B. Frankfurt am Main⟩). Eine Übermittlung in
          Drittländer findet nicht statt.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">7. Speicherdauer</h2>
        <p class="text-muted">
          Das gesamte Material wird spätestens {{ retentionMonths }} Monate nach der
          Abiturfeier vollständig und unwiderruflich gelöscht. Zieht jemand die Einwilligung
          zurück, löschen wir die betroffenen Dateien unverzüglich.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">8. Deine Rechte</h2>
        <p class="mb-2 text-muted">
          Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
          (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit
          (Art. 20) und Widerspruch (Art. 21 DSGVO).
        </p>
        <p class="mb-2 text-muted">
          <strong class="text-ink">Widerruf:</strong> Du kannst deine Einwilligung jederzeit
          ohne Angabe von Gründen zurückziehen. Einzelne Beiträge kannst du unter „Meine
          Beiträge“ selbst zurückziehen; für alles Weitere genügt eine E-Mail an
          <a [href]="'mailto:' + contact.email" class="text-primary-ink underline">{{
            contact.email
          }}</a>
          . Die Rechtmäßigkeit der Verarbeitung bis zum Widerruf bleibt davon unberührt.
        </p>
        <p class="text-muted">
          Außerdem kannst du dich bei der zuständigen Aufsichtsbehörde beschweren:
          ⟨Landesbeauftragte für Datenschutz und Informationsfreiheit, Bundesland⟩.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">9. Keine Tracker</h2>
        <p class="text-muted">
          Diese Seite verwendet keine Analyse-Werkzeuge, keine Werbe-Cookies und lädt keine
          Schriften oder Skripte von externen Servern. Technisch notwendig sind allein ein
          Eintrag im Sitzungsspeicher (deine Anmeldung) und ein lokaler Zwischenspeicher, der
          abgebrochene Uploads fortsetzbar macht. Beides verlässt dein Gerät nicht.
        </p>
      </section>
    </article>
  `,
})
export class Privacy {
  protected readonly contact = CONTACT;
  protected readonly schoolName = SCHOOL_NAME;
  protected readonly retentionMonths = RETENTION_MONTHS;
  protected readonly consentVersion = CONSENT_VERSION;
}
