import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { isDemoMode, runtimeConfig } from '../runtime-config';

const SESSION_KEY = 'steinabi-access';

/** Demo-mode code. Irrelevant in production, where the server decides. */
const DEMO_CODE = 'ABIFILM26';

/**
 * Gate in front of the upload area.
 *
 * Deliberately not a login: 200 students will not register accounts, and
 * every extra step costs submissions. One code for the year group, or a
 * pre-filled invite link (`/upload?code=…`), is the whole flow.
 *
 * In production the code is verified SERVER-SIDE and exchanged for a
 * short-lived upload token -- the client-side comparison below runs only in
 * demo mode and protects nothing.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly http = inject(HttpClient);

  private readonly _token = signal<string | null>(readStoredToken());
  readonly isUnlocked = computed(() => this._token() !== null);
  readonly token = this._token.asReadonly();

  private readonly _checking = signal(false);
  readonly checking = this._checking.asReadonly();

  async unlock(code: string): Promise<boolean> {
    const normalized = code.trim().toUpperCase();
    if (normalized.length === 0) return false;

    this._checking.set(true);
    try {
      const token = isDemoMode
        ? normalized === DEMO_CODE
          ? `demo:${normalized}`
          : null
        : await this.exchange(normalized);

      if (!token) return false;

      this._token.set(token);
      try {
        sessionStorage.setItem(SESSION_KEY, token);
      } catch {
        // Private mode: the code just has to be entered again next visit.
      }
      return true;
    } catch {
      return false;
    } finally {
      this._checking.set(false);
    }
  }

  lock(): void {
    this._token.set(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  private async exchange(code: string): Promise<string | null> {
    const base = runtimeConfig.apiBaseUrl.replace(/\/$/, '');
    try {
      const result = await firstValueFrom(
        this.http.post<{ token: string }>(`${base}/access`, { code }),
      );
      return result.token ?? null;
    } catch {
      return null;
    }
  }
}

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
