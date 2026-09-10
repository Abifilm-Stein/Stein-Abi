# Abifilm-Sammelplattform

Website, über die Schülerinnen und Schüler Fotos und Videos für den Abifilm des
Freiherr-vom-Stein-Gymnasiums hochladen. Angular 22 (standalone, Signals, zoneless) +
Tailwind CSS 4, Tests mit Vitest.

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
| Zugangscode | `ABIFILM26`, im Browser geprüft |
| Team-Login | `team@example.de` / `abifilm`, im Browser geprüft |

Ein gelbes Banner weist durchgehend darauf hin. **Zugangscode und Team-Login
schützen in diesem Modus nichts** — das ist Absicht, damit ein Demo-Build nicht
versehentlich für produktionsreif gehalten wird.

Retry-Verhalten von Hand testen: `window.__steinabiFailureRate = 0.3` in der Konsole.

## Aufbau

```
src/app/
  core/
    config.ts                  Limits, Kategorien, Fristen, Kontakt — einzige Quelle
    runtime-config.ts          Deploy-Konfiguration aus index.html, Demo-Modus-Flag
    models.ts                  Submission, AssetRef, ReviewStatus
    access/                    Zugangscode-Gate
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
    home/ upload/ legal/ team/ not-found/
supabase/migrations/0001_init.sql   Schema inkl. Row Level Security
```

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
| `POST` | `/access` | Zugangscode gegen kurzlebiges Upload-Token tauschen |
| `POST` | `/auth/sign-in` | Team-Anmeldung |
| `POST` | `/submissions` | Beitrag anlegen (verknüpft die Assets) |
| `GET` | `/submissions` | Liste für das Team (RLS-geschützt) |
| `PATCH` | `/submissions/:id` | Review-Status setzen |
| `DELETE` | `/submissions/:id` | Beitrag inkl. Storage-Objekte löschen |
| `GET` | `/submissions/count` | Öffentlicher Zähler für die Startseite |

Serverseitig zwingend nachzuziehen:

- **Magic-Bytes-Prüfung** der Dateien. Die Client-Validierung ist reines UX.
- **Rate Limiting** pro IP (Werte in `.env.example`).
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
