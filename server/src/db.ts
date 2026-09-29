import { Firestore, type Transaction } from '@google-cloud/firestore';
import { env } from './env.js';

/**
 * Firestore data model.
 *
 * Moving off Postgres cost us three guarantees the database used to enforce
 * on its own: row level security, a trigger blocking "verwendet" while a
 * withdrawal is open, and a partial unique index allowing one open request
 * per submission. Firestore has none of those, so:
 *
 *  - access control lives in this API only, and firestore.rules denies all
 *    client access so there is exactly one implementation to audit
 *  - the two multi-document invariants are enforced inside transactions
 *    (see `submissions.openWithdrawal`)
 *
 * That is weaker than a trigger -- a bug here is no longer caught by the
 * database -- which is why both invariants are covered by tests.
 */

export const db = new Firestore({
  ...(env.projectId ? { projectId: env.projectId } : {}),
  databaseId: env.firestoreDatabase,
  ignoreUndefinedProperties: true,
});

export const collections = {
  accounts: db.collection('accounts'),
  submissions: db.collection('submissions'),
  withdrawals: db.collection('withdrawalRequests'),
  rateLimits: db.collection('rateLimits'),
} as const;

export interface AccountDoc {
  displayName: string;
  schoolClass: string;
  /** Argon2id hash of the canonical code. The code itself is never stored. */
  codeHash: string;
  /** First four characters, so the team can tell two printed slips apart. */
  codeHint: string;
  revoked: boolean;
  createdAt: string;
  lastSeenAt?: string;
}

export interface AssetDoc {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export type ReviewStatus = 'neu' | 'gesichtet' | 'verwendet' | 'aussortiert';
export type WithdrawalStatus = 'offen' | 'erledigt' | 'zurueckgenommen';

/** Mirrored onto the submission so uniqueness is checkable in a transaction. */
export interface OpenWithdrawal {
  id: string;
  status: 'offen';
  reason: string;
  createdAt: string;
}

export interface SubmissionDoc {
  accountId: string;
  uploaderName: string;
  uploaderClass: string;
  category: string;
  grade: string;
  description: string;
  consentPersons: boolean;
  consentPrivacy: boolean;
  consentVersion: string;
  reviewStatus: ReviewStatus;
  createdAt: string;
  assets: AssetDoc[];
  /** Absent unless a request is open. Presence IS the uniqueness constraint. */
  openWithdrawal?: OpenWithdrawal | null;
  /** Salted, truncated hash. Enough for abuse handling, not to identify anyone. */
  ipHash?: string;
}

export interface WithdrawalDoc {
  submissionId: string;
  accountId: string;
  uploaderName: string;
  uploaderClass: string;
  assetCount: number;
  reason: string;
  status: WithdrawalStatus;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export const nowIso = (): string => new Date().toISOString();

/**
 * Fixed-window counter, incremented inside a transaction.
 *
 * A fixed window lets a caller burst across a boundary (up to 2x the limit in
 * theory). A sliding window would need a document per attempt, which costs
 * far more writes than this protection is worth here.
 *
 * @returns whether the request fits inside the limit
 */
export async function consumeQuota(
  tx: Transaction,
  key: string,
  limit: number,
  amount = 1,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 3_600_000);
  const ref = collections.rateLimits.doc(`${key}_${bucket}`);
  const snapshot = await tx.get(ref);
  const used: number = snapshot.exists ? (snapshot.get('used') as number) ?? 0 : 0;

  if (used + amount > limit) return false;

  tx.set(
    ref,
    {
      used: used + amount,
      // A Firestore TTL policy on this field cleans the documents up; without
      // one the collection grows without bound.
      expiresAt: new Date((bucket + 2) * 3_600_000),
    },
    { merge: true },
  );
  return true;
}
