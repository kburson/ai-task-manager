<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-9ddf3402cca15836099b1605404469d7"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2153-current-plan-approval-design.md"
artifact_commit: "a3e7cf228bfbdd355381b31a59c19a624631afe5"
artifact_blob: "871c763ce110045444a3b303b026f88364496856"
artifact_digest: "sha256:6b142ba07e22bdb8eee3310ff636b397e4fd5f77c68d9b84a81b62f490f0608e"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:8e885e611129d4b258f33753eb3a968c9f46761f665119ec7a841d482a683b39"
  identity_source: "runtime"
started_at: "2026-11-05T07:06:50.811Z"
submitted_at: "2026-11-05T07:11:55.188Z"
finding_ids: ["R2-F001","R2-F002","R2-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Re-reviewed the revised spec (blob `871c763c`) against author response 1 and the turn-1 findings. All four turn-1 findings are resolved in the new "Normative dispatch and convergence requirements" section:

- R1-F001: resolved. Strict parsing (unknown, duplicate and conflicting flags, plus duplicate issue arguments) refuses with usage exit 2. `--current-scope` is dispatched after the state read and before `automaticModernEligible`, waived reconstruction and the Plan-only wrong-state precheck. Tests must spy that `evaluateModernPlanTransitionEvidence` is never invoked. Stable statuses and exits are named (`approved-current-scope`/0, `already-approved-current-scope`/0, `current-scope-refused`/15), and post-write validation or readback failure can never exit 0.
- R1-F002: resolved. The public integration test must run real resident Review (pass reuse, required-comments, normalization). It must converge directly or after at most one same-source re-approval, with stable scope identity on the second pass. Any normalization change beyond a bounded sequencing correction returns to review. Both audit-form negatives are required in both Review consumers.
- R1-F003: resolved. Trunk SHA is approval-time provenance. Producer retries resolve trunk afresh, so drift forces a new timestamp. Review checks source and the recorded binding, not live trunk. Both rules are tested.
- R1-F004: resolved. The observed #2147 `createdAt == updatedAt` values are pinned in a fixture, with a changed-`updatedAt` refusal test. Fail-closed strict equality is retained, explicitly without claiming it covers every metadata event. That is acceptable.

I checked the strict-parser change against current callers. Global flags (`--role`, artifact selection, worktree relocation, foreign-worktree override) are stripped by `parseWorktreeRelocationConfirmation`, `parseForeignWorktreeOverride` and `buildContext`/`parseArtifactSelection` (`scripts/task-tracker/runtime.mjs:282-293`) before `ctx.rest` reaches `verbPlanApprove` (`task-tracker.mjs:849-852`). The only documented flag is `--repair-from-evidence` (`help-data.mjs:368,381`). Making the whole verb strict therefore does not break existing invocations. The remaining items are wording precision only and do not block planning.

## Findings

### R2-F001 — Optional: remove the stale non-normative sentence in "Public contract"

Severity: P3. Line 29 still says "Unknown flags should not be silently treated as authorization." The new normative section supersedes it, so the two now say different things at different strengths. Replace it with a pointer to the normative dispatch section, or restate it as "must refuse with usage exit 2".

### R2-F002 — Optional: scope "before any issue/provider read" to verb-owned reads

Severity: P3. The dispatcher already performs worktree-binding and annotation-target work in `task-tracker.mjs` (around lines 476-552) before `verbPlanApprove` runs. Read literally, "before any issue/provider read or write" would require lifting plan-approve argument validation into dispatcher preflight. State the intended boundary: either "before any read or write performed by plan-approve", or require pre-dispatch validation explicitly.

### R2-F003 — Optional: clarify the "installations that do not implement --current-scope" sentence

Severity: P3. Already-shipped versions cannot be changed retroactively, and an old install will still silently ignore `--current-scope`. The intended guarantee is that the strict parser ships in the same release as, or before, the new flag. Operator guidance for #2147 activation should also confirm the delivered version (trunk SHA containing #2153) before invoking it, which the activation section already implies. Say this directly. Also consider whether the existing missing-issue usage path (currently exit 1) should move to the same usage exit 2 for consistency.

## Required changes

None.

## Optional suggestions

1. (R2-F001) Replace the "should not" sentence in "Public contract" with normative wording or a pointer to the dispatch section.
2. (R2-F002) Define the "before any read" boundary as verb-owned reads, or require dispatcher-level pre-validation.
3. (R2-F003) Reword the old-installation sentence as a same-release ordering guarantee, and align the missing-issue usage exit code with exit 2.

## Decision

accepted
