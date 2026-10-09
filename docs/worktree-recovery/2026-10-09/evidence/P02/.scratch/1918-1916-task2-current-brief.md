## Task 2: Connect genuine native compensation and durable custody

**Modify:** compensation-only functions in `state-recording.mjs`, `github-mutation.mjs`, `move-state/move-state-core.mjs`, `criteria-revision/stage-execution.mjs`, `store.mjs`, `source-correction.mjs`.
**Extend tests:** the existing native fixture with dedicated compensation modes reusing its actual proof/Plan/guard/actor/phase/entry/board initialization; existing modes and assertions stay intact.

**Consumes:** actual original board return identity with exit7, three unconfirmed attempts, genuine active stage token/capability and captured priorState develop; common revision admission; current header/source/resource vector.
**Produces:** fixed memory-only rollback/audit effects and a closed pending compensation chronology. No public registration function may manufacture a legitimate invocation.

### Durable interface

The existing failed stage remains fourteen original steps. An optional exact `compensation` member is admitted only for that fourteen-step journal with unconfirmed board outcome. It cannot coexist with sentinel/comment/tail steps. The closed member has:

- `schema:'aitm.native-compensation/v1'` and `previous` equal to the independently hashed actual board step;
- `intent:{priorState:'develop',stateTs}` captured from the actual original rollback derivation, with canonical timestamp and no caller-selected after bytes;
- `attempts` with at most two ordered original writes, each recording its exact original request, before body/version, returned/thrown facts and actual after body/version;
- `readback` null or exact original body CLI and independent JSON-resource response, matching the rollback bytes/version derived again from the original chronology;
- `audit` null or the exact original failure-audit request, persisted intent, actual response/readback and resource facts;
- `result` null or the actual closed recording result. A result is DATA, not current custody or completion authority.

`reconstructNativeStageCompensation({header,steps,compensation})` derives the before body, expected rollback, actual board stage/membership and full unchanged resource vector from the original chronology. It rejects unknown keys, premature/confirmed boards, arbitrary bytes, extra attempts, foreign subject, invalid timestamp, failed/partial/copied framing or incoherent readback. Store/history constructors never brand execution or intent-read membership.

### Runtime interface

- `rollbackRecordedState` recognizes memory scope before reading ctx. A private WeakMap registers only its actual lexical invocation after `assertNativeStageCompensationContext(ctx,priorState)` validates the currently active original saga and actual exhausted board result.
- Core `beginNativeStageCompensation(ctx,invocation)` / `endNativeStageCompensation(ctx,invocation)` acquire/release the existing body resource lock by exact stage-token/invocation ownership, under the already held common revision frame. Checks cover original descriptors, actual executor/config/HEAD/transcript and current persisted vector before/after every await and effect.
- Reuse `legacyRecordingProgram`; private operation membership is born only as its actual original generator yields. Its operation DATA cannot authorize a public write. `writeIssueBodyWithRetry` accepts a private native invocation argument only after no-return custody checks before destructuring, then executes the same bounded program through fixed memory-only sinks.
- Store `persistMemoryNativeStageCompensation`, `writeMemoryNativeStageCompensation`, `completeMemoryNativeStageCompensation` consume only `{backend,capability,context,token,invocation}` and original sealed operation identity. Intent-read membership stays private; a copied journal/capability/input cannot substitute. No arbitrary caller after bytes or callbacks are accepted.
- A retry freshly observes actual body/version. If the first fixed effect already landed, verify its original readback and acknowledge the same delta without writing or incrementing again. No authority result is cached.
- Failure audit uses the original bounded program and actual failure facts. Its wording must identify unconfirmed board/rollback status truthfully; the generic sentence claiming a committed board must not become an unsupported completion claim.
- The independent source fold validates compensation against the original board chronology and current body/resources. Any incomplete or completed compensation remains pending-native-stage, with nativeHistoryApproved false; it cannot admit sentinel15/comment16 or production delivery. Keep actual board stage truth even when marker was restored.

- [ ] Create actual original exhausted-board positive/failure/audit cases. Expected RED at missing native compensation bridge, after genuine prior steps; no manufactured header/token or setter-selected callback.
- [ ] Add the closed DATA branch, private runtime membership and fixed store protocol above. Keep public pre-getter quarantine for every invalid invocation.
- [ ] Cover both write attempts, effect-before/effect-after interruptions, write readback mismatch, audit interruption, source/resource/identity drift, copied/prototype/accessor public inputs, and a landed-first-write retry with one body/version delta. Expected: exact recoverable committed facts, zero unauthorized effects and no phantom rollback/board consistency.
- [ ] Run all owned native compensation and original public/recording/board cases. Expected: scoped GREEN inside unchanged budgets. Preserve unrelated whole-transition failures for their owners.

