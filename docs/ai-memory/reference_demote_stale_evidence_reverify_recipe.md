---
name: reference_demote_stale_evidence_reverify_recipe
description: "demote leaves stale AC/VC/DoD green (bug #932); manual uncheck-then-reverify + strip-derived recipe to honestly re-verify against the current commit"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 7eb34043-996a-4344-b692-4f66fef0559a
  modified: 2026-07-22T13:49:45.889Z
---

`demote` moves a task backward but does NOT invalidate downstream AC/VC/DoD
evidence — stale green survives a code change, and the forward re-drive skips
already-stamped items, so `promote test→review` completes in seconds citing the
PRE-demote sha. Root causes (all confirmed in source):

- `verbs/demote.mjs` has zero evidence handling (grep uncheck/invalidat/strip → nothing).
- `lib/auto-tick-verified.mjs` `UNCHECKED_RE` only matches `[ ]` boxes, so an
  already-`[x]` item with a marker is never refreshed.
- `lib/functional-dod-derive.mjs:20` — DERIVED keys (`acs`, `checkboxes`) skip
  re-stamp if a marker is already present, so a re-tick keeps the stale sha/ts
  through review AND close.

Tracked as bug **#932** (demote must strip evidence for the demoted span). Until
fixed, honest manual re-verify recipe (proven live on #908, 2026-07-22):

1. **Uncheck** the command-backed boxes (AC + Verification Commands + Functional
   `tests`/`lint`/`commits`), PRESERVING their markers — flip only `[x]`→`[ ]`.
   The `vc-list`/`cmd` linkage stays so re-verify re-stamps in place.
   (`.tmp/inspect/uncheck-908.mjs` — section-scoped via `mutateIssueBody`.)
2. **In-place re-verify**: `TT_FULL_AUTO=1 npx aitm test <N>` while parked in
   Test (#444 re-verify; board unchanged). Re-ticks the unchecked boxes with
   fresh `sandbox`/today evidence + refreshes `aitm-dod-verified` to current HEAD.
   The sandbox's #343 auto-un-tick ALSO clears Lifecycle items ticked before
   their trigger (e.g. "Agent Review Passed") and the derived acs/checkboxes.
3. **Strip** the two DERIVED markers (`dod:functional:acs`, `:checkboxes`):
   uncheck + remove ONLY the `aitm-verified` proof comment, keep the structural
   `dod:functional:*` key. Then `close` re-derives + stamps fresh (close.mjs:481
   passes a fresh `git rev-parse --short HEAD` + `nowIso()`).
   (`.tmp/inspect/strip-derived-908.mjs`.)
4. `/task promote` test→review → agent-review gate re-runs, re-earning
   "Agent Review Passed" with a fresh gate marker.

All ops route through `mutateIssueBody`; unticking + marker-removal is
invariant-safe (never trips MarkerLossError / ticked-without-proof / fabricated-
proof). The derived `aitm-verified` proof marker is NOT in the protected set.
See [[feedback_never_fabricate_evidence]], [[feedback_promote_not_action_verb]].
