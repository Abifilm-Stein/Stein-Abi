import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AccessService } from './access.service';

/**
 * The gate in front of the upload area. Tests run in demo mode (no
 * `window.__STEINABI__`), so the client-side branch is exercised here -- in
 * production the equivalent check happens on the server.
 */
describe('AccessService', () => {
  let access: AccessService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    access = TestBed.inject(AccessService);
  });

  it('starts locked, so the upload area is unreachable without a code', () => {
    expect(access.isUnlocked()).toBe(false);
  });

  it('stays locked for a wrong code', async () => {
    expect(await access.unlock('FALSCH')).toBe(false);
    expect(access.isUnlocked()).toBe(false);
  });

  it('stays locked for an empty code', async () => {
    expect(await access.unlock('   ')).toBe(false);
    expect(access.isUnlocked()).toBe(false);
  });

  it('unlocks with the correct code', async () => {
    expect(await access.unlock('ABIFILM26')).toBe(true);
    expect(access.isUnlocked()).toBe(true);
  });

  it('ignores case and surrounding whitespace, as typed on a phone', async () => {
    expect(await access.unlock('  abifilm26 ')).toBe(true);
    expect(access.isUnlocked()).toBe(true);
  });

  it('locks again on demand', async () => {
    await access.unlock('ABIFILM26');
    access.lock();
    expect(access.isUnlocked()).toBe(false);
  });
});
