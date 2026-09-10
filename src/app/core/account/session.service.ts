import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { isDemoMode, runtimeConfig } from '../runtime-config';
import { Account, formatCode, isValidCode, normalizeCode } from './account';

const STORE_KEY = 'steinabi-session';

interface StoredSession {
  token: string;
  account: Account;
}

/**
 * Pre-generated demo accounts, so the flow is clickable without a backend.
 *
 * These must be built from CODE_ALPHABET only -- no I, O, L, U, 0 or 1 --
 * otherwise `isValidCode` rejects them before the lookup ever runs.
 */
const DEMO_ACCOUNTS: { code: string; account: Account }[] = [
  {
    code: 'DEMAQ2MJA234',
    account: { id: 'acc-mia', displayName: 'Mia Beispiel', schoolClass: 'Q2' },
  },
  {
    code: 'DEMBQ2JNS567',
    account: { id: 'acc-jonas', displayName: 'Jonas Muster', schoolClass: 'Q2' },
  },
  {
    code: 'DEMCQ2ENA789',
    account: { id: 'acc-lena', displayName: 'Lena Probe', schoolClass: 'Q1' },
  },
];

export type SignInResult = 'ok' | 'invalid-format' | 'unknown-code' | 'error';

/**
 * Login by personal code.
 *
 * In production the code is sent to the server, which looks up its HASH,
 * applies rate limiting and returns a session token bound to one account.
 * The browser never learns whether a code exists by any means other than
 * that response.
 *
 * The demo branch compares codes in the browser and is NOT a security
 * boundary -- it exists so the flow can be reviewed before infrastructure
 * exists.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);

  private readonly _session = signal<StoredSession | null>(restore());

  readonly account = computed(() => this._session()?.account ?? null);
  readonly isSignedIn = computed(() => this._session() !== null);
  readonly token = computed(() => this._session()?.token ?? null);

  private readonly _pending = signal(false);
  readonly pending = this._pending.asReadonly();

  /**
   * @param remember `true` keeps the session in `localStorage` across browser
   *   restarts. Default is `false`, i.e. `sessionStorage`, because these codes
   *   get typed on shared school computers where a persistent login would
   *   hand the next person somebody else's uploads.
   */
  async signIn(code: string, remember = false): Promise<SignInResult> {
    if (!isValidCode(code)) return 'invalid-format';

    this._pending.set(true);
    try {
      const session = isDemoMode
        ? demoLookup(code)
        : await this.exchange(normalizeCode(code));

      if (!session) return 'unknown-code';

      this._session.set(session);
      persist(session, remember);
      return 'ok';
    } catch {
      return 'error';
    } finally {
      this._pending.set(false);
    }
  }

  signOut(): void {
    this._session.set(null);
    forget();
  }

  private async exchange(code: string): Promise<StoredSession | null> {
    const base = runtimeConfig.apiBaseUrl.replace(/\/$/, '');
    const result = await firstValueFrom(
      this.http.post<StoredSession>(`${base}/session`, { code }),
    );
    return result?.token ? result : null;
  }
}

function demoLookup(code: string): StoredSession | null {
  const normalized = normalizeCode(code);
  const match = DEMO_ACCOUNTS.find((entry) => entry.code === normalized);
  return match ? { token: `demo:${match.account.id}`, account: match.account } : null;
}

/** Codes to show on the login screen while in demo mode. */
export const DEMO_CODES = DEMO_ACCOUNTS.map((entry) => ({
  code: formatCode(entry.code),
  name: entry.account.displayName,
}));

function restore(): StoredSession | null {
  for (const store of storesInPriorityOrder()) {
    try {
      const raw = store?.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw) as StoredSession;
    } catch {
      // Blocked storage or malformed JSON: treat as signed out.
    }
  }
  return null;
}

function persist(session: StoredSession, remember: boolean): void {
  forget();
  try {
    const store = remember ? localStorage : sessionStorage;
    store.setItem(STORE_KEY, JSON.stringify(session));
  } catch {
    // Private mode: the code simply has to be entered again next visit.
  }
}

function forget(): void {
  for (const store of storesInPriorityOrder()) {
    try {
      store?.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function storesInPriorityOrder(): (Storage | null)[] {
  try {
    return [sessionStorage, localStorage];
  } catch {
    return [];
  }
}

/** Sends signed-out visitors to the login, keeping the intended target. */
export const sessionGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session.isSignedIn()
    ? true
    : router.createUrlTree(['/anmelden'], { queryParams: { weiter: state.url } });
};
