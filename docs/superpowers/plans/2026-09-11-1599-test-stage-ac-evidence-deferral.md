# #1599 Test-stage AC evidence deferral implementation plan

## Goal

Allow the Develop-to-Test boundary to defer only acceptance criteria whose declared verifier set includes a command that policy restricts to Test, while preserving all existing evidence and code-complete safeguards.

## Steps

1. Add `scripts/tests/unit/task-tracker/lib/test-stage-ac-defer.test.mjs` with RED cases for the #1592 restricted-command deadlock, ordinary unchecked AC refusal, dangling citation refusal, and green-only Test auto-tick fan-in.
2. Update `scripts/task-tracker/lib/code-complete-gate.mjs` to parse the root Verification Commands once, resolve each unchecked AC's declaration with the shared extractor, and skip only the unticked blocker when at least one resolved command is Test-restricted.
3. Run the new focused test and `scripts/tests/unit/task-tracker/verbs/dod-stamp-state-gate.test.mjs` to prove the boundary and the pre-Test restriction together.
4. Run AITM acceptance stamping, exact-SHA Test, Review, Full-Auto approval, hosted CI, governed delivery, and close.

## Invariants

- Deferral is not execution evidence and never checks an AC.
- Missing, malformed, or dangling declarations remain blocking.
- Targeted-only unchecked ACs remain blocking.
- Slow and full-suite commands remain prohibited through `ac-stamp` in Develop.
- Test auto-tick still requires every resolved command to pass.
- Commit-trail and dirty-worktree gates are unchanged.
