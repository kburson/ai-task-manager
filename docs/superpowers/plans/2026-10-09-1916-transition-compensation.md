# #1916 Transition Compensation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline and one fresh final reviewer. This implements the already accepted remaining compensation slice, under active1918 orchestration and the documented sequencing continuation.

**Goal:** Execute the retained bounded rollback/audit program from a genuine exhausted original board invocation, and report compensation only from its actual verified result.

**Architecture:** Preserve the original two-attempt generator, ordinary saga and public pre-getter quarantine. Add a memory-only compensation branch with private lexical invocation/request/return custody, the existing body resource lock and a closed durable compensation record attached to the failed stage. Independently derive rollback bytes and current resource prefixes from the unchanged original header/board chronology. No new production route is activated.

**Tech Stack:** Node.js, node:test, existing native fixtures, Markdown; no dependency or compiled addon.

**Spec:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md; original Task5 in docs/superpowers/plans/2026-09-30-1847-governed-criteria-revisions.md; live1916 Scope and1918 hydration/continuation.

## Source and baseline

Exact source input `ed5679da4` contains reviewed1909–1912 and1920 local inputs. Original state-recording/marker-retry/board-readback profiles passed23/23; original board-marker atomicity passed8/8. These are baseline observations, not new implementation or Linux evidence.

Actual retained code:

- `state-recording.mjs::legacyRecordingProgram` owns two writes, warnings and one failure-audit attempt; yields are operation DATA, never authority.
- `writeIssueBodyWithRetry(input)` quarantines the public call before destructuring.
- `github-mutation.mjs::rollbackRecordedState(ctx,priorState)` reads the current marker and uses the original bounded helper, but discards its failed result and returns `rolledBack:true`.
- `move-state-core.mjs::continueMoveStateAfterPhases` calls compensation only after a non-null board result and captured prior state; its board invocation already has private actual-result custody.
- `deriveRecordedStageBody` already derives exact `rollback-state` bytes with unchanged entry visits and one native version increment; it accepts only priorState develop.
- The stage journal, store and ordered source fold currently have no compensation branch. A constructor-shaped history object does not establish current execution or read custody.

## Global Constraints

- Native ancestry1847 →1855 →1918 →1916; reuse the existing1918 parent branch/worktree and active orchestrator timer. Child1916 remainsR4P until actual aggregate reconciliation; no stage skipping or fabricated receipts.
- Preserve original code, tests, fixture size, proof/source/approval guards, strict common interlock before body lock, and the original bounded retry/audit control flow.
- Node/Markdown only. No authority cache, production activation, required-check waiver, new issue/defect/prerequisite chain or compiled addon.
- Preserve600000ms per-file/semantic section,20-minute focused verifier and45-minute sandbox. At most four isolated original case processes when overlapping native profiles.
- No arbitrary after-body/audit bytes, caller closures, reconstructed tokens, copied outputs or caller-selected stage timestamps establish authority.
- Body rollback does not prove board consistency or whole-transition success. Retain actual board resource/status facts, non-zero exit and all completed actor/checkpoint/phase/entry effects.
- Partial facade/cancellation/join reporting stays1924; actual reentry/restart belongs1915. This slice supplies validated pending compensation history and actual fixed-effect custody, not a replacement recovery engine.
- Prospective incremental forecast12h:3h bounded algorithm/ordinary result,5h native custody/lock/history integration,4h real failures/review. Excludes inherited implementation and passive execution. Reassess before code if >=24h.

## Review Focus

- A body write that exhausts must not yield `rolledBack:true`, including a failed audit attempt.
- A public compensation or recording call with getters/prototypes/copied context must refuse before callback selection or effects.
- Drift after intent/readback or during a retry must preserve the actual committed prefix and release only its own body lock.
- A first write that landed before interruption must not produce a second body/version change on bounded retry.
- An unconfirmed board may actually have changed; rollback must preserve that resource truth and remain pending, without claiming board/marker consistency or completion.

## Task 1: Preserve the bounded algorithm and truthful ordinary result

**Create:** `scripts/tests/integration/task-tracker/lib/criteria-revision-transition-compensation.test.mjs`.
**Modify:** only the result handling of `github-mutation.mjs::rollbackRecordedState` and compensation audit context in the retained recording program when actual tests require it.

**Consumes:** `writeIssueBodyWithRetry(input)` result `{status:'ok',attempts}` / `{status:'noop'}` / `{status:'failed',attempts,error,auditPosted}`.
**Produces:** existing stable-input rollback behavior, with failed writes returning `{rolledBack:false,priorState,reason:'state-recording-failed',recording}`; success/no-op remain distinct. This result is not a delivery receipt.

- [ ] Write an actual public rollback test whose two original `gh issue edit` calls fail, and whose audit command is captured by an isolated fake-gh executable. Use the real module and real temporary body files; assert both attempts, actual audit bytes and zero real network. Include audit transport failure. Do not replace the retry helper with a stub.

```javascript
const result = await rollbackRecordedState(ctx, 'develop');
assert.equal(editAttempts, 2);
assert.equal(result.rolledBack, false);
assert.equal(result.reason, 'state-recording-failed');
assert.equal(result.recording.auditPosted, auditSucceeded);
```

Run the focused ordinary cases. Expected: genuine RED because the current helper discards the failed recording result, not because fixture paths or audit setup failed.

- [ ] Retain the actual bounded helper result and condition the existing success return on it.

```javascript
const recording = await writeIssueBodyWithRetry(originalInput);
if (recording.status === 'failed')
  return { rolledBack: false, priorState, reason: 'state-recording-failed', recording };
return { rolledBack: recording.status === 'ok', priorState };
```

`originalInput` is the existing lexical object already passed by rollback, not a new public interface. Existing already-consistent handling remains before this call.

- [ ] Re-run the real failure/audit cases and all31 original recording/board/atomicity cases. Expected: ordinary GREEN without weakening original assertions or claiming a host write acknowledgment is native readback proof. Commit with1918/1916 attribution.

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

## Task 3: Qualification and one fresh review

Run: `node --test scripts/tests/integration/task-tracker/lib/criteria-revision-transition-compensation.test.mjs`.

Expected: real original exhausted-board and bounded compensation/audit, all owned current-source/public/fault controls, exact body/version/resource/readback and truthful failed result. Qualify complete originals in isolated profiles if necessary, with all cases, counts, zero skips/cancellations and unchanged limits.

Run: original recording/marker-retry/board-readback/atomicity profiles; `npm run lint`; `npm run format:check`; `git log --oneline -1`.

Expected: complete current-source ordinary regression and quality passes. Request one fresh reviewer with exact range/spec/ledger and this Review Focus. Fix Important/Critical once via meaningful RED→GREEN; record all declines/rulings/costs and deferred Minors. No re-review loop.

Retain source provenance and pending obligations. Required full/slow/Linux verification, normal child lifecycle, true restart/retry, facade/join and full transition completion remain due; no AC/DoD/closure is inherited from a scoped pass.
