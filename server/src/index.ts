import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { collections, consumeQuota, db, nowIso, type WithdrawalDoc } from './db.js';
import { env } from './env.js';
import {
  confirmUpload,
  createUploadSession,
  deleteMedia,
  listMediaByUser,
  MAX_VIDEO_BYTES,
  MediaError,
  signedUrlFor,
  type MediaDoc,
} from './media.js';
import { hashIp, issueToken, readToken, signIn, type Session } from './session.js';

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
 * Access
 * ---------------------------------------------------------------------- */

function callerIp(c: { req: { header: (name: string) => string | undefined } }): string {
  // Cloud Run appends the real client IP as the last entry it controls; the
  // first entry is client-supplied and must not be trusted on its own.
  const forwarded = c.req.header('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const parts = forwarded.split(',').map((part) => part.trim());
  return parts[parts.length - 1] || 'unknown';
}

/** Any signed-in student. */
const requireSession = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = token ? await readToken(token) : null;
  if (!session) return c.json({ error: 'Nicht angemeldet.' }, 401);
  c.set('session', session);
  await next();
});

/**
 * Film team.
 *
 * Deliberately NOT the same mechanism as the student session: team identity
 * comes from Google Cloud IAM in front of the service (IAP, or a second
 * service deployed with --no-allow-unauthenticated). Rolling our own admin
 * password would be the weakest link in a system whose entire point is that
 * only this group may see other people's files.
 */
const requireTeam = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  if (!c.req.header('x-goog-authenticated-user-email')) {
    return c.json({ error: 'Nur fuer das Abifilm-Team.' }, 403);
  }
  await next();
});

function mediaErrorStatus(code: string): 400 | 403 | 404 {
  if (code === 'forbidden') return 403;
  if (code === 'not-found') return 404;
  return 400;
}

/* -------------------------------------------------------------------------
 * Session
 * ---------------------------------------------------------------------- */

app.post('/session', async (c) => {
  const parsed = z
    .object({ code: z.string().min(1).max(64) })
    .safeParse(await c.req.json().catch(() => null));
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
 * Upload
 * ---------------------------------------------------------------------- */

app.post('/media/uploads', requireSession, async (c) => {
  const session = c.get('session');
  const parsed = z
    .object({
      filename: z.string().min(1).max(300),
      contentType: z.string().max(200).default(''),
      sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Ungueltige Angaben zur Datei.' }, 400);

  const ipKey = hashIp(callerIp(c));
  const allowed = await db.runTransaction(async (tx) => {
    if (!(await consumeQuota(tx, `files_${ipKey}`, env.uploadsPerHour))) return false;
    return consumeQuota(tx, `bytes_${ipKey}`, env.uploadBytesPerHour, parsed.data.sizeBytes);
  });
  if (!allowed) {
    return c.json({ error: 'Stundenlimit erreicht. Bitte spaeter weitermachen.' }, 429);
  }

  const origin = c.req.header('origin') ?? env.allowedOrigins[0]!;
  return c.json(
    await createUploadSession({ ...parsed.data, userId: session.accountId, origin }),
  );
});

app.post('/media', requireSession, async (c) => {
  const session = c.get('session');
  const parsed = z
    .object({
      storagePath: z.string().min(1).max(300),
      title: z.string().max(200).default(''),
      description: z.string().max(2000).default(''),
      category: z.string().min(1).max(80),
      grade: z.enum(['5', '6', '7', '8', '9', '10', 'EF', 'Q1', 'Q2']),
      consentPersons: z.literal(true),
      consentPrivacy: z.literal(true),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Angaben unvollstaendig oder Einwilligung fehlt.' }, 400);
  }

  try {
    const { id, doc } = await confirmUpload({
      userId: session.accountId,
      uploaderName: session.displayName,
      uploaderClass: session.schoolClass,
      storagePath: parsed.data.storagePath,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      grade: parsed.data.grade,
      consentVersion: CONSENT_VERSION,
    });
    return c.json({ id, ...doc }, 201);
  } catch (error) {
    if (error instanceof MediaError) {
      return c.json({ error: error.message }, mediaErrorStatus(error.code));
    }
    throw error;
  }
});

/* -------------------------------------------------------------------------
 * Reading -- this is where "only your own" is enforced
 * ---------------------------------------------------------------------- */

app.get('/media/mine', requireSession, async (c) => {
  const session = c.get('session');
  return c.json(await listMediaByUser(session.accountId));
});

app.get('/media/count', async (c) => {
  const snapshot = await collections.media.count().get();
  return c.json({ count: snapshot.data().count });
});

/**
 * Time-limited URL for one file.
 *
 * The ownership check is the load-bearing line here: without it, knowing a
 * document id would be enough to view anybody's upload, and Firestore
 * document ids are not secrets.
 */
app.get('/media/:id/url', requireSession, async (c) => {
  const session = c.get('session');
  const snapshot = await collections.media.doc(c.req.param('id')).get();

  // Same answer for "does not exist" and "not yours", so the endpoint cannot
  // be used to discover which ids exist.
  if (!snapshot.exists) return c.json({ error: 'Nicht gefunden.' }, 404);
  const doc = snapshot.data() as MediaDoc;
  if (doc.userId !== session.accountId) return c.json({ error: 'Nicht gefunden.' }, 404);

  const path = doc.storageUrl.replace(`gs://${env.bucket}/`, '');
  return c.json({ url: await signedUrlFor(path), expiresInMinutes: 15 });
});

app.delete('/media/:id', requireSession, async (c) => {
  const session = c.get('session');
  try {
    await deleteMedia(c.req.param('id'), session.accountId);
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof MediaError) {
      return c.json({ error: error.message }, mediaErrorStatus(error.code));
    }
    throw error;
  }
});

/* -------------------------------------------------------------------------
 * Withdrawal requests
 * ---------------------------------------------------------------------- */

app.post('/media/:id/withdrawal', requireSession, async (c) => {
  const session = c.get('session');
  const parsed = z
    .object({ reason: z.string().trim().min(3).max(2000) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Bitte gib eine Begruendung an.' }, 400);

  const mediaRef = collections.media.doc(c.req.param('id'));
  const requestRef = collections.withdrawals.doc();

  try {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(mediaRef);
      if (!snapshot.exists) throw new Error('not-found');

      const doc = snapshot.data() as MediaDoc;
      if (doc.userId !== session.accountId) throw new Error('not-found');
      // Firestore has no partial unique index, so this read-then-write inside
      // a transaction is what keeps it to one open request per file.
      if (doc.openWithdrawal) throw new Error('already-open');

      const createdAt = nowIso();
      const request: WithdrawalDoc = {
        mediaId: mediaRef.id,
        userId: session.accountId,
        uploaderName: doc.uploaderName,
        uploaderClass: doc.uploaderClass,
        assetCount: 1,
        reason: parsed.data.reason,
        status: 'offen',
        createdAt,
      };

      tx.create(requestRef, request);
      tx.update(mediaRef, {
        openWithdrawal: { id: requestRef.id, reason: parsed.data.reason, createdAt },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'already-open') {
      return c.json({ error: 'Fuer diese Datei laeuft bereits ein Antrag.' }, 409);
    }
    return c.json({ error: 'Nicht gefunden.' }, 404);
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
      if (request.userId !== session.accountId) throw new Error('not-found');
      if (request.status !== 'offen') throw new Error('not-open');

      tx.update(requestRef, { status: 'zurueckgenommen', resolvedAt: nowIso() });
      tx.update(collections.media.doc(request.mediaId), { openWithdrawal: null });
    });
  } catch {
    return c.json({ error: 'Antrag nicht gefunden.' }, 404);
  }

  return c.body(null, 204);
});

/* -------------------------------------------------------------------------
 * Team
 * ---------------------------------------------------------------------- */

app.get('/admin/media', requireTeam, async (c) => {
  const snapshot = await collections.media.orderBy('createdAt', 'desc').limit(1000).get();
  return c.json(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as MediaDoc) })));
});

/** Same as the student endpoint, but without the ownership restriction. */
app.get('/admin/media/:id/url', requireTeam, async (c) => {
  const snapshot = await collections.media.doc(c.req.param('id')).get();
  if (!snapshot.exists) return c.json({ error: 'Nicht gefunden.' }, 404);

  const doc = snapshot.data() as MediaDoc;
  const path = doc.storageUrl.replace(`gs://${env.bucket}/`, '');
  return c.json({ url: await signedUrlFor(path, 60), expiresInMinutes: 60 });
});

app.patch('/admin/media/:id', requireTeam, async (c) => {
  const parsed = z
    .object({ reviewStatus: z.enum(['neu', 'gesichtet', 'verwendet', 'aussortiert']) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Ungueltiger Status.' }, 400);

  const ref = collections.media.doc(c.req.param('id'));

  try {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new Error('not-found');

      const doc = snapshot.data() as MediaDoc;
      // Material with an open withdrawal request must not be marked as used.
      if (parsed.data.reviewStatus === 'verwendet' && doc.openWithdrawal) {
        throw new Error('withdrawal-open');
      }
      tx.update(ref, { reviewStatus: parsed.data.reviewStatus });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'withdrawal-open') {
      return c.json(
        { error: 'Datei hat einen offenen Rueckzugsantrag und darf nicht verwendet werden.' },
        409,
      );
    }
    return c.json({ error: 'Nicht gefunden.' }, 404);
  }

  return c.body(null, 204);
});

app.get('/admin/withdrawals', requireTeam, async (c) => {
  const snapshot = await collections.withdrawals.orderBy('createdAt', 'desc').get();
  const requests = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as WithdrawalDoc),
  }));

  requests.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'offen' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return c.json(requests);
});

app.patch('/admin/withdrawals/:id', requireTeam, async (c) => {
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

  if (parsed.data.status === 'erledigt') {
    // Deletes the stored object as well, not just the record.
    await deleteMedia(request.mediaId, request.userId).catch(() => undefined);
  } else {
    await collections.media
      .doc(request.mediaId)
      .update({ openWithdrawal: null })
      .catch(() => undefined);
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
