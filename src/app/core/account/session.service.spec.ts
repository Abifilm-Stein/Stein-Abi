import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { normalizeCode } from './account';
import { DEMO_CODES, SessionService } from './session.service';

/**
 * Tests run in demo mode (no `window.__STEINABI__`), so the client-side
 * lookup is exercised. In production the server does this against a hash.
 */
describe('SessionService', () => {
  let session: SessionService;
  const validCode = DEMO_CODES[0].code;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    session = TestBed.inject(SessionService);
  });

  it('starts signed out, so the upload area is unreachable', () => {
    expect(session.isSignedIn()).toBe(false);
    expect(session.account()).toBeNull();
  });

  it('rejects an incomplete code without contacting anything', async () => {
    expect(await session.signIn('ABCD')).toBe('invalid-format');
    expect(session.isSignedIn()).toBe(false);
  });

  it('rejects a code containing an excluded glyph', async () => {
    expect(await session.signIn('ABCD-EFGH-JKM1')).toBe('invalid-format');
    expect(session.isSignedIn()).toBe(false);
  });

  it('rejects a well-formed but unknown code', async () => {
    expect(await session.signIn('ZZZZ-ZZZZ-ZZZZ')).toBe('unknown-code');
    expect(session.isSignedIn()).toBe(false);
  });

  it('signs in with a provisioned code and exposes the account', async () => {
    expect(await session.signIn(validCode)).toBe('ok');
    expect(session.isSignedIn()).toBe(true);
    expect(session.account()?.displayName).toBe(DEMO_CODES[0].name);
  });

  it('accepts the code without dashes and in lower case', async () => {
    expect(await session.signIn(normalizeCode(validCode).toLowerCase())).toBe('ok');
    expect(session.isSignedIn()).toBe(true);
  });

  it('defaults to a session that ends with the tab, not a persistent login', async () => {
    await session.signIn(validCode);

    expect(sessionStorage.getItem('steinabi-session')).not.toBeNull();
    // Shared school computers: a persistent login would hand the next person
    // somebody else's uploads.
    expect(localStorage.getItem('steinabi-session')).toBeNull();
  });

  it('persists across restarts only when explicitly asked to', async () => {
    await session.signIn(validCode, true);

    expect(localStorage.getItem('steinabi-session')).not.toBeNull();
    expect(sessionStorage.getItem('steinabi-session')).toBeNull();
  });

  it('clears both stores on sign out', async () => {
    await session.signIn(validCode, true);
    session.signOut();

    expect(session.isSignedIn()).toBe(false);
    expect(localStorage.getItem('steinabi-session')).toBeNull();
    expect(sessionStorage.getItem('steinabi-session')).toBeNull();
  });

  it('restores an existing session on construction', async () => {
    await session.signIn(validCode, true);

    // A fresh injector stands in for a page reload.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const revived = TestBed.inject(SessionService);

    expect(revived.isSignedIn()).toBe(true);
    expect(revived.account()?.displayName).toBe(DEMO_CODES[0].name);
  });

  it('gives different codes different accounts', async () => {
    await session.signIn(DEMO_CODES[0].code);
    const first = session.account()?.id;

    session.signOut();
    await session.signIn(DEMO_CODES[1].code);

    expect(session.account()?.id).not.toBe(first);
  });
});
