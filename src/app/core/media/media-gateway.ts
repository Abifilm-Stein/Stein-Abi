import { AuthService } from '../auth/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../account/session.service';
import { CONSENT_VERSION } from '../config';
import { AccountSummary, MediaDraft, MediaItem, ReviewStatus, WithdrawalRequest, WithdrawalStatus } from '../models';
import { runtimeConfig } from '../runtime-config';

/**
 * Persistence boundary for media records.
 *
 * Files are private: nothing here ever returns a public URL. Displaying a
 * file goes through `signedUrl`, which asks the API for a short-lived,
 * single-object link that the server only issues to the owner or the team.
 */
export abstract class MediaGateway {
  /** Register a finished upload. The server verifies the stored object. */
  abstract create(draft: MediaDraft): Promise<MediaItem>;

  /** The signed-in person's own files. Never anybody else's. */
  abstract listMine(userId: string): Promise<MediaItem[]>;

  /** Short-lived URL for displaying or downloading one file. */
  abstract signedUrl(mediaId: string): Promise<string>;

  abstract requestWithdrawal(mediaId: string, userId: string, reason: string): Promise<void>;
  abstract cancelWithdrawal(requestId: string, userId: string): Promise<void>;

  /** Public counter for the landing page. */
  abstract count(): Promise<number>;

  /* Team only. These routes require the team token from POST /auth/sign-in. */
  abstract listAll(): Promise<MediaItem[]>;
  abstract adminSignedUrl(mediaId: string): Promise<string>;
  abstract setReviewStatus(mediaId: string, status: ReviewStatus): Promise<void>;
  abstract listAccounts(): Promise<AccountSummary[]>;
  abstract resetCode(accountId: string): Promise<string>;
  abstract listWithdrawals(): Promise<WithdrawalRequest[]>;
  abstract resolveWithdrawal(
    requestId: string,
    outcome: Exclude<WithdrawalStatus, 'offen'>,
    note: string,
  ): Promise<void>;
}

@Injectable()
export class HttpMediaGateway implements MediaGateway {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly team = inject(AuthService);
  private readonly base = runtimeConfig.apiBaseUrl.replace(/\/$/, '');

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.session.token() ?? ''}` });
  }

  private teamHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.team.token() ?? ''}` });
  }

  create(draft: MediaDraft): Promise<MediaItem> {
    return firstValueFrom(
      this.http.post<MediaItem>(`${this.base}/media`, draft, { headers: this.authHeaders() }),
    );
  }

  listMine(): Promise<MediaItem[]> {
    // No user id in the URL on purpose: the session token decides whose
    // files come back, so a tampered request cannot widen the result.
    return firstValueFrom(
      this.http.get<MediaItem[]>(`${this.base}/media/mine`, { headers: this.authHeaders() }),
    );
  }

  async signedUrl(mediaId: string): Promise<string> {
    const result = await firstValueFrom(
      this.http.get<{ url: string }>(`${this.base}/media/${mediaId}/url`, {
        headers: this.authHeaders(),
      }),
    );
    return result.url;
  }

  async requestWithdrawal(mediaId: string, _userId: string, reason: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.base}/media/${mediaId}/withdrawal`,
        { reason },
        { headers: this.authHeaders() },
      ),
    );
  }

  async cancelWithdrawal(requestId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.base}/withdrawals/mine/${requestId}`, {
        headers: this.authHeaders(),
      }),
    );
  }

  async count(): Promise<number> {
    const result = await firstValueFrom(
      this.http.get<{ count: number }>(`${this.base}/media/count`),
    );
    return result.count;
  }

  listAll(): Promise<MediaItem[]> {
    return firstValueFrom(
      this.http.get<MediaItem[]>(`${this.base}/admin/media`, { headers: this.teamHeaders() }),
    );
  }

  async adminSignedUrl(mediaId: string): Promise<string> {
    const result = await firstValueFrom(
      this.http.get<{ url: string }>(`${this.base}/admin/media/${mediaId}/url`, {
        headers: this.teamHeaders(),
      }),
    );
    return result.url;
  }

  async setReviewStatus(mediaId: string, status: ReviewStatus): Promise<void> {
    await firstValueFrom(
      this.http.patch(
        `${this.base}/admin/media/${mediaId}`,
        { reviewStatus: status },
        { headers: this.teamHeaders() },
      ),
    );
  }

  listAccounts(): Promise<AccountSummary[]> {
    return firstValueFrom(
      this.http.get<AccountSummary[]>(`${this.base}/admin/accounts`, {
        headers: this.teamHeaders(),
      }),
    );
  }

  async resetCode(accountId: string): Promise<string> {
    const result = await firstValueFrom(
      this.http.post<{ code: string }>(
        `${this.base}/admin/accounts/${accountId}/reset-code`,
        {},
        { headers: this.teamHeaders() },
      ),
    );
    return result.code;
  }

  listWithdrawals(): Promise<WithdrawalRequest[]> {
    return firstValueFrom(
      this.http.get<WithdrawalRequest[]>(`${this.base}/admin/withdrawals`, {
        headers: this.teamHeaders(),
      }),
    );
  }

  async resolveWithdrawal(
    requestId: string,
    outcome: Exclude<WithdrawalStatus, 'offen'>,
    note: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.patch(
        `${this.base}/admin/withdrawals/${requestId}`,
        { status: outcome, note },
        { headers: this.teamHeaders() },
      ),
    );
  }
}

const STORAGE_KEY = 'steinabi-demo-media';

/**
 * Demo-mode persistence in `localStorage`.
 *
 * Lets the whole flow be reviewed without a backend. NOT a production store:
 * per-browser, unencrypted, and the per-user filtering is a convenience
 * rather than access control.
 */
@Injectable()
export class LocalMediaGateway implements MediaGateway {
  private readonly session = inject(SessionService);

  async create(draft: MediaDraft): Promise<MediaItem> {
    const account = this.session.account();
    const item: MediaItem = {
      ...draft,
      id: crypto.randomUUID(),
      userId: account?.id ?? 'demo',
      // The real server decides this from the file's magic bytes; the demo
      // guesses from the extension, which is fine because nothing is stored.
      type: /\.(mp4|mov|m4v|webm|avi|mkv|3gp)$/i.test(draft.title) ? 'video' : 'image',
      fileSize: 0,
      createdAt: new Date().toISOString(),
      likes: 0,
      uploaderName: account?.displayName ?? 'Demo',
      uploaderClass: account?.schoolClass ?? '',
      consentVersion: CONSENT_VERSION,
      reviewStatus: 'neu',
      openWithdrawal: null,
    };
    this.write([...this.read(), item]);
    return item;
  }

  async listMine(userId: string): Promise<MediaItem[]> {
    return this.read()
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async signedUrl(): Promise<string> {
    // Nothing was actually uploaded in demo mode, so there is nothing to show.
    throw new Error('Im Demo-Modus gibt es keine gespeicherten Dateien.');
  }

  async requestWithdrawal(mediaId: string, userId: string, reason: string): Promise<void> {
    this.write(
      this.read().map((item) =>
        item.id === mediaId && item.userId === userId && !item.openWithdrawal
          ? {
              ...item,
              openWithdrawal: {
                id: crypto.randomUUID(),
                reason,
                createdAt: new Date().toISOString(),
              },
            }
          : item,
      ),
    );
  }

  async cancelWithdrawal(requestId: string, userId: string): Promise<void> {
    this.write(
      this.read().map((item) =>
        item.openWithdrawal?.id === requestId && item.userId === userId
          ? { ...item, openWithdrawal: null }
          : item,
      ),
    );
  }

  async count(): Promise<number> {
    return this.read().length;
  }

  async listAll(): Promise<MediaItem[]> {
    return this.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async adminSignedUrl(): Promise<string> {
    throw new Error('Im Demo-Modus gibt es keine gespeicherten Dateien.');
  }

  async setReviewStatus(mediaId: string, status: ReviewStatus): Promise<void> {
    this.write(
      this.read().map((item) => (item.id === mediaId ? { ...item, reviewStatus: status } : item)),
    );
  }

  async listAccounts(): Promise<AccountSummary[]> {
    return [];
  }

  async resetCode(): Promise<string> {
    throw new Error('Im Demo-Modus gibt es keine Konten.');
  }

  async listWithdrawals(): Promise<WithdrawalRequest[]> {
    return this.read()
      .filter((item) => item.openWithdrawal)
      .map((item) => ({
        id: item.openWithdrawal!.id,
        mediaId: item.id,
        userId: item.userId,
        uploaderName: item.uploaderName,
        uploaderClass: item.uploaderClass,
        title: item.title,
        reason: item.openWithdrawal!.reason,
        status: 'offen' as WithdrawalStatus,
        createdAt: item.openWithdrawal!.createdAt,
      }));
  }

  async resolveWithdrawal(
    requestId: string,
    outcome: Exclude<WithdrawalStatus, 'offen'>,
  ): Promise<void> {
    const items = this.read();
    const target = items.find((item) => item.openWithdrawal?.id === requestId);
    if (!target) return;

    this.write(
      outcome === 'erledigt'
        ? items.filter((item) => item.id !== target.id)
        : items.map((item) =>
            item.id === target.id ? { ...item, openWithdrawal: null } : item,
          ),
    );
  }

  private read(): MediaItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as MediaItem[]) : [];
    } catch {
      return [];
    }
  }

  private write(items: MediaItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full or blocked -- demo mode only, nothing to recover.
    }
  }
}

