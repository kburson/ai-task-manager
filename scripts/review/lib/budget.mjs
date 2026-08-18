// @story #1268

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be an integer >= ${minimum}: ${String(value)}`);
  }
  return value;
}

export function reviewBudgetFloor(state, resumeRole) {
  const used = integer(state.reviewTurnsUsed, 'reviewTurnsUsed');
  if (!['owner', 'reviewer'].includes(resumeRole)) {
    throw new RangeError(`resumeRole must be owner or reviewer: ${String(resumeRole)}`);
  }
  return resumeRole === 'reviewer' ? used + 1 : used;
}

export function planAbsoluteBudget(state, requestedMax, resumeRole) {
  const requested = integer(requestedMax, 'requestedMax');
  const priorMax = integer(state.maxReviewTurns, 'maxReviewTurns');
  const reviewTurnsUsed = integer(state.reviewTurnsUsed, 'reviewTurnsUsed');
  const effectiveMax = Math.max(requested, reviewBudgetFloor(state, resumeRole));
  return Object.freeze({
    priorMax,
    requestedMax: requested,
    effectiveMax,
    reviewTurnsUsed,
    remainingReviewTurns: effectiveMax - reviewTurnsUsed,
  });
}

export function planContinuationBudget(
  state,
  { resumeRole, maxReviewTurns, additionalTurns } = {}
) {
  if (maxReviewTurns !== undefined && additionalTurns !== undefined) {
    throw new RangeError('maxReviewTurns and additionalTurns are mutually exclusive');
  }
  const requestedMax =
    additionalTurns === undefined
      ? maxReviewTurns === undefined
        ? reviewBudgetFloor(state, resumeRole)
        : maxReviewTurns
      : integer(additionalTurns, 'additionalTurns', 1) +
        integer(state.maxReviewTurns, 'maxReviewTurns');
  return planAbsoluteBudget(state, requestedMax, resumeRole);
}
