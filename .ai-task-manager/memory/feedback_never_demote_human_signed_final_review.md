---
name: feedback-never-demote-human-signed-final-review
description: 'Superseded: a visible Final Review tick is historical intent, not current Review authority; demotion and failure invalidate it'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7eb34043-996a-4344-b692-4f66fef0559a
  modified: 2026-07-23T01:05:50.548Z
---

> **Superseded active guidance (#1050).** This note records a historical incident
> but must not be used to authorize close.

On #908 (2026-07-22/23), a human-ticked `Final Review Passed` box was genuine
approval intent for that Review visit. The operator then demoted unnecessarily
after misreading the box, causing avoidable rework. That history remains useful:
do not demote merely because a genuine manual tick lacks an `aitm-verified`
marker.

Current policy is stricter. A visible tick is a projection, not standalone
authority. Close requires the persisted Test SHA, a passing Agent Review proof
in the latest Review epoch for that SHA, a matching truthful
`aitm-review-approved` marker, and no later invalidation. Demotion,
demotion-shaped reconciliation, and Agent Review failure invalidate that
authority even if `Final Review Passed` remains ticked.

If the human approves in chat, record it with `/task approve #N --human` after
the current passing proof exists. A genuine GitHub UI tick may establish human
intent for `/task approve`, but never bypasses the epoch/SHA proof join. If
authority was invalidated, re-run Test, Review, and approval; do not preserve or
restore the tick as a substitute.

Full-Auto uses the consolidated `aitm-review-approved` marker with
`provenance="full-auto"` and signals, not a standalone
`aitm-full-auto-approved` marker. Related:
[[reference_demote_stale_evidence_reverify_recipe]],
[[project_epic_912_state]].
