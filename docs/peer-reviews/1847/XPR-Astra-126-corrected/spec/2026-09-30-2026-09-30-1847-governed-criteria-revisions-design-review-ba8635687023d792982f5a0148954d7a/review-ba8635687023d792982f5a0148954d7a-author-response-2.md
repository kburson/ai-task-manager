<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ba8635687023d792982f5a0148954d7a"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md"
artifact_commit: "042ed2d8fb002feeda3771a85761ab5d27dcb8b7"
artifact_blob: "b59ceeb96c1248d6ae3157546b3bfaabbb502ac9"
artifact_digest: "sha256:d00af99b2b2cdc1c67bb19b2010afdbd4236d5b35154a382564d0c7d59eb573f"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
  identity_source: "runtime"
started_at: "2026-09-30T08:22:26.323Z"
submitted_at: "2026-09-30T08:36:42.490Z"
finding_ids: []
answered_finding_ids: ["R2-F001"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed the remaining material finding with a common-directory local admission
projection. The complete remote chain remains authoritative at bind and gates.

## Finding dispositions

### R2-F001 — Addressed

Specified a shared local per-issue projection for Develop activity hooks,
including schema/domain/issue bindings, observed generation, revision/source/
approval bindings, explicit never-revised state, and allow/deny admission.
Missing, corrupt, mismatched, or dirty state denies.

Domain enablement, bind/rebind and authoritative gates derive it under the strict
interlock from complete remote authority. Never-revised admission requires an
actually verified empty chain; pointer absence is insufficient. Hooks read the
atomic current entry on every invocation with no cross-invocation allow cache.

Every relevant governed writer publishes deny before its first remote effect,
including source/approval/stage/authority writers and reconciliation. Only
verified current authority after read-back can restore allow. The strict
interlock prevents a competing bind from overwriting deny with stale authority.
Crash and failed refresh preserve denial; restart requires refresh. The
cooperative single-domain trust limit remains explicit. Lifecycle gates never
treat local admission as remote proof.

Added the requested A/B linked-worktree interleaving and missing/corrupt/
never-revised/restart/crash verification cases. This selects local projection
rather than network-per-tool-call behavior and specifies its costs in scope.

## Changes made

Also bounded authorization session/message IDs to 256 ASCII bytes with exact
concrete provenance/event budgeting during preparation. Clarified that an
original-session retry continues the already-approved operation without minting
a new resume proposal; every new recovery proposal needs matching approval.

## Declined changes and rationale

None.

## Verification

Read the full sealed reviewer response. The local projection is an explicit
proposed extension; no baseline implementation is claimed. Rechecked the
revision interlock, pending-fence, consumer, and activity rules for consistent
deny-before-effect/read-back-before-allow ordering. Document formatting and
diff checks precede submission; runtime tests are not applicable to this draft.
