/**
 * Provision student accounts.
 *
 * Reads a CSV of `Name;Stufe` from stdin, generates one personal code per
 * line, writes the account with only a hash of that code, and prints the
 * plain codes ONCE to stdout so they can be printed and handed out.
 *
 *   npx tsx src/provision.ts < stufe.csv > codes.csv
 *
 * The plain codes exist only in that output. Losing it means reissuing, which
 * is the intended trade-off -- a database that can reveal the codes is a
 * database that leaks them.
 */
import { createInterface } from 'node:readline';
import { collections, nowIso, type UserDoc } from './db.js';
import { formatCode, generateCode, hashCode } from './session.js';

async function main(): Promise<void> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let created = 0;

  console.log('Name;Stufe;Code');

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [name, schoolClass] = trimmed.split(';').map((part) => part.trim());
    if (!name || !schoolClass) {
      console.error(`uebersprungen (Format Name;Stufe): ${trimmed}`);
      continue;
    }

    const code = generateCode();
    const user: Omit<UserDoc, 'createdAt'> & { createdAt: string } = {
      username: name,
      email: '',
      profileImageUrl: '',
      schoolClass,
      codeHash: await hashCode(code),
      codeHint: code.slice(0, 4),
      revoked: false,
      createdAt: nowIso(),
    };

    await collections.users.add(user);
    console.log(`${name};${schoolClass};${formatCode(code)}`);
    created++;
  }

  console.error(`\n${created} Konten angelegt.`);
  console.error('Die Codes stehen NUR in dieser Ausgabe. Sicher aufbewahren und danach loeschen.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
