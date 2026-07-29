---
name: reference-heal-vc-refs-stamped-ac-refusal
description: "heal-vc-refs can't convert already-stamped (post-Develop) ACs; mutate guard blocks re-introducing proof markers — expected, legacy form is supported forever"
metadata:
  node_type: memory
  type: reference
  originSessionId: 9e3c44a5-5a3b-4f6c-8f14-ac384558d7d7
---

`heal-vc-refs.mjs --apply` converts legacy embedded-command AC citations (`cmd="\`node --test …\`"`) to `vc:<n>`citations. It **cannot heal an AC that is already stamped with real evidence** (an`aitm-verified`marker carrying`exit`/`sha`/`ts`/`key`): the rewrite carries the proof fields onto the new line, and `mutateIssueBody`'s honesty guard refuses because a plain body-write may not INTRODUCE an execution-proof marker (only `ac-stamp`/`dod-stamp`/close/sandbox-auto-stamp may, via `evidenceStamp: true`).

**This is expected, not a defect.** Healing targets pre-stamp ACs (Refine/Plan-authored, not yet Develop-stamped). Once an AC is stamped from a real run its citation format is frozen. The **legacy embedded form remains fully supported forever** by the #721 read-side (#762's AC5 proves legacy embedded still reads, gates, and ticks unchanged), so an unhealed Review/Test-stage issue is correct as-is.

Practical consequence: when healing "all Refine-or-later issues," expect Develop/Test/Review-stage issues whose ACs are already stamped to REFUSE with "N newly-introduced execution-proof marker(s)". Do NOT force with an evidence bypass (that's fabrication territory) — leave them on the legacy form. Only Refine/Plan-stage (un-stamped) ACs actually convert. Observed 2026-07-09: #755 (review, stamped) refused; #727 (develop, unstamped) + #752 (refine) healed clean.

Related: [[feedback_never_fabricate_evidence]], [[feedback_route_issue_bodies_through_scripts]].
