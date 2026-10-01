<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-fe3b8aacd416cf76d25d311dc272c4dc"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-30-1857-complete-outcomes-revised.md"
artifact_commit: "2079261adada8e9c4087c6c66a0b4a76031618d8"
artifact_blob: "ccf0bc65ef16d389313be94df1ac66061e27a78c"
artifact_digest: "sha256:cf4b8ab03e4dac6ef1b4e0d602b2da8476b685c5d98089e62192a607375c4713"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:c9125952da149fd3712e65df311e6de5c91e318ed41e211b32dfed3d7ab5ef12"
  identity_source: "runtime"
started_at: "2026-10-01T05:51:41.337Z"
submitted_at: "2026-10-01T06:00:33.255Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The round-two artifact (commit 2079261a) addresses all six required changes and all three optional suggestions from round one. I re-read the revised plan in full and checked the author's one premise correction against source.

- **R1, Close lanes. Resolved, and the author's correction is right.** `issue-kind.mjs:133-136` defines `isIssueResidentDeliveryKind` as `NO_COMMIT_KINDS.has(kind) && kind !== 'epic'`. `close-delivery-receipt.mjs:80`, `action-decision/close.mjs:251`, `action-decision/deliver.mjs:318,716` and `delivery-preflight.mjs:469` all branch on that narrower predicate. Epic membership in NO_COMMIT_KINDS therefore relaxes Develop/Test command expectations but does not authorize an ordinary root epic no-commit Close. My round-one premise, that no-commit root epic delivery is a lawful current lane, was wrong. The new "Source-derived lawful Close and provenance matrix" now lists eleven lanes. Each has its own provenance and forecast rule: top-level code, docs-only, each audit/research/spike kind separately, child/sub-epic, ordinary root epic, local-trunk, Evidence-v2/waiver, incident epic, historical false-delivery recovery, reopened-close recovery and non-delivery dispositions. Every row is required as a regression case through the real gate paths, and historical epic no-commit records stay readable but grant nothing new. That satisfies the requirement.
- **R2, self-hosting containment. Resolved.** The new section states that an outcome commit is not an isolation boundary. It requires a stable, recorded execution image (source identity, packaged digest, resolved hook paths, root, actor) through the registered installer route before any emitter or storage edit. It restricts candidate code to fixtures, and it moves this repository's emitter and default adoption to the single separately admitted, quiesced cutover. It adds the requested active-author survival test and a no-mixed-generation check. If the installer cannot bind a stable image, the plan requires one concrete capability refusal rather than editing live defaults. That is the right fallback.
- **R3, upgraded but unmigrated. Resolved.** "Migration required" is now a distinct durable admission state. Populated or ambiguous legacy stores can never take the total-loss or empty-initialization path. Lifecycle mutations refuse with a typed, actionable message. Artifact authoring, read-only diagnostics and the closed bootstrap descriptor remain reachable through the prompt-hook chain, not only through the command handler. Install/update emits the notice and preserves legacy bytes, and the exit matrix adds the upgrade-with-populated-queue and hook-reachability rows.
- **R4, generation handoff. Resolved.** Outcome 1 now versions every changed local store shape and goes through the path/state/session APIs. Outcome 2 must migrate both generations, including mixed queues, and the exit matrix has the matching row.
- **R5, host evidence. Resolved.** The plan names a durable scenario document and separates seam-test coverage from genuine observation. Non-destructive inventory and the absent-capability case are always required. An applied archive needs separate approval, and until then that row is recorded as "not executed", never ticked from a seam. This is honest and consistent with the prohibition on removing real assets.
- **R6, budget. Resolved.** The plan names the artifact (`1857-delivery-report.md`), the author who prepares it, adoption by the controller under the stated delegation, the issue-body and owned-comment route, and timing after acceptance and before source work. It also states that the budget is advisory unless the estimator route admits a new forecast.

Optional items are also incorporated: the multi-skill provider schema and update-collision coverage, the distinction between the baseline HEAD and the review HEAD, and the spike/audit calibration assertions.

## Findings

None blocking. One minor wording ambiguity is recorded under Optional suggestions.

## Required changes

None.

## Optional suggestions

1. The Outcome 1 checklist item "Adopt all live emitters last within the same outcome" (line 107) can be read as live activation in this repository. That would conflict with the self-hosting section, which defers this repository's adoption to the Outcome 2 cutover. Consider rewording it to "Wire all emitters in source last within the same outcome (fixture-proven; live activation in this repository occurs only at the Outcome 2 cutover)" so an executor following the checklist cannot activate them early.
2. Line 168 ("Total runtime loss permits explicit empty initialization") is correct only together with line 163's "proven absence of legacy durable data" condition. A cross-reference there would stop the earlier sentence being read on its own.

## Decision

accepted
