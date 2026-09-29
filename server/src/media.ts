import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { env } from './env.js';
import { sniffKind, type SniffedKind } from './sniff.js';

/**
 * Media upload against the `users` / `media` collections.
 *
 * Authentication note: no service account key is read anywhere here. The
 * Firestore and Storage clients use Application Default Credentials -- on
 * Cloud Run that is the service account attached to the service, locally it
 * is `gcloud auth application-default login`. A key file in the project is a
 * credential that can leak; an attached identity cannot.
 */

const storage = new Storage(env.projectId ? { projectId: env.projectId } : {});
const bucket = storage.bucket(env.bucket);

/** Uploads land here before they are confirmed, so orphans are easy to find. */
const MEDIA_PREFIX = 'media/';

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export const users = db.collection('users');
export const media = db.collection('media');

export interface UserDoc {
  username: string;
  email: string;
  createdAt: Timestamp;
  profileImageUrl: string;
}

export type MediaType = 'image' | 'video';

export type ReviewStatus = 'neu' | 'gesichtet' | 'verwendet' | 'aussortiert';

/** Mirrored onto the media doc so uniqueness is checkable in a transaction. */
export interface OpenWithdrawal {
  id: string;
  reason: string;
  createdAt: Timestamp;
}

export interface MediaDoc {
  userId: string;
  type: MediaType;
  title: string;
  description: string;
  /** Canonical internal reference: gs://bucket/object. Never sent to a browser. */
  storageUrl: string;
  /**
   * Always empty. Kept as a field because the schema defines it, but filling
   * it would mean making the object world readable -- which contradicts the
   * privacy policy this project ships with. Reading happens through
   * signedUrlFor() instead: scoped to one object, and it expires.
   */
  publicUrl: string;
  createdAt: Timestamp;
  likes: number;
  fileSize: number;

  /* Abifilm metadata. Carried per file rather than per batch, so every
   * object holds its own consent record. */
  uploaderName: string;
  uploaderClass: string;
  category: string;
  grade: string;
  consentPersons: boolean;
  consentPrivacy: boolean;
  consentVersion: string;
  reviewStatus: ReviewStatus;
  openWithdrawal?: OpenWithdrawal | null;
}

/* -------------------------------------------------------------------------
 * Users
 * ---------------------------------------------------------------------- */

/**
 * Create the user document if it does not exist yet, otherwise leave it
 * alone.
 *
 * `create` inside a transaction rather than `set({merge:true})`: two parallel
 * first requests from the same person would otherwise both write, and the
 * later one could overwrite a profile the user has since edited.
 */
export async function ensureUser(
  userId: string,
  profile: { username: string; email?: string; profileImageUrl?: string },
): Promise<void> {
  const ref = users.doc(userId);

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) return;

    const doc: Omit<UserDoc, 'createdAt'> & { createdAt: FieldValue } = {
      username: profile.username,
      email: profile.email ?? '',
      profileImageUrl: profile.profileImageUrl ?? '',
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.create(ref, doc);
  });
}

/* -------------------------------------------------------------------------
 * Upload, step 1: open a session
 * ---------------------------------------------------------------------- */

export interface UploadSession {
  /** Browser PUTs the bytes here. Expires after a week. */
  sessionUri: string;
  /** Object name inside the bucket. The client sends it back on confirm. */
  storagePath: string;
}

/**
 * Open a resumable upload session.
 *
 * The bytes go straight from the browser to Cloud Storage; they never pass
 * through this service. That is what makes 2 GB phone videos possible at all
 * -- a request body that size would blow past Cloud Run's limits -- and it
 * keeps the service inside the free tier.
 *
 * The session URI is a capability for exactly one object, so handing it to
 * the browser grants no broader access than writing that one file.
 */
export async function createUploadSession(input: {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  origin: string;
}): Promise<UploadSession> {
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new MediaError('invalid-size', 'Ungueltige Dateigroesse.');
  }
  if (input.sizeBytes > MAX_VIDEO_BYTES) {
    throw new MediaError('too-large', 'Die Datei ist zu gross.');
  }

  // Never reuse the caller's filename as the object name -- it is
  // attacker-controlled and would allow path traversal and collisions.
  const storagePath = MEDIA_PREFIX + randomUUID() + safeExtension(input.filename);

  const [sessionUri] = await bucket.file(storagePath).createResumableUpload({
    origin: input.origin,
    metadata: {
      contentType: input.contentType || 'application/octet-stream',
      metadata: {
        userId: input.userId,
        originalFilename: input.filename.slice(0, 300),
      },
    },
  });

  return { sessionUri, storagePath };
}

function safeExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return '';
  const raw = filename.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(raw) ? '.' + raw : '';
}

/* -------------------------------------------------------------------------
 * Upload, step 2: confirm and write the metadata
 * ---------------------------------------------------------------------- */

export class MediaError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

/**
 * Confirm a finished upload and create the `media` document.
 *
 * Everything the client claims about the file is ignored here. Size and MIME
 * type come from the stored object, and the type is decided by reading the
 * first bytes -- a .zip renamed to .mp4 is caught at this point and never
 * becomes a media record. The browser-side check is convenience only,
 * because the bytes bypassed this service entirely.
 */
export interface ConfirmInput {
  userId: string;
  uploaderName: string;
  uploaderClass: string;
  storagePath: string;
  title: string;
  description?: string;
  category: string;
  grade: string;
  consentVersion: string;
}

export async function confirmUpload(input: ConfirmInput): Promise<{ id: string; doc: MediaDoc }> {
  if (!input.storagePath.startsWith(MEDIA_PREFIX) || input.storagePath.includes('..')) {
    throw new MediaError('bad-path', 'Ungueltiger Speicherpfad.');
  }

  const file = bucket.file(input.storagePath);

  const [exists] = await file.exists();
  if (!exists) throw new MediaError('not-found', 'Die Datei wurde nicht gefunden.');

  const [metadata] = await file.getMetadata();

  // The session recorded who opened it, so one user cannot claim another
  // user's upload as their own.
  const owner = metadata.metadata?.['userId'];
  if (owner && owner !== input.userId) {
    throw new MediaError('forbidden', 'Die Datei gehoert zu einem anderen Konto.');
  }

  const fileSize = Number(metadata.size ?? 0);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new MediaError('empty', 'Die Datei ist leer.');
  }

  const [head] = await file.download({ start: 0, end: 15 });
  const kind: SniffedKind = sniffKind(head);
  if (kind === 'unknown') {
    // Remove it straight away: an unusable object that nobody references is
    // storage nobody is paying for on purpose.
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw new MediaError('unsupported', 'Die Datei ist weder ein Foto noch ein Video.');
  }

  const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (fileSize > limit) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw new MediaError('too-large', 'Die Datei ist zu gross.');
  }

  const doc = {
    userId: input.userId,
    type: kind,
    title: input.title.trim().slice(0, 200),
    description: (input.description ?? '').trim().slice(0, 2000),
    storageUrl: `gs://${env.bucket}/${input.storagePath}`,
    // Deliberately empty: filling this in means making the object world
    // readable. See makePublic() below before changing this.
    publicUrl: '',
    createdAt: FieldValue.serverTimestamp(),
    likes: 0,
    fileSize,

    uploaderName: input.uploaderName,
    uploaderClass: input.uploaderClass,
    category: input.category,
    grade: input.grade,
    // Reaching this function at all requires both consents; the route
    // rejects the request otherwise, so they are recorded as given.
    consentPersons: true,
    consentPrivacy: true,
    consentVersion: input.consentVersion,
    reviewStatus: 'neu' as ReviewStatus,
    openWithdrawal: null,
  };

  const ref = await media.add(doc);
  const written = await ref.get();

  return { id: ref.id, doc: written.data() as MediaDoc };
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

/**
 * Time-limited URL for one object.
 *
 * This is how a private bucket is read: a signed URL expires, is scoped to a
 * single object, and can be issued only to someone the API has authorised.
 * A `publicUrl` cannot do any of that.
 *
 * Requires the service account to have the Service Account Token Creator role
 * on itself when running on Cloud Run without a key file.
 */
export async function signedUrlFor(storagePath: string, minutes = 15): Promise<string> {
  const [url] = await bucket.file(storagePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + minutes * 60_000,
    version: 'v4',
  });
  return url;
}

export async function listMediaByUser(userId: string, limit = 100) {
  const snapshot = await media
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as MediaDoc) }));
}

/* -------------------------------------------------------------------------
 * Mutating
 * ---------------------------------------------------------------------- */

/**
 * Increment the like counter.
 *
 * `FieldValue.increment` is atomic on the server, so parallel likes cannot
 * overwrite each other the way a read-modify-write would.
 *
 * NOTE: this counts likes, it does not track who liked. Preventing repeat
 * likes needs a `likes/{mediaId}/{userId}` subcollection written in the same
 * transaction -- worth doing before this is user-visible.
 */
export async function likeMedia(mediaId: string, delta: 1 | -1 = 1): Promise<void> {
  await media.doc(mediaId).update({ likes: FieldValue.increment(delta) });
}

/** Delete a media item: the stored object first, then the record. */
export async function deleteMedia(mediaId: string, userId: string): Promise<void> {
  const ref = media.doc(mediaId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new MediaError('not-found', 'Nicht gefunden.');

  const doc = snapshot.data() as MediaDoc;
  if (doc.userId !== userId) throw new MediaError('forbidden', 'Kein Zugriff.');

  // Object first. A record without a file is untidy; a file without a record
  // is material nobody can find, review or delete any more.
  const path = doc.storageUrl.replace(`gs://${env.bucket}/`, '');
  await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => undefined);
  await ref.delete();
}

/**
 * Objects older than `olderThanHours` that no media document references.
 *
 * Users who pick a file and then close the tab leave the object behind.
 * Without a scheduled job calling this, the bucket fills with uploads nobody
 * ever confirmed.
 */
export async function findOrphanedObjects(olderThanHours = 24): Promise<string[]> {
  const [files] = await bucket.getFiles({ prefix: MEDIA_PREFIX });
  const cutoff = Date.now() - olderThanHours * 3_600_000;

  const candidates = files.filter(
    (file) => new Date(file.metadata.timeCreated ?? 0).getTime() < cutoff,
  );
  if (candidates.length === 0) return [];

  const snapshot = await media.select('storageUrl').get();
  const referenced = new Set(
    snapshot.docs.map((doc) =>
      String(doc.get('storageUrl') ?? '').replace(`gs://${env.bucket}/`, ''),
    ),
  );

  return candidates.map((file) => file.name).filter((name) => !referenced.has(name));
}
