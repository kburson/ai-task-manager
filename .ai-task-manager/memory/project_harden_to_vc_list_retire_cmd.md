---
name: project_harden_to_vc_list_retire_cmd
description: 'Strategic direction (2026-07-13) — harden harness to vc-list-only, retire legacy cmd= citation forms; solo user, 3 test projects, central backlog heal.'
metadata:
  node_type: memory
  type: project
  originSessionId: afadefe0-cb5c-4159-ae69-a56fdd266e1f
  modified: 2026-07-22T02:21:14.575Z
---

Direction set 2026-07-13: **harden the harness to support only the latest AC-citation shape (`vc-list="vc:N"`) and retire the legacy `cmd=`-based forms.** Emerged right after fixing [[reference_vc_list_cmd_consumer_parity]] (#803): three consumers (`code-complete-gate`, `ac-evidence`, `auto-tick-verified`) had to be taught `vc-list`; the lag is the smell that motivates removing the second form entirely.

Constraints that make this safe to do aggressively:

- **No external users/customers.** The user is the sole operator, dogfooding across **3 separate test projects**.
- Existing backlogs in those projects can be **healed centrally from this repo** once the models are hardened (batch-convert `cmd=` bodies → `vc-list=`).

**Why:** eliminate the dual-form maintenance burden — every new consumer currently has to remember to handle both `vc-list` and `cmd`, and auto-tick already fell behind once. One canonical shape = fewer silent gaps.

**Scope RESOLVED 2026-07-13 (user, option 1a):** "retire cmd=" covers **ONLY the AC-citation `cmd="vc:N"` form**. The DoD-Functional literal-declaration `cmd="\`npm run test:all\`"` form STAYS — it is a verifier declaration, a different role, out of scope. Enforcement: fail-closed at the refine/plan authoring gates + a central heal pass for existing bodies afterward.

**Status: #804 CLOSED 2026-07-21 (trunk 3bf3bea, full-auto, code story NOT epic).** Delivered as a standalone hardening story with 4 ACs: AC1 Refine→Plan gate rejects ordinal `cmd="vc:N"`; AC2 consumers drop the ordinal fallback (`resolveCitedOrLiteralCommands` = backtick-literal only, second param renamed `_vcItems`); AC3 `resolveVcListStrict` + `extractCommands` THROW on missing/empty/dangling `vc-list` at both authoring gate and resolution (the user's "no silent false green light" requirement); AC4 DoD-Functional literal backtick `cmd` declarations untouched. Central heal sweep of the 3 test-project backlogs is carved out to **#929 (parked in Backlog — do NOT work)**. Was authored with the pre-#810 body layout; had to restructure in-Review (add `## Plan Metadata`, move Deep-Dive before ACs, migrate legacy single-checkbox Lifecycle DoD to the 4-item canonical block) to pass the Agent Review Gate — see [[feedback_deep_dive_placement]] and [[reference_agent_review_gate_legacy_close]].

**How to apply:** treat this as an epic, not a one-shot edit. Sequence: harden models/gates here (fail-closed on `cmd="vc:N"` at refine/plan) → then heal the 3 projects' backlogs (batch-convert `cmd="vc:N"` → `vc-list="vc:N"`).

**Home = #804** ("Harden AC-citation model to vc-list only, retire legacy cmd= citation"), CLOSED 2026-07-21 as a code story (no children). Scope in its body is RESOLVED to option 1a (AC-citation `cmd="vc:N"` only; DoD literal `cmd="\`...\`"` stays, separately tracked in #903).

**ROOT CAUSE FIXED — #928 SHIPPED 2026-07-21 (trunk c3abbe5 + 7dd94b6, CLOSED, full-auto).** The producer/gate mismatch is closed: `buildMarker` in `lib/evidence-markers.mjs` now branches on `parseVcRefIndexes(cmd)` — a pure `vc:N` run serializes to `vc-list="vc:N"` (canonical), any literal command still serializes to `cmd=` (DoD-literal compat path untouched). Regression guard = `lib/evidence-markers-emit.test.mjs` (4 tests: vc-list-not-cmd for AC citations, gate-passing output, literal-keeps-cmd, DoD-literal untouched). Stale emitter-output assertions across the suite were migrated to `vc-list=` (`vc-authoring.test.mjs`, `evidence-marker-backfill.test.mjs`, `writer-consolidated-declaration.test.mjs`). This was the "stop the bleeding" child of epic #804.

**Gate half (already shipped before #928):** `findAcsWithLegacyVerificationForm` in `lib/body-invariants.mjs` rejects AC `cmd="vc:N"` with reason `ordinal-cmd-citation` at Refine→Plan (#773/#774), re-checked at Review by V5 `agent-review/validators/ac-dod-vc-attributes.mjs` (#814).

**Remaining (parked as #929):** central heal sweep of the 3 test-project backlogs (batch-convert legacy `cmd="vc:N"` bodies → `vc-list="vc:N"`). #804 removed the ordinal-citation consumer fallback (AC2) and closed the emitter bleed (#928); what's left is purely the cross-repo legacy-body heal. The by-id `vc-list` reader (`resolveVcRefCommands`) and the backtick-literal DoD path both remain — those are the canonical/kept forms, not compat to retire.
