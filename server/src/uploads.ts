import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';
import { env } from './env.js';
import type { AssetDoc } from './db.js';
import { sniffKind, type SniffedKind } from './sniff.js';

const storage = new Storage(env.projectId ? { projectId: env.projectId } : {});
const bucket = storage.bucket(env.bucket);

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

const PREFIX = 'uploads/';

/**
 * Mint a GCS resumable upload session.
 *
 * The session URI is the whole point of this endpoint: once the browser has
 * it, it PUTs the bytes straight to Google Cloud Storage. Nothing large ever
 * passes through Cloud Run, which is what keeps the service inside the free
 * tier and makes 2 GB videos possible at all.
 *
 * The URI is a capability scoped to exactly one object and expires after a
 * week, so handing it to the browser grants no broader access.
 */
export async function createUploadSession(input: {
  filename: string;
  contentType: string;
  sizeBytes: number;
  accountId: string;
  origin: string;
}): Promise<{ sessionUri: string; storagePath: string }> {
  // Never reuse the caller's filename for the object name -- it is
  // attacker-controlled. The original is kept as metadata instead.
  const storagePath = PREFIX + randomUUID() + extensionOf(input.filename);

  const [sessionUri] = await bucket.file(storagePath).createResumableUpload({
    origin: input.origin,
    metadata: {
      contentType: input.contentType || 'application/octet-stream',
      metadata: {
        originalFilename: input.filename.slice(0, 300),
        accountId: input.accountId,
        declaredSize: String(input.sizeBytes),
      },
    },
  });

  return { sessionUri, storagePath };
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return '';
  const raw = filename.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(raw) ? '.' + raw : '';
}

export interface VerifiedAsset extends AssetDoc {
  kind: Exclude<SniffedKind, 'unknown'>;
}

export interface VerifyFailure {
  path: string;
  reason: string;
}

/**
 * Confirm that every object a submission claims really exists, belongs to the
 * caller, is the right kind of file, and is within its size limit.
 *
 * Runs before the submission record is written. Doing it here rather than
 * from a storage trigger means a rejected file can never become a visible
 * submission in the first place.
 */
export async function verifyAssets(
  claims: readonly { storagePath: string; originalFilename: string }[],
  accountId: string,
): Promise<{ assets: VerifiedAsset[]; failures: VerifyFailure[] }> {
  const assets: VerifiedAsset[] = [];
  const failures: VerifyFailure[] = [];

  await Promise.all(
    claims.map(async (claim) => {
      if (!claim.storagePath.startsWith(PREFIX) || claim.storagePath.includes('..')) {
        failures.push({ path: claim.storagePath, reason: 'Ungueltiger Speicherpfad.' });
        return;
      }

      const file = bucket.file(claim.storagePath);
      try {
        const [metadata] = await file.getMetadata();

        // The object records which account opened its upload session, so one
        // account cannot attach another account's file to its own submission.
        const owner = metadata.metadata?.['accountId'];
        if (owner && owner !== accountId) {
          failures.push({
            path: claim.storagePath,
            reason: 'Datei gehoert zu einem anderen Konto.',
          });
          return;
        }

        const sizeBytes = Number(metadata.size ?? 0);
        if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
          failures.push({ path: claim.storagePath, reason: 'Die Datei ist leer.' });
          return;
        }

        const [head] = await file.download({ start: 0, end: 15 });
        const kind = sniffKind(head);
        if (kind === 'unknown') {
          failures.push({
            path: claim.storagePath,
            reason: 'Die Datei ist weder ein Foto noch ein Video.',
          });
          return;
        }

        const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (sizeBytes > limit) {
          failures.push({ path: claim.storagePath, reason: 'Die Datei ist zu gross.' });
          return;
        }

        assets.push({
          storagePath: claim.storagePath,
          originalFilename: String(
            metadata.metadata?.['originalFilename'] ?? claim.originalFilename,
          ),
          mimeType: String(metadata.contentType ?? 'application/octet-stream'),
          sizeBytes,
          kind,
        });
      } catch {
        failures.push({ path: claim.storagePath, reason: 'Die Datei wurde nicht gefunden.' });
      }
    }),
  );

  return { assets, failures };
}

/** Delete stored objects. Used when a withdrawal request is fulfilled. */
export async function deleteObjects(paths: readonly string[]): Promise<void> {
  await Promise.all(
    paths.map((path) =>
      bucket
        .file(path)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined),
    ),
  );
}

/**
 * Upload objects older than `olderThanHours` that no submission references.
 *
 * Students who pick files and then close the tab leave objects behind.
 * Without a job calling this, the bucket fills up with material nobody ever
 * consented to keeping.
 */
export async function listUploadObjects(): Promise<{ name: string; createdAt: number }[]> {
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  return files.map((file) => ({
    name: file.name,
    createdAt: new Date(file.metadata.timeCreated ?? 0).getTime(),
  }));
}

export { sniffKind } from './sniff.js';
export type { SniffedKind } from './sniff.js';
