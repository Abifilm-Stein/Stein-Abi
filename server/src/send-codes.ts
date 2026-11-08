/**
 * Mail every student their personal code via Brevo.
 *
 * Input: CSV `Name;Stufe;Code;E-Mail` (provision.ts output plus an address column).
 * Nothing is stored; addresses live only in that file and in Brevo's send log.
 *
 *   npx tsx src/send-codes.ts codes-mail.csv                 # check only, sends nothing
 *   npx tsx src/send-codes.ts codes-mail.csv --test me@x.de  # first row to one address
 *   npx tsx src/send-codes.ts codes-mail.csv --send          # real send
 *
 * Needs BREVO_API_KEY in the environment.
 */
import { readFileSync } from 'node:fs';

const SENDER = { name: 'Abifilm Stein', email: 'abifilm@steinabi.com' };
const SITE = 'https://steinabi.com';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

interface Row {
  name: string;
  schoolClass: string;
  code: string;
  email: string;
}

function parse(path: string): { rows: Row[]; problems: string[] } {
  const rows: Row[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .forEach((line, index) => {
      if (!line.trim()) return;
      const [name = '', schoolClass = '', code = '', email = ''] = line.split(';').map((p) => p.trim());
      const at = `Zeile ${index + 2} (${name || '?'})`;
      const email_ = email.toLowerCase();

      if (!name) problems.push(`${at}: Name fehlt`);
      if (!CODE.test(code)) problems.push(`${at}: Code ungueltig`);
      if (!EMAIL.test(email_)) problems.push(`${at}: Adresse ungueltig "${email}"`);
      else if (seen.has(email_)) problems.push(`${at}: Adresse doppelt "${email}"`);
      seen.add(email_);

      rows.push({ name, schoolClass, code, email: email_ });
    });

  return { rows, problems };
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function body(row: Row): { subject: string; html: string; text: string } {
  const first = row.name.split(' ')[0] ?? row.name;
  const subject = 'Dein Zugang zum Abifilm-Upload';
  const text = [
    `Hallo ${first},`,
    '',
    'fuer den Abifilm koennen alle Fotos und Videos hochladen:',
    `${SITE}/anmelden`,
    '',
    `Dein persoenlicher Code: ${row.code}`,
    '',
    'Der Code gehoert nur dir. Bitte gib ihn nicht weiter.',
    'Unter "Meine Beitraege" siehst du spaeter alles, was du hochgeladen hast.',
    '',
    'Viele Gruesse',
    'Das Abifilm-Team',
  ].join('\n');

  const html = `<!doctype html><html lang="de"><body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:16px">
<p>Hallo ${escapeHtml(first)},</p>
<p>f&uuml;r den Abifilm k&ouml;nnen alle Fotos und Videos hochladen:</p>
<p><a href="${SITE}/anmelden" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Zum Upload</a></p>
<p>Dein pers&ouml;nlicher Code:</p>
<p style="font-size:24px;letter-spacing:2px;font-family:monospace;background:#f3f3f3;padding:12px;border-radius:6px;text-align:center">${escapeHtml(row.code)}</p>
<p>Der Code geh&ouml;rt nur dir. Bitte gib ihn nicht weiter. Unter &bdquo;Meine Beitr&auml;ge&ldquo; siehst du sp&auml;ter alles, was du hochgeladen hast.</p>
<p>Viele Gr&uuml;&szlig;e<br>Das Abifilm-Team</p></body></html>`;

  return { subject, html, text };
}

async function send(row: Row, to: string, apiKey: string): Promise<void> {
  const { subject, html, text } = body(row);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      replyTo: SENDER,
      to: [{ email: to, name: row.name }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const testAt = args.indexOf('--test');
  const path = args.find((a, i) => !a.startsWith('--') && (testAt < 0 || i !== testAt + 1));
  if (!path) throw new Error('Aufruf: send-codes.ts <datei.csv> [--test adresse | --send]');

  const { rows, problems } = parse(path);
  console.log(`${rows.length} Zeilen, ${problems.length} Probleme.`);
  problems.forEach((p) => console.log(`  ! ${p}`));

  const testIndex = args.indexOf('--test');
  const real = args.includes('--send');
  if (!real && testIndex < 0) return console.log('Nur geprueft, nichts gesendet.');
  if (problems.length) throw new Error('Erst die Probleme beheben.');

  const apiKey = process.env['BREVO_API_KEY'];
  if (!apiKey) throw new Error('BREVO_API_KEY fehlt.');

  if (testIndex >= 0) {
    await send(rows[0]!, args[testIndex + 1]!, apiKey);
    return console.log(`Testmail an ${args[testIndex + 1]} gesendet.`);
  }

  let sent = 0;
  for (const row of rows) {
    try {
      await send(row, row.email, apiKey);
      sent++;
    } catch (error) {
      console.error(`FEHLER ${row.name}: ${(error as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`${sent} von ${rows.length} gesendet.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
