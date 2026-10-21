### Delivery receipt gap — closed without a `deliver` receipt

This issue is being closed without a governed `npx aitm deliver` receipt. Recording
why, so the audit trail explains the gap rather than leaving it silent.

**What happened.** `resolveAcceptedDeliveryAuthority` selects the pull request whose
`headRefOid` equals the accepted SHA — the SHA carried by the Test and review
receipts. This issue's accepted SHA was `e9fec6f7dbeadd82d495ddf7873b252044c77ec6`.
After review approval, trunk was merged into the branch to pick up #1485, advancing
PR #1489's head to `82eba885bac295a57c236c611c84e0fd6f69d7e3`. No pull request then
matched the accepted SHA, so `deliver` refused with `delivery-preflight:pull-request-count`.
Because PR #1489 is already merged, its head cannot be moved back, and the
current-head delivery path is permanently closed for this issue.

**Why closing is still correct.** The deliverable is on trunk and is byte-identical
to what was verified:

- PR #1489 merged at 2026-09-02T18:47:28Z as squash commit `3a044ea8411a9f0e34f54c33f412749cb735c457`.
- `origin/trunk` carries the `[#1488]` attribution token, which is the repository's
  message-based attribution contract.
- Every file changed by this issue was diffed between the approved SHA `e9fec6f7`
  and `origin/trunk` and is identical: `scripts/task-tracker/verbs/start.mjs`,
  `scripts/task-tracker/verbs/resume.mjs`,
  `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs`, and
  `scripts/tests/fixtures/state-engine-policy-baseline.mjs`.
- The intervening commit `82eba885` is solely the trunk merge carrying #1485; it
  introduced no changes of its own.

**Verification standing behind the close.** At `e9fec6f7`: focused verifier 22/22,
full Unit, Integration, and Slow lanes green in the governed Test sandbox, `npm test`,
`npm run test:slow`, `npm run lint`, and `npm run format:check` all exit 0, and all
four Acceptance Criteria stamped from genuine exit-0 runs. The repair was additionally
confirmed end to end after the fix: `npx aitm start` on a Review-state issue left
`entryStartTs` set instead of null, and `deliver` advanced past the `timer-not-running`
gate that motivated this issue.

**Correction to the record on #1485.** #1485 was annotated `BLOCKED` by this issue.
That annotation overstated the relationship. #1485 had no code dependency here — it
passed CI and merged independently. This defect blocked only the automated
`aitm deliver` path from the Review column, not #1485's correctness or its ability to
land. The block was a workflow blocker, not a dependency, and should have been scoped
that way when it was applied.

**Generalizable lesson.** Merging trunk into a branch after review approval
invalidates the delivery receipt path, because the accepted SHA is pinned by the Test
and review receipts while the pull-request head moves. Sync before approval, not after,
or expect to re-run Test and review at the new head.

No evidence marker was fabricated and no refusal was bypassed to reach this close.
