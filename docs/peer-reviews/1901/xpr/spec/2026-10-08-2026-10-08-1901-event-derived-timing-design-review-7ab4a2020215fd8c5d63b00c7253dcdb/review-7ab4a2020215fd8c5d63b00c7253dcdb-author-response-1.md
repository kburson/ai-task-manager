<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ab4a2020215fd8c5d63b00c7253dcdb"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md"
artifact_commit: "06743dbddd6f9001d60b5674e52824230aead9f0"
artifact_blob: "292c2008e330d3b628dc6b7a84e2d1f360839e62"
artifact_digest: "sha256:e85871a74daba96ecc2310e0e0a3756759230bb0a1b1fcd7006e3eb73353ebbc"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
  identity_source: "runtime"
started_at: "2026-10-08T21:00:32.785Z"
submitted_at: "2026-10-08T21:11:59.520Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed all five required findings and the overlapping-Idle clarification. Added concrete publication convergence, bounded lane evidence, mixed-version rollout, observed-row behavior and lifecycle pre-flush/pair contracts. Preserved issue scope, original source evidence, sealed outcomes and separate transcript estimates. This is a specification revision only.

## Finding dispositions

### R1-F001 — Accepted with clarification

Selected full-projection post-write verification with three bounded mutation attempts, source-inventory retention, drift merge/rederive, protected-byte refusal and recoverable journal/queue evidence. A complete event insertion and allocation rewrite is one body mutation, so there is no deliberate insert-before-rewrite intermediate write. Cross-host stale-snapshot races still exist; readers validate the whole projection and refuse authoritative complete totals on drift. Historical batch apply retains its stronger maintenance-window requirement.

### R1-F002 — Accepted

A shared boundary needs closing evidence for the particular lane, not just an unmatched opener. Its publisher can attest only its own continued bound engagement. Other tails remain pending/unavailable until their own closing observation arrives; dead sessions do not accumulate days through unrelated boundaries. Recorded bounded slices survive later unknown-tail recovery. The legacy Idle bridge explicitly retires the old legacy interruption.

### R1-F003 — Accepted

Reader-compatible release N precedes opt-in producer emission. Added disabled-by-default repository timingDurationModel gate, explicit participant readiness/minimum release inventory and operational exclusion of stale installations. Defined enabled suffix ordering, declared baseline reader incompatibility honestly, and required tests for old readers, disabled emission, compatible readers and sealed-source successor adapters. Enumerated display-sensitive consumers.

### R1-F004 — Accepted

Defined engagement with both matching opener and actor-owned closing evidence. Without departures, the bounded event window is Active regardless of transcript gaps. An opener alone supplies no end at another actor boundary. Transcript idle thresholds remain estimate-only. Added observed-estimate-reclassified previews, board delta visibility and long-gap regression while preserving original estimates.

### R1-F005 — Accepted

Retained the pre-flush as an independent journaled word-banking event; it owns elapsed time up to its tick and does not end engagement. The same-instant lifecycle pair is its own immutable atomic admission unit, with the first row owning only the remaining observed slice and the second zero. Added queue/remote partial-failure, restart, lost-response and replay contracts.

### R1-F006 — Partially accepted; linked-story creation deferred

Added independently verifiable delivery steps for readers/engine, enabled producers/scalars and guarded repair/reallocation. Concrete story decomposition belongs to the implementation-plan stage; no child issues or workflow transitions are invented during specification XPR. Full AC1–AC6 remains required.

### R1-F007 — Accepted

Explicitly stated summed Idle is per-lane waiting duration and, like Active, may exceed wall time. It cannot substitute for SessionTime.

### R1-F008 — Deferred outside this artifact

Verified the existing mismatch between the historical predicate literal 0h 0m 0s and the formatter output 0h 00m 00s. A global old-format behavior change is outside this defect and could alter pinned outcome semantics. The revised design requires correct decoded handling of new-format zero in its compatibility view while leaving original historical semantics intact. Separate backlog intake is appropriate after XPR; no fix or new issue authority is claimed here.

## Changes made

The specification now includes XPR clarifications for live convergence and evidence bounds, currently observed-row metrics changes, reader-first opt-in cross-version rollout, exact suffix ordering, retained pre-flush plus atomic lifecycle pair, associated regressions and implementation-planning boundaries. Earlier contradictory broad lane-credit and continuous-evidence wording was replaced rather than left as an overriding ambiguity.

## Declined changes and rationale

No required change declined. New linked stories and a separate old-format zero-literal defect are deferred to governed implementation planning/backlog intake; they are not silently bundled into this specification or used to weaken sealed historical validation.

## Verification

Re-read appendActorRow/postTimingEvent, flushBoundActorInterval, actor-flush journal, timing-post-outcome, queue, actor marker reader, timing row reader, deriveActorEngagement, duration codec and outcome source validation. Compared findings with the live issue already read by the reviewer. Document-only formatter and whitespace checks follow this edit; no product code or implementation tests were run.

Timing evidence: review-created at 2026-10-08T21:00:32.785Z; reviewer-joined at 2026-10-08T21:01:26.811Z; reviewer-revisions-requested at 2026-10-08T21:05:53.688Z. First reviewer round was 266.877 seconds (4m 26.877s); startup plus first reviewer handoff was 320.903 seconds (5m 20.903s). These come from sealed protocol events, exclude setup before review creation, and do not use the later XPR:start timing checkpoint as a backdated start. Final end-to-end measurement will use terminal protocol finalization.
