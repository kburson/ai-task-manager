// #932 — demote-to-develop invalidation of stale AC/VC/Functional-DoD proof.
//
// A backward move (`demote`) does not by itself mean the code is wrong — it
// means the caller is about to change it (`--rework` is mandatory, #935). Any
// checkbox whose `aitm-verified` marker already carries execution PROOF
// (`ts=`/`sha=`/`evidence=`) attests to a commit that is about to be
// superseded. Strip the proof (uncheck the box, drop the run-props) so the
// forward re-drive's existing skip-if-stamped path re-verifies honestly
// against the new HEAD — the bare `cmd=`/`vc-list=` DECLARATION survives so
// the re-drive still knows what to run again.
//
// Deliberately generic: scans every checkbox line in the body (AC section,
// Functional DoD section) instead of parsing per-section, because execution
// PROOF only exists on lines a stage-verb sandbox actually stamped — Lifecycle
// checkboxes and unstamped Refine/Plan-era declarations carry no run-props and
// are untouched by construction. Invariant/lifecycle markers live outside any
// checkbox line and are never matched by `CHECKED_LINE_RE`.

import { hasExecutionProof, stripExecutionProof } from './proof-marker.mjs';
import { stripMarkers } from './ac-evidence.mjs';
import {
  derivePersistedReviewAuthority,
  serializeReviewInvalidation,
} from './review-authority.mjs';

const CHECKED_LINE_RE = /^(\s*- \[)x(\]\s+)(.+)$/gm;

// Returns { body, invalidated: [label, ...] }. `invalidated` names the
// human-readable label of every checkbox that was unchecked, for the caller's
// audit trail. Idempotent — a body with nothing to strip returns unchanged.
export function appendReviewAuthorityInvalidation(body, { ts, reason = 'demoted' } = {}) {
  const src = String(body || '');
  const authority = derivePersistedReviewAuthority(src);
  if (authority.status !== 'current' || !authority.epoch || !ts) {
    return { body: src, reviewInvalidated: false, authority };
  }
  const separator = src.length > 0 && !src.endsWith('\n') ? '\n' : '';
  return {
    body: `${src}${separator}${serializeReviewInvalidation({ epoch: authority.epoch, ts, reason })}`,
    reviewInvalidated: true,
    authority,
  };
}

export function invalidateEvidence(
  body,
  { reviewInvalidatedAt = '', reviewInvalidationReason = 'demoted' } = {}
) {
  const src = String(body || '');
  const invalidated = [];
  const next = src.replace(CHECKED_LINE_RE, (line, pre, post, rest) => {
    if (!hasExecutionProof(rest)) return line;
    invalidated.push(stripMarkers(rest));
    return `${pre} ${post}${stripExecutionProof(rest)}`;
  });
  const review = reviewInvalidatedAt
    ? appendReviewAuthorityInvalidation(next, {
        ts: reviewInvalidatedAt,
        reason: reviewInvalidationReason,
      })
    : { body: next, reviewInvalidated: false, authority: null };
  return { body: review.body, invalidated, reviewInvalidated: review.reviewInvalidated };
}
