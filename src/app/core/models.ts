import { Category, Grade } from './config';

export type ReviewStatus = 'neu' | 'gesichtet' | 'verwendet' | 'aussortiert';

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  neu: 'Neu',
  gesichtet: 'Gesichtet',
  verwendet: 'Im Film verwendet',
  aussortiert: 'Aussortiert',
};

/** What the team may say about a status towards the person who uploaded. */
export const REVIEW_STATUS_HINTS: Record<ReviewStatus, string> = {
  neu: 'Noch nicht angesehen',
  gesichtet: 'Vom Team angesehen',
  verwendet: 'Im Film verwendet',
  aussortiert: 'Passt nicht in den Film',
};

export type MediaType = 'image' | 'video';

/**
 * The metadata the upload form collects.
 *
 * Applies to every file of one upload batch: the form is filled once, and
 * each file gets its own record carrying a copy. One document per file means
 * every object holds its own consent record, which is what makes a single
 * file withdrawable on its own.
 */
export interface MediaMetadata {
  category: Category;
  /** School year the material is from -- see GRADES in `config.ts`. */
  grade: Grade;
  description: string;
  consentPersons: boolean;
  consentPrivacy: boolean;
}

/** An open withdrawal request, mirrored onto the media item. */
export interface OpenWithdrawal {
  id: string;
  reason: string;
  createdAt: string;
}

/** One uploaded file. */
export interface MediaItem extends MediaMetadata {
  id: string;
  userId: string;
  type: MediaType;
  title: string;
  fileSize: number;
  createdAt: string;
  likes: number;
  uploaderName: string;
  uploaderClass: string;
  /** Which version of the consent wording was actually agreed to. */
  consentVersion: string;
  reviewStatus: ReviewStatus;
  openWithdrawal?: OpenWithdrawal | null;
}

/** What the client sends to register a finished upload. */
export interface MediaDraft extends MediaMetadata {
  storagePath: string;
  title: string;
}

export type WithdrawalStatus = 'offen' | 'erledigt' | 'zurueckgenommen';

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  offen: 'Offen',
  erledigt: 'Erledigt, Datei gelöscht',
  zurueckgenommen: 'Von der Person zurückgenommen',
};

/**
 * A request to remove one file.
 *
 * There is deliberately no 'abgelehnt' status: withdrawing consent under
 * Art. 7(3) GDPR cannot be refused, so this workflow coordinates the removal
 * rather than deciding whether it happens.
 */
export interface WithdrawalRequest {
  id: string;
  mediaId: string;
  userId: string;
  uploaderName: string;
  uploaderClass: string;
  title: string;
  reason: string;
  status: WithdrawalStatus;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}
