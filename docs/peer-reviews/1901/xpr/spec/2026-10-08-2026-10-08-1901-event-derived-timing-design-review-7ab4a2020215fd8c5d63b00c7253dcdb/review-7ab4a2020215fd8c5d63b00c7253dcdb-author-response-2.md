<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "1e6f2461a1db7b2ab07119cdc57447fd60b2eb9d"
artifact_blob: "db7201ee19f1e08c7507d157c80f03861921d3b7"
artifact_digest: "sha256:c05810c5daa57b3a63663b938f36161574e97cd81b3f32a5e848222747329767"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
  identity_source: "runtime"
started_at: "2026-10-08T21:00:32.785Z"
submitted_at: "2026-10-08T21:41:37.425Z"
finding_ids: []
answered_finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed both required round-two findings and clarified symmetric Idle evidence plus availability/board behavior. The canonical log owns model activation, and valid ordinary appends retain protected-unfillable history without moving or losing events. This is a specification revision only.

## Finding dispositions

### R2-F001 — Accepted

Moved model authority to an immutable activation marker in the canonical Timing Log. Local configuration only permits requesting activation; it cannot override the shared model. Defined the effective source tuple, operation identity, concrete minimum release, recording time, idempotent admission and conflict diagnostics. Compatible writers honor the logged model or refuse. Added post-activation legacy-row handling, mixed-segment completeness and guarded historical conversion limits.

### R2-F002 — Accepted

Ordinary appends after protected history retain their source evidence and publish even when older pending allocations cannot be filled. Previously credited slices stay intact. Only uncredited protected portions become terminal-unavailable with sealed-source-protected provenance on the successor. The new row credits its post-cutoff window; true late insertion inside protected bytes refuses. Added the spanning-update and conservation tests.

### R2-F003 — Accepted

The closing-evidence rule now explicitly applies to interrupted lanes and Idle. A lone departure cannot accrue Idle through unrelated stage boundaries; its own matching closing evidence establishes the window.

### R2-F004 — Partially accepted

Added known, fillable-pending and terminal-unavailable portion states, evidenced recovery terminalization, stage-scoped null/Unknown board persistence, known-subtotal provenance and existing incomplete-outcome/calibration behavior. A new command declaring sessions dead remains outside #1901, in existing pause/runtime scope. No artificial end is introduced.

## Changes made

Added canonical model activation, model-segment coverage, protected pending-slice preservation for ordinary appends and explicit availability/board/close contracts. Replaced earlier participant-local activation and broad protected-insertion refusal wording. Added the corresponding regression requirements.

## Declined changes and rationale

No required change declined. The optional new dead-session operator command is deferred to its existing pause/runtime scope, retaining honest incomplete measurements and existing evidenced recovery.

## Verification

Re-read the sealed round-two response, layered configuration, actor publication, source lineage validation and the append-position versus projection-rewrite distinction. Document formatting and whitespace checks precede submission. No product code or implementation tests were changed.

Recovery evidence: the actual Claude transcript recorded APR_REVIEWER_GIT_VIOLATION, with artifact/HEAD/branch/index matching but worktree drift from an author-created standalone XPR record. Preserved that record in ignored scratch and verified the exact expected boundary digest sha256:0a7e6f1b45fc78f05dfd91562675a39f53ce50353ca734ca8dd3ee8c0b7590dd.

Reconciled the stalled provider-launch outcome using the official exact-session terminal snapshot, exact native submit refusal and matching reviewer fingerprint; original ledger and audit receipt are preserved in scratch. This confirmed completed provider execution only and created no review decision, timestamp or identity. The same actual Claude session then submitted round two, recorded at 2026-10-08T21:35:20.539Z in protocol revision 5. Future task-comment collateral remains ignored while reviewer turns are active. The recovery delay remains part of end-to-end elapsed time, separately identified from reviewer work.
