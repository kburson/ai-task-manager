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
// #835/#923 — kind-aware. Two rows (`Commits`, `New Automated Tests`) are report
// comments only some kinds produce. Each such row carries a `requiredFor(body)`
// predicate; the row is skipped when it returns false. The predicates are
// distinct, not a single `codeKindOnly` flag (#923):
//   - `Commits` applies to every commit-bearing kind — everything EXCEPT the
//     no-commit kinds (`epic`/`audit`/`spike`/`research`), whose deliverable is a
//     posted marker rather than a commit trail. So `!isNoCommitKind(body)`.
//   - `New Automated Tests` applies only when the kind is expected to ship tests —
//     `expectsAutomatedTests(body)`. Commit-bearing-but-testless `docs-only` keeps
//     the `Commits` row but skips this one, so a docs issue is not forced to
//     fabricate a NAT comment it can never honestly produce.
// The kind is read from the issue `body` the same context threads to V1
// (`body-sections`), so no plumbing change is needed for other validators.

import { registry } from '../registry.mjs';
import { isNoCommitKind, expectsAutomatedTests } from '../../issue-kind.mjs';

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
    match: (bodies) => bodies.some((b) => /Full-Auto Plan-Approval Audit/i.test(b)),
  },
  {
    label: 'Commits',
    requiredFor: (body) => !isNoCommitKind(body),
    match: (bodies) => bodies.some((b) => /^#{1,6}\s*🔗\s*Commits\b/im.test(b)),
  },
  {
    label: 'New Automated Tests',
    requiredFor: (body) => expectsAutomatedTests(body),
    match: (bodies) => bodies.some((b) => /^#{1,6}\s*New Automated Tests\b/im.test(b)),
  },
];

// V2 validator. `context.comments` is the raw comment array; each element's
// `.body` is the comment markdown. `context.body` is the issue body, used to
// resolve the issue kind so a row whose `requiredFor(body)` predicate returns
// false is skipped (#835/#923).
export function validate({ comments, body } = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const bodies = list.map((c) => (c && typeof c.body === 'string' ? c.body : ''));

  const failures = [];
  for (const row of REQUIRED_COMMENTS) {
    if (row.requiredFor && !row.requiredFor(body)) continue;
    if (!row.match(bodies)) {
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
