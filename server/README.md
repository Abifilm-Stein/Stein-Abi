# SteinAbi API

Backend für die Abifilm-Sammelplattform. Hono auf Node, läuft als Container auf
**Google Cloud Run**, Daten in **Firestore**, Dateien in **Google Cloud Storage**.

```bash
npm install
npm run dev        # lokal auf :8080
npm test           # Vitest
npm run typecheck
```

## Warum Cloud Run

Der Ausschlag gibt die Nähe zur Datenbank, nicht die Rechenleistung. Bei einem
Login macht der Code Millisekunden aus, der Weg zu Firestore dagegen deutlich
mehr. Cloud Run in derselben Region spricht privat mit Firestore und Storage,
zahlt keinen Egress dafür, und braucht keinen öffentlichen Datenbankzugang.

**Setze `--min-instances=1`.** Ohne das skaliert der Dienst auf null und der
erste Request nach einer Pause dauert 1–3 Sekunden — beim Login fühlt sich das
nach „kaputt“ an. Die paar Euro im Monat sind hier gut angelegt.

## Was der Umstieg von Postgres gekostet hat

Die frühere Postgres-Fassung ließ die **Datenbank** drei Invarianten erzwingen.
Firestore kann das nicht, also sind sie hierher gewandert — in Transaktionen:

| Invariante | Früher | Jetzt |
|---|---|---|
| Nur eigene Dateien lesen | RLS-Policy | `GET /media/mine` filtert nach der Konto-ID aus dem Token |
| Kein `verwendet` bei offenem Rückzugsantrag | Trigger | Transaktion in `PATCH /admin/media/:id` |
| Ein offener Antrag pro Datei | Partieller Unique-Index | Transaktion prüft `media.openWithdrawal` |
| Typen, Längen, Pflichtfelder | Check-Constraints | Zod-Schemas |
| Dateien mitlöschen | — (manuell) | `deleteObjects` vor dem Löschen des Dokuments |

**Das ist schwächer als vorher**, und das soll hier stehen: ein Fehler im
Backend wird nicht mehr von der Datenbank abgefangen. Deshalb hängt
`openWithdrawal` als Feld am Media-Dokument selbst — nur so lässt sich die
Eindeutigkeit überhaupt in einer Transaktion prüfen.

Konsequenz daraus: **der Browser spricht nie direkt mit Firestore.**
`firestore.rules` verweigert jeden Client-Zugriff, damit es genau eine Stelle
gibt, an der Autorisierung stattfindet, statt zweier Implementierungen, die
auseinanderlaufen.

## Endpunkte

| Methode | Pfad | Zugriff |
|---|---|---|
| `POST` | `/session` | offen, **rate-limited** |
| `POST` | `/media/uploads` | Token, rate-limited — liefert die GCS-Session |
| `POST` | `/media` | Token — bestätigt den Upload, prüft Magic Bytes |
| `GET` | `/media/mine` | Token — **nur eigene** Dateien |
| `GET` | `/media/:id/url` | Token — signierte URL, **nur für den Besitzer** |
| `DELETE` | `/media/:id` | Token — nur eigene |
| `POST` | `/media/:id/withdrawal` | Token |
| `DELETE` | `/withdrawals/mine/:id` | Token |
| `GET` | `/media/count` | offen |
| `GET` `PATCH` | `/admin/media…` | **Team, per IAP** — sieht alle |
| `GET` | `/admin/media/:id/url` | **Team** — signierte URL für jede Datei |
| `GET` `PATCH` | `/admin/withdrawals…` | **Team, per IAP** |

Team-Zugriff läuft bewusst **nicht** über ein eigenes Passwort, sondern über
Google-Identität (IAP bzw. `--no-allow-unauthenticated`). Ein selbstgebautes
Admin-Login wäre das schwächste Glied im ganzen System.

## Wie Uploads laufen

1. Browser fragt `POST /media/uploads` → Server erzeugt eine **GCS-Resumable-Session**
2. Browser lädt die Bytes **direkt** zur Session-URI, in 6-MiB-Blöcken
3. Beim Abschicken prüft `POST /media` die **Magic Bytes** der Datei

Die Bytes passieren Cloud Run nie. Das ist der Grund, warum 2-GB-Videos
überhaupt funktionieren und warum der Dienst im Free Tier bleibt.

Die Session-URI ist ein Zugriffsrecht für genau ein Objekt und läuft nach einer
Woche ab — der Browser hält also nie Zugangsdaten.

**Schritt 3 ist nicht optional.** Weil die Bytes am Server vorbeigehen, ist die
Prüfung im Browser reine Kosmetik. Eine als `.mp4` umbenannte ZIP-Datei wird
erst hier erkannt, und ohne Media-Datensatz bleibt sie ein Waisenobjekt, das der Cleanup-Job entfernt.

## Datenmodell

Eine Collection pro Sache, ein Dokument pro Datei:

| Collection | Inhalt |
|---|---|
| `users` | username, email, profileImageUrl, createdAt — plus schoolClass, codeHash, codeHint, revoked für die Code-Anmeldung |
| `media` | userId, type, title, description, storageUrl, publicUrl, createdAt, likes, fileSize — plus category, grade, Einwilligungen, reviewStatus, openWithdrawal |
| `withdrawalRequests` | Rückzugsanträge mit Protokoll |
| `rateLimits` | Zähler pro IP und Stunde (TTL-Policy nicht vergessen) |

**`publicUrl` bleibt immer leer.** Das Feld existiert, weil das Schema es
vorsieht, aber es zu füllen hieße, die Objekte weltweit lesbar zu machen. Das
widerspricht der Datenschutzerklärung. Gelesen wird über `signedUrlFor()`:
auf ein Objekt begrenzt und zeitlich befristet.

Die Einwilligung hängt **pro Datei** am Dokument, nicht an einem Sammel-Beitrag.
Deshalb lässt sich eine einzelne Datei zurückziehen, ohne die anderen zu berühren.

## Einrichtung

```bash
# 1. Bucket, nicht öffentlich, gleiche Region wie Firestore
gcloud storage buckets create gs://steinabi-originals \
  --location=europe-west3 --uniform-bucket-level-access

# 2. CORS, sonst blockiert der Browser jeden Chunk-PUT
cat > cors.json <<'JSON'
[{
  "origin": ["https://<eure-domain>"],
  "method": ["PUT", "POST", "GET", "HEAD"],
  "responseHeader": ["Content-Type", "Content-Range", "Range", "Location"],
  "maxAgeSeconds": 3600
}]
JSON
gcloud storage buckets update gs://steinabi-originals --cors-file=cors.json

# 3. Secrets
openssl rand -base64 48 | gcloud secrets create steinabi-session-secret --data-file=-
openssl rand -base64 32 | gcloud secrets create steinabi-hash-salt --data-file=-

# 4. Deploy
gcloud run deploy steinabi-api \
  --source . --region=europe-west3 --min-instances=1 \
  --set-env-vars STORAGE_BUCKET=steinabi-originals,ALLOWED_ORIGINS=https://<eure-domain> \
  --set-secrets SESSION_SECRET=steinabi-session-secret:latest,HASH_SALT=steinabi-hash-salt:latest

# 5. Firestore-Regeln (alles verweigern)
gcloud firestore deploy --rules ../firestore.rules
```

Danach `apiBaseUrl` in `src/index.html` auf die Cloud-Run-URL setzen — damit
verlässt das Frontend automatisch den Demo-Modus.

### Firestore

Ein **TTL-Feld auf `rateLimits.expiresAt`** einrichten, sonst wächst die
Collection unbegrenzt. Composite Index nötig für:
`users(codeHint, revoked)` und `media(userId, createdAt desc)` —
Firestore verlinkt den passenden Index beim ersten fehlschlagenden Query.

### Konten anlegen

```bash
printf 'Mia Beispiel;Q2\nJonas Muster;Q2\n' | npx tsx src/provision.ts > codes.csv
```

Die Klartext-Codes stehen **nur** in dieser Ausgabe. Gespeichert wird ein
scrypt-Hash. Eine Datenbank, aus der sich die Codes auslesen ließen, wäre eine
Datenbank, die sie irgendwann preisgibt.

## Offen

- [ ] Cronjob für verwaiste Uploads (`findOrphanedObjects`, älter als 24 h)
- [ ] Cronjob für die Löschfrist nach der Abiturfeier
- [ ] IAP vor die Team-Pfade setzen
- [ ] Composite Indexes anlegen
- [ ] Lasttest mit einem 2-GB-Video über eine abbrechende Verbindung
