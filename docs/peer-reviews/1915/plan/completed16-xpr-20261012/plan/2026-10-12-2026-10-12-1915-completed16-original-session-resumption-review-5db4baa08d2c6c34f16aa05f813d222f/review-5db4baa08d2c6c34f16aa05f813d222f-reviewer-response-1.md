<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5db4baa08d2c6c34f16aa05f813d222f"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md"
artifact_commit: "942428e7d3f8ccfcd520df4d4ef77b307e21f637"
artifact_blob: "1fcf3cb2254c4db1a5e4c74b2f4e516660c4768e"
artifact_digest: "sha256:9be27c5baac14c76c879634f7a96bb0e2005d6a8124d3b608bd827f7ecd62ff7"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a2ce79750eb9d215757281b766d25d98c5e3b065b3f573e63f17875823203b8a"
  identity_source: "runtime"
started_at: "2026-10-12T13:34:18.201Z"
submitted_at: "2026-10-12T13:41:41.324Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the plan against the approved spec
(`docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md`), the
design-approval record and the current worktree source at artifact commit
`942428e7d3f8ccfcd520df4d4ef77b307e21f637`. This was read-only inspection. I ran no
tests, made no Git or GitHub calls and did not edit the artifact. I also did not read
the parallel SPR so this review stays independent.

What I verified as accurate:

- Every verifier file in the command ledger exists. `criteria-revision-transition-recovery.test.mjs`
  is absent, as the plan says. `scripts/maintenance/verify-ci-receipts.mjs`,
  `discoverOriginalCases` and the `test`, `test:slow`, `lint` and `format:check` npm
  scripts all exist.
- Source coordinates are close enough to be accurate within a few lines:
  - Core `assertOriginalNativeStageEntry`/`evaluateOriginalNativeStageRestart`/`moveState` 435–549
  - policy `tryNativeStageOriginalEntry` 257–340
  - store transition 3570–3768, dispatch 3770–3950, cache 4402–4581, partial facts 4583–4664
  - fixture known-prefix block 3175–3368
- The fault mechanism in Task 4 is real. `backend.failBefore`/`failAfter` are live
  setters (`store.mjs:825-832`), and `operation()` (`store.mjs:63-69`) checks before
  the mutation and pushes the effect label before the fail-after throw. So "fail-after
  retains the landed vector" is correct.
- The eight `newStageOperations` labels match the store exactly
  (`store.mjs:3853-3913`, `4505-4570`).
- Step16 `readback` has the shape `{create, read, census}`, and `census` equals the
  reconstructed `afterResources.comments` (`stage-execution.mjs:2649-2656`). That makes
  the Task 1 comparison block structurally correct.
- The Task 1 Step 4 "in-flight store clone boundary" has existing precedent:
  `globalThis.structuredClone` is interposed at fixture lines 1293 and 4492. The store's
  `clone` resolves `structuredClone` at call time. So the post-admission drift
  injection is feasible without a production hook.
- `runPostCommitTail` rethrows under memory scope (`post-commit-tail.mjs:101-102`).
  An interrupted dispatch17 therefore cannot fall through into cache18. This matches
  the plan's interruption semantics.
- `deriveRecordedNativeStagePartialFacts` reads only steps 1–16, so it can produce
  the specified prior-facts shape from a 17- or 18-step journal.

The plan faithfully carries the spec's contract, all four design-XPR suggestions, and
the story-scope and lifecycle boundaries. The problems are in how it integrates with
existing gates that the plan never names. The central tail entry path and the policy's
admission-time closure both hard-require state that the spec forbids recreating. The
plan's task text does not tell the implementer how to get past those gates. It also
leaves two verification obligations without a defined real mechanism. These are
plan-precision defects for an agentic executor. They are not design defects.

## Findings

### R1-F001 — The tail entry gates require first-entry preparation state; the plan only describes a `tailCurrent` branch

Task 2 Step 3 says "`tailCurrent` accepts either its current first-entry frame or the
separate completed16 frame". The existing tail is gated well before and around
`tailCurrent`, by state the spec says must not be recreated:

- `runNativeStageTail` (`move-state-core.mjs:4945-4954`) first calls
  `assertNativeStageTransitionContext(ctx)`. It then refuses unless
  `record.transitionCommentReturned` is set and the journal has exactly 16 steps.
- `assertNativeStageTransitionContext` (`move-state-core.mjs:2870-2888`) reads
  `nativeStagePreparation.getStore()`. It requires all of the following, then calls
  `checkPreparation` (`nativeStagePreparations` map) and
  `assertOriginalNativeBoardResult(record.boardResult, ctx)`:
  - `entryActive`, `stageToken` registered in `nativeStageIntents`
  - `assignedBoardItemDescriptor`, `entryReturned`, `sentinelReturned`
  - `transitionEvidenceDescriptor`, `consistencyReturned`, `consistencyRead`

  These are exactly the "actual live original entry, board, sentinel and consistency
  returns" that the spec ("Why the current handoff cannot be reused") says cannot be
  recreated.
- `tailCurrent` (`move-state-core.mjs:4767-4783`) itself calls
  `assertNativeStageTransitionContext` again. It then calls
  `record.transitionCommentCode.assertOriginalNativeTransitionResult(...)`, which is
  creation custody.
- The store's dispatch and cache sinks reach Core through `originalTailLeaves` and
  `leaf.record`:
  - `readNativeStageTailDispatchIntent` (`move-state-core.mjs:4839-4847`) checks
    `record.stageToken/backend/context` and returns `record.header`.
  - `readNativeStageTailCacheIntent` (`5331-5338`) does the same.
  - `assertNativeStageTailCacheSet` (`5353-5360`) binds the sink to
    `leaf.record.actorIdentity.sid` and `leaf.record.context.executor.worktree`.
- `session-state.mjs` (`assertOriginalNativeStageKanbanWrite`,
  `getNativeStageCachedTask`, `setNativeStageKanbanState`) is part of the cache18 leaf
  path. It is not in the ownership table.

Failure scenario: the implementer follows Task 2 Step 3 literally and adds a branch
only to `tailCurrent`. `runNativeStageTail` then refuses with `original-tail-entry`
before the branch runs, and the Task 2 RED never turns GREEN. Under pressure, the
easiest fix is to install the resume frame as the `nativeStagePreparation` store, or
populate `nativeStageIntents`/`nativeStagePreparations` and the
`*Returned` flags. That is the restored-membership path (approach C) the spec rejects.
It would also pass the positive tests.

### R1-F002 — The policy's admission `check()` closure and its post-evaluate throw sites are not named for the execution branch

The `check` closure in `tryNativeStageOriginalEntry` (`policy.mjs:272-280`) compares
the whole `backend.snapshot` and authority to the admission-time bytes. It is stored
as `originalStageEntry.check`. It is invoked from:

- `assertNativeStageOriginalEntryPolicy` (`policy.mjs:243`), which
  `evaluateOriginalNativeStageRestart` calls repeatedly;
- `originalStageReadState` (`policy.mjs:250`);
- directly after `evaluateOriginalNativeStageRestart` returns (`policy.mjs:327`).

After that `check()`, the policy throws on `final !== state` (`policy.mjs:330`). It
then calls `core.assertOriginalNativeStageEntrySources(ctx)` (`policy.mjs:332`), which
throws a `TypeError` on source drift.

Task 2 Step 4 adds a cursor "execution branch", and Task 3 Step 4 replaces the "final
comparison". Neither says that the existing `check` closure must stop comparing to the
admission snapshot once the frame is admitted, or which of its callers switch to the
cursor. Neither names the `:327` call or the `:332` sources assertion as throw sites
that must become the fresh unverified return for the admitted category.

Failure scenario: the first `native-stage-tail-dispatch-intent-write` changes
`backend.snapshot`. Any later Core call to `assertNativeStageOriginalEntryPolicy`, or
the `:327` `check()`, throws a `revision-conflict` `RevisionPolicyError` from outside
Core's catch. A clean completed18 run then escapes `moveState` as an exception instead
of the exact return contract. Alternatively, source drift detected at `:332` after a
verified report escapes as a `TypeError`. Neither path is addressed by "discard the
computed verified partial".

### R1-F003 — The admission boundary is not pinned, so negative controls lack a fixed throw-versus-exact-return classification

The design defines two outcome classes. Pre-admission refusals throw, or return
`exit: 4` with a phase other than `native-stage-resume` (the predicate in
`native-stage-original-entry-controls.mjs:51-58`). Admitted refusals return the exact
`native-stage-resume` record. Task 4 Step 3 tells the implementer to "distinguish
pre-admission exception controls from admitted exact-return controls". But the plan
never says where admission happens, or which named control falls on which side. Task 1
Step 3, for example, says "refuse non16, changed target/actions, actor mismatch or
missing scope before the read" without saying whether that refusal throws or returns
the admitted record.

Ambiguous cases include:

- target other than `test`
- changed `STATES.test.onEnter`
- actor or provider mismatch at frame creation
- missing stage scope
- direct or overlapping policy calls on ordinal 16
- guard-pipeline failure inside `evaluateOriginalNativeStageRestart`

Failure scenario: the implementer writes the code first, observes which class each
refusal produces, and pins that observation as the expected test result. The plan's own
ledger text forbids exactly this: "do not derive expected output from the same run
under test". It also allows a pre-admission refusal to drift into a `native-stage-resume`
return, which the unchanged `qualifyOriginalEntryRefusals` predicate would then reject.

### R1-F004 — Lock-release proof for refused and interrupted runs has no defined real observable

Task 2 Step 5 and Task 4 Step 2 require proof that each lock is released after clean,
refused and interrupted work. They also require a following authorized operation to
acquire it, "not a fabricated lock token". The relevant facts:

- The locks are private (`m.nativeCheckpointResourceLocks`, timing lock;
  `store.mjs:737`, `1950-1957`, `4439-4451`). They are not in `backend.snapshot`.
- A fresh `createRevisionMemory(snapshot)` starts with fresh locks, so it proves nothing.
- After an interrupted or refused completed16 run, no genuine follow-up operation on the
  same live backend is admissible. Completed17 and incomplete prefixes are excluded, and
  ordinary consumers are blocked by `revision-pending`.

In a clean run, dispatch17 acquiring the timing lock does prove the read lock was
released. But cache18 takes a different resource (`activeTask`), so its acquisition
does not prove the dispatch lock was released. I found no existing integration pattern
that observes lock release; there are no lock-release assertions in the fixture.

Failure scenario: the implementer cannot meet the obligation honestly. They either drop
it silently, add a production lock-inspection hook (forbidden), or assert on a token they
constructed themselves (forbidden by the plan's own text).

## Required changes

1. **R1-F001: Specify the resume frame's path through every tail gate.** In Task 2
   (and the ownership table), enumerate each gate and state its resume branch:
   - `runNativeStageTail` entry
   - `assertNativeStageTransitionContext` (both calls)
   - the creation-custody assertion inside `tailCurrent`, replaced by
     `assertExistingNativeTransitionResult` for resume
   - `beginNativeStageTailSequence`/`assertNativeStageTailSequenceCurrent`
   - `tailLeafCurrent`/`originalTailLeaves` leaf records
   - `readNativeStageTailDispatchIntent`, `readNativeStageTailCacheIntent` and
     `readNativeStageTailCacheSource`
   - `assertNativeStageTailCacheSet`

   State where the resume frame's `stageToken`, `header`, `backend`, `capability`,
   `context`, `actorIdentity` and `sagaContext` live. State the private map they are
   registered in, which must be distinct from `nativeStagePreparations` and
   `nativeStageIntents`. Explicitly forbid installing the resume frame as the
   `nativeStagePreparation` store, and forbid setting the first-entry `*Returned` flags.
   Say whether `session-state.mjs` and the tail-cache leaf modules need no change, or
   add them to the ownership table.
2. **R1-F002: Name the policy closure transition and every admitted-branch throw site.**
   In Task 2 Step 4, state when `originalStageEntry.check` switches from
   admission-snapshot equality to exact landed-cursor comparison (at frame
   registration), and that all three callers (`policy.mjs:243`, `:250`, `:327`) use it.
   In Task 3 Step 4, list `:327`, `:330` and `:332` as the admitted-branch sites whose
   refusal becomes the fresh unverified result. Add one control per site.
3. **R1-F003: Pin the admission point and classify each negative control.** Define
   admission as one concrete event, for example "the Core resume frame is registered
   after the guard pipeline passes". In Task 4 Step 3, add a two-column list: controls
   that must throw or return a non-resume phase, and controls that must return the
   exact admitted record. Cover every control named in Tasks 1–4.
4. **R1-F004: Define a real lock-release observable, or narrow the claim.** Either name
   the concrete fixture-only observer, or reduce the obligation to what can be honestly
   proved and record the remainder as unverified. One candidate observer is the existing
   `Object.getOwnPropertyDescriptors` probe pattern recording the actual
   `releaseMemoryNativeStage{Transition|TailDispatch|Cache}` and `acquire…` call order on
   the live `{backend, token, invocation}` inputs. Dispatch17 reacquiring the timing lock
   in-call can serve as the read-release proof. What can be honestly proved: release
   ordering in clean and interrupted runs through the observer, plus in-call reacquisition.

## Optional suggestions

1. **Reconcile the estimate now.** The completed16 slice is forecast at 12 hours, but
   the whole-story remaining estimate is 14 hours. That leaves about 2 hours for the
   completed1–15 actor/body/board/comment continuation, which the plan itself calls
   still required. The 24-hour decomposition trigger looks likely to fire. Record the
   expected whole-story forecast, and say whether this slice would become a child
   story, so "no new issue is justified" is not contradicted at lifecycle approval.
2. **Pre-decide the test file layout against the 600-second per-file budget.** Task 4
   adds 16 fault subtests and the full negative matrix to the single
   `known-prefix-entry` case, which already runs the full authentic capture. The repo's
   established pattern is one registered file per fault boundary, such as
   `native-stage-board-effect-readback-failAfter.test.mjs`. Decide the split in the
   plan rather than on budget breach, and note the inventory and story-tag
   (`// @story #1915`) updates for any new files or helpers.
3. **Cover the existing read in the fault matrix.** If the new
   `native-stage-existing-transition-read` label is recorded through `operation()`, add
   `failBefore`/`failAfter` on it. This exercises read-lock release on an interrupted
   read and the "refusal before dispatch17" category through a genuine boundary.
4. **Name the injection mechanism for the Task 3 Step 1 final-policy refusal.** Task 1
   Step 4 specifies its observer, but Task 3 Step 1 does not. For example, use the
   existing `structuredClone`/descriptor probe after `readMemoryNativeStagePartialFacts`
   returns, or physical configuration drift detected at `policy.mjs:332`.
5. **Name the existing `originalNativeStageEntries` map.** `moveState` already
   registers a ctx-keyed entry (`move-state-core.mjs:386`, `532-548`), and the existing
   "direct public policy call" control passes because of it. Say that the new one-use
   call object supplements this map. It specifically closes the overlapping same-ctx
   call that ctx-keyed membership cannot.

## Decision

revisions-requested
