# #1583 Secondary Squash Recovery Implementation Plan

**Goal:** Recover exact delivery receipts for authorized secondary issues in externally merged GitHub-default multi-source squash commits without weakening attribution.

**Architecture:** Add focused pure-verifier and verb-boundary regressions, then make the smallest possible change to `provesDefaultSquashBodyAttribution`. Preserve the upstream delivery proof pipeline and every canonical attribution path.

**Tech stack:** Node.js ECMAScript modules, built-in `node:test`, AITM governed lifecycle commands, GitHub pull-request evidence.

## Constraints

- Modify production behavior only in `scripts/task-tracker/lib/delivery-verification.mjs`.
- Do not change canonical trailers, provider actions, merge inference, source inventory, accepted-head verification, tree proof, trunk proof, incident records, or issue lineage.
- Do not synthesize the current target into `intent.attributionTokens`.
- Use the recorded `codex/defect-1583-secondary-squash-recovery` worktree and preserve unrelated work.
- Implement test-first and prove every negative verb path writes zero records.

## Task 1: Add the secondary-target RED cases

**Files:**

- Modify `scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs`.
- Modify `scripts/tests/unit/task-tracker/verbs/deliver-default-squash-recovery.test.mjs`.

1. Add a pure-verifier fixture where `issueNumber` is secondary, the title leads with another authorized token, and the complete observed set is exact.
2. Add a pure-verifier negative case where the target is absent from `attributionTokens`.
3. Add a verb-boundary success case for a secondary target and assert exactly one external intent followed by one receipt.
4. Add a verb-boundary unauthorized-leading negative case and assert zero writes.
5. Run:

   ```bash
   node --test scripts/tests/unit/task-tracker/lib/delivery-default-squash-attribution.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-default-squash-recovery.test.mjs
   ```

   Expected: the new secondary success cases fail with `delivery-verification:attribution`; existing tests and the new negative boundaries pass.

## Task 2: Implement the minimal predicate change

**File:** Modify `scripts/task-tracker/lib/delivery-verification.mjs`.

1. Parse the leading bracket token as today.
2. Build `expected` solely from `intent.attributionTokens`.
3. Refuse unless `expected` contains both `#${intent.issueNumber}` and the parsed leading token.
4. Preserve exact observed/expected size and membership equality.
5. Rerun the focused command and require all cases to pass.

## Task 3: Verify, commit, and enter Test

1. Run `node scripts/task-tracker/verify-develop.mjs --mode iteration`.
2. Inspect `git diff --check`, `git diff`, and `git status --short`.
3. Commit with `[#1583]` attribution and record the commit trace.
4. Run all eight issue verification commands at the committed SHA.
5. Stamp each acceptance criterion and functional DoD item only from its declared evidence.
6. Run `npx aitm test 1583` and verify the exact Test receipt.

## Task 4: Review and deliver

1. Run the governed task review at the exact Test SHA and resolve all findings before approval.
2. Record Full-Auto final approval with `npx aitm approve 1583`.
3. Push the branch, create the pull request, and wait for required hosted checks on the exact head.
4. Run `npx aitm deliver 1583`; execute only its emitted authorized provider action.
5. Verify the merge commit, receipt, trunk reachability, and issue state, then close #1583 through `npx aitm close 1583`.
6. Return to #1580 and retry the original recovery path without rewriting accepted evidence or lineage.
