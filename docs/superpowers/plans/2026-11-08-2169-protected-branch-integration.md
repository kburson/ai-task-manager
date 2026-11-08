# #2169 Protected-Branch Integration Plan

> **For agentic workers:** Use executing-plans inline for this existing issue's delivery recovery.

**Goal:** Prepare #2169 for strict protected-branch delivery while preserving its accepted artifact and every prior outcome.

**Architecture:** Add pinned current trunk to the existing branch with an ordinary merge. Preserve source `7091f5db2f3b37468b179a7087c95d24da8ae62b` as an ancestor and retain immutable archive links. Renew verification for the resulting head. Prepare a new source-specific waiver for explicit user approval; the prior waiver cannot authorize the new head.

**Tech Stack:** Git, existing npm verification, AITM, GitHub Actions.

**Spec:** Existing #2169 Scope and `2026-11-06-2169-wbs-conversion-compatibility.md` at `37fda1a14a813046be4f10475f73017e46f558b2`.

## Constraints and budget

No new story, feature, guard or branch-rule change, force push, rebase or history deletion. Reuse the recorded worktree and branch. Preserve original 6h overrun disclosure, M/8h ceiling and Unknown timing. Latest native lower bound was 24,242.535 seconds at the successful waived Review; it is not a complete actual total.

Independent reviewer `/root/review_2169_closure_replan` accepted source-update preparation at 07:12 UTC on November 8, before the previous 07:15 cutoff. Preparation is limited to 45 minutes and **07:55 UTC or the observable 8h ceiling, whichever comes first**. Charging all elapsed time from the reported 06:51 lower bound through 07:55 yields approximately 7h48m, leaving about 12 minutes of observable margin. Stop earlier if remaining work no longer fits. Approval does not retroactively cure the original overrun.

Keep waiver revisions 1 and 2 intact. Preserve pending intent `01M6WYWPDW6YWYHKX68QD11W92`; do not reuse its provider action. The native delivery implementation was inspected: a different approved head creates a successor intent with `supersedesIntentId` pointing to the prior live intent.

## Evidence and review focus

GitHub refused the exact-head provider merge. One close/reopen diagnostic preserved source and generated eligible PR CI run `42456827745`: all 18 jobs passed. Its checkout log proves test merge `c13f1bbb2debb234e656ed446c7b17014f298368` combines approved source with trunk `431a4e1f4cf3e7826f2575f20ca7f4e796c42c8a`. GitHub still reports BEHIND under strict up-to-date protection. No provider retry occurred.

Review both ancestors, archive-byte preservation, unexpected conflict resolution, equality with the qualified product tree, exact-head authority, pending-intent preservation and the budget boundary. Existing tests and tree comparisons provide the relevant checks; this recovery adds no product behavior or synthetic tests.

## Task 1: Additive integration

- [ ] Use native demotion, genuine binding and fresh Explain before source work.
- [ ] Fetch and verify pinned trunk; stop for review on drift or conflicts.
- [ ] Merge trunk into `codex/2169-draft` without rewriting history. Include this plan in an attributed `[#2169]` commit; preserve tracked and ignored evidence.
- [ ] Verify original source and trunk are ancestors. Compare all product paths with the qualified merge candidate; only explicit recovery documentation may differ.

## Task 2: Qualify the new head

- [ ] Obtain independent final source review of the integration and retained archive.
- [ ] Record the review in Git, push the existing branch normally, and require complete exact-head CI.
- [ ] Renew the six existing focused AC verifiers and native Test. Require clean final HEAD, unchanged substantive ACs and verifier declarations, and matching receipts. Stop on new implementation needs or budget drift.

## Task 3: Prepare the remaining authorization

- [ ] Prepare a concrete new-head Review-waiver request limited to the same semantic requirement and historical-gap rationale. Do not apply the old approval to the new head.
- [ ] Request explicit source-specific authorization after qualification; pause #2169 while awaiting the decision. Other issues retain their own dependency gates.
- [ ] After approval, reassess remaining budget before ordinary Review, separate final approval, fresh Deliver reconciliation, provider action and native Close verification.

## Independent planning review

PASS for preparation only, not merge or closure: preserve both ancestors and archives, verify the product tree, retain the pending intent, obtain exact-new-head evidence and fresh user approval. This is an independent recovery-plan review, not formal APR acceptance. The earlier reviewed runtime-selection and verification-metadata rebinding recoveries remain historical; neither widens the old waiver to a changed head.
