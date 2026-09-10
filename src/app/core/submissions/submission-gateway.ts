import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CONSENT_VERSION } from '../config';
import {
  ReviewStatus,
  Submission,
  SubmissionDraft,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../models';
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

  /**
   * File a withdrawal request. Does NOT delete anything: the team removes the
   * material after talking to the person who asked.
   */
  abstract requestWithdrawal(
    submissionId: string,
    accountId: string,
    reason: string,
  ): Promise<void>;

  /** Take back one's own request, e.g. after talking to the team. */
  abstract cancelWithdrawal(requestId: string, accountId: string): Promise<void>;

  /* Team-only operations. */
  abstract list(): Promise<Submission[]>;
  abstract setReviewStatus(id: string, status: ReviewStatus): Promise<void>;
  abstract remove(id: string): Promise<void>;

  abstract listWithdrawalRequests(): Promise<WithdrawalRequest[]>;
  /**
   * Close a request. `erledigt` deletes the submission and its files;
   * `zurueckgenommen` only closes the request and is reserved for the case
   * where the person agreed to keep the material.
   */
  abstract resolveWithdrawal(
    requestId: string,
    outcome: Exclude<WithdrawalStatus, 'offen'>,
    note: string,
  ): Promise<void>;

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

  async requestWithdrawal(submissionId: string, _accountId: string, reason: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.base}/submissions/mine/${submissionId}/withdrawal`, { reason }),
    );
  }

  async cancelWithdrawal(requestId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/withdrawals/mine/${requestId}`));
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

  listWithdrawalRequests(): Promise<WithdrawalRequest[]> {
    return firstValueFrom(this.http.get<WithdrawalRequest[]>(`${this.base}/withdrawals`));
  }

  async resolveWithdrawal(
    requestId: string,
    outcome: Exclude<WithdrawalStatus, 'offen'>,
    note: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.base}/withdrawals/${requestId}`, { status: outcome, note }),
    );
  }

  async count(): Promise<number> {
    const result = await firstValueFrom(
      this.http.get<{ count: number }>(`${this.base}/submissions/count`),
    );
    return result.count;
  }
}

const SUBMISSIONS_KEY = 'steinabi-demo-submissions';
const WITHDRAWALS_KEY = 'steinabi-demo-withdrawals';

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
    this.writeSubmissions([...this.readSubmissions(), submission]);
    return submission;
  }

  async listMine(accountId: string): Promise<Submission[]> {
    return (await this.list()).filter((entry) => entry.accountId === accountId);
  }

  async requestWithdrawal(
    submissionId: string,
    accountId: string,
    reason: string,
  ): Promise<void> {
    const submission = this.readSubmissions().find(
      (entry) => entry.id === submissionId && entry.accountId === accountId,
    );
    if (!submission) return;

    const open = this.readWithdrawals().some(
      (entry) => entry.submissionId === submissionId && entry.status === 'offen',
    );
    if (open) return;

    const request: WithdrawalRequest = {
      id: crypto.randomUUID(),
      submissionId,
      accountId,
      uploaderName: submission.uploaderName,
      uploaderClass: submission.uploaderClass,
      assetCount: submission.assets.length,
      reason,
      status: 'offen',
      createdAt: new Date().toISOString(),
    };
    this.writeWithdrawals([...this.readWithdrawals(), request]);
  }

  async cancelWithdrawal(requestId: string, accountId: string): Promise<void> {
    this.writeWithdrawals(
      this.readWithdrawals().map((entry) =>
        entry.id === requestId && entry.accountId === accountId && entry.status === 'offen'
          ? { ...entry, status: 'zurueckgenommen', resolvedAt: new Date().toISOString() }
          : entry,
      ),
    );
  }

  async list(): Promise<Submission[]> {
    const withdrawals = this.readWithdrawals();
    return this.readSubmissions()
      .map((entry) => {
        const request = withdrawals.find(
          (candidate) => candidate.submissionId === entry.id && candidate.status === 'offen',
        );
        return request
          ? {
              ...entry,
              withdrawal: {
                id: request.id,
                status: request.status,
                reason: request.reason,
                createdAt: request.createdAt,
              },
            }
          : entry;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async setReviewStatus(id: string, status: ReviewStatus): Promise<void> {
    this.writeSubmissions(
      this.readSubmissions().map((entry) =>
        entry.id === id ? { ...entry, reviewStatus: status } : entry,
      ),
    );
  }

  async remove(id: string): Promise<void> {
    this.writeSubmissions(this.readSubmissions().filter((entry) => entry.id !== id));
  }

  async listWithdrawalRequests(): Promise<WithdrawalRequest[]> {
    return this.readWithdrawals().sort((a, b) => {
      // Open requests first, newest within each group.
      if (a.status !== b.status) return a.status === 'offen' ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  async resolveWithdrawal(
    requestId: string,
    outcome: Exclude<WithdrawalStatus, 'offen'>,
    note: string,
  ): Promise<void> {
    const request = this.readWithdrawals().find((entry) => entry.id === requestId);
    if (!request) return;

    if (outcome === 'erledigt') await this.remove(request.submissionId);

    this.writeWithdrawals(
      this.readWithdrawals().map((entry) =>
        entry.id === requestId
          ? { ...entry, status: outcome, resolutionNote: note, resolvedAt: new Date().toISOString() }
          : entry,
      ),
    );
  }

  async count(): Promise<number> {
    return this.readSubmissions().length;
  }

  private readSubmissions(): Submission[] {
    return read<Submission>(SUBMISSIONS_KEY);
  }

  private writeSubmissions(entries: Submission[]): void {
    write(SUBMISSIONS_KEY, entries);
  }

  private readWithdrawals(): WithdrawalRequest[] {
    return read<WithdrawalRequest>(WITHDRAWALS_KEY);
  }

  private writeWithdrawals(entries: WithdrawalRequest[]): void {
    write(WITHDRAWALS_KEY, entries);
  }
}

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, entries: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Storage full or blocked -- demo mode only, nothing to recover.
  }
}
