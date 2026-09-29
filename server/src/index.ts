import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import {
  collections,
  consumeQuota,
  db,
  nowIso,
  type OpenWithdrawal,
  type SubmissionDoc,
  type WithdrawalDoc,
} from './db.js';
import { env } from './env.js';
import { hashIp, issueToken, readToken, signIn, type Session } from './session.js';
import {
  createUploadSession,
  deleteObjects,
  MAX_VIDEO_BYTES,
  verifyAssets,
} from './uploads.js';

const CONSENT_VERSION = '2026-09-10';

type Vars = { session: Session };
const app = new Hono<{ Variables: Vars }>();

app.use(
  '*',
  cors({
    origin: env.allowedOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  }),
);

/** Cloud Run health probe. Must not touch Firestore. */
app.get('/healthz', (c) => c.text('ok'));

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

function callerIp(c: { req: { header: (name: string) => string | undefined } }): string {
  // Cloud Run appends the real client IP as the last entry it controls; the
  // first entry is client-supplied and must not be trusted on its own.
  const forwarded = c.req.header('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const parts = forwarded.split(',').map((part) => part.trim());
  return parts[parts.length - 1] || 'unknown';
}

/** Requires a student session. */
const requireSession = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = token ? await readToken(token) : null;
  if (!session) return c.json({ error: 'Nicht angemeldet.' }, 401);
  c.set('session', session);
  await next();
});

/**
 * Team routes.
 *
 * Deliberately NOT the same mechanism as the student session: team access is
 * granted by Google Cloud IAM in front of the service. Deploy the team paths
 * behind IAP or a separate Cloud Run service with `--no-allow-unauthenticated`
 * and let Google check identity. Rolling our own admin password here would be
 * the weakest link in the whole system.
 */
const requireTeam = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const assertion = c.req.header('x-goog-authenticated-user-email');
  if (!assertion) {
    return c.json(
      { error: 'Nur fuer das Abifilm-Team. Zugriff laeuft ueber Google-Anmeldung.' },
      403,
    );
  }
  await next();
});

/* -------------------------------------------------------------------------
 * Session
 * ---------------------------------------------------------------------- */

app.post('/session', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ code: z.string().min(1).max(64) }).safeParse(body);
  if (!parsed.success) return c.json({ error: 'Code fehlt.' }, 400);

  const outcome = await signIn(parsed.data.code, callerIp(c));

  if (!outcome.ok) {
    if (outcome.reason === 'rate-limited') {
      return c.json({ error: 'Zu viele Versuche. Bitte warte eine Stunde.' }, 429);
    }
    // Identical answer for unknown and revoked codes, so the response cannot
    // be used to probe which codes exist.
    return c.json({ error: 'Diesen Code kennen wir nicht.' }, 401);
  }

  return c.json({
    token: await issueToken(outcome.session),
    account: {
      id: outcome.session.accountId,
      displayName: outcome.session.displayName,
      schoolClass: outcome.session.schoolClass,
    },
  });
});

/* -------------------------------------------------------------------------
 * Uploads
 * ---------------------------------------------------------------------- */

app.post('/uploads', requireSession, async (c) => {
  const session = c.get('session');
  const body = await c.req.json().catch(() => null);
  const parsed = z
    .object({
      filename: z.string().min(1).max(300),
      contentType: z.string().max(200).default(''),
      sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
    })
    .safeParse(body);

  if (!parsed.success) return c.json({ error: 'Ungueltige Angaben zur Datei.' }, 400);

  const ipKey = hashIp(callerIp(c));
  const allowed = await db.runTransaction(async (tx) => {
    const files = await consumeQuota(tx, `files_${ipKey}`, env.uploadsPerHour);
    if (!files) return false;
    return consumeQuota(tx, `bytes_${ipKey}`, env.uploadBytesPerHour, parsed.data.sizeBytes);
  });
  if (!allowed) {
    return c.json({ error: 'Stundenlimit erreicht. Bitte spaeter weitermachen.' }, 429);
  }

  const origin = c.req.header('origin') ?? env.allowedOrigins[0]!;
  const created = await createUploadSession({ ...parsed.data, accountId: session.accountId, origin });
  return c.json(created);
});

/* -------------------------------------------------------------------------
 * Submissions
 * ---------------------------------------------------------------------- */

const submissionSchema = z.object({
  category: z.string().min(1).max(80),
  grade: z.enum(['5', '6', '7', '8', '9', '10', 'EF', 'Q1', 'Q2']),
  description: z.string().max(2000).default(''),
  consentPersons: z.literal(true),
  consentPrivacy: z.literal(true),
  assets: z
    .array(
      z.object({
        storagePath: z.string().min(1).max(300),
        originalFilename: z.string().max(300).default(''),
      }),
    )
    .min(1)
    .max(30),
});

app.post('/submissions', requireSession, async (c) => {
  const session = c.get('session');
  const parsed = submissionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Angaben unvollstaendig oder Einwilligung fehlt.' }, 400);
  }

  // Magic-byte check against the stored objects. The client validation is UX
  // only; this is where a disguised file is actually caught.
  const { assets, failures } = await verifyAssets(parsed.data.assets, session.accountId);
  if (assets.length === 0) {
    return c.json({ error: 'Keine gueltige Datei gefunden.', failures }, 400);
  }

  const doc: SubmissionDoc = {
    accountId: session.accountId,
    uploaderName: session.displayName,
    uploaderClass: session.schoolClass,
    category: parsed.data.category,
    grade: parsed.data.grade,
    description: parsed.data.description,
    consentPersons: true,
    consentPrivacy: true,
    consentVersion: CONSENT_VERSION,
    reviewStatus: 'neu',
    createdAt: nowIso(),
    assets: assets.map(({ kind, ...asset }) => asset),
    ipHash: hashIp(callerIp(c)),
  };

  const ref = await collections.submissions.add(doc);
  return c.json({ id: ref.id, ...doc, failures }, 201);
});

app.get('/submissions/mine', requireSession, async (c) => {
  const session = c.get('session');
  const snapshot = await collections.submissions
    .where('accountId', '==', session.accountId)
    .orderBy('createdAt', 'desc')
    .get();

  return c.json(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as SubmissionDoc) })));
});

app.get('/submissions/count', async (c) => {
  const snapshot = await collections.submissions.count().get();
  return c.json({ count: snapshot.data().count });
});

/* -------------------------------------------------------------------------
 * Withdrawal requests
 * ---------------------------------------------------------------------- */

app.post('/submissions/mine/:id/withdrawal', requireSession, async (c) => {
  const session = c.get('session');
  const parsed = z
    .object({ reason: z.string().trim().min(3).max(2000) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Bitte gib eine Begruendung an.' }, 400);

  const submissionRef = collections.submissions.doc(c.req.param('id'));
  const requestRef = collections.withdrawals.doc();

  try {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(submissionRef);
      if (!snapshot.exists) throw new Error('not-found');

      const submission = snapshot.data() as SubmissionDoc;
      if (submission.accountId !== session.accountId) throw new Error('not-found');

      // This is the uniqueness invariant Postgres used to give us with a
      // partial unique index. Inside a transaction the read-then-write is
      // atomic, so two taps cannot both create a request.
      if (submission.openWithdrawal) throw new Error('already-open');

      const createdAt = nowIso();
      const open: OpenWithdrawal = {
        id: requestRef.id,
        status: 'offen',
        reason: parsed.data.reason,
        createdAt,
      };

      const request: WithdrawalDoc = {
        submissionId: submissionRef.id,
        accountId: session.accountId,
        uploaderName: submission.uploaderName,
        uploaderClass: submission.uploaderClass,
        assetCount: submission.assets.length,
        reason: parsed.data.reason,
        status: 'offen',
        createdAt,
      };

      tx.create(requestRef, request);
      tx.update(submissionRef, { openWithdrawal: open });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'already-open') {
      return c.json({ error: 'Fuer diesen Beitrag laeuft bereits ein Antrag.' }, 409);
    }
    return c.json({ error: 'Beitrag nicht gefunden.' }, 404);
  }

  return c.json({ id: requestRef.id }, 201);
});

app.delete('/withdrawals/mine/:id', requireSession, async (c) => {
  const session = c.get('session');
  const requestRef = collections.withdrawals.doc(c.req.param('id'));

  try {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(requestRef);
      if (!snapshot.exists) throw new Error('not-found');

      const request = snapshot.data() as WithdrawalDoc;
      if (request.accountId !== session.accountId) throw new Error('not-found');
      // Only an open request can be taken back, and only by its author. This
      // replaces the RLS policy that allowed exactly offen -> zurueckgenommen.
      if (request.status !== 'offen') throw new Error('not-open');

      tx.update(requestRef, { status: 'zurueckgenommen', resolvedAt: nowIso() });
      tx.update(collections.submissions.doc(request.submissionId), { openWithdrawal: null });
    });
  } catch {
    return c.json({ error: 'Antrag nicht gefunden.' }, 404);
  }

  return c.body(null, 204);
});

/* -------------------------------------------------------------------------
 * Team
 * ---------------------------------------------------------------------- */

app.get('/submissions', requireTeam, async (c) => {
  const snapshot = await collections.submissions.orderBy('createdAt', 'desc').get();
  return c.json(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as SubmissionDoc) })));
});

app.patch('/submissions/:id', requireTeam, async (c) => {
  const parsed = z
    .object({ reviewStatus: z.enum(['neu', 'gesichtet', 'verwendet', 'aussortiert']) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Ungueltiger Status.' }, 400);

  const ref = collections.submissions.doc(c.req.param('id'));

  try {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new Error('not-found');

      const submission = snapshot.data() as SubmissionDoc;
      // Replaces the Postgres trigger: material with an open withdrawal
      // request must not be marked as used in the film.
      if (parsed.data.reviewStatus === 'verwendet' && submission.openWithdrawal) {
        throw new Error('withdrawal-open');
      }
      tx.update(ref, { reviewStatus: parsed.data.reviewStatus });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'withdrawal-open') {
      return c.json(
        { error: 'Beitrag hat einen offenen Rueckzugsantrag und darf nicht verwendet werden.' },
        409,
      );
    }
    return c.json({ error: 'Beitrag nicht gefunden.' }, 404);
  }

  return c.body(null, 204);
});

app.delete('/submissions/:id', requireTeam, async (c) => {
  const ref = collections.submissions.doc(c.req.param('id'));
  const snapshot = await ref.get();
  if (!snapshot.exists) return c.json({ error: 'Beitrag nicht gefunden.' }, 404);

  const submission = snapshot.data() as SubmissionDoc;
  // Files first: a dangling object outlives its consent record, which is
  // exactly what must not happen. A dangling record is merely untidy.
  await deleteObjects(submission.assets.map((asset) => asset.storagePath));
  await ref.delete();

  return c.body(null, 204);
});

app.get('/withdrawals', requireTeam, async (c) => {
  const snapshot = await collections.withdrawals.orderBy('createdAt', 'desc').get();
  const requests = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as WithdrawalDoc),
  }));

  // Open ones first, newest within each group.
  requests.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'offen' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return c.json(requests);
});

app.patch('/withdrawals/:id', requireTeam, async (c) => {
  const parsed = z
    .object({
      // No 'abgelehnt': withdrawing consent under Art. 7(3) GDPR cannot be
      // refused. This endpoint coordinates the removal, it does not decide it.
      status: z.enum(['erledigt', 'zurueckgenommen']),
      note: z.string().max(2000).default(''),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Ungueltiger Abschluss.' }, 400);

  const requestRef = collections.withdrawals.doc(c.req.param('id'));
  const snapshot = await requestRef.get();
  if (!snapshot.exists) return c.json({ error: 'Antrag nicht gefunden.' }, 404);

  const request = snapshot.data() as WithdrawalDoc;
  const submissionRef = collections.submissions.doc(request.submissionId);

  if (parsed.data.status === 'erledigt') {
    const submission = await submissionRef.get();
    if (submission.exists) {
      const data = submission.data() as SubmissionDoc;
      await deleteObjects(data.assets.map((asset) => asset.storagePath));
      await submissionRef.delete();
    }
  } else {
    await submissionRef.update({ openWithdrawal: null }).catch(() => undefined);
  }

  await requestRef.update({
    status: parsed.data.status,
    resolutionNote: parsed.data.note,
    resolvedAt: nowIso(),
  });

  return c.body(null, 204);
});

app.onError((error, c) => {
  console.error('unhandled', error);
  return c.json({ error: 'Unerwarteter Serverfehler.' }, 500);
});

serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`steinabi-api listening on ${info.port}`);
});

export { app };
