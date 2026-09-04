// @story #1512
// Pure policy for the optional human pull-request review boundary.

const SHA_RE = /^[0-9a-f]{40}$/;

function sameLogin(left, right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function resolveManualCodeReviewer({ configuredReviewer = '@me', authenticatedLogin } = {}) {
  const configured = String(configuredReviewer || '').trim();
  const reviewer = configured === '@me' ? String(authenticatedLogin || '').trim() : configured;
  if (reviewer.length === 0) throw new TypeError('manual-code-review:reviewer-unresolved');
  return reviewer;
}

function readableParticipant(participant) {
  return (
    plainObject(participant) &&
    typeof participant.login === 'string' &&
    participant.login.length > 0 &&
    typeof participant.isBot === 'boolean'
  );
}

function readableReview(review) {
  return (
    plainObject(review) &&
    typeof review.authorLogin === 'string' &&
    review.authorLogin.length > 0 &&
    typeof review.authorIsBot === 'boolean' &&
    typeof review.state === 'string' &&
    SHA_RE.test(review.commitOid || '') &&
    typeof review.submittedAt === 'string' &&
    Number.isFinite(Date.parse(review.submittedAt))
  );
}

export function evaluateManualCodeReview({
  gateEnabled,
  expectedHeadSha,
  reviewerLogin,
  pullRequest,
} = {}) {
  if (gateEnabled !== true) return { status: 'authorized', mode: 'full-auto' };
  if (
    gateEnabled !== true ||
    !SHA_RE.test(expectedHeadSha || '') ||
    typeof reviewerLogin !== 'string' ||
    reviewerLogin.length === 0 ||
    !plainObject(pullRequest) ||
    !readableParticipant(pullRequest.author) ||
    !Array.isArray(pullRequest.reviewRequests) ||
    !pullRequest.reviewRequests.every(readableParticipant) ||
    !Array.isArray(pullRequest.reviews) ||
    !pullRequest.reviews.every(readableReview)
  ) {
    return { status: 'refused', reason: 'evidence-unreadable' };
  }
  if (sameLogin(reviewerLogin, pullRequest.author.login)) {
    return { status: 'refused', reason: 'reviewer-is-author' };
  }

  const requestedReviewer = pullRequest.reviewRequests.find(({ login }) =>
    sameLogin(login, reviewerLogin)
  );
  const reviewerReviews = pullRequest.reviews.filter(({ authorLogin }) =>
    sameLogin(authorLogin, reviewerLogin)
  );
  if (
    requestedReviewer?.isBot === true ||
    reviewerReviews.some(({ authorIsBot }) => authorIsBot === true)
  ) {
    return { status: 'refused', reason: 'reviewer-bot' };
  }

  const exactHeadReviews = reviewerReviews
    .filter(({ commitOid }) => commitOid === expectedHeadSha)
    .filter(({ state }) =>
      ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(state.toUpperCase())
    )
    .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt));
  const latest = exactHeadReviews.at(-1);
  if (latest?.state.toUpperCase() === 'APPROVED') {
    return {
      status: 'authorized',
      mode: 'human-pr-review',
      reviewerLogin,
      approvedHeadSha: expectedHeadSha,
      submittedAt: latest.submittedAt,
    };
  }
  return {
    status: requestedReviewer ? 'waiting' : 'request-review',
    reviewerLogin,
    reason: 'approval-missing',
  };
}
