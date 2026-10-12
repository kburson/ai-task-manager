<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-efeda328cf3fbcf87107748d2a8d62a5"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md"
artifact_commit: "f225c0ca5664036eb4b54729f2a219f995b70d27"
artifact_blob: "d23034beb8f224f83871cdfa99a8cc6019710d87"
artifact_digest: "sha256:55d540975484f12c61c37d6488964d6104b2fb73eb074bcbe90edb5439e963ac"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:3f00fb073cf147db2b9f3907a52251896bf56857a2d1b7f8ca47f607fd2e3624"
  identity_source: "runtime"
started_at: "2026-10-11T19:37:41.703Z"
submitted_at: "2026-10-12T03:19:28.023Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the exact artifact pinned by this response: digest
`sha256:55d540975484f12c61c37d6488964d6104b2fb73eb074bcbe90edb5439e963ac`, blob
`d23034beb8f224f83871cdfa99a8cc6019710d87`, commit
`f225c0ca5664036eb4b54729f2a219f995b70d27`. It is the formatted successor of the
design that the earlier XPR review `review-0b4f795d5c595c5b55da425a257660f9` accepted
at digest `sha256:00c8ce01…6cda`. That earlier receipt covers only the old digest, so
this review requalifies the design at the new exact bytes.

**Method and limits.** This was read-only inspection. I read the whole artifact, the
earlier review's manifest and its final reviewer response, and the current source at
the coordinates the design cites. I made no Git call, ran no tests, and did not touch
the artifact. Without Git I could not produce a byte diff between digest `00c8…` and
`55d5…`. So I did not just accept "formatting only" on trust. I re-reviewed the
complete text at `55d5…` on its own merits. I also checked that every resolution the
earlier review relied on is still present, worded with the same meaning.

**Earlier resolutions are intact at this digest.**

- *Pinned return contract.* "Observable completed16 resume result" still fixes
  `exit: 4`, `code: 'revision-authority-unavailable'`, `phase: 'native-stage-resume'`,
  `preparationReason: 'native-source-unavailable'` and `tail: { failures: [] }`
  without `total`. It covers all four terminal categories. The table now uses padded
  columns, and every row is the same as the accepted contract: clean step19 fence,
  refusal before dispatch17, interruption within 17/18, and refused report custody or
  refused final policy comparison. Partial fields still describe step16 facts only.
  17/18 progress is still evidenced only by the reconstructed backend snapshot and the
  operation trace.
- *Actor binding for the cache18 sink.* "Admission and lifetime" still keeps
  `header.original.actor.identity`. It cross-checks that identity against fresh
  `currentSessionId()` / `aiAppName()` captures and `context.executor.sessionId` at
  frame creation and at every cache18 boundary, and refuses on drift before any new
  effect.
- *Scope requirement.* The frame, the existing read and the tail must run inside
  `runMemoryContext` with activity `stage-write` under
  `withMemoryStageEffectQuarantine`. They must recheck `isMemoryStageEffectScope()` and
  must never fall through to the host branch of `runPostCommitTail`.
- *Envelope equality.* Step 4 still requires the genuine GET response to equal
  reconstructed step16 `readback.read.response`, including raw `stdout`, empty
  `stderr` and `exitCode` 0. It also requires census equality and `afterResources`
  equality. Envelope-only drift still refuses before dispatch17 or custody
  registration.
- *Ordinal-16 test transition.* "Qualification and delivery boundary" still keeps
  ordinals 1–15 unchanged and records the old ordinal-16 assertions as the red
  baseline. It replaces only that iteration's expectations, in the same case. It keeps
  the `1..16` completeness assertion, the full map passed to
  `qualifyOriginalEntryRefusals`, and the unchanged-physical-files assertion for every
  ordinal. The cache18 delta stays in the memory backend's
  `nativeStageResources.local.activeTask`. The "Source boundaries" fixture row and the
  final preservation bullet both refer to this same single exception.

**The design's source claims still match the code.**

- *POST before GET.* `writeTransitionCommit` (`transition-commit.mjs:434-487`) always
  calls `create` before `read`. In memory scope it also requires the creation
  (`call.created`) and read (`call.found`) captures before registering
  `nativeTransitionResults`. Reusing it at completed16 would publish a second comment,
  as the design states.
- *Repair is host-fenced.* `repairTransitionCommit` (`:517-544`) calls
  `assertRevisionStageHostEffect()` first. Its `already-present` result is parsed data
  with no return custody.
- *Existing read needs a pending step16.* `readMemoryNativeStageTransition`
  (`store.mjs:3705-3768`) needs `assertTransitionIntentRead(journal)` and a
  `nativeTransitionCreates` membership for `steps[15]`, and it writes
  `step.readback`. It cannot authenticate a step16 that has already completed. Its
  recorded read envelope is `{ stdout: actual.bytes, stderr: '', exitCode: 0 }`, plus a
  census clone and an `afterResources` check (`:3739-3759`). Those are exactly the
  fields step 4 of the design compares, so envelope-only drift is detectable as
  described.
- *Policy entry point.* `tryNativeStageOriginalEntry` (`policy.mjs:257-329`) already
  runs the restart inside `runMemoryContext({ …, activity: 'stage-write' })`. Its
  `check()` compares against the snapshot and authority captured at admission. That
  is why a private ordered execution-phase branch is needed to admit genuine 17/18
  progress, as the design specifies.
- *Tail validation.* `tailCurrent` (`move-state-core.mjs:4767-4797`) needs
  `record.transitionCommentReturned` and
  `assertOriginalNativeTransitionResult`. It refuses `deps` and
  `transitionCommitRepairRequested` own properties. So a separate resume-frame branch
  is needed, and leaving the original branch untouched is coherent.
- *Frozen empty `onEnter`.* `assertNativeStageTailDispatchModule` (`:4826-4838`)
  already requires `STATES.test.onEnter` to be frozen and empty. This backs the design
  limiting admission to completed16 with target `test` only.
- *Partial-report holder.* `assertNativeStagePartialHolder` (`:898-934`) needs a
  registered original preparation holder. A separate comparison-only resume holder is
  therefore needed and does not weaken the original path.
- *Host branch can add repair.* `runPostCommitTail` (`post-commit-tail.mjs:77-116`)
  rethrows in memory scope. In host scope it may prepend `repairTransitionCommit`.
  This confirms why the design forbids falling through to the host branch.

**Scope and honesty.** The boundaries are unchanged:

- completed16 only;
- target `test` only;
- no body grant;
- the ordinary pending fence is kept;
- no generic policy exception, budget increase or production activation;
- no claim that #1915, #1928 or #1957 is complete.

The status line correctly records that the earlier SAR receipt covers only
`e443…9dae` and that SAR must be renewed on the final exact digest. It does not claim
that either review already covers this digest. That is the right way to describe
coverage: the receipts are kept outside the artifact, so the artifact never has to
record its own digest, and requalification cannot loop.

I found no defect, contradiction or overclaim at this digest. I recommend acceptance.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Record the formatting-only evidence in the author's durable response.** Without
   Git access a reviewer cannot confirm that `00c8…` → `55d5…` changes only whitespace
   and table padding. The author response, not the artifact, could cite a
   whitespace-insensitive comparison of commits `d985e728d` and `f225c0ca5` for this
   path that shows no semantic change. Keep that evidence out of the artifact, so
   recording it does not change the digest again.
2. **Carry forward the earlier plan-level note.** The previous review's optional
   suggestion still applies to the implementation plan. Admitted completed16 refusal
   and interruption cases return `phase: 'native-stage-resume'` and may keep landed
   17/18 state. They should therefore be checked with a dedicated assertion set built
   from the terminal-category table. They should not go through the existing
   `refuse()` predicate in `native-stage-original-entry-controls.mjs`, which rejects
   that phase and asserts an unchanged snapshot. Leave that predicate unchanged for the
   pre-admission controls. No artifact change is needed.

## Decision

accepted
