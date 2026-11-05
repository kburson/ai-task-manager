<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-9ddf3402cca15836099b1605404469d7"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2153-current-plan-approval-design.md"
artifact_commit: "3e1aa87437d290dd60ccbe0128b75311500280fe"
artifact_blob: "a2940becd0d0f77175bb224d930f756c059738fd"
artifact_digest: "sha256:505e17d0df7aae667ab644f14a694d5bebdc8a71ab0debd27a8795e04f662afb"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:8e885e611129d4b258f33753eb3a968c9f46761f665119ec7a841d482a683b39"
  identity_source: "runtime"
started_at: "2026-11-05T07:06:50.811Z"
submitted_at: "2026-11-05T07:08:59.578Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Reviewed the spec at blob `a2940bec` against baseline code: `scripts/task-tracker/verbs/plan-approve.mjs` (routing, `parseArgs`, outcome/exit mapping), `scripts/task-tracker/lib/plan-approval-audit.mjs` (audit builder/reader), `scripts/task-tracker/lib/agent-review/validators/required-comments.mjs` (Review consumer), `scripts/task-tracker/lib/stage-entry-markers.mjs` / `stage-entry-grammar.mjs` (visit-suffixed entry accumulation), and `scripts/task-tracker/lib/workflow-policy/scope-identity.mjs`.

The selected direction (option A: explicit, opt-in, present-time approval that uses the historical `not-required` transition only as admission context) is sound. It keeps Review's audit requirement, does not broaden waiver reconstruction, and does not relabel the historical exemption. Option B and C rejections are correctly reasoned. Historical admission is appropriately strict. The current-evidence digest plus a narrow Review freshness check closes the "stale persisted approval qualifies Review" hole that a producer-only mismatch result would leave open. I confirmed entry markers accumulate with visit suffixes (`stampEntryMarker` appends `entered-develop-N`), so the `demote --rework` activation path keeps the original Develop entry present, as the admission rules require.

Two gaps need normative text before planning: the CLI dispatch/flag contract is underspecified against current routing, and verification does not prove that the real Review gate converges after the scope-identity normalization the spec itself flags as a risk.

## Findings

### R1-F001 — Required: make `--current-scope` dispatch and flag strictness normative

Severity: P2. Today `parseArgs` (plan-approve.mjs:756-767) silently drops every unrecognized argument. `runPlanApprove` computes `automaticModernEligible` (lines 139-141) for any Full-Auto caller in Develop/Test/Review without `--repair-from-evidence`, then collects authority records and refuses with `evidence-repair-refused` whenever any authority record exists that does not evaluate as an available waiver (lines 184-215). #2147's `not-required` authority is exactly such a record. The spec says the lane is opt-in and that "Unknown flags should not be silently treated as authorization", but:

- "should" is not normative, and current behavior is to ignore unknown flags. A typo (`--current-scop`) or an older install that does not know the flag falls silently into the automatic waived-reconstruction route instead of failing loudly as a usage error. Today that route happens to refuse; nothing in the spec guarantees it will keep refusing.
- The spec does not say where the new lane branches. Unless `--current-scope` is dispatched before the `automaticModernEligible` computation and the wrong-state/adaptive precheck on line 142, a natural implementation that only adds a flag will still run `evaluateModernPlanTransitionEvidence` and refuse.
- The public contract names no result statuses or exit codes for the new lane. `verbPlanApprove` maps unknown statuses to `plan-approve: unknown result` with exit 1. The operator guidance and integration tests need stable, distinct success/refusal statuses and exits.

### R1-F002 — Required: verify end-to-end Review convergence after normalization, and digest-required audit selection

Severity: P2. The spec admits (Review freshness section, last paragraph) that the scope projection keeps some runtime AC attributes. `canonicalSection` strips only checkbox state and `aitm-execution-proof|dod-evidence|ac-evidence` comments, so Review-time normalization can change scope identity at an unchanged source. The prescribed remedy is "repeat the explicit approval at the same source before retrying Review". The spec does not require evidence that this loop terminates, meaning the second approval is not invalidated again by the same Review normalization. The integration test as written stops at "produces current approval and a canonical required-comment audit". It does not require the real resident Review run (pass-reuse check plus the `required-comments` gate) to accept the result.

Separately, the current `required-comments` matcher (lines 64-71) accepts any canonical audit whose `ts` matches the marker, calling `isCanonicalPlanApprovalAuditComment` with `repairEvidence` null. The spec says digest-bearing markers "require the canonical current audit", but it does not state the negative: an ordinary or waiver-form audit at the same timestamp must not satisfy a marker that carries `current-approval-digest`. A converse statement is also missing: a current-form audit must not satisfy a marker without the digest. This matters because the audit heading is shared.

### R1-F003 — Optional: state the trunk-SHA semantics inside the digest

Severity: P3. The closed record includes trunk SHA, and partial-audit recovery reuses the marker timestamp only if a freshly recomputed record hashes to the stored digest. The Review freshness list correctly omits trunk SHA. But the producer's idempotency path will treat any trunk movement between a failed audit post and the retry as "evidence changed", which forces a new timestamp and orphans the first marker/audit pair. That may be intended, since trunk is approval-time provenance. Say so explicitly: either trunk SHA is approval-time provenance that the retry compares against the audit's recorded value rather than the live trunk, or trunk movement intentionally forces a fresh approval. Then test whichever behavior is chosen.

### R1-F004 — Optional: confirm `createdAt == updatedAt` is a sound edit signal for the live #2147 comments

Severity: P3. Admission rejects comments whose creation and update instants differ. I am unsure whether GitHub ever advances a comment's `updatedAt` for non-content events, such as minimize/unminimize or author-association changes. If it does, a genuine record would be refused. That fails closed, but it would block the #2147 activation this spec exists for. Pin the check against the actual observed values of comments 6620373277 and 6620377056 in a recorded fixture, or compare body bytes and the immutable record fingerprint instead of relying on timestamps alone.

## Required changes

1. (R1-F001) In "Public contract", replace "should not" with a normative rule. `plan-approve` must refuse unknown, duplicate, or conflicting flags with a usage exit before any read or write. `--current-scope` must be dispatched immediately after argument parsing and state read, before the `automaticModernEligible` computation, the waived-reconstruction branch, and the Plan-only wrong-state precheck, so the new lane can never reach `evaluateModernPlanTransitionEvidence`. Name the new lane's success statuses (for example approved and idempotently-reconciled) and its refusal status, and map each to an exit code in `verbPlanApprove`. Add tests for: a typo flag refuses; `--current-scope` with `--repair-from-evidence` refuses; `--current-scope` against a `not-required` authority never invokes the waiver evaluator.
2. (R1-F002) In "Verification", require the integration test to run the real resident Review path after approval: pass-reuse validation and the `required-comments` gate, including any Review-time body normalization. It must show Review accepts the result either directly or after at most one documented re-approval at the same source, with no further change to scope identity on the second pass. In "Review freshness", state both negatives and test them: a digest-bearing marker is satisfied only by the matching current-form audit, never by an ordinary or waiver audit with the same `ts`; and a current-form audit never satisfies a marker without the digest.

## Optional suggestions

1. (R1-F003) Define whether trunk SHA in `aitm.current-plan-approval/v1` is approval-time provenance compared against the recorded value on retry, or whether live-trunk drift intentionally forces a fresh approval. Test the chosen behavior.
2. (R1-F004) Validate the `createdAt == updatedAt` admission rule against the real #2147 authority/completion comment observations in a recorded fixture, or anchor edit detection on body bytes and record fingerprints.

## Decision

revisions-requested
