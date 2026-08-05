// Agent Review Gate — V2 required-comments validator (#811, #835).
//
// Verifies that the required report comments exist on the issue by the time it
// reaches Review. It is a pure `validate`-family member: it never mutates the
// body and returns `{ pass, failures }` where each failure names the missing
// comment by its human label.
//
// It consumes the `comments` array the gate threads through
// `buildReviewContext` (review-gate.mjs) — the raw
// `gh issue view --json comments` shape, i.e. `[{ body, ... }]`. A
// missing/non-array value is tolerated as "no comments present", which fails
// every required-comment row.
//
// #835/#923/#940 — kind- and diff-aware. Two rows (`Commits`, `New Automated
// Tests`) are report comments only some kinds/diffs produce. Each such row
// carries a `requiredFor(body, changedPaths)` predicate; the row is skipped when
// it returns false. The predicates are distinct, not a single `codeKindOnly`
// flag (#923):
//   - `Commits` applies to every commit-bearing kind — everything EXCEPT the
//     no-commit kinds (`epic`/`audit`/`spike`/`research`), whose deliverable is a
//     posted marker rather than a commit trail. So `!isNoCommitKind(body)`.
//   - `New Automated Tests` uses `natCommentRequired(body, changedPaths)` (#940):
//     the kind declares, the diff decides. A `docs-only` body skips this row only
//     when its `trunk...HEAD` diff is provably documentation-only; a `docs-only`
//     body whose diff touches code (or is empty/unclassifiable — default-deny)
//     still requires the NAT comment. Non-`docs-only` kinds fall back to the
//     prior kind-only `expectsAutomatedTests` behavior. This mirrors, at the
//     Review layer, the DoD/VC-layer `docsKindDropsTests` guarantee from #865.
// The kind is read from the issue `body`, and `changedPaths` is threaded from the
// review context (`buildReviewContext`), so no plumbing change is needed for
// other validators.

import { registry } from '../registry.mjs';
import { isNoCommitKind, natCommentRequired } from '../../issue-kind.mjs';
import {
  isCanonicalPlanApprovalAuditComment,
  readPlanApprovedTimestamp,
} from '../../plan-approval-audit.mjs';
import { readPlanApprovedMode } from '../../markers.mjs';

// One row per required report comment. `label` is the human name used in
// failures[]; `match(bodies)` returns true when at least one comment body
// satisfies the row's signal. Signals were chosen for low false-positive risk
// against live bodies (verified against #810's comment stream). A row with a
// `requiredFor(body)` predicate is skipped when the predicate returns false; a
// row without one applies to every kind (#923).
export const REQUIRED_COMMENTS = [
  {
    label: 'Timing Log',
    match: (bodies) => bodies.some((b) => /⏱\s*Timing Log/.test(b)),
  },
  {
    // Conjunctive: the refine-estimate comment must ALSO carry the
    // Plan-updated `Planned Estimate` block — exactly the spec's
    // "Refine Estimate (with a Planned Estimate)".
    label: 'Refine Estimate',
    match: (bodies) =>
      bodies.some((b) => /<!--\s*aitm-refined-estimate:/.test(b) && /Planned Estimate/i.test(b)),
  },
  {
    label: 'Full-Auto plan-approval audit',
    // #1109 — only an explicit human provenance can skip this attestation.
    // Full-Auto and legacy/malformed `unknown` markers remain default-deny.
    requiredFor: (body) => readPlanApprovedMode(body) !== 'human',
    match: (bodies, { issueNumber, body }) =>
      bodies.some((commentBody) =>
        isCanonicalPlanApprovalAuditComment(commentBody, {
          issueNumber,
          ts: readPlanApprovedTimestamp(body),
        })
      ),
  },
  {
    label: 'Commits',
    requiredFor: (body) => !isNoCommitKind(body),
    match: (bodies) => bodies.some((b) => /^#{1,6}\s*🔗\s*Commits\b/im.test(b)),
  },
  {
    // #944 + #940 — required when `natCommentRequired(body, changedPaths)` holds:
    // the kind expects tests (or is a `docs-only` body whose diff touches code),
    // AND the issue has not filed a valid, fail-closed `no-new-tests` declaration.
    // The #944 escape lets a code-kind fix that greens an already-committed test
    // skip the NAT comment it can never honestly produce; the #940 diff-awareness
    // stops a mislabelled `docs-only` code change from skipping it. Default-deny:
    // an empty/unclassifiable diff keeps the requirement.
    label: 'New Automated Tests',
    requiredFor: (body, changedPaths) => natCommentRequired(body, changedPaths),
    match: (bodies) => bodies.some((b) => /^#{1,6}\s*New Automated Tests\b/im.test(b)),
  },
];

// V2 validator. `context.comments` is the raw comment array; each element's
// `.body` is the comment markdown. `context.body` is the issue body, used to
// resolve the issue kind so a row whose `requiredFor(body, changedPaths)`
// predicate returns false is skipped (#835/#923). `context.changedPaths` is the
// `trunk...HEAD` changed-path set (#940), consulted by the diff-aware NAT row;
// a missing value normalizes to `[]` (default-deny).
export function validate({ comments, body, issueNumber, changedPaths } = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const bodies = list.map((c) => (c && typeof c.body === 'string' ? c.body : ''));
  const paths = Array.isArray(changedPaths) ? changedPaths : [];

  const failures = [];
  for (const row of REQUIRED_COMMENTS) {
    if (row.requiredFor && !row.requiredFor(body, paths)) continue;
    if (!row.match(bodies, { issueNumber, body })) {
      failures.push(`required comment '${row.label}' is missing`);
    }
  }

  return { pass: failures.length === 0, failures };
}

export const requiredCommentsValidator = {
  id: 'required-comments',
  describe: () => 'V2: five required report comments present on the issue',
  validate,
};

registry.register(requiredCommentsValidator);

export default requiredCommentsValidator;
