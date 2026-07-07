---
name: Full-Auto must also tick "Passed final human review" checkbox [SUPERSEDED by #302]
description: SUPERSEDED — `/task approve` now ticks the Lifecycle box itself. Manual tick is no longer required. Audit comment is still required.
type: feedback
originSessionId: ab7187c6-1bbe-4a2e-83e6-8b79c7be0087
---
**SUPERSEDED (#302, 2026-06-05).** `scripts/task-tracker/verbs/approve.mjs` already calls `tickLifecycleItem(updated, 'passed-final-review')` inside its authoritative body-write closure. The manual pre-tick step described below is redundant and previously caused a false-positive `lifecycle-tick-noop` warning on every Full-Auto approval (fixed in #302 via the new `lifecycleItemState` accessor). See `docs/architecture/lifecycle-dod.md` for the current contract.

The audit-comment requirement (`feedback_full_auto_review_audit.md`) is unchanged and still applies.

--- ORIGINAL RULE (no longer applicable) ---

When running with `TT_FULL_AUTO=1` / no human reviewer, the "Full-Auto mode enabled: human review skipped" audit comment is necessary but **not sufficient**. The Lifecycle DoD checkbox `- [ ] Passed final human review` must also be flipped to `- [x]` before close, so the issue body reflects the same fact the audit comment documents.

**Why:** The audit comment lives in the comment stream; the checkbox lives in the body. Closing with the box still unchecked leaves the body inconsistent with the audit record and forces the human (user) to manually correct it post-hoc — which has happened more than once.

**How to apply:** In any Full-Auto close path, before `/task close`:
1. Post the auto-approval audit comment (existing behavior).
2. `node scripts/task-tracker/task-tracker.mjs check 'Passed final human review'` — tick the box.
3. Then close.

Applies to both sub-issues and epics. Same rule for "Story closed and moved to Done" and "Timing data flushed to issue" if they're left unchecked at close — Full-Auto should drive all Lifecycle boxes to true, not just the gating ones.
