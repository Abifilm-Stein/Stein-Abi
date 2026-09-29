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

  /** Login attempts per IP per hour. The codes are strong; this stops brute force. */
  loginAttemptsPerHour: optionalInt('LOGIN_ATTEMPTS_PER_HOUR', 10),

  /** Upload sessions per IP per hour, i.e. the file count ceiling. */
  uploadsPerHour: optionalInt('UPLOADS_PER_HOUR', 40),

  /** Total bytes per IP per hour. */
  uploadBytesPerHour: Number(
    process.env['UPLOAD_BYTES_PER_HOUR']?.trim() || String(5 * 1024 * 1024 * 1024),
  ),

  /** Origins allowed to call the API and upload. */
  allowedOrigins: (process.env['ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  port: optionalInt('PORT', 8080),
} as const;

if (env.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters');
}
if (env.allowedOrigins.length === 0) {
  throw new Error('ALLOWED_ORIGINS must list at least one origin');
}
