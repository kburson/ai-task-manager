import { formatDuration } from '../duration.mjs';
import { parseTimingRows, rollupTotals } from '../../timing-rollup.mjs';

export const ISSUE_TIME_FIELD_KEYS = Object.freeze([
  'engagedTime',
  'sessionTime',
  'reviewTime',
  'planTime',
]);

function selectFields(value) {
  return Object.fromEntries(ISSUE_TIME_FIELD_KEYS.map((key) => [key, value?.[key]]));
}

export function deriveIssueTimeExpectedFields(timingBody, thresholdMin = 5) {
  const body = String(timingBody || '');
  const totals = rollupTotals(parseTimingRows(body), Number(thresholdMin) || 5, body);
  if (totals.rowCount === 0) {
    throw new Error('issue-time projection requires at least one timing row');
  }
  return {
    bodyFields: {
      engagedTime: totals.engagedMin,
      sessionTime: totals.totalActiveMin,
      reviewTime: totals.reviewMin,
      planTime: totals.planMin,
    },
    projectFields: {
      engagedTime: formatDuration(Math.round(totals.engagedSec)),
      sessionTime: formatDuration(Math.round(totals.totalActiveSec)),
      reviewTime: formatDuration(Math.round(totals.reviewSec)),
      planTime: formatDuration(Math.round(totals.planMin * 60)),
    },
  };
}

export function validateIssueTimeExpectedFields(expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new Error('persisted issue-time expected fields are malformed');
  }
  for (const key of ISSUE_TIME_FIELD_KEYS) {
    if (
      typeof expected.bodyFields?.[key] !== 'number' ||
      !Number.isFinite(expected.bodyFields[key])
    ) {
      throw new Error('persisted issue-time body fields are malformed');
    }
    if (typeof expected.projectFields?.[key] !== 'string' || expected.projectFields[key] === '') {
      throw new Error('persisted issue-time project fields are malformed');
    }
  }
  return {
    bodyFields: selectFields(expected.bodyFields),
    projectFields: selectFields(expected.projectFields),
  };
}

export function issueTimeProjectionMatches(state, expected) {
  let trusted;
  try {
    trusted = validateIssueTimeExpectedFields(expected);
  } catch {
    return false;
  }
  return ISSUE_TIME_FIELD_KEYS.every(
    (key) =>
      state?.bodyFields?.[key] === trusted.bodyFields[key] &&
      state?.projectFields?.[key] === trusted.projectFields[key]
  );
}

export async function reconcileIssueTimeProjection({ expected, readState, mutate } = {}) {
  const trusted = validateIssueTimeExpectedFields(expected);
  if (typeof readState !== 'function' || typeof mutate !== 'function') {
    throw new Error('issue-time projection requires read and mutation capabilities');
  }
  const before = await readState();
  if (issueTimeProjectionMatches(before, trusted)) {
    return { reconciled: true, skippedMutation: true, state: before };
  }
  try {
    await mutate();
  } catch (error) {
    const afterLoss = await readState();
    if (issueTimeProjectionMatches(afterLoss, trusted)) {
      return {
        reconciled: true,
        recoveredAfterResponseLoss: true,
        state: afterLoss,
      };
    }
    throw error;
  }
  const after = await readState();
  if (!issueTimeProjectionMatches(after, trusted)) {
    throw new Error('issue-time exact remote read-back does not match');
  }
  return { reconciled: true, state: after };
}
