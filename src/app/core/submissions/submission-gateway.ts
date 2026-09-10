import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CONSENT_VERSION } from '../config';
import { ReviewStatus, Submission, SubmissionDraft } from '../models';
import { runtimeConfig } from '../runtime-config';

/** Persistence boundary for submission records. */
export abstract class SubmissionGateway {
  abstract create(draft: SubmissionDraft): Promise<Submission>;

  /**
   * The signed-in student's own submissions.
   *
   * The account is passed for the demo implementation's benefit only. In
   * production the server derives the owner from the session token and the
   * database enforces it -- a client-supplied id must never decide what a
   * request may read.
   */
  abstract listMine(accountId: string): Promise<Submission[]>;

  /** Withdraw one's own submission (Art. 7(3) GDPR). */
  abstract withdraw(id: string, accountId: string): Promise<void>;

  /* Team-only operations. */
  abstract list(): Promise<Submission[]>;
  abstract setReviewStatus(id: string, status: ReviewStatus): Promise<void>;
  abstract remove(id: string): Promise<void>;

  /** Public counter for the landing page. */
  abstract count(): Promise<number>;
}

@Injectable()
export class HttpSubmissionGateway implements SubmissionGateway {
  private readonly http = inject(HttpClient);
  private readonly base = runtimeConfig.apiBaseUrl.replace(/\/$/, '');

  create(draft: SubmissionDraft): Promise<Submission> {
    return firstValueFrom(
      this.http.post<Submission>(`${this.base}/submissions`, {
        ...draft,
        consentVersion: CONSENT_VERSION,
      }),
    );
  }

  listMine(): Promise<Submission[]> {
    // No account id in the URL on purpose: the session token decides.
    return firstValueFrom(this.http.get<Submission[]>(`${this.base}/submissions/mine`));
  }

  async withdraw(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/submissions/mine/${id}`));
  }

  list(): Promise<Submission[]> {
    return firstValueFrom(this.http.get<Submission[]>(`${this.base}/submissions`));
  }

  async setReviewStatus(id: string, status: ReviewStatus): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.base}/submissions/${id}`, { reviewStatus: status }),
    );
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/submissions/${id}`));
  }

  async count(): Promise<number> {
    const result = await firstValueFrom(
      this.http.get<{ count: number }>(`${this.base}/submissions/count`),
    );
    return result.count;
  }
}

const STORAGE_KEY = 'steinabi-demo-submissions';

/**
 * Demo-mode persistence in `localStorage`.
 *
 * Present so the whole flow is clickable without a backend. NOT a production
 * store: per-browser, unencrypted, and the per-account filtering below is a
 * convenience rather than access control.
 */
@Injectable()
export class LocalSubmissionGateway implements SubmissionGateway {
  async create(draft: SubmissionDraft): Promise<Submission> {
    const submission: Submission = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      consentVersion: CONSENT_VERSION,
      reviewStatus: 'neu',
    };
    this.write([...this.read(), submission]);
    return submission;
  }

  async listMine(accountId: string): Promise<Submission[]> {
    return (await this.list()).filter((entry) => entry.accountId === accountId);
  }

  async withdraw(id: string, accountId: string): Promise<void> {
    this.write(
      this.read().filter((entry) => !(entry.id === id && entry.accountId === accountId)),
    );
  }

  async list(): Promise<Submission[]> {
    return this.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async setReviewStatus(id: string, status: ReviewStatus): Promise<void> {
    this.write(
      this.read().map((entry) => (entry.id === id ? { ...entry, reviewStatus: status } : entry)),
    );
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((entry) => entry.id !== id));
  }

  async count(): Promise<number> {
    return this.read().length;
  }

  private read(): Submission[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Submission[]) : [];
    } catch {
      return [];
    }
  }

  private write(entries: Submission[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage full or blocked -- demo mode only, nothing to recover.
    }
  }
}
