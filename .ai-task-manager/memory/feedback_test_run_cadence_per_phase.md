---
name: feedback_test_run_cadence_per_phase
description: 'Per-phase test-execution contract — Develop runs only new tests, Test runs the full suite ONCE in isolation, Review re-runs it in cloud CI; expected totals new=3x all=2x'
metadata:
  node_type: memory
  type: feedback
  originSessionId: d79eb795-3713-486d-bd2c-0e0ccb26c620
---

The intended test-execution cadence across the `/task` phases (user-stated design, 2026-07-08):

- **Develop** — run ONLY the individual **new/changed** tests (`node --test <file>`, i.e. `verify-develop.mjs`) to confirm each passes and mark its AC. **Never** `npm run test:all` in Develop.
- **Test** — Develop→Test transitions once all ACs are marked verified. Run the **full suite exactly ONCE** in a fresh isolated worktree at HEAD of the branch. This proves everything needed is actually committed and runnable in CI's environment. It **should** call the CI test script (so cloud-only failures surface here, not during PR validation). Only after this passes are DoD items checked off.
- **Review** — with worktree+PR flow, GitHub cloud CI re-runs the full suite on the PR before merge to the branch's parent (feature branch or trunk). Fires when the PR is approved/pushed.

**Expected run totals:** new tests **3×** (Develop individual → Test suite → cloud CI); all tests **2×** (local isolated Test → cloud Review).

**Why:** each run has a distinct job. Develop = fast per-AC feedback. Test = "is it actually checked in and CI-runnable" in isolation. Review/cloud = the real merge gate. Running `test:all` multiple times _within_ one phase (my #739 mistake — 2–3× inside Test) is pure waste, not extra safety.

**How to apply:**

- In Test, one isolated full-suite run is the target. Do NOT run `dod-stamp tests` AND a separate `test` sandbox re-verify — the in-place `test` re-verify already both stamps sandbox proof AND ticks Functional DoD via `autoTickVerified` in a single run. See [[feedback_test_stage_write_code_gate]].
- Tick boxes with the `ensureChecked`/`ensureUnchecked` verbs (idempotent, guarded), not hand-rolled `mutateIssueBody` string-replace.
- Current impl gap: Test sandbox runs `npm run test:all` (= `run-tests.mjs --lane all`); CI (`ci.yml`) runs fast lane (`npm test`) + slow lane (`npm run test:slow`) separately. Same union of tests, but no single shared CI script — equivalence is by-convention. Related: [[feedback_aggregate_test_execution_pattern]].
