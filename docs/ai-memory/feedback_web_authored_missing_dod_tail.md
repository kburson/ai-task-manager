---
name: feedback_web_authored_missing_dod_tail
description: 'Superseded repair: heal the canonical Lifecycle block, then establish current epoch/SHA-bound Review authority before close.'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 562cb9c7-6ca4-40cb-8bf0-9d1e2e7e14e4
---

> **Superseded active guidance (#1050).** The body-shape diagnosis remains
> historical context; the old "backfill, approve, close" shortcut is not current
> authority.

GitHub web-UI-authored issues may bypass `preflight-issue.mjs` and lack the
`## Definition of Done` tail, including the canonical `### Lifecycle
(auto-ticked at Review/Close)` subsection. The old symptom was
`lifecycle-incomplete: passed-final-review`, while `/task approve` could not
tick a label that did not exist.

**Why:** `assertLifecycleSatisfied` requires the label present-and-ticked (or a
`<!-- aitm-lifecycle-optout: <key> -->` for a genuine skip). The Functional DoD
items are NOT enforced pre-close, so don't backfill them — they'd add new
blockers.

**Current repair:** use the sanctioned lifecycle-heal/body-mutation path to add
the canonical four-item subsection: `Agent Review Passed`,
`Final Review Passed`, `Story closed and moved to Done`, and
`Timing data flushed to issue`. Canonical labels live in
`lib/lifecycle-dod.mjs` `LIFECYCLE_LABELS`.

Healing labels does not authorize close. Re-run Test to persist the verified
SHA, re-run Review to create a current-epoch passing Agent Review proof for
that SHA, then record truthful approval. If approval came from chat, use
`/task approve #N --human`. Full-Auto records provenance and signals on the
consolidated `aitm-review-approved` marker, never on the retired standalone
`aitm-full-auto-approved` marker. A later demotion, demotion-shaped reconcile,
or Agent Review failure invalidates the authority and requires that sequence
again.

Use lifecycle opt-out only for an intentionally absent lifecycle label; it is
not a substitute for current Review authority. See
[[feedback_full_auto_review_audit]] and
[[feedback_route_issue_bodies_through_scripts]].
