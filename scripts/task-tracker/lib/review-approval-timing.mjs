import {
  bodyOf,
  buildMarkerAuthorizedReviewApprovedRow,
  postTimingEvent as defaultPostTimingEvent,
  readTimingCommentBody as defaultReadTimingCommentBody,
} from '../gh-timing-comment.mjs';
import { hasReviewApprovedMarker, parseReviewApprovedMarker } from './markers.mjs';
import { computePhaseCloseDelta } from './timing-rows.mjs';
import { parseTimingRows, pendingClosePairState } from '../timing-rollup.mjs';

export async function reconcileReviewApprovedTiming({
  issueNumber,
  repo,
  issueBody,
  wordMarker = 0,
  readTimingCommentBody = defaultReadTimingCommentBody,
  postTimingEvent = defaultPostTimingEvent,
} = {}) {
  if (!issueNumber) throw new Error('review approval timing requires issueNumber');
  if (!repo) throw new Error('review approval timing requires repo');
  if (!hasReviewApprovedMarker(issueBody)) {
    throw new Error('review approval timing requires an authoritative approval marker');
  }
  const approval = parseReviewApprovedMarker(issueBody);
  if (!approval?.ts || !Number.isFinite(Date.parse(approval.ts))) {
    throw new Error('review approval timing marker has a non-parseable timestamp');
  }

  const read = await readTimingCommentBody({ issueNumber, repo });
  if (read?.status === 'error') {
    throw new Error(
      `review approval timing log is unreadable: ${read.error?.message || 'unknown'}`
    );
  }
  const timingBody = bodyOf(read);
  if (pendingClosePairState(timingBody).reviewApproved) {
    return { status: 'present', ts: approval.ts };
  }

  const delta = computePhaseCloseDelta(timingBody, 'review', approval.ts, wordMarker);
  if (!delta.matched) {
    throw new Error('review approval timing cannot find review:started in the timing log');
  }
  const approvalMs = Date.parse(approval.ts);
  const timingRows = parseTimingRows(timingBody);
  const hasLaterRow = timingRows.some(({ tsMs }) => Number.isFinite(tsMs) && tsMs > approvalMs);
  let boundaryWordMarker = wordMarker;
  if (hasLaterRow) {
    for (const timingRow of timingRows) {
      if (!Number.isFinite(timingRow.tsMs) || timingRow.tsMs > approvalMs) continue;
      if (Number.isFinite(timingRow.wordMarker)) boundaryWordMarker = timingRow.wordMarker;
    }
  }
  const row = buildMarkerAuthorizedReviewApprovedRow({
    issueBody,
    activeSec: delta.activeSec,
    idleSec: delta.idleSec,
    wordMarker: boundaryWordMarker,
  });
  await postTimingEvent({ issueNumber, repo, row });
  return { status: 'posted', ts: approval.ts };
}
