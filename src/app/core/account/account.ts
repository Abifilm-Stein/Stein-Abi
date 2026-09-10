/**
 * Pre-generated accounts.
 *
 * Every student gets one personal code, printed and handed out. Entering it
 * IS the login -- no e-mail, no password, no registration. That keeps the
 * friction of the original shared-code flow while making "my uploads" a
 * concept the server can enforce, and it avoids storing e-mail addresses of
 * minors.
 *
 * Because the code is a personal credential rather than a door opener for the
 * whole year group, it needs real entropy: 12 characters from a 30-symbol
 * alphabet is 30^12 ~= 5.3e17 combinations. Paired with server-side rate
 * limiting that is not guessable. A short mnemonic code would NOT do here.
 */

export interface Account {
  id: string;
  displayName: string;
  schoolClass: string;
}

/**
 * Alphabet without the glyphs that get misread off a printed slip:
 * no I, O, L, U and no 0 or 1. Every misread code is a student who concludes
 * the site is broken.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export const CODE_GROUP_SIZE = 4;
export const CODE_GROUPS = 3;
export const CODE_LENGTH = CODE_GROUP_SIZE * CODE_GROUPS;

/**
 * Canonical form of whatever the student typed: upper case, separators
 * removed. Tolerates lower case, missing or extra dashes, and spaces pasted
 * out of a chat message.
 *
 * Deliberately does NOT substitute look-alike characters. There is no sound
 * mapping (O and 0 are both excluded, so neither has an obvious target), and
 * silently rewriting an input produces a different code that then fails for
 * reasons the student cannot see. A wrong character stays visible in the
 * field and `isValidCode` reports it.
 */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

/** Group for display and printing: ABCD-EFGH-JKMN. */
export function formatCode(code: string): string {
  const normalized = normalizeCode(code);
  const groups: string[] = [];
  for (let index = 0; index < normalized.length; index += CODE_GROUP_SIZE) {
    groups.push(normalized.slice(index, index + CODE_GROUP_SIZE));
  }
  return groups.join('-');
}

export function isCompleteCode(code: string): boolean {
  return normalizeCode(code).length === CODE_LENGTH;
}

/** Complete AND built only from alphabet characters. */
export function isValidCode(code: string): boolean {
  const normalized = normalizeCode(code);
  return (
    normalized.length === CODE_LENGTH &&
    [...normalized].every((character) => CODE_ALPHABET.includes(character))
  );
}

/**
 * Generate a code. Used by the team to provision accounts.
 *
 * `crypto.getRandomValues`, never `Math.random` -- these are credentials.
 * Rejection sampling keeps the distribution uniform, where a plain modulo
 * would bias toward the start of the alphabet.
 */
export function generateCode(): string {
  const alphabetSize = CODE_ALPHABET.length;
  const limit = Math.floor(256 / alphabetSize) * alphabetSize;
  const characters: string[] = [];

  while (characters.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (characters.length >= CODE_LENGTH) break;
      if (byte < limit) characters.push(CODE_ALPHABET[byte % alphabetSize]);
    }
  }

  return formatCode(characters.join(''));
}
