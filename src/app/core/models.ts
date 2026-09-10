import { Category } from './config';

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
  /** Month precision is enough: `YYYY-MM`. */
  takenAt: string;
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
}
