/**
 * Configuration from the environment.
 *
 * Read once at startup and validated eagerly: a missing secret should stop
 * the container from starting, not surface as a 500 on somebody's first
 * upload attempt.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}

function parseTeamUsers(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('TEAM_USERS must be a JSON object');
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([name, hash]) => [
      name.trim().toLowerCase(),
      String(hash),
    ]),
  );
}

export const env = {
  /** GCP project. Set automatically on Cloud Run. */
  projectId: process.env['GOOGLE_CLOUD_PROJECT']?.trim() || undefined,

  /** Firestore database id. '(default)' unless a named database is used. */
  firestoreDatabase: process.env['FIRESTORE_DATABASE']?.trim() || '(default)',

  /** Bucket holding the originals. Must NOT be public. */
  bucket: required('STORAGE_BUCKET'),

  /** Signs session tokens. At least 32 bytes of randomness. */
  sessionSecret: required('SESSION_SECRET'),

  /** Salts the code and IP hashes. Changing it invalidates both. */
  hashSalt: required('HASH_SALT'),

  /** How long a student session lasts. */
  sessionTtlHours: optionalInt('SESSION_TTL_HOURS', 12),

  /** Student login attempts per IP per hour. A school shares one IP, and the
   * 12-character codes are far too strong to brute force at this rate. */
  loginAttemptsPerHour: optionalInt('LOGIN_ATTEMPTS_PER_HOUR', 300),

  /** Team login attempts per IP per hour. Kept strict: few people, one password each. */
  teamLoginAttemptsPerHour: optionalInt('TEAM_LOGIN_ATTEMPTS_PER_HOUR', 10),

  /** Upload sessions per IP per hour (a whole school may share one IP). */
  uploadsPerHour: optionalInt('UPLOADS_PER_HOUR', 400),

  /** Total bytes per IP per hour. */
  uploadBytesPerHour: Number(
    process.env['UPLOAD_BYTES_PER_HOUR']?.trim() || String(80 * 1024 * 1024 * 1024),
  ),

  /** Per account and day: files and bytes. Bounds what one stolen or abused code can store. */
  accountFilesPerDay: optionalInt('ACCOUNT_FILES_PER_DAY', 30),
  accountBytesPerDay: Number(
    process.env['ACCOUNT_BYTES_PER_DAY']?.trim() || String(12 * 1024 * 1024 * 1024),
  ),

  /** Student download-link requests per account and day. Bounds egress cost. */
  accountDownloadsPerDay: optionalInt('ACCOUNT_DOWNLOADS_PER_DAY', 40),

  /** Shared secret for the scheduled cleanup call. Empty disables the endpoint. */
  cleanupToken: process.env['CLEANUP_TOKEN']?.trim() ?? '',

  /** Origins allowed to call the API and upload. */
  allowedOrigins: (process.env['ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** Film team: JSON object `{ "username": "<scrypt hash>" }`. */
  teamUsers: parseTeamUsers(process.env['TEAM_USERS']),

  port: optionalInt('PORT', 8080),
} as const;

if (env.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters');
}
if (env.allowedOrigins.length === 0) {
  throw new Error('ALLOWED_ORIGINS must list at least one origin');
}
