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
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { collections, nowIso, type UserDoc } from './db.js';
import { hashCode } from './session.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_LENGTH = 12;

/**
 * Uniform random code. Rejection sampling, not modulo: a plain modulo would
 * bias towards the start of the alphabet.
 */
function generateCode(): string {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  const chars: string[] = [];

  while (chars.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (chars.length >= CODE_LENGTH) break;
      if (byte < limit) chars.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]!);
    }
  }

  return chars.join('');
}

function group(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

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
    console.log(`${name};${schoolClass};${group(code)}`);
    created++;
  }

  console.error(`\n${created} Konten angelegt.`);
  console.error('Die Codes stehen NUR in dieser Ausgabe. Sicher aufbewahren und danach loeschen.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
