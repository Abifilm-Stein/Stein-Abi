# SteinAbi

Website, über die Schülerinnen und Schüler Fotos und Videos für den Abifilm des
Freiherr-vom-Stein-Gymnasiums hochladen. Angular 22 (standalone, Signals, zoneless) +
Tailwind CSS 4, Tests mit Vitest. Backend in [server/](server/).

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

Solange `apiBaseUrl` in [src/index.html](src/index.html) leer ist, läuft die App
**vollständig ohne Backend**:

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
    models.ts                  Submission, AssetRef, Rückzugsanträge
    account/
      account.ts               Kontomodell, Code-Format, Code-Generator
      session.service.ts       Anmeldung per Code, Session, sessionGuard
    auth/                      Team-Authentifizierung + Route-Guard
    submissions/               SubmissionGateway (HTTP | localStorage)
    upload/
      upload-target.ts         Transport-Abstraktion
      gcs-upload-target.ts     GCS-Resumable über fetch + XHR, ohne Fremd-Client
      mock-upload-target.ts    Simulation für den Demo-Modus
      upload-queue.ts          Warteschlange, Nebenläufigkeit, Retry, Pause/Resume
      queue-store.ts           IndexedDB-Persistenz der Warteschlange
      file-validation.ts       Größen- und Typprüfung, HEIC-Erkennung
  features/
    home/ auth/ upload/ mine/ legal/ team/ not-found/
firestore.rules                Client-Zugriff auf Firestore: alles verweigert
server/                        Cloud-Run-Backend (eigenes README)
```

## Backend

Hono auf **Cloud Run**, **Firestore** als Datenbank, **Google Cloud Storage** für
die Dateien. Einrichtung, Endpunkte und Deploy-Befehle: [server/README.md](server/README.md).

Die vier Entscheidungen, die dort zählen:

- **Cloud Run in derselben Region wie Firestore.** Der Weg zur Datenbank ist der
  Latenzfaktor, nicht der Code. Mit `--min-instances=1` deployen, sonst kostet
  der erste Request nach einer Pause 1–3 Sekunden.
- **Uploads gehen direkt zu GCS.** Der Server stellt nur eine Resumable-Session
  aus; die Bytes passieren Cloud Run nie. Nur so sind 2-GB-Videos im Free Tier
  möglich.
- **Der Browser spricht nie mit Firestore.** `firestore.rules` verweigert jeden
  Client-Zugriff, damit Autorisierung genau eine Implementierung hat statt zweier,
  die auseinanderlaufen.
- **Magic-Bytes-Prüfung beim Abschicken.** Weil die Bytes am Server vorbeigehen,
  ist die Prüfung im Browser reine Kosmetik.

Sobald `apiBaseUrl` in [src/index.html](src/index.html) gesetzt ist, verlässt das
Frontend den Demo-Modus und nutzt `GcsUploadTarget` statt der Simulation.

> Firestore kann keine Invarianten erzwingen. Was vorher RLS-Policies, ein
> Trigger und ein partieller Unique-Index in Postgres erledigt haben, liegt
> jetzt in Transaktionen im Backend — **schwächer als vorher**, und in
> [server/README.md](server/README.md) im Detail begründet.

## Anmeldung und „Meine Beiträge“

Konten werden **vorab generiert**, jede Person bekommt einen persönlichen Code.
Diesen Code eingeben *ist* die Anmeldung — keine E-Mail, kein Passwort, keine
Registrierung. Das hält die Reibung niedrig und speichert keine E-Mail-Adressen
von Minderjährigen.

Weil der Code damit ein **persönliches Zugangsmittel** ist, gilt:

- 12 Zeichen aus einem 30er-Alphabet (30¹² ≈ 5,3·10¹⁷), erzeugt mit
  `crypto.getRandomValues` und Rejection Sampling — nie `Math.random`
- ohne `I`, `O`, `L`, `U`, `0`, `1`: jeder Lesefehler vom Zettel ist eine Person,
  die die Seite für kaputt hält
- gespeichert wird nur ein **scrypt-Hash**, nie der Code selbst
- **Rate Limiting ist Pflicht** — ohne es nützt die Entropie nichts, weil einfach
  durchprobiert werden kann
- Eingaben werden **nicht** stillschweigend korrigiert: ein `O` bleibt sichtbar
  falsch, statt zu einem anderen Code umgeschrieben zu werden

Die Sitzung liegt standardmäßig im `sessionStorage` und endet mit dem Tab.
„Angemeldet bleiben“ wechselt bewusst explizit auf `localStorage` — an einem
Schulrechner würde ein dauerhafter Login sonst der nächsten Person die eigenen
Beiträge zeigen.

Konten anlegen:

```bash
cd server
printf 'Mia Beispiel;Q2\nJonas Muster;Q2\n' | npx tsx src/provision.ts > codes.csv
```

Dass jemand nur die **eigenen** Beiträge sieht, entscheidet die API anhand der
Konto-ID aus dem signierten Session-Token — nie anhand einer ID aus dem Request.
Eine mitgeschickte Konto-ID würde sonst reichen, um fremde Uploads zu lesen.

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

Durchgesetzt wird das in Firestore-Transaktionen im Backend: `PATCH /submissions/:id`
verweigert `verwendet`, solange ein Antrag offen ist, und das Feld
`submission.openWithdrawal` sorgt dafür, dass pro Beitrag nur **ein** Antrag offen
sein kann. Beim Abschluss mit `erledigt` werden auch die Storage-Objekte gelöscht,
nicht nur der Datensatz.

## Warum der Upload so gebaut ist

Die vier Entscheidungen, die den Unterschied zwischen „funktioniert im Test“ und
„funktioniert mit 200 Handys im Schul-WLAN“ machen:

1. **Bytes gehen direkt in den Object Storage**, nie durch einen App-Server.
   Handyvideos sind 200 MB–2 GB; ein Upload durch eine Serverless-Funktion
   scheitert an Request-Limits.
2. **Resumable über das GCS-Protokoll.** Abbrüche sind der Normalfall, nicht die
   Ausnahme. Ein 1,4-GB-Video darf nicht bei 90 % neu beginnen.
3. **Die `File`-Objekte liegen in IndexedDB.** `File` ist structured-cloneable,
   deshalb überlebt die Warteschlange einen Reload und setzt am Byte-Offset fort,
   ohne dass die Datei erneut ausgewählt werden muss.
4. **HEIC/MOV werden angenommen.** iOS liefert HEIC teils mit leerem `file.type`;
   eine MIME-only-Prüfung sperrt jedes iPhone aus. Die Vorschau wird optimistisch
   versucht und fällt über das `error`-Event auf ein Icon zurück — Safari kann HEIC
   rendern, Chrome und Firefox nicht.

Dateien laden sofort nach der Auswahl hoch, während das Formular noch ausgefüllt
wird. Der Beitrag entsteht erst beim Absenden und referenziert die fertigen
Objekte. Deshalb existieren Upload-Objekte zeitweise ohne Beitrag — und deshalb
braucht es den Cleanup-Job für verwaiste Objekte (siehe server/README.md).

## Deployment (Frontend, Cloudflare Workers)

| Feld | Wert |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Konfiguration in [wrangler.jsonc](wrangler.jsonc). Zwei Dinge sind nicht optional:

- **`not_found_handling: "single-page-application"`** — Angular routet im Browser,
  auf dem Server existiert keine Datei `/upload`. Ohne diese Zeile liefert ein
  direkt aufgerufener oder neu geladener Unterpfad einen 404.
- **`directory: "./dist/Steinabi/browser"`** — Angular legt das Ergebnis in einen
  `browser/`-Unterordner, nicht direkt in `dist/`.

Security-Header und Cache-Regeln stehen in [public/_headers](public/_headers).
**Wichtig:** `connect-src` muss um die Cloud-Run-Domain erweitert werden und
zusätzlich `https://storage.googleapis.com` erlauben, sonst blockiert der Browser
die Upload-Chunks.

## Offene Punkte vor dem Livegang

- [ ] Alle `⟨Platzhalter⟩` in `core/config.ts`, `/impressum`, `/datenschutz` ersetzen
- [ ] Datenschutzerklärung und Impressum von Schulleitung und Datenschutzbeauftragten
      freigeben lassen — der Entwurf ist **nicht juristisch geprüft**
- [ ] Einsendeschluss bestätigen (aktuell 31.03.2027, geraten)
- [ ] Echte Team-Authentifizierung über IAP; der Demo-Login ist ein Platzhalter
- [ ] Offizielles Schulgrün in `src/styles.css` eintragen, falls vorhanden
- [x] Security-Header setzen — `public/_headers`
- [ ] `connect-src` um Cloud Run und `storage.googleapis.com` erweitern
- [ ] Cronjobs: verwaiste Uploads, Löschfrist nach der Abiturfeier
- [ ] Lighthouse auf `/` und `/upload` prüfen
- [ ] Echttest: 2-GB-Video mit unterbrochener Verbindung, HEIC vom iPhone
- [ ] Entscheidung offen: öffentliche Galerie ja/nein (aktuell nicht gebaut)
