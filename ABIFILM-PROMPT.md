# Prompt: Abifilm-Sammelplattform „Freiherr-vom-Stein-Gymnasium“

> **Vor dem Absenden ausfüllen:** alle `⟨…⟩`-Platzhalter ersetzen (Schul-Grünton, Domain,
> Impressums-Kontakt, Abi-Jahrgang, Verantwortliche des Filmteams).

---

## Rolle

Du bist Senior Frontend-Entwickler mit Schwerpunkt Angular und Media-Uploads. Baue eine
produktionsreife Web-Anwendung, mit der Schülerinnen und Schüler Fotos und Videos für den
Abifilm des Freiherr-vom-Stein-Gymnasiums (Jahrgang ⟨2026⟩) hochladen können.

Arbeite **im bestehenden Scaffold** unter `Steinabi/`. Ersetze den Angular-Platzhalter in
`src/app/app.html` und `src/app/app.css` vollständig. Frage nicht nach dem Stack — er steht fest.

## Tech-Stack (nicht verhandelbar)

| Bereich | Vorgabe |
|---|---|
| Framework | Angular 22, **standalone components**, keine NgModules |
| State | Angular **Signals** (`signal`, `computed`, `resource`), kein NgRx |
| Reaktivität | `input()`/`output()`-Funktionen, `@if`/`@for`-Control-Flow (kein `*ngIf`/`*ngFor`) |
| HTTP | `HttpClient` mit `provideHttpClient(withFetch())` |
| Styling | **Tailwind CSS 4** (bereits über `@import 'tailwindcss'` in `src/styles.css`) — Utility-first, kein zusätzliches UI-Framework |
| Tests | **Vitest** (`npm test`), nicht Karma/Jasmine |
| Sprache | UI durchgängig **Deutsch (de-DE)**, Code/Kommentare Englisch |
| Change Detection | `provideZonelessChangeDetection()` |

Keine neuen Dependencies ohne Notwendigkeit. Erlaubt und erwünscht: ein Resumable-Upload-Client
(`tus-js-client` **oder** Uppy). Alles andere begründen.

---

## Kernproblem, das die Seite löst

Ohne diese Seite bekommt das Filmteam 3000 unbenannte Handyclips in einem WhatsApp-Chat. Die
Seite ist deshalb **nicht** nur ein Upload-Formular, sondern erzwingt brauchbare Metadaten und
liefert dem Filmteam eine sortierbare Übersicht.

Zwei Nutzergruppen mit sehr unterschiedlichen Anforderungen:

1. **Schüler:innen (mobil, ungeduldig, 200 Personen).** Müssen in unter 60 Sekunden vom Link zum
   laufenden Upload kommen. **Kein Login, keine Registrierung** — Reibung killt die Teilnahme.
   Zugang über Zugangscode bzw. signierten Einladungslink.
2. **Filmteam (Desktop, 5 Personen).** Braucht echte Authentifizierung, Filter, Bulk-Download
   der Originaldateien und einen Review-Status.

---

## Seitenstruktur

| Route | Inhalt |
|---|---|
| `/` | Landingpage: Was wird gesucht, Deadline ⟨TT.MM.JJJJ⟩, Fortschrittsanzeige („412 Beiträge gesammelt“), großer CTA „Jetzt hochladen“ |
| `/upload` | **Herzstück** — Upload-Bereich (siehe unten) |
| `/upload/danke` | Bestätigung, Möglichkeit direkt weitere Dateien hochzuladen |
| `/galerie` | Optional, siehe Entscheidungspunkt D1 — öffentliche Vorschau freigegebener Beiträge |
| `/datenschutz` | Datenschutzerklärung |
| `/impressum` | Impressum |
| `/team` | Login + Dashboard des Filmteams (Guard-geschützt, lazy-loaded) |

Lazy-Loading per `loadComponent` für alles außer `/` und `/upload`.

---

## Upload-Bereich — detaillierte Anforderungen

Das ist der Teil, an dem naive Implementierungen scheitern. Halte dich exakt daran.

### Dateiannahme

- Drag & Drop **plus** `<input type="file" multiple>` — der Input ist der Primärweg, weil mobil
  kein Drag & Drop existiert. Drag & Drop ist die Desktop-Ergänzung, nicht umgekehrt.
- Zusätzlicher Button „Direkt aufnehmen“ mit `capture="environment"` für die Handykamera.
- **iPhone-Formate müssen funktionieren:** `.heic`/`.heif` (Fotos) und `.mov`/HEVC (Videos). Ein
  `accept="image/jpeg,video/mp4"` sperrt die halbe Jahrgangsstufe aus. Nimm:
  `accept="image/*,video/*,.heic,.heif,.mov"`
- HEIC lässt sich im Browser **nicht** als `<img>` vorschauen. Zeige dort ein generisches
  Datei-Icon mit Dateinamen — kein kaputtes Bild, kein Crash.
- Limits: Bilder ≤ 50 MB, Videos ≤ 2 GB, max. 30 Dateien pro Vorgang. Werte als Konstanten an
  einer Stelle, nicht verstreut.
- Validierung clientseitig für schnelles Feedback, **serverseitig zwingend erneut** über
  Magic-Bytes-Prüfung — der Client ist nicht vertrauenswürdig.

### Übertragung

- **Resumable/chunked Upload.** Schul-WLAN bricht ab; ein 1,4-GB-Video darf nicht bei 90 % neu
  beginnen. Nutze tus (Supabase Storage unterstützt es nativ) oder S3-Multipart.
- **Direkt zum Object Storage** über presigned URLs bzw. tus-Endpoint. Die Bytes laufen
  **niemals** durch einen eigenen App-Server — das ist der klassische Fehler und sprengt jedes
  Serverless-Limit.
- Max. 3 parallele Uploads, weitere in einer Warteschlange.
- Pro Datei: Thumbnail/Icon, Dateiname, Größe, Prozent, Übertragungsrate, geschätzte Restzeit,
  Buttons für Pause / Fortsetzen / Abbrechen / Wiederholen.
- Automatischer Retry mit exponentiellem Backoff (3 Versuche) bei Netzwerkfehlern.
- Upload-Queue in **IndexedDB** persistieren: nach Reload oder Verbindungsabbruch bietet die
  Seite an, dort weiterzumachen.
- `beforeunload`-Warnung, solange Uploads laufen.
- Originaldateien werden **unverändert** gespeichert — kein clientseitiges Re-Encoding, kein
  Runterskalieren. Das Filmteam braucht die volle Qualität. Vorschaubilder/Proxies erzeugt der
  Server (ffmpeg) als separate Ableitung.

### Metadaten pro Beitrag

Ein Formular, das für **alle Dateien eines Vorgangs gemeinsam** gilt, mit Möglichkeit einzelne
Dateien davon abweichend zu bearbeiten:

- **Name der hochladenden Person** (Pflicht, Freitext) + Klasse/Kurs ⟨z. B. Q2⟩
- **Anlass/Kategorie** (Pflicht, Auswahlliste): Kursfahrt, Sportfest, Unterricht, Pausenhof,
  Klassenfahrt Stufe 5–10, Abistreich, Motto-Woche, Karneval, Sonstiges
- **Ungefährer Zeitpunkt** (Monat/Jahr genügt, Vorbelegung aus EXIF sofern lesbar)
- **Kurzbeschreibung** (Freitext, optional): „Wer/was ist zu sehen?“
- **Checkbox (Pflicht):** „Alle erkennbaren Personen sind mit der Verwendung im Abifilm
  einverstanden.“
- **Checkbox (Pflicht):** Einwilligung Datenschutz mit Link auf `/datenschutz`
- ~~**Radio:** Darf das Material auch außerhalb des Abifilms genutzt werden (Abizeitung,
  Social Media)?~~ — **verworfen.** Das Material wird ausschließlich für den Abifilm
  verwendet. Nicht zu fragen ist stärker, als zu fragen und auf „Nein“ vorzubelegen:
  es existiert dann kein Feld, das später als Erlaubnis gelesen werden könnte.

Formular mit Angular Reactive Forms, Fehlermeldungen inline, deutsch und konkret
(„Bitte gib deinen Namen an“, nicht „Feld ungültig“).

---

## Bereich Filmteam (`/team`)

- Echte Authentifizierung (E-Mail + Passwort oder Magic Link), Route-Guard, Rolle `admin`.
- Tabelle/Grid aller Beiträge mit Vorschau, Filter nach Kategorie, Zeitraum, Uploader,
  Medientyp und Review-Status.
- Status pro Beitrag setzbar: `neu` → `gesichtet` → `im Film verwendet` / `aussortiert`.
- Download einzelner Originaldateien und **Bulk-Download als ZIP** (serverseitig gestreamt,
  nicht im Browser zusammengebaut).
- Löschen einzelner Beiträge inkl. Storage-Objekt (Widerruf der Einwilligung muss umsetzbar sein).
- Kennzahlen: Gesamtzahl, Gesamtvolumen, Beiträge pro Kategorie, Top-Uploader.

---

## Zugang, Sicherheit, Missbrauchsschutz

- Upload nur mit gültigem Zugangscode (ein Code für den Jahrgang, serverseitig geprüft) oder
  signiertem Einladungslink mit Ablaufdatum. Der Storage-Bucket ist **niemals** anonym
  beschreibbar.
- Rate Limiting pro IP: max. ⟨40⟩ Dateien und ⟨5 GB⟩ pro Stunde.
- Row Level Security: Schüler:innen dürfen **schreiben, aber keine fremden Beiträge lesen**.
  Lesezugriff nur für Rolle `admin` (und für freigegebene Beiträge in der optionalen Galerie).
- Security-Header setzen: CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- Hochgeladene Dateien nie mit ihrem Originalnamen und nie unter dem Web-Root ausliefern;
  serverseitig auf UUID-Dateinamen umschreiben.

## Datenschutz — harte Anforderung, nicht optional

Es geht um Fotos und Videos von **Minderjährigen an einer deutschen Schule**. Das ist der
rechtlich heikelste Teil des Projekts, und Fehler hier stoppen das Projekt schneller als jeder Bug.

- **DSGVO-konform.** Bild- und Videomaterial mit erkennbaren Personen ist personenbezogenes Datum.
- **Hosting ausschließlich in der EU** (Storage und Datenbank, z. B. Region Frankfurt). Kein
  US-Bucket, kein US-CDN für die Medien.
- **Einwilligung** dokumentiert speichern: Zeitstempel, Version des Einwilligungstextes.
- **Art. 8 DSGVO:** Für Personen unter 16 Jahren ist die Einwilligung der Erziehungsberechtigten
  erforderlich. Da Material auch Schüler:innen der Unterstufe zeigt, muss die Seite einen
  Elterneinwilligungs-Vordruck als PDF-Download bereitstellen und im Upload-Formular auf die
  Notwendigkeit hinweisen.
- **Impressum nach § 5 DDG** ist in Deutschland Pflicht, ebenso eine Datenschutzerklärung.
  Beide als eigene Routen mit ⟨Kontaktdaten der verantwortlichen Person⟩.
- **Löschkonzept:** Automatische Löschung des gesamten Materials ⟨6⟩ Monate nach der
  Abiturfeier. Widerruf der Einwilligung muss jederzeit über ⟨Kontakt-E-Mail⟩ möglich sein und
  im Team-Bereich vollständig ausführbar sein.
- Keine Analytics, keine Tracker, keine externen Fonts von Google-Servern (Fonts lokal
  einbinden).

---

## Design

**Ausdruck:** freundlich und vertrauenswürdig, aber nicht kindlich — Abiturjahrgang, nicht
Grundschule. Ruhige Flächen, klare Typografie, ein Grün als Akzent. Der Upload-Bereich ist
optisch das dominante Element der Seite.

### Grüne Akzente — Tokens

Definiere die Farben **einmal** als CSS-Custom-Properties in `src/styles.css` innerhalb von
`@theme` (Tailwind 4) und verwende ausschließlich diese Tokens, keine hartcodierten Hex-Werte
in Komponenten:

```css
@theme {
  --color-stein-50:  oklch(0.97 0.02 155);
  --color-stein-100: oklch(0.93 0.045 155);
  --color-stein-300: oklch(0.78 0.10 155);
  --color-stein-500: oklch(0.58 0.13 155);  /* Primär: Buttons, Links, Fokus */
  --color-stein-600: oklch(0.50 0.13 155);  /* Hover */
  --color-stein-700: oklch(0.42 0.115 155); /* Text auf hellem Grün */
  --color-stein-900: oklch(0.26 0.07 155);  /* Überschriften */
}
```

⟨Falls die Schule ein offizielles Grün hat, ersetze `--color-stein-500` dadurch und leite die
übrigen Stufen davon ab.⟩

Grün gezielt einsetzen, nicht flächig: Primärbuttons, Fortschrittsbalken, aktiver Drop-Zone-Rand,
Fokusringe, Icons, Erfolgszustände. Neutrale Flächen bleiben Weiß/Grau. Fehlerzustände in einem
klar unterscheidbaren Rot, Warnungen in Amber — Erfolg/Fehler dürfen nie nur über Farbe
kommuniziert werden.

### Weitere Design-Vorgaben

- **Mobile first.** Die Mehrheit lädt vom Handy hoch. Entwirf 390 px zuerst, Desktop danach.
  Touch-Ziele ≥ 44 px.
- **Dark Mode** über `prefers-color-scheme`, Tokens entsprechend umdefinieren.
- Kein Layout-Shift beim Erscheinen der Upload-Liste.
- Ladezustände als Skeletons, keine Spinner-Vollbildschirme.
- Animationen dezent und `prefers-reduced-motion` respektieren.

## Barrierefreiheit

- **WCAG 2.2 AA.** Kontrast ≥ 4.5:1 für Text (prüfe die Grüntöne tatsächlich nach, das
  Primärgrün auf Weiß ist grenzwertig — ggf. `--color-stein-600` für Text auf Weiß nutzen).
- Upload komplett per Tastatur bedienbar, Drop-Zone ist ein fokussierbarer Button.
- Upload-Fortschritt und Abschluss über `aria-live="polite"` ansagen.
- `<progress>` bzw. `role="progressbar"` mit korrekten `aria-value*`-Attributen.
- Sichtbare Fokusringe in `--color-stein-500`, nie `outline: none` ohne Ersatz.

---

## Backend / Infrastruktur

Empfehlung, weil es EU-Hosting, resumable Uploads und Row Level Security ohne eigenen Server
mitbringt: **Supabase** (Region Frankfurt) mit Postgres + Storage + Auth.

- Tabelle `submissions`: `id`, `uploader_name`, `uploader_class`, `category`, `taken_at`,
  `description`, `consent_persons`, `consent_privacy`, `consent_version`, `extended_usage`,
  `review_status`, `created_at`, `ip_hash`.
- Tabelle `assets`: `id`, `submission_id`, `storage_path`, `mime_type`, `size_bytes`,
  `original_filename`, `duration_seconds`, `width`, `height`, `thumbnail_path`.
- RLS-Policies explizit als SQL-Migration ausliefern.
- Alle Secrets über Environment-Variablen, nichts im Repository. Lege eine `.env.example` an.

Wenn ein anderes Backend gewählt wird, müssen resumable Direct-Uploads, EU-Hosting und
zeilenbasierte Zugriffskontrolle erhalten bleiben.

---

## Tests (Vitest)

- Upload-Service: Chunking, Retry-Verhalten, Queue-Persistenz, Abbruch.
- Dateivalidierung: Größe, MIME-Typ, HEIC/MOV werden akzeptiert.
- Formularvalidierung: Pflichtfelder, Einwilligungs-Checkboxen blockieren das Absenden.
- Mindestens ein Test, der belegt, dass ohne Zugangscode kein Upload möglich ist.

## Definition of Done

1. `npm start` läuft ohne Fehler und Warnungen, `npm run build` erzeugt einen sauberen Build.
2. `npm test` ist grün.
3. Ein 500-MB-Video lässt sich hochladen, der Upload übersteht eine unterbrochene Verbindung
   und setzt korrekt fort.
4. Ein iPhone-HEIC-Foto und ein `.mov`-Video werden angenommen.
5. Ohne Zugangscode ist kein Upload möglich; ohne Einwilligungs-Checkboxen ist kein Absenden
   möglich.
6. Lighthouse: Performance ≥ 90, Accessibility = 100 auf `/` und `/upload`.
7. Bedienbar auf iPhone SE (375 px) ohne horizontales Scrollen.
8. `/datenschutz` und `/impressum` sind vorhanden und aus dem Footer jeder Seite erreichbar.

## Ausdrücklich nicht Teil des Auftrags

- Kein Videoschnitt und keine Bearbeitung im Browser.
- Keine Gesichtserkennung, kein automatisches Tagging.
- Keine Social-Media-Anbindung, keine Kommentare, keine Likes.
- Keine Transkodierung der Originale.
- Keine Native-App.

## Arbeitsweise

Beginne mit einem kurzen Umsetzungsplan (Dateien, Komponenten, Reihenfolge) und warte auf
Bestätigung, bevor du Code schreibst. Implementiere danach in dieser Reihenfolge:
Design-Tokens & Layout → Upload-Service → Upload-UI → Metadaten-Formular → Landingpage →
Rechtsseiten → Team-Bereich. Nach jedem Schritt kurz zusammenfassen, was läuft und was noch fehlt.
