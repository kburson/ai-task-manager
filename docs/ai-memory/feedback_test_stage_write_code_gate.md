---
name: feedback-test-stage-write-code-gate
description: "Test-stage activity-policy blocks Edit/Write to source files (WRITE_CODE refused) — demote to develop, fix, verify-develop, commit, re-promote"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7dfc179a-dd63-409b-8a8a-4801e182a4bb
---

While an issue is in the `test` kanban state, the activity-policy guard only permits `RUN_TESTS, RUN_BUILD, WRITE_ISSUE, READ_*`. Any `Edit`/`Write` to source/test files is refused: `activity refused: WRITE_CODE ... is not permitted in state test ... To proceed: /task demote → develop`. Shell `>` redirects are also refused as `WRITE_OTHER` in `test` state (same as `plan`/`develop`) — use the Read tool on output files or pipe through read-only tools instead.

If `npm run test:all` at Test stage surfaces a genuine defect requiring a code fix (not just re-running an existing verifier), the correct remediation loop is: `node bin/aitm.mjs demote <N>` (Test→Develop) → make the fix with Edit/Write (now permitted) → re-verify via `node scripts/task-tracker/verify-develop.mjs` (never `test:all` while in `develop` — see [[project_worktree_seed_sync_todo]] and the Develop-Phase Verification Contract in CLAUDE.md) → commit → `node bin/aitm.mjs promote <N>` (Develop→Test again) → re-run full regression.

**Why:** Directly hit and resolved this window driving #670: Test-stage `test:all` found a real regression (#670's own extraction of reconciliation logic into a pure module broke a stale snapshot-style test's literal-text assertions in `beta-report-templates-497.test.mjs`). A direct `Edit` attempt on the stale test file was refused by the state gate before the demote/fix/repromote cycle was discovered as the sanctioned path.

**How to apply:** Whenever Test-stage verification finds a real defect (not a flake), demote first — don't fight the gate by trying to force an edit, and don't skip straight to closing/ignoring the failure.
