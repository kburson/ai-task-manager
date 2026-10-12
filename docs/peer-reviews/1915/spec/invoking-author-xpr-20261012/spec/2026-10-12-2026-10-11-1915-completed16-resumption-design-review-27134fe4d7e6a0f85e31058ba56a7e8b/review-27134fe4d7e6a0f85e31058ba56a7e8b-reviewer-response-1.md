<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-27134fe4d7e6a0f85e31058ba56a7e8b"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md"
artifact_commit: "de0a1aede3d84cd46c26d0832072bfa762e4adbc"
artifact_blob: "d23034beb8f224f83871cdfa99a8cc6019710d87"
artifact_digest: "sha256:55d540975484f12c61c37d6488964d6104b2fb73eb074bcbe90edb5439e963ac"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:5f19b3c770ccc4525b613cb0085fbf1df82e319b0074907437c1de06e8ec2739"
  identity_source: "runtime"
started_at: "2026-10-12T12:38:40.352Z"
submitted_at: "2026-10-12T12:42:17.876Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the design independently against the current source at the artifact commit. Every "why the current handoff cannot be reused" claim holds:

- `writeTransitionCommit` always creates before reading (`transition-commit.mjs:453-459`), and its memory result custody requires `call.created`/`call.found` (`assertOriginalNativeTransitionResult`, `:168-175`).
- `repairTransitionCommit` calls `assertRevisionStageHostEffect()` first and returns its `already-present` result as parsed DATA only (`:507`, `:517-518`).
- `readMemoryNativeStageTransition` refuses unless `nativeTransitionCreates` holds the pending step16 (`store.mjs:3713-3715`).
- `tailCurrent` requires `ctx.transitionCommit === record.transitionCommentReturned.result` and the original create/read custody (`move-state-core.mjs:4767-4783`).

I also checked these source facts:

- Admission currently ends at `evaluateOriginalNativeStageRestart` with `known-prefix-continuation-unavailable` (`:520-530`).
- The policy's `check()` pins the whole snapshot, and its final `observeRevision` must equal the entry state (`policy.mjs:270-331`). The design correctly recognizes that both need a private execution-phase branch.
- Dispatch17 and cache18 already exist as original leaves (`runNativeStageTailStep`, `runNativeStageCache`). They use the timing/comment lock and the `activeTask` checkpoint lock respectively (`store.mjs:3805-3812`, `:4439-4451`), which matches the lock hand-off ordering in the design.
- Step index 2 already hits `assertRevisionStageHostEffect()` (`:4873`), which is the "step19 fence".
- Cache18 binds `record.actorIdentity.sid` and `record.localPaths.activeTask`. On restart these currently come from historical `header.original.actor` (`:470-498`). The design's added cross-check against fresh `currentSessionId()`/`aiAppName()` and `context.executor.sessionId` (mirroring first entry at `:4079-4080`) closes a real gap.
- The codec derives the cache18 file from `actor.capture.projectDir`, which header validation already pins to `executor.worktree` (`stage-execution.mjs:1353`).

The token rationale is sound. Today `tryNativeStageOriginalEntry` only checks `originalNativeStageEntries.has(ctx)` (`policy.mjs:259`), so a concurrent direct call with the live ctx would pass. The fixture claims also match the existing code: the ordinal loop at `native-stage-continuation-fixture.mjs:3339-3360`, `qualifyOriginalEntryRefusals`, including its ordinal-16 drift cases, and physical-file `captureFiles()`.

The design is internally consistent and correctly scoped to completed16 → 17/18 → fenced 19. It explicitly acknowledges that an interrupted 17/18 state stays stranded until #1923/#1925, and it gives an exact observable return contract and qualification plan. I found no correctness or safety defect that blocks writing the implementation plan. The optional suggestions below make the qualification more precise and name ownership; the plan can absorb them.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Inject comment-read refusals after admission, at the existing-read boundary.** The comment-read refusals are envelope-only drift, duplicate, changed or missing comments, and incompatible census. Admission already requires the exact whole resource vector through `deriveRecordedNativeStageKnownPrefix`, and `nativeStageResources.comments[]` carries the raw `bytes` that the memory GET serves. A drift seeded into the snapshot before the call is therefore refused pre-admission. That would pass the test without ever exercising the new read comparison. The plan should state that these cases inject drift after admission and assert the "Refusal before dispatch17" return (`phase: 'native-stage-resume'`, no step17 intent). It should also note that `qualifyOriginalEntryRefusals` cannot host these cases as-is, because its predicate rejects results with `phase === 'native-stage-resume'` (`native-stage-original-entry-controls.mjs:56`).
2. **Name who returns the fourth-category record when the final policy comparison refuses.** Today `tryNativeStageOriginalEntry` throws `RevisionPolicyError('revision-conflict')` when the final observation differs (`policy.mjs:330-331`). The design requires that refusal to return the fresh unverified record with `exit: 4` / `phase: 'native-stage-resume'`. The `policy.mjs` row in "Source boundaries" should say explicitly that the execution-phase finalization returns that record instead of throwing, and that it discards any already-computed verified partial.
3. **Call out the store strengthening for current partial facts.** The existing `readMemoryNativeStagePartialFacts` (`store.mjs:4649-4657`) derives facts from the journal alone and only checks snapshot stability. It does not compare current resources against reconstructed step16/17/18 `afterResources`. The design's "independently reconstructs the complete current history and current resource vector" is therefore new behavior. The `store.mjs` row should list it so the plan does not reuse the existing reader unchanged for the resume path.
4. **Record the memory-only equality rules as a constraint for future transports.** Exact raw GET `stdout` equality and whole-census equality with `readback.census` are deterministic only for the memory backend. A real transport would refuse on any `updated_at`/reactions change or unrelated third-party comment. Recording this as a known constraint for #1923 or production activation would keep it from being relaxed silently later.

## Decision

accepted
