import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ABI_YEAR,
  CONSENT_VERSION,
  CONTACT,
  LEGAL,
  LEGAL_INCOMPLETE,
  RETENTION_MONTHS,
  SCHOOL_NAME,
} from '../../core/config';

/**
 * !! LEGAL REVIEW REQUIRED before going live.
 *
 * Structurally complete statement covering the information duties of
 * Art. 13 GDPR for this specific system (Cloud Run, Firestore, Cloud Storage,
 * Cloudflare, Brevo). It is not legal advice. The school administration and its
 * data protection officer must sign it off, and every placeholder in
 * `core/config.ts` has to be filled in.
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

      @if (incomplete) {
        <div class="card mb-8 border-warn p-4 text-sm" style="color: var(--warn)">
          <strong>Hinweis für das Projektteam:</strong> Dieser Text ist ein vollständiger
          Entwurf, aber noch nicht juristisch geprüft. Vor dem Livegang rechtlich prüfen lassen und alle ⟨Platzhalter⟩ in
          <code>core/config.ts</code> ersetzen. Dieser Hinweis verschwindet dann von selbst.
        </div>
      }

      <section class="card mb-10 p-5">
        <h2 class="mb-2 text-xl font-bold">Das Wichtigste in Kürze</h2>
        <ul class="list-disc space-y-1 pl-5 text-muted">
          <li>Wir sammeln Fotos und Videos ausschließlich für den Abifilm.</li>
          <li>Nur das Abifilm-Team sieht, was hochgeladen wird. Es gibt keine öffentliche Galerie.</li>
          <li>Du meldest dich mit einem persönlichen Code an. Es gibt kein Passwort und kein Konto, das du selbst anlegst.</li>
          <li>Alles wird {{ retentionMonths }} Monate nach der Abiturfeier gelöscht.</li>
          <li>Du kannst deine Einwilligung jederzeit zurückziehen.</li>
        </ul>
      </section>

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
        <p class="mt-2 text-muted">
          Das Projekt ist ein privates Projekt des Abiturjahrgangs {{ abiYear }} am
          {{ schoolName }}. Die Schule ist weder Betreiberin noch Verantwortliche und hat
          keinen Zugriff auf die Daten.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">2. Ansprechperson für Datenschutz</h2>
        <p class="text-muted">
          Eine Datenschutzbeauftragte oder ein Datenschutzbeauftragter ist für dieses
          Projekt nicht benannt. Bei allen Fragen zum Datenschutz erreichst du die
          verantwortliche Person unter
          <a [href]="'mailto:' + contact.email" class="text-primary-ink underline">{{
            contact.email
          }}</a
          >.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">3. Welche Daten wir verarbeiten</h2>
        <h3 class="mb-1 font-semibold">Wenn du Dateien hochlädst</h3>
        <ul class="mb-4 list-disc space-y-1 pl-5 text-muted">
          <li>
            die Fotos und Videos selbst. Sie enthalten oft technische Zusatzdaten
            (Metadaten) wie Aufnahmezeit, Gerät und teils den Aufnahmeort. Wir verändern die
            Originaldateien nicht, das Team kann diese Angaben also sehen
          </li>
          <li>deine Angaben dazu: Titel, Beschreibung, Anlass und Zeitraum</li>
          <li>
            deine Einwilligungen mit Zeitpunkt und der Fassung dieses Textes, die du bestätigt
            hast
          </li>
          <li>
            Rückzugsanträge, falls du Material zurückziehst, mit Verlauf und Bearbeitung
          </li>
        </ul>
        <h3 class="mb-1 font-semibold">Zu deinem Zugang</h3>
        <ul class="mb-4 list-disc space-y-1 pl-5 text-muted">
          <li>dein Name und deine Stufe</li>
          <li>
            eine Prüfsumme deines Zugangscodes. Der Code selbst wird nicht gespeichert und
            lässt sich aus der Prüfsumme nicht zurückrechnen
          </li>
          <li>
            der Zeitpunkt deiner letzten Anmeldung. Das Team sieht damit, wer sich schon
            angemeldet hat, damit niemand ohne Zugang bleibt
          </li>
          <li>
            deine E-Mail-Adresse, nur um dir den Code zu schicken (siehe Abschnitt 5). Sie
            wird nicht in der Datenbank der Website gespeichert
          </li>
        </ul>
        <h3 class="mb-1 font-semibold">Technische Daten</h3>
        <ul class="list-disc space-y-1 pl-5 text-muted">
          <li>
            beim Aufruf der Seite fällt technisch bedingt deine IP-Adresse an, zusammen mit
            Zeitpunkt, aufgerufener Adresse und Browserangaben (Server-Protokolle)
          </li>
          <li>
            eine gekürzte, nicht rückführbare Prüfsumme deiner IP-Adresse, um Missbrauch zu
            begrenzen (zum Beispiel zu viele Anmeldeversuche)
          </li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">4. Zweck und Rechtsgrundlagen</h2>
        <p class="mb-2 text-muted">
          Wir verarbeiten deine Daten, um aus den Aufnahmen den Abifilm des
          {{ schoolName }} zu erstellen und zu zeigen. Dafür gilt deine
          <strong class="text-ink">Einwilligung</strong> (Art. 6 Abs. 1 lit. a DSGVO). Die
          Teilnahme ist freiwillig. Wenn du nichts hochlädst, entstehen dir keine Nachteile.
        </p>
        <p class="mb-2 text-muted">
          Für den sicheren Betrieb der Seite (Server-Protokolle, Schutz vor Missbrauch)
          verarbeiten wir technische Daten auf Grundlage unseres berechtigten Interesses
          (Art. 6 Abs. 1 lit. f DSGVO). Wir wollen damit verhindern, dass Unbefugte Zugang
          erhalten oder die Seite überlastet wird.
        </p>
        <p class="mb-2 text-muted">
          Auf Aufnahmen sind oft weitere Personen erkennbar. Beim Upload bestätigst du, dass
          diese einverstanden sind. Für Personen unter 18 Jahren sollte zusätzlich die
          Einwilligung der Erziehungsberechtigten vorliegen; für Personen unter 16 Jahren ist
          sie erforderlich (Art. 8 DSGVO). Dafür gibt es einen
          <a routerLink="/einwilligung" class="text-primary-ink underline"
            >Vordruck zum Ausdrucken</a
          >.
        </p>
        <p class="text-muted">
          Es findet keine automatisierte Entscheidungsfindung und kein Profiling statt.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">5. Dein Zugangscode und die E-Mail</h2>
        <p class="mb-2 text-muted">
          Für den Upload bekommst du von uns eine E-Mail mit deinem persönlichen Code. Er ist
          deine Anmeldung: Wir speichern dafür
          <strong class="text-ink">kein Passwort</strong>, sondern nur deinen Namen, deine
          Stufe und die Prüfsumme des Codes.
        </p>
        <p class="mb-2 text-muted">
          Zum Versand der E-Mail nutzen wir den Dienst Brevo (siehe Abschnitt 7). Deine
          Adresse und dein Code werden dabei an den Dienst übermittelt. Brevo führt ein
          Versandprotokoll, in dem die Adresse und der Zeitpunkt des Versands stehen.
          Danach nutzen wir die Adresse nicht mehr. Wir schicken keine Werbung und
          verwenden sie nicht für andere Zwecke.
        </p>
        <p class="text-muted">
          Über den Code sehen wir, welche Beiträge zu dir gehören. Das ist die Grundlage
          dafür, dass du sie unter „Meine Beiträge“ einsehen und zurückziehen kannst. Gib
          deinen Code niemandem weiter, und melde dich an fremden Geräten wieder ab. Ist dein
          Code verloren gegangen oder funktioniert er nicht, vergeben wir einen neuen. Der
          alte Code gilt dann nicht mehr.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">6. Wer die Daten sehen kann</h2>
        <p class="mb-2 text-muted">
          Zugriff hat ausschließlich das benannte Abifilm-Team des Jahrgangs. Es kann alle
          Beiträge sehen, herunterladen und, wenn nötig, löschen, außerdem die Liste der
          Konten mit Stufe, letzter Anmeldung und Anzahl der Uploads. Den Zugangscode sieht
          das Team nicht. Die Zugänge des Teams sind persönlich und durch Passwörter
          geschützt.
        </p>
        <p class="text-muted">
          Andere Teilnehmende sehen deine Beiträge nicht. Unter „Meine Beiträge“ siehst du nur,
          was du selbst hochgeladen hast. Eine öffentliche Galerie gibt es nicht. Eine
          Weitergabe an Dritte findet nicht statt, außer an die Dienstleister in Abschnitt 7.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">7. Dienstleister und Speicherort</h2>
        <p class="mb-3 text-muted">
          Wir setzen die folgenden Dienstleister ein. Mit ihnen bestehen Verträge zur
          Auftragsverarbeitung (Art. 28 DSGVO).
        </p>
        <ul class="list-disc space-y-3 pl-5 text-muted">
          <li>
            <strong class="text-ink">Google Cloud</strong> (Google Cloud EMEA Limited, Irland):
            Hier liegen deine Dateien (Cloud Storage), die Datenbank (Firestore) und der
            Server der Anwendung (Cloud Run). Die Daten werden in einem Rechenzentrum in
            Frankfurt am Main gespeichert. Google gehört zur Google LLC in den USA.
          </li>
          <li>
            <strong class="text-ink">Cloudflare</strong> (Cloudflare, Inc., USA): liefert die
            Webseite aus und schützt sie vor Angriffen. Dabei wird deine IP-Adresse technisch
            verarbeitet. Es werden dort keine hochgeladenen Dateien gespeichert.
          </li>
          <li>
            <strong class="text-ink">Brevo</strong> (Sendinblue SAS, Frankreich): versendet die
            E-Mail mit deinem Zugangscode.
          </li>
        </ul>
        <p class="mt-3 text-muted">
          Google und Cloudflare haben Mutterunternehmen in den USA. Eine Verarbeitung oder ein
          Zugriff aus den USA lässt sich dabei nicht vollständig ausschließen. Die
          Übermittlung stützt sich auf den Angemessenheitsbeschluss der EU-Kommission zum
          EU-US Data Privacy Framework, soweit die Unternehmen zertifiziert sind, und im
          Übrigen auf EU-Standardvertragsklauseln (Art. 45 und 46 DSGVO).
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">8. Wie lange wir Daten speichern</h2>
        <ul class="list-disc space-y-1 pl-5 text-muted">
          <li>
            Dateien, Angaben dazu, Einwilligungen und Konten: spätestens {{ retentionMonths }}
            Monate nach der Abiturfeier. Dann löschen wir alles vollständig und
            unwiderruflich.
          </li>
          <li>
            Zieht jemand die Einwilligung zurück, löschen wir die betroffenen Dateien
            unverzüglich nach der Bearbeitung des Antrags.
          </li>
          <li>
            Dateien, die hochgeladen, aber nie abgeschickt wurden, werden automatisch nach
            24 Stunden entfernt.
          </li>
          <li>
            Server-Protokolle der Dienstleister: nur kurz, in der Regel bis zu 30 Tage.
          </li>
          <li>
            Die Prüfsummen zur Missbrauchsbegrenzung und der Versandverlauf bei Brevo werden
            spätestens zusammen mit den übrigen Daten gelöscht.
          </li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">9. Verwendung im Film</h2>
        <p class="text-muted">
          {{ legal.screening }}. Es werden nur Aufnahmen verwendet, für die eine Einwilligung
          vorliegt. Material, bei dem ein Rückzug beantragt wurde, wird ab dem Antrag nicht
          mehr weiterverwendet. Der fertige Film ist ein eigenes Werk. Wurde er bereits
          gezeigt oder weitergegeben, können wir Kopien bei Dritten nicht zurückholen.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">10. So schützen wir deine Daten</h2>
        <ul class="list-disc space-y-1 pl-5 text-muted">
          <li>Die Verbindung zur Seite ist verschlüsselt (HTTPS).</li>
          <li>
            Dateien liegen in einem nicht öffentlichen Speicher. Zum Ansehen entsteht ein
            Link, der nur für eine Datei und nur wenige Minuten gilt.
          </li>
          <li>
            Der Browser spricht nicht direkt mit der Datenbank. Jeder Zugriff läuft über den
            Server der Anwendung, der prüft, wer du bist und was du sehen darfst.
          </li>
          <li>
            Zugangscodes und Passwörter werden nur als Prüfsumme gespeichert. Es gibt
            Begrenzungen gegen automatisches Durchprobieren.
          </li>
          <li>
            Beim Hochladen prüft der Server, ob die Datei wirklich ein Foto oder Video ist.
          </li>
        </ul>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">11. Deine Rechte</h2>
        <p class="mb-2 text-muted">
          Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
          (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit
          (Art. 20) und Widerspruch (Art. 21 DSGVO). Wende dich dafür an
          <a [href]="'mailto:' + contact.email" class="text-primary-ink underline">{{
            contact.email
          }}</a
          >.
        </p>
        <p class="mb-2 text-muted">
          <strong class="text-ink">Widerruf:</strong> Du kannst deine Einwilligung jederzeit
          ohne Angabe von Gründen zurückziehen. Stelle dafür unter „Meine Beiträge“ einen
          Rückzugsantrag, oder schreib uns. Die Rechtmäßigkeit der Verarbeitung bis zum
          Widerruf bleibt davon unberührt.
        </p>
        <p class="mb-2 text-muted">
          Beiträge werden nicht sofort automatisch gelöscht, weil der Film zu diesem
          Zeitpunkt bereits um eine Aufnahme herum geschnitten sein kann. Das Abifilm-Team
          nimmt deshalb Kontakt mit dir auf und entfernt das Material anschließend.
          <strong class="text-ink">Ablehnen kann das Team einen Rückzug nicht</strong>. Ab
          dem Antrag wird das Material nicht mehr weiterverwendet und danach gelöscht.
        </p>
        <p class="text-muted">
          Du kannst dich außerdem bei der zuständigen Aufsichtsbehörde beschweren:
          {{ legal.supervisoryAuthority }}.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">12. Cookies, Tracking und lokaler Speicher</h2>
        <p class="mb-2 text-muted">
          Diese Seite verwendet keine Analyse-Werkzeuge, keine Werbe-Cookies und lädt keine
          Schriften oder Skripte von fremden Servern.
        </p>
        <p class="text-muted">
          Technisch notwendig sind nur Einträge im Speicher deines Browsers: deine Anmeldung
          (im Sitzungsspeicher, sie endet mit dem Tab; mit „Angemeldet bleiben“ im lokalen
          Speicher) und ein Zwischenspeicher für Uploads, damit abgebrochene Übertragungen
          fortgesetzt werden können. Beides bleibt auf deinem Gerät. Für diese Einträge ist
          keine Einwilligung nötig, weil sie für den Dienst unbedingt erforderlich sind
          (§ 25 Abs. 2 Nr. 2 TDDDG).
        </p>
      </section>

      <section class="mb-8">
        <h2 class="mb-2 text-xl font-bold">13. Änderungen</h2>
        <p class="text-muted">
          Ändern wir diese Erklärung inhaltlich, erhöht sich die Fassung oben. Zu jeder
          Einwilligung speichern wir die Fassung, der du zugestimmt hast.
        </p>
      </section>
    </article>
  `,
})
export class Privacy {
  protected readonly contact = CONTACT;
  protected readonly legal = LEGAL;
  protected readonly incomplete = LEGAL_INCOMPLETE;
  protected readonly schoolName = SCHOOL_NAME;
  protected readonly abiYear = ABI_YEAR;
  protected readonly retentionMonths = RETENTION_MONTHS;
  protected readonly consentVersion = CONSENT_VERSION;
}
