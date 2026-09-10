import { Category, SchoolClass } from './config';

export type ReviewStatus = 'neu' | 'gesichtet' | 'verwendet' | 'aussortiert';

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  neu: 'Neu',
  gesichtet: 'Gesichtet',
  verwendet: 'Im Film verwendet',
  aussortiert: 'Aussortiert',
};

export interface AssetRef {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

/** What the upload form collects. */
export interface SubmissionDraft {
  uploaderName: string;
  uploaderClass: SchoolClass;
  category: Category;
  /** Month precision is enough: `YYYY-MM`. */
  takenAt: string;
  description: string;
  consentPersons: boolean;
  consentPrivacy: boolean;
  extendedUsage: boolean;
  assets: AssetRef[];
}

export interface Submission extends SubmissionDraft {
  id: string;
  createdAt: string;
  /** Which version of the consent wording was actually agreed to. */
  consentVersion: string;
  reviewStatus: ReviewStatus;
}
