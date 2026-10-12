<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-0b4f795d5c595c5b55da425a257660f9"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md"
artifact_commit: "3249b393bb3c81d3fd89db19659ee2c0c13d7db0"
artifact_blob: "889b73869a50717eeac5eefbd06549ac8fcad0f1"
artifact_digest: "sha256:e443603691356e2365fd8fdc358261819cf9dcd44f0b5d435557037d779f9dae"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:7f709c3acc0a5562493b71731ee6551460300f0ea6ca3ac56fa6825532a2c6f4"
  identity_source: "runtime"
started_at: "2026-10-11T19:23:05.405Z"
submitted_at: "2026-10-11T19:26:35.344Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I checked the design against the source at artifact commit
`3249b393bb3c81d3fd89db19659ee2c0c13d7db0`. It is read-only inspection only. I ran no
tests, made no Git or GitHub call, and did not touch the artifact.

The diagnosis in "Why the current handoff cannot be reused" is correct, and the source
confirms each claim:

- `writeTransitionCommit` (`transition-commit.mjs:434-487`) always calls `create`
  before `read`. Its memory branch then asserts `call.created`/`call.found`
  membership.
- `repairTransitionCommit` (`transition-commit.mjs:517-544`) starts with
  `assertRevisionStageHostEffect()`. Its `already-present` branch returns a parsed
  record with no custody.
- `readMemoryNativeStageTransition` (`store.mjs:3705-3768`) requires
  `assertTransitionIntentRead` (step16 `readback === null` plus intent-read membership)
  and `nativeTransitionCreates` membership. It also writes `step.readback`, so it cannot
  authenticate an already-completed step16.
- `tailCurrent` (`move-state-core.mjs:4767-4797`) requires
  `record.transitionCommentReturned` and `assertOriginalNativeTransitionResult`.

The approach A versus B/C analysis is sound. Rejecting C, where restored DATA would
become execution authority, is consistent with the accepted Task5 protection contract.

The increment is also feasible against the existing pieces:

- `validateNativeStageJournal` (`stage-execution.mjs:1753-1787`) already accepts
  17- and 18-step journals.
- `source-correction.mjs:777-809` already reconstructs exact `pending-native-stage`
  prefixes at 17 and 18 steps, so the proposed final policy re-observation has a real
  reader.
- `runNativeStageTailStep` already builds sealed `tailPrefixes` (dispatch17,
  `move-state-core.mjs:4907-4916`). `persistNativeStageTailCache` already builds sealed
  `cachePrefixes` (cache18, `move-state-core.mjs:5484-5490`). Those are the snapshots
  the proposed ordered cursor needs.
- Step19 (`emitFullAutoReviewAudit`) is already fenced by the
  `assertRevisionStageHostEffect()` + `original-tail-order` refusal at
  `move-state-core.mjs:4865-4875`. In memory scope, `runPostCommitTail` rethrows it
  (`post-commit-tail.mjs:101-102`). "Stops before step19" is therefore inherited, not
  new.

The scope boundaries are honest. The design covers completed16 only, adds no body
grant, keeps the ordinary pending fence, and makes no claim that #1915 or #1928 is
complete.

The gaps are in the contract the plan will test against, not in the architecture:

- The design never pins the observable return of a successful completed16 resume.
- It does not say where cache18's actor identity comes from, even though the frame
  explicitly refuses to populate historical actor maps.
- It states "no production transport" as a goal without tying it to the mechanism
  that enforces it.
- The existing-comment read compares body bytes but does not pin the full recorded
  census and response.

These four gaps are required changes, because the implementation plan must turn each
of them into exact red/green assertions. I recommend revisions.

## Findings

### R1-F001 — The observable result of a completed16 resume is not pinned

Today `evaluateOriginalNativeStageRestart` (`move-state-core.mjs:520-530`) returns a
fixed record: `exit: 4`, `code: 'revision-authority-unavailable'`,
`phase: 'native-stage-resume'`, `preparationReason: 'known-prefix-continuation-unavailable'`,
all partial fields false, and `tail: { failures: [] }`. Every existing test that
covers this path asserts against that literal.

The design changes what happens before the return. The tail now runs dispatch17 and
cache18 and then hits the step19 fence. But "Partial reporting and refusal" only says
the result is "a failed/partial result" with "nonzero failure". It does not state the
new values of `exit`, `code`, `phase` or `preparationReason`, or the shape of `tail`.

The original first-entry path ends at the same step19 fence. It reports through the
`catch` at `move-state-core.mjs:4653-4707`: `phase: 'authority'`,
`code: 'revision-authority-unavailable'`, and
`preparationReason: error.preparationReason ?? 'native-source-unavailable'`. The step19
error is a `RevisionMemoryTransportError` (`transport-quarantine.mjs:17-27`), so in
practice that resolves to the fallback reason.

The design does not say whether the resume path should mirror that report, keep
`phase: 'native-stage-resume'`, or introduce a reason that means "resumed through
cache18, stopped at step19". These outcomes are distinguishable, and a caller (and a
test) needs to know which one is correct.

There is a second gap. With the existing meanings, `deriveRecordedNativeStagePartialFacts`
(`stage-execution.mjs:2971-3002`) reads facts only through step16. A resume that
completed 17/18 and one that refused before dispatch17 would report identical partial
fields, apart from whatever `phase`/`preparationReason` distinguishes them. If the
design means for the snapshot alone to show 17/18 progress, it should say so.
Otherwise the result record needs a distinguishing value.

Without this, the plan's "red/green expectations" will be authored against an
unspecified contract. Two plausible implementations could both pass review while
reporting different results.

### R1-F002 — Cache18's actor identity source is unspecified, and the frame text appears to forbid the obvious source

Cache18 depends on `record.actorIdentity` throughout:

- `persistNativeStageTailCache` stamps `sid: leaf.record.actorIdentity.sid` into the
  step18 intent (`move-state-core.mjs:5463`).
- `assertNativeStageCacheValue` refuses any `sid` operation value that differs from
  `leaf.record.actorIdentity.sid` (`move-state-core.mjs:5559-5560`). Lines 5358, 5369
  and 5406 do the same.
- The active-task path the cache writes is keyed by that sid.

On first entry, `actorIdentity` is captured from the live session and cross-checked
against `context.executor.sessionId` (`move-state-core.mjs:4079-4080`). In the current
restart evaluator, it comes from historical DATA: `header.original.actor.identity`
(`move-state-core.mjs:470-477`).

The design says the resume frame "does not populate historical actor, board,
sentinel, original transition-result or creation maps." It also says it is bound to
"reconstructed effective operation and current source captures." It never says where
the cache18 sid comes from. An implementer could take any of three readings:

1. Copy `header.original.actor.identity` into the frame. This is historical DATA
   acting as the selector for a write sink, which is the pattern approach C was
   rejected for.
2. Capture a fresh `currentSessionId()`/`aiAppName()`. This silently writes a
   different session's active-task file if the restart runs under another session.
3. Require both and compare them.

Only reading 3 is consistent with the rest of the design. That is the requirement
under "Admission and lifetime" that current executor/session must agree, together
with the per-boundary recheck rule. The design should state it explicitly, because it
decides which local file cache18 is allowed to write.

### R1-F003 — "Must not activate production GitHub transport" is stated as an outcome, not bound to its enforcement mechanism

`runPostCommitTail` (`post-commit-tail.mjs:77-116`) chooses its branch from
`isMemoryStageEffectScope()`. If that is false, it calls `assertRevisionStageHostEffect()`.
That call is a no-op outside the stage-effect scope (`transport-quarantine.mjs:42-44`).
The tail then runs `step.fn(ctx)` directly for every `DEFAULT_TAIL_STEPS` entry. That
is the real host path: `gh`, cache writes and audits.

Today the resume is safe only because `tryNativeStageOriginalEntry` calls the core
through `runMemoryContext({ activity: 'stage-write' })` (`policy.mjs:318-320`).
`runMemoryContext` wraps the call in `withMemoryStageEffectQuarantine`
(`policy.mjs:68-71`).

This design adds a new caller of `runPostCommitTail` (the resume frame) and a new
existing-read protocol through `transition-commit.mjs`. It also explicitly lets the
shared-lock and resource-lock lifecycle cross several awaited boundaries. If either
new path ran outside the `stage-write` memory context, it would not fail closed:
`runPostCommitTail` would take the host branch.

The design should state these invariants:

- The resume tail and the existing read run only inside the same `stage-write` memory
  stage-effect scope.
- The resume frame and the existing-read invocation refuse when
  `isMemoryStageEffectScope()` is false, rather than relying on the
  `runPostCommitTail` branch.

It should also add a qualification case proving that refusal.

### R1-F004 — The existing-comment read pins body bytes but not the recorded read response and census

Step 3 of "Existing-comment read" requires "exactly one matching identity with exact
node identity and body bytes" plus a "whole comment census". It does not say what the
census and the GET response are compared to.

The completed step16 already records exactly what they should equal:
`step.readback.read.response` (raw `stdout` bytes) and `step.readback.census`
(`store.mjs:3739-3743`). `reconstructNativeStageTransitionComment` also derives
`afterResources`. The source-correction reader (`source-correction.mjs:764-772`) and
dispatch17's `sameBefore` (`store.mjs:3844-3851`) both already require current
resources to equal those exactly.

If the existing read only compares body bytes, some response-level drift passes the
read and is caught only later, at dispatch17's persist. One example is a changed
envelope field in the raw comment JSON. By then the existing-read result has already
been registered as verified custody, and the refusal is reported as a dispatch prefix
failure instead of a read failure. That puts the refusal at the wrong boundary and
weakens the "late substitution" qualification.

The read should compare against the reconstructed step16 record. That means the raw
response bytes equal `readback.read.response.stdout`, the census equals
`readback.census`, and the current resources equal the reconstructed `afterResources`.
This should happen before custody is registered.

## Required changes

1. **Pin the completed16-resume return contract.** State the exact `exit`, `code`,
   `phase`, `preparationReason` and `tail` values for:
   - (a) a clean resume that completes 17/18 and stops at the step19 fence;
   - (b) a refusal before dispatch17;
   - (c) an interruption inside 17/18;
   - (d) refused report custody.
   
   State whether 17/18 progress appears in the returned record or only in the backend
   snapshot. If it is snapshot-only, require the qualification cases to assert the
   snapshot directly. (R1-F001)

2. **Specify the resume frame's actor identity.** Require the frame's actor identity
   to be the reconstructed `header.original.actor.identity`. It must be compared, at
   frame creation and at every cache18 operation boundary, against a fresh current
   capture (`currentSessionId()`, `aiAppName()`, `context.executor.sessionId`). State
   that cache18's step intent `sid` and active-task path derive only from that
   cross-checked identity. Clarify that "does not populate historical actor maps"
   refers to the original first-entry custody maps, not to the absence of an actor
   identity. (R1-F002)

3. **Bind "no production transport" to the stage-effect scope.** Require the resume
   tail and the existing-read invocation to run only inside the `stage-write` memory
   context (`withMemoryStageEffectQuarantine`). Also require them to refuse explicitly
   when `isMemoryStageEffectScope()` is false. Add a qualification case where a resume
   frame or existing-read invocation reached outside that scope refuses before any
   `DEFAULT_TAIL_STEPS` function or `gh` transport is invoked. (R1-F003)

4. **Pin the existing read to the recorded step16 readback.** Before the verified
   result is registered, require:
   - the GET response bytes to equal step16 `readback.read.response.stdout`;
   - the current comment census to equal step16 `readback.census`;
   - current resources to equal the reconstructed step16 `afterResources`.
   
   Add a qualification case where only the raw response envelope changes (body bytes
   identical). It must refuse at the existing read, not at dispatch17. (R1-F004)

## Optional suggestions

1. **Fix the dropped spaces between words and numbers.** Several phrases have lost a
   space. Step tokens like "step19" are fine, but "at600000ms", "focused1200s",
   "sandbox45 minutes", "admission-only1–15", "the new17/18 journal", "Incomplete17/18
   progress", "only the actual new17/18 work" and "stops truthfully before19" all need
   one. A formatter appears to have collapsed them. They hurt readability in the
   budget sentence in particular.

2. **State the stuck-transaction consequence of an interrupted resume.** Incomplete
   17/18 progress "remains pending and is not … admitted for another execution by
   this increment." A memory-backend transaction interrupted during the resume
   therefore cannot progress until #1923 (completed17–24) or #1925 (ambiguous
   outcomes) lands. That is acceptable, but one sentence saying it is accepted, and
   naming the follow-up that unblocks it, would keep a reader from treating it as an
   oversight.

3. **Note the inherited `target: 'test'` constraint.** `runNativeStageTailStep`
   hardcodes dispatch17's intent as `{ target: 'test', actions: [] }` and requires
   `STATES.test.onEnter` to be empty (`move-state-core.mjs:4904`, `4965-4971`).
   Reusing the original leaf inherits that. A completed16 journal for any other
   transition target will refuse at dispatch17. Saying so explicitly would bound the
   "exact completed16" admission claim honestly.

4. **Name the public entry point the one-use token closes.** The token fence is aimed
   at `tryNativeStageOriginalEntry` (`policy.mjs:257`), which is exported and today
   gated only by `assertOriginalNativeStageEntry(ctx)`. Naming it in the design would
   make the overlapping-call qualification case unambiguous.

## Decision

revisions-requested
