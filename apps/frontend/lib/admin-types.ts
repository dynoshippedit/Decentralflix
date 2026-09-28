/**
 * Decentralflix Admin Dashboard Types
 * Used by /admin and /admin/review/[id]
 */

export type TrustTier = 'TRUSTED' | 'VERIFIED' | 'NEW' | 'BANNED';

export type ContentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'DENIED' | 'DELISTED';

export interface AdminFilm {
  id: string;                    // filmHash or on-chain id
  title: string;
  description: string;
  creator: string;               // wallet address
  creatorTier: TrustTier;
  submittedAt: string;           // ISO
  status: ContentStatus;
  genre?: string;
  durationMinutes?: number;
  videoHash: string;
  isDeplatformed?: boolean;
}

export interface AdminCreator {
  wallet: string;
  displayName?: string;
  tier: TrustTier;
  contentCount: number;
  joinedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  adminWallet: string;
  action: 'APPROVE' | 'DENY' | 'DELIST' | 'RESTORE' | 'PROMOTE_TIER' | 'DEMOTE_TIER' | 'BAN';
  targetId: string;              // filmHash or creator wallet
  details: string;
}

export interface NCMECReportData {
  platform: string;
  contentHash: string;
  uploadTimestamp: string;
  creatorWallet: string;
  ipAddress?: string;
  fileType: string;
  additionalNotes?: string;
}
