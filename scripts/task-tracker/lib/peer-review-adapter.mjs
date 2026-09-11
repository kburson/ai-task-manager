import {
  createNativePushTransport as installedCreateNativePushTransport,
  negotiateAutomaticRequired as installedNegotiateAutomaticRequired,
  residentHealth as installedResidentHealth,
  statusReview as installedStatusReview,
  validateAutomaticParticipant as installedValidateAutomaticParticipant,
  validateResidentLease as installedValidateResidentLease,
} from 'ai-peer-review';

export const AITM_PEER_REVIEW_CONFIG = Object.freeze({
  reviewsRoot: 'docs/superpowers/reviews',
  reviewPathTemplate: '<issue>/<kind>',
  allowNoCommit: false,
});

export const installedPeerReviewApi = Object.freeze({
  createNativePushTransport: installedCreateNativePushTransport,
  negotiateAutomaticRequired: installedNegotiateAutomaticRequired,
  residentHealth: installedResidentHealth,
  statusReview: installedStatusReview,
  validateAutomaticParticipant: installedValidateAutomaticParticipant,
  validateResidentLease: installedValidateResidentLease,
});

function positiveIssue(issue) {
  const value = Number(issue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('peer-review: issue must be a positive safe integer');
  }
  return value;
}

export function peerReviewStartArgs({
  artifact,
  issue,
  kind,
  noCommit = false,
  testMode = false,
  testHumanAuthority,
  maxTurns,
  claimTtl,
}) {
  const artifactPath = String(artifact || '').trim();
  if (!artifactPath) throw new TypeError('peer-review: artifact is required');
  if (!['spec', 'plan'].includes(kind)) {
    throw new TypeError('peer-review: kind must be spec or plan');
  }
  if (noCommit && !testMode) throw new Error('peer-review: no-commit mode is test-only in AITM');
  if (testHumanAuthority && (!testMode || !noCommit)) {
    throw new Error('peer-review: test Human Authority requires explicit no-commit test mode');
  }
  for (const [label, value] of [
    ['maxTurns', maxTurns],
    ['claimTtl', claimTtl],
  ]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new TypeError(`peer-review: ${label} must be a positive safe integer`);
    }
  }

  return Object.freeze([
    'start',
    artifactPath,
    '--artifact-kind',
    kind,
    '--issue',
    String(positiveIssue(issue)),
    '--reviews-root',
    AITM_PEER_REVIEW_CONFIG.reviewsRoot,
    '--review-path-template',
    AITM_PEER_REVIEW_CONFIG.reviewPathTemplate,
    ...(maxTurns ? ['--max-turns', String(maxTurns)] : []),
    ...(claimTtl ? ['--claim-ttl', String(claimTtl)] : []),
    ...(noCommit ? ['--no-commit'] : []),
    ...(testHumanAuthority ? ['--test-human-authority', String(testHumanAuthority)] : []),
  ]);
}

export function peerReviewStatus({ workspace, api = installedPeerReviewApi }) {
  const status = api.statusReview(workspace);
  return Object.freeze({
    reviewId: status.review_id,
    state: status.state,
    worktree: status.worktree ?? status.paths?.workspace ?? workspace,
  });
}
