import { Category, Grade } from './config';

export type ReviewStatus = 'neu' | 'gesichtet' | 'verwendet' | 'aussortiert';

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  neu: 'Neu',
  gesichtet: 'Gesichtet',
  verwendet: 'Im Film verwendet',
  aussortiert: 'Aussortiert',
};

/** What the team is allowed to say publicly about a status, to the uploader. */
export const REVIEW_STATUS_HINTS: Record<ReviewStatus, string> = {
  neu: 'Noch nicht angesehen',
  gesichtet: 'Vom Team angesehen',
  verwendet: 'Im Film verwendet',
  aussortiert: 'Passt nicht in den Film',
};

export interface AssetRef {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * The fields the upload form actually collects.
 *
 * There is deliberately no "may this be used beyond the film" flag: the
 * material is collected for the Abifilm only. Not asking is stronger than
 * asking and defaulting to no -- there is no field anyone could later
 * reinterpret as permission for the Abizeitung or social media.
 */
export interface SubmissionMetadata {
  category: Category;
  /** School year the material is from -- see GRADES in `config.ts`. */
  grade: Grade;
  description: string;
  consentPersons: boolean;
  consentPrivacy: boolean;
}

export interface SubmissionDraft extends SubmissionMetadata {
  /** Owning account. Everything about "my uploads" hangs off this. */
  accountId: string;
  /**
   * Copied from the account at submission time rather than joined on read:
   * the team must still be able to tell who sent something even if the
   * account is later removed.
   */
  uploaderName: string;
  uploaderClass: string;
  assets: AssetRef[];
}

export interface Submission extends SubmissionDraft {
  id: string;
  createdAt: string;
  /** Which version of the consent wording was actually agreed to. */
  consentVersion: string;
  reviewStatus: ReviewStatus;
  /** Set while a withdrawal request exists for this submission. */
  withdrawal?: WithdrawalSummary;
}

/* -------------------------------------------------------------------------
 * Withdrawal requests
 *
 * Uploads are not deleted on the spot: the film may already be cut around a
 * clip, so removing one is a conversation with the team rather than a button.
 *
 * IMPORTANT, and the reason there is no "rejected" state: withdrawing
 * consent under Art. 7(3) GDPR cannot be refused. This workflow exists to
 * coordinate the removal, never to decide whether it happens. A request
 * therefore ends either as `erledigt` (the material was deleted) or as
 * `zurueckgenommen` -- and only the person who filed it may take it back.
 * From the moment a request exists the material counts as blocked and must
 * not be cut into the film.
 * ---------------------------------------------------------------------- */

export type WithdrawalStatus = 'offen' | 'erledigt' | 'zurueckgenommen';

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  offen: 'Offen',
  erledigt: 'Erledigt, Material gelöscht',
  zurueckgenommen: 'Von der Person zurückgenommen',
};

export interface WithdrawalSummary {
  id: string;
  status: WithdrawalStatus;
  reason: string;
  createdAt: string;
}

export interface WithdrawalRequest extends WithdrawalSummary {
  submissionId: string;
  accountId: string;
  /** Denormalised so the team sees who asked without a second lookup. */
  uploaderName: string;
  uploaderClass: string;
  /** How many files the request concerns, for the team overview. */
  assetCount: number;
  resolvedAt?: string;
  /** What the team noted when closing it. */
  resolutionNote?: string;
}
