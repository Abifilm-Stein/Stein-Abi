/**
 * Project constants. Single source of truth -- do not inline these values in
 * components or templates.
 */

export const SCHOOL_NAME = 'Freiherr-vom-Stein-Gymnasium';
export const ABI_YEAR = 2026;

/** Submission deadline. TODO: confirm with the film team. */
export const SUBMISSION_DEADLINE = new Date('2026-03-31T23:59:59+01:00');

/**
 * Version of the consent text shown at upload time. Bump this whenever the
 * wording in `/datenschutz` changes -- it is stored per submission so an
 * existing consent can always be traced back to what was actually agreed to.
 */
export const CONSENT_VERSION = '2026-09-01';

/** Months after the graduation ceremony when all material is deleted. */
export const RETENTION_MONTHS = 6;

/** TODO: replace with the responsible person's details before going live. */
export const CONTACT = {
  name: '⟨Vorname Nachname⟩',
  role: 'Abifilm-Team, Jahrgang ' + ABI_YEAR,
  email: '⟨abifilm@example.de⟩',
  postal: '⟨Straße Hausnummer, PLZ Ort⟩',
} as const;

/* -------------------------------------------------------------------------
 * Upload limits
 * ---------------------------------------------------------------------- */

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_FILES_PER_SUBMISSION = 30;

/** Simultaneous transfers. Above ~3 the per-file rate collapses on mobile. */
export const MAX_CONCURRENT_UPLOADS = 3;

/** Retries per file on network errors, with exponential backoff. */
export const MAX_UPLOAD_RETRIES = 3;

/**
 * Accepted by the file picker.
 *
 * The bare extensions matter: iOS reports an EMPTY `file.type` for HEIC in
 * some versions, and `image/*` alone does not reliably offer `.heic` in the
 * picker. Dropping these locks out every iPhone user.
 */
export const ACCEPT_ATTRIBUTE = 'image/*,video/*,.heic,.heif,.hif,.mov,.m4v,.3gp';

/* -------------------------------------------------------------------------
 * Submission metadata
 * ---------------------------------------------------------------------- */

export const CATEGORIES = [
  'Kursfahrt',
  'Sportfest',
  'Unterricht',
  'Pausenhof',
  'Klassenfahrt Stufe 5–10',
  'Abistreich',
  'Motto-Woche',
  'Karneval',
  'Sonstiges',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SCHOOL_CLASSES = ['Q2', 'Q1', 'EF', 'Lehrkraft', 'Sonstige'] as const;

export type SchoolClass = (typeof SCHOOL_CLASSES)[number];
