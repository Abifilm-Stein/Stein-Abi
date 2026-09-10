# SteinAbi

Website, über die Schülerinnen und Schüler Fotos und Videos für den Abifilm des
Freiherr-vom-Stein-Gymnasiums hochladen. Angular 22 (standalone, Signals, zoneless) +
Tailwind CSS 4, Tests mit Vitest.

Das Logo liegt als Inline-SVG in [src/app/shared/logo.ts](src/app/shared/logo.ts)
(sechs Rechtecke, aus der Vorlage nachgebaut) und als Tab-Icon in
[public/favicon.svg](public/favicon.svg). Die Markenfarbe steht als
`--color-brand` in `src/styles.css` — bewusst getrennt von `--color-primary`,
weil sie für Text zu hell ist und nur für die Marke gilt.

Der ursprüngliche Auftrag liegt in [ABIFILM-PROMPT.md](ABIFILM-PROMPT.md).

## Starten

```bash
npm install
npm start     # http://localhost:4200
npm test      # Vitest
npm run build # Produktionsbuild
```

## Demo-Modus

Solange in [src/index.html](src/index.html) keine `uploadEndpoint` und `apiBaseUrl`
gesetzt sind, läuft die App **vollständig ohne Backend**:

| Bereich | Verhalten im Demo-Modus |
|---|---|
| Upload | simuliert (`MockUploadTarget`), kein Byte verlässt das Gerät |
| Beiträge | `localStorage` |
| Anmeldung | `DEMA-Q2MJ-A234`, `DEMB-Q2JN-S567`, `DEMC-Q2EN-A789` — im Browser geprüft |
| Team-Login | `team@example.de` / `abifilm`, im Browser geprüft |

Die Codes sind auf der Anmeldeseite anklickbar hinterlegt.

Ein gelbes Banner weist durchgehend darauf hin. **Anmeldung und Team-Login schützen
in diesem Modus nichts** — das ist Absicht, damit ein Demo-Build nicht versehentlich
für produktionsreif gehalten wird.

Retry-Verhalten von Hand testen: `window.__steinabiFailureRate = 0.3` in der Konsole.

## Aufbau

```
src/app/
  core/
    config.ts                  Limits, Kategorien, Fristen, Kontakt — einzige Quelle
    runtime-config.ts          Deploy-Konfiguration aus index.html, Demo-Modus-Flag
    models.ts                  Submission, AssetRef, ReviewStatus
    account/
      account.ts               Kontomodell, Code-Format, Code-Generator
      session.service.ts       Anmeldung per Code, Session, sessionGuard
    auth/                      Team-Authentifizierung + Route-Guard
    submissions/               SubmissionGateway (HTTP | localStorage)
    upload/
      upload-target.ts         Transport-Abstraktion
      tus-upload-target.ts     tus 1.0.0 über fetch + XHR, ohne Fremd-Client
      mock-upload-target.ts    Simulation für den Demo-Modus
      upload-queue.ts          Warteschlange, Nebenläufigkeit, Retry, Pause/Resume
      queue-store.ts           IndexedDB-Persistenz der Warteschlange
      file-validation.ts       Größen- und Typprüfung, HEIC-Erkennung
  features/
    home/ auth/ upload/ mine/ legal/ team/ not-found/
supabase/migrations/
  0001_init.sql                Schema inkl. Row Level Security
  0002_accounts.sql            Vorgenerierte Konten, Zugriff auf eigene Beiträge
  0003_drop_extended_usage.sql Nutzung außerhalb des Films entfernt
  0004_grade_instead_of_date.sql Stufe statt Aufnahmedatum
  0005_withdrawal_requests.sql Rückzugsanträge inkl. Sperr-Trigger
```

## Anmeldung und „Meine Beiträge“

Konten werden **vorab generiert**, jede Person bekommt einen persönlichen Code.
Diesen Code eingeben *ist* die Anmeldung — keine E-Mail, kein Passwort, keine
Registrierung. Das hält die Reibung niedrig und speichert keine
E-Mail-Adressen von Minderjährigen.

Weil der Code damit ein **persönliches Zugangsmittel** ist, gilt:

- 12 Zeichen aus einem 30er-Alphabet (30¹² ≈ 5,3·10¹⁷), erzeugt mit
  `crypto.getRandomValues` und Rejection Sampling — nie `Math.random`
- ohne `I`, `O`, `L`, `U`, `0`, `1`: jeder Lesefehler vom Zettel ist eine Person,
  die die Seite für kaputt hält
- gespeichert wird nur ein **bcrypt-Hash**, nie der Code selbst
- **Rate Limiting ist Pflicht** — ohne es nützt die Entropie nichts, weil einfach
  durchprobiert werden kann
- Eingaben werden **nicht** stillschweigend korrigiert: ein `O` bleibt sichtbar
  falsch, statt zu einem anderen Code umgeschrieben zu werden

Die Sitzung liegt standardmäßig im `sessionStorage` und endet mit dem Tab.
„Angemeldet bleiben“ wechselt bewusst explizit auf `localStorage` — an einem
Schulrechner würde ein dauerhafter Login sonst der nächsten Person die eigenen
Beiträge zeigen.

Konten anlegen (aus einem vertrauenswürdigen Kontext, Service Role):

```sql
select provision_account('Mia Beispiel', 'Q2', 'DEMA-Q2MJ-A234');
```

Dass jemand nur die **eigenen** Beiträge sieht, erzwingt die Datenbank über
`current_account_id()` aus einem JWT-Claim — nicht die Website. Eine im
Request mitgeschickte Konto-ID würde sonst reichen, um fremde Uploads zu lesen.

## Rückzug von Beiträgen

Hochgeladenes Material löscht sich **nicht** auf Knopfdruck. Wer einen Beitrag
entfernen möchte, stellt unter „Meine Beiträge“ einen Antrag; das Team bearbeitet
ihn unter `/team/rueckzuege`. Grund: der Film kann zu diesem Zeitpunkt schon um
eine Aufnahme herum geschnitten sein.

**Ein Rückzug kann nicht abgelehnt werden.** Nach Art. 7 Abs. 3 DSGVO darf eine
Einwilligung jederzeit widerrufen werden. Der Workflow koordiniert die Entfernung,
er entscheidet nicht über sie. Deshalb gibt es bewusst **keinen Status
„abgelehnt“** — ein Antrag endet als:

| Status | Bedeutung |
|---|---|
| `offen` | Antrag liegt vor. Material darf **nicht** weiter im Film verwendet werden. |
| `erledigt` | Team hat das Material gelöscht. |
| `zurueckgenommen` | Die Person hat den Antrag selbst zurückgenommen. |

Das „nicht verwenden“ hängt nicht am Frontend: ein Datenbank-Trigger
(`block_use_while_withdrawal_open`) verhindert, dass ein Beitrag mit offenem
Antrag auf `verwendet` gesetzt wird. Ein Fehlklick in der Oberfläche kann es
also nicht umgehen. Ebenso lässt ein partieller Unique-Index nur **einen**
offenen Antrag pro Beitrag zu, und die RLS-Policy erlaubt Schüler:innen als
einzige Änderung `offen → zurueckgenommen` am eigenen Antrag.

Wichtig fürs Backend: Beim Abschluss mit `erledigt` müssen auch die
**Storage-Objekte** gelöscht werden. Der Cascade entfernt nur die
Asset-Datensätze, nicht die Dateien.

## Warum der Upload so gebaut ist

Die vier Entscheidungen, die den Unterschied zwischen „funktioniert im Test“ und
„funktioniert mit 200 Handys im Schul-WLAN“ machen:

1. **Bytes gehen direkt in den Object Storage**, nie durch einen App-Server.
   Handyvideos sind 200 MB–2 GB; ein Upload durch eine Serverless-Funktion
   scheitert an Request-Limits.
2. **Resumable über tus.** Abbrüche sind der Normalfall, nicht die Ausnahme. Ein
   1,4-GB-Video darf nicht bei 90 % neu beginnen.
3. **Die `File`-Objekte liegen in IndexedDB.** `File` ist structured-cloneable,
   deshalb überlebt die Warteschlange einen Reload und setzt am Byte-Offset fort,
   ohne dass die Datei erneut ausgewählt werden muss.
4. **HEIC/MOV werden angenommen.** iOS liefert HEIC teils mit leerem `file.type`;
   eine MIME-only-Prüfung sperrt jedes iPhone aus. Die Vorschau wird optimistisch
   versucht und fällt über das `error`-Event auf ein Icon zurück — Safari kann HEIC
   rendern, Chrome und Firefox nicht.

Dateien laden sofort nach der Auswahl hoch, während das Formular noch ausgefüllt
wird. Der Beitrag wird erst beim Absenden angelegt und referenziert die fertigen
Assets. Deshalb sind `assets.submission_id` in der Datenbank nullable — und deshalb
braucht es den Cleanup-Job für verwaiste Assets (siehe Migration).

## Backend anbinden

1. Supabase-Projekt in einer **EU-Region** anlegen (Frankfurt).
2. `supabase db push` — legt Tabellen, RLS-Policies und die Cleanup-Funktionen an.
3. Nicht-öffentlichen Storage-Bucket erstellen (`abifilm-originals`).
4. `.env.example` nach `.env` kopieren und füllen.
5. `uploadEndpoint` und `apiBaseUrl` in `src/index.html` setzen — damit schalten
   automatisch `TusUploadTarget` und `HttpSubmissionGateway` scharf.

Erwartete API-Endpunkte:

| Methode | Pfad | Zweck |
|---|---|---|
| `POST` | `/session` | Persönlichen Code gegen Session-Token tauschen (rate-limited!) |
| `POST` | `/auth/sign-in` | Team-Anmeldung |
| `POST` | `/submissions` | Beitrag anlegen (verknüpft die Assets) |
| `GET` | `/submissions/mine` | Eigene Beiträge — Besitzer kommt aus dem Token, nie aus der URL |
| `POST` | `/submissions/mine/:id/withdrawal` | Rückzugsantrag stellen |
| `DELETE` | `/withdrawals/mine/:id` | Eigenen Antrag zurücknehmen |
| `GET` | `/withdrawals` | Anträge für das Team |
| `PATCH` | `/withdrawals/:id` | Antrag abschließen (löscht bei `erledigt` auch die Dateien) |
| `GET` | `/submissions` | Liste für das Team (RLS-geschützt) |
| `PATCH` | `/submissions/:id` | Review-Status setzen |
| `DELETE` | `/submissions/:id` | Beitrag inkl. Storage-Objekte löschen |
| `GET` | `/submissions/count` | Öffentlicher Zähler für die Startseite |

Serverseitig zwingend nachzuziehen:

- **Magic-Bytes-Prüfung** der Dateien. Die Client-Validierung ist reines UX.
- **Rate Limiting** pro IP (Werte in `.env.example`) — für Uploads *und* für
  `/session`, sonst ist der Code durchprobierbar.
- **Gleiche Antwort** für unbekannten und gesperrten Code, damit sich über die
  Antwort nicht herausfinden lässt, welche Codes existieren.
- **Thumbnails/Proxies** per ffmpeg als Ableitung; Originale nie neu kodieren.
- **Löschung der Storage-Objekte** in denselben Jobs, die DB-Zeilen löschen.

## Deployment (Cloudflare Workers)

In den Cloudflare-Einstellungen unter **Workers & Pages → Build**:

| Feld | Wert |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Die Konfiguration steht in [wrangler.jsonc](wrangler.jsonc). Zwei Dinge daran sind
nicht optional:

- **`not_found_handling: "single-page-application"`** — Angular routet im Browser,
  auf dem Server existiert keine Datei `/upload`. Ohne diese Zeile liefert ein
  direkt aufgerufener oder neu geladener Unterpfad einen 404.
- **`directory: "./dist/Steinabi/browser"`** — Angular legt das Ergebnis in einen
  `browser/`-Unterordner, nicht direkt in `dist/`.

Security-Header und Cache-Regeln stehen in [public/_headers](public/_headers) und
werden vom Build in den Output kopiert. Wichtig beim Anbinden des Backends: die
CSP-Direktive `connect-src` muss um die Supabase-Domain erweitert werden, sonst
blockiert der Browser jeden Upload.

Lokal testen: `npm run build && npm run preview`.

## Offene Punkte vor dem Livegang

- [ ] Alle `⟨Platzhalter⟩` in `core/config.ts`, `/impressum`, `/datenschutz` ersetzen
- [ ] Datenschutzerklärung und Impressum von Schulleitung und Datenschutzbeauftragten
      freigeben lassen — der Entwurf ist **nicht juristisch geprüft**
- [ ] Echte Team-Authentifizierung; der Demo-Login ist ein Platzhalter
- [ ] Offizielles Schulgrün in `src/styles.css` eintragen, falls vorhanden
- [x] Security-Header setzen — `public/_headers`
- [ ] `connect-src` in `public/_headers` um die Backend-Domain erweitern
- [ ] Lighthouse auf `/` und `/upload` prüfen
- [ ] Echttest: 500-MB-Video mit unterbrochener Verbindung, HEIC vom iPhone
- [ ] Entscheidung offen: öffentliche Galerie ja/nein (aktuell nicht gebaut)
