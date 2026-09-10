import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { isDemoMode, runtimeConfig } from '../runtime-config';

const SESSION_KEY = 'steinabi-team-session';

/** Demo credentials. Replaced by real auth as soon as a backend exists. */
const DEMO_EMAIL = 'team@example.de';
const DEMO_PASSWORD = 'abifilm';

/**
 * Authentication for the film team.
 *
 * !! The demo branch below is a PLACEHOLDER and provides no security
 * whatsoever -- it compares a hardcoded password in the browser. Before this
 * goes live, `apiBaseUrl` must be configured so the HTTP branch is used, with
 * the server issuing the session and enforcing the `admin` role on every read
 * of submission data. The route guard is a UX convenience, never the
 * protection: the protection is row-level security in the database.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _session = signal<string | null>(readStoredSession());
  readonly isSignedIn = computed(() => this._session() !== null);

  private readonly _pending = signal(false);
  readonly pending = this._pending.asReadonly();

  async signIn(email: string, password: string): Promise<boolean> {
    this._pending.set(true);
    try {
      const session = isDemoMode
        ? email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD
          ? 'demo-session'
          : null
        : await this.requestSession(email, password);

      if (!session) return false;

      this._session.set(session);
      try {
        sessionStorage.setItem(SESSION_KEY, session);
      } catch {
        /* ignore */
      }
      return true;
    } finally {
      this._pending.set(false);
    }
  }

  signOut(): void {
    this._session.set(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  private async requestSession(email: string, password: string): Promise<string | null> {
    const base = runtimeConfig.apiBaseUrl.replace(/\/$/, '');
    try {
      const result = await firstValueFrom(
        this.http.post<{ token: string }>(`${base}/auth/sign-in`, { email, password }),
      );
      return result.token ?? null;
    } catch {
      return null;
    }
  }
}

function readStoredSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export const teamGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isSignedIn() ? true : router.createUrlTree(['/team']);
};
