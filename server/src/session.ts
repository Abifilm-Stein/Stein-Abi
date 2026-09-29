import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { collections, consumeQuota, db, nowIso, type UserDoc } from './db.js';
import { env } from './env.js';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_LENGTH = 12;
const KEY_LENGTH = 32;

const secret = new TextEncoder().encode(env.sessionSecret);

/** Same canonical form the browser produces: upper case, separators removed. */
export function canonicaliseCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

export function isValidCode(input: string): boolean {
  const code = canonicaliseCode(input);
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/**
 * Hash a code for storage: `scrypt$<salt hex>$<key hex>`.
 *
 * scrypt from node:crypto rather than argon2 deliberately -- argon2 is a
 * native module, which means a compiler toolchain in the Docker build and a
 * glibc/musl trap at runtime. For a 12-character code from a 30-symbol
 * alphabet (~59 bits) combined with per-IP rate limiting, scrypt is ample.
 */
export async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(canonicaliseCode(code), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyCode(code: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

  try {
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scryptAsync(code, Buffer.from(saltHex, 'hex'), expected.length);
    // Constant time, so the comparison cannot leak how much of the hash matched.
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Salted, truncated hash of the caller's IP.
 *
 * Truncated on purpose: enough to rate limit and to attribute abuse, not
 * enough to re-identify a household. Full IP addresses of minors are not
 * something this project needs to keep.
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${env.hashSalt}:${ip}`).digest('hex').slice(0, 24);
}

export interface Session {
  accountId: string;
  displayName: string;
  schoolClass: string;
}

export async function issueToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.accountId)
    .setIssuedAt()
    .setExpirationTime(`${env.sessionTtlHours}h`)
    .sign(secret);
}

export async function readToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return {
      accountId: payload.sub,
      displayName: String(payload['displayName'] ?? ''),
      schoolClass: String(payload['schoolClass'] ?? ''),
    };
  } catch {
    return null;
  }
}

export type SignInOutcome =
  | { ok: true; session: Session }
  | { ok: false; reason: 'invalid' | 'rate-limited' };

/**
 * Verify a personal code and start a session.
 *
 * Two deliberate properties:
 *
 *  1. Rate limited per IP. ~59 bits of entropy is irrelevant if an attacker
 *     may keep guessing, so this is the real protection, not the code length.
 *  2. Unknown and revoked codes produce the same 'invalid'. Anything else
 *     would let someone probe which codes exist.
 */
export async function signIn(rawCode: string, ip: string): Promise<SignInOutcome> {
  const allowed = await db.runTransaction((tx) =>
    consumeQuota(tx, `login_${hashIp(ip)}`, env.loginAttemptsPerHour),
  );
  if (!allowed) return { ok: false, reason: 'rate-limited' };

  if (!isValidCode(rawCode)) return { ok: false, reason: 'invalid' };
  const code = canonicaliseCode(rawCode);

  // The stored hint narrows the candidate set without revealing anything, so
  // we verify a handful of hashes instead of every account in the year group.
  const candidates = await collections.users
    .where('codeHint', '==', code.slice(0, 4))
    .where('revoked', '==', false)
    .get();

  for (const doc of candidates.docs) {
    const user = doc.data() as UserDoc;
    if (!(await verifyCode(code, user.codeHash))) continue;

    // Best effort, deliberately not awaited into the response path.
    void doc.ref.set({ lastSeenAt: nowIso() }, { merge: true }).catch(() => undefined);

    return {
      ok: true,
      session: {
        accountId: doc.id,
        displayName: user.username,
        schoolClass: user.schoolClass,
      },
    };
  }

  return { ok: false, reason: 'invalid' };
}
