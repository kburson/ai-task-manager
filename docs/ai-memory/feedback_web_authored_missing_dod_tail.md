---
name: feedback_web_authored_missing_dod_tail
description: "Web-authored issues lack the preflight DoD tail; close blocks on passed-final-review — backfill the Lifecycle subsection only, then approve+close."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 562cb9c7-6ca4-40cb-8bf0-9d1e2e7e14e4
---

GitHub web-UI-authored issues never run through `preflight-issue.mjs`, so they
lack the `## Definition of Done` tail entirely — including the `### Lifecycle`
section whose `passed-final-review` checkbox `/task close` enforces pre-close
(`close-gate.mjs`: only `passed-final-review` blocks). Symptom: `close` refuses
with `lifecycle-incomplete: passed-final-review`, and `/task approve` no-ops
because `tickLifecycleItem` can only tick a label that exists.

**Why:** `assertLifecycleSatisfied` requires the label present-and-ticked (or a
`<!-- aitm-lifecycle-optout: <key> -->` for a genuine skip). The Functional DoD
items are NOT enforced pre-close, so don't backfill them — they'd add new
blockers.

**How to apply:** backfill ONLY the `### Lifecycle` subsection (3 items:
`Passed final human review`, `Story closed and moved to Done`, `Timing data
flushed to issue`) via `mutateIssueBody`, inserted before the Pickup Directive
heading. Then run `/task approve` (writes the real `aitm-review-approved`
marker + ticks the box), then `/task close`. Canonical labels live in
`lib/lifecycle-dod.mjs` `LIFECYCLE_LABELS`. Use optout only when review was
genuinely skipped — not when a human actually approved.

Note: invoking `approve` non-interactively (piped stdin, reviewer field unset)
makes `detectFullAuto` stamp `full-auto="yes"` even for a real human approval —
post an audit-correction comment to keep the record honest. See
[[feedback_full_auto_review_audit]] and [[feedback_route_issue_bodies_through_scripts]].
