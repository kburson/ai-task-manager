import { statusReview as installedStatusReview } from 'ai-peer-review';

export const AITM_PEER_REVIEW_CONFIG = Object.freeze({
  reviewsRoot: 'docs/superpowers/reviews',
  reviewPathTemplate: '<issue>/<kind>',
  allowNoCommit: false,
});

export const installedPeerReviewApi = Object.freeze({ statusReview: installedStatusReview });

export function peerReviewStatus({ workspace, api = installedPeerReviewApi }) {
  const status = api.statusReview(workspace);
  return Object.freeze({
    reviewId: status.review_id,
    state: status.state,
    worktree: status.worktree,
  });
}

export function assertLegacyReviewMigrationSafe({ legacyRows = [] } = {}) {
  const active = legacyRows.find((row) => row?.lifecycle === 'active');
  if (active) {
    throw new Error(
      `peer-review-migration: active legacy review ${String(active.protocolId ?? '')}`
    );
  }
  return Object.freeze({ removable: true });
}
