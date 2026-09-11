# #1579 governed plan policy implementation plan

## Goal

Prevent Plan approval from ratifying executable issue-body bypasses or disposable scratch-path drift while preserving the repository's established two-bucket ownership model and historical plan archives.

## Steps

1. Add `scripts/tests/unit/task-tracker/core/governed-plan-policy.test.mjs` with RED cases for direct issue-body replacement, executable internal-mutator calls, one-off scratch mutator commands, `.tmp/` runtime-bucket drift for operator GitHub/plan artifacts, unreadable linked plans, and a no-linked-plan compatibility case.
2. Add `scripts/task-tracker/lib/governed-plan-policy.mjs` to resolve the active Plan Metadata reference, validate only that plan's bytes, and return stable rule IDs with one-based line diagnostics. Accept `npx aitm issue-body #N --operation-file .scratch/gh/N-body-operation.json` and runtime/generated `.tmp/aitm/` paths.
3. Wire the validator into `scripts/task-tracker/verbs/plan-approve.mjs` before any approval authority write. Add a stable refusal outcome and command-catalog exit meaning; extend the Plan-approval verb test to prove zero marker, audit, or directory writes on refusal.
4. Reconcile `CLAUDE.md`, README, shared preferences/scratch/issue-record/review rules, the deep-dive procedure, and affected guides so disposable operator files use `.scratch/gh/` while machine runtime and generated output remain under `.tmp/`.
5. Extend `scripts/tests/unit/task-tracker/lib/scratch-contract-docs.test.mjs` to pin runtime helpers, configured defaults, command help, shared rules, and every updated guide to the two-bucket contract.
6. Run `node --test scripts/tests/unit/task-tracker/core/governed-plan-policy.test.mjs`, the affected Plan-approval and scratch-contract tests, and `node scripts/task-tracker/verify-develop.mjs`; commit with #1579 attribution.
7. Run `npx aitm commit-trace 1579`, acceptance and Functional DoD stamping, isolated `npx aitm test 1579`, Review, Full-Auto approval, exact-head hosted CI, governed provider delivery, and closure.

## Invariants

- Validation is limited to the active linked plan; historical plan files are neither scanned nor rewritten.
- A linked path that is unreadable or escapes the repository fails closed.
- No approval marker, directory seal, or Full-Auto audit is written after a policy refusal.
- The public issue-body operation verb remains the only plan-authored live body mutation path.
- `.scratch/` remains disposable and must never become runtime authority; `.tmp/` remains runtime/generated output and must not become operator scratch.
- Existing no-linked-plan approval flows remain compatible.
- Verification evidence is produced only by the declared AITM Test and review lifecycle.
