# #1915 Completed16 Original-Session Resumption Design

Status: proposed; review required before implementation.

## Intent and existing authority

The user wants the recovered work in #1957 reviewed, repaired and delivered through the normal workflow, beginning with #1919 / #1928. On October 11 the user selected revised source ordering while retaining every verification gate. #1928 remains open while the already-owned repair inputs compose under active parent #1918 in draft #1983.

The accepted Task5 specification requires genuine original-session continuation without repeating completed effects. The current #1915 increment admits authentic completed1–16 histories through fresh original guards, then returns `known-prefix-continuation-unavailable`. It does not run remaining effects. This proposal implements the first remaining-effect increment at exact completed16; it does not represent the whole #1915 story as complete.

The assumed decomposition is intentional: completed1–15 still need their actor/body/board/comment resumption, while completed17–24 belongs to #1923 and ambiguous outcomes to #1925. The new event-body predicate remains separately authorized under #1922. Neither step17 nor step18 writes the issue body or widens the existing body grants.

Success means a new original `moveState` call reads and verifies the existing transition comment, executes the actual original dispatch17 and cache18 programs, preserves completed1–16 byte-for-byte, and truthfully stops before the unavailable step19. Every ordinary pending writer remains fenced. Source qualification does not create a Test, Review, merge or closure receipt.

## Why the current handoff cannot be reused

At source `2a3f4a662107d2dd48bb18cc607ca6be7e92b474`, `writeTransitionCommit` always performs POST before GET. Its result assertion requires the actual live creation and read captures. Calling it during a completed16 restart would duplicate publication.

`repairTransitionCommit` is host-effect fenced. Its already-present result is parsed DATA, without the verified return custody required by the tail. `readMemoryNativeStageTransition` requires a pending step16 intent and actual creation membership, and completes that intent's readback. It cannot authenticate a read of an already-completed16 operation.

The tail additionally checks the actual live original entry, board, sentinel and consistency returns. Those returns cannot be recreated from a saved journal or copied result. A fresh resume execution frame must prove the current completed state without claiming that the old calls ran in the new process.

## Approach and alternatives

**A — Fresh completed16 frame and verified existing-comment read (recommended).** Reuse the original tail algorithms after a distinct current-read protocol establishes new custody. This is the smallest increment that proves actual remaining execution without replaying prior effects.

**B — Reuse the create-and-read route.** Rejected: it repeats the POST or requires fabricating creation membership for an old comment.

**C — Restore saved result memberships and resume the tail.** Rejected: reconstructed DATA would become execution authority, violating the accepted protection contract.

## Admission and lifetime

The original `moveState` invocation privately registers a one-use restart-call token before calling the policy boundary. The boundary requires that actual call token in addition to the unchanged original context. A direct or overlapping public policy call, even with the live caller's context, cannot begin effect resumption. No public function registers tokens or returns a capability.

Under the existing shared interlock, the policy independently observes current authority, reconstructs the full native history and exact known prefix, and runs the real current guard pipeline. Current executor/session, configuration bytes, physical local sources, Git sources, field definitions, guard inventory and assignment must still agree. Caller overrides, transition IDs, accessors or substituted context remain refused before effects.

Only exact completed16 enters this increment. The journal has sixteen completely read-back steps, confirmed board outcome, no compensation or unknown mutation, no unrelated pending source/Plan operation, and an exact whole body/stage/resource/executor vector. The transaction and original clock come from reconstruction; the caller does not supply them and the restart does not generate replacements.

Core creates a separate private resume frame bound to the live original caller, held policy origin, capability, admitted snapshot, reconstructed effective operation and current source captures. It does not populate historical actor, board, sentinel, original transition-result or creation maps. Generated transition fields live on a private saga context, leaving captured caller descriptors unchanged.

The frame exists only during that original call and shared lock. Every awaited boundary rechecks caller descriptors, current sources, resource state and actual returned inputs/results. A cancellation joins running work before reporting; synchronous final cleanup expires all frame, call, read and leaf memberships. Copied tuples and expired inputs never qualify.

## Existing-comment read and genuine result custody

Add a fixed internal existing-transition read protocol across Core, store and `transition-commit.mjs`:

1. Independently reconstruct the expected step16 identity, request and comment bytes from the complete journal and retained operation.
2. Acquire the existing timing/comment resource lock under the shared interlock. Read the current private selected comment and whole comment census. Require exactly one matching identity with exact node identity and body bytes; reject duplicates, disappearance, changed bytes, incompatible current resources and ambiguous transport.
3. Execute the genuine GET/parser path through `readExistingTransitionCommit(ctx, input)`. The input belongs to a distinct private existing-read invocation, not to the historical create call. Do not POST, persist a new intent, change the completed readback or alter completed resources.
4. Register the returned verified result only after the actual current read and complete record/body comparison. A distinct comparison-only `assertExistingNativeTransitionResult` requires the actual invocation and current return. The original create-and-read assertion continues to require its creation capture.
5. Keep request, response and result comparisons live through tail execution and partial reporting. A late accessor or substitution refuses without invoking the getter or starting further reads/writes.

No parsed comment, journal decoder output, status report or returned readiness flag alone can select an effect sink. Current read custody and the exact private frame are required together.

## Original tail execution and exact progress

`tailCurrent` validates either the existing original execution frame or the distinct completed16 resume frame. The resume branch checks its genuine existing-read result and all current frame/source invariants rather than accepting historical return DATA. The original branch and creation requirements remain intact.

Reuse `runPostCommitTail`, the frozen `DEFAULT_TAIL_STEPS`, original dispatch17 and cache18 leaves, actual operation/return custody and resource lock ordering. There is no alternate tail implementation or injected dependency. Core/store comparison readers may recognize a live resume token separately from original first-entry tokens; they cannot register one from DATA or pretend to create the original stage again.

The policy's admission-only unchanged-snapshot check gains an explicit private execution-phase branch. Only Core-derived exact step17/18 intent/effect/readback snapshots, sealed immediately before their genuine operations, may advance it. Full body/stage/resource equality remains required at each boundary; unrelated changes refuse. The held policy state stays pending and ordinary `evaluateRevisionPolicy` and `withRevisionConsumer` remain blocked.

After cache18 completes, the original sequence reaches the unavailable step19 and stops under its existing fence. The report exposes only currently verified completed facts and a failed/partial result, never whole-transition success. It does not repeat dispatch17 or cache18 after they have completed in another invocation; admitting already-completed17/18 remains outside this increment.

## Source boundaries

| File                                                                                                | Owned change                                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/lib/move-state/move-state-core.mjs`                                           | One-use actual-call custody, distinct completed16 frame, fixed existing-read invocation, tail frame comparison and exact progress snapshots     |
| `scripts/task-tracker/lib/criteria-revision/policy.mjs`                                             | Preserve ordinary pending fence; require actual restart call; hand off to private exact execution-phase progress under the same interlock       |
| `scripts/task-tracker/lib/criteria-revision/store.mjs`                                              | Fixed locked existing-comment/census read without intent, POST or readback mutation; recognize only live resume custody for original17/18 sinks |
| `scripts/task-tracker/lib/move-state/transition-commit.mjs`                                         | Distinct actual existing-read/parser/result custody; retain original create-result requirements                                                 |
| `scripts/tests/integration/task-tracker/lib/native-stage-continuation-fixture.mjs` and test helpers | Authentic captured16 fresh restart and live refusal qualification; preserve all original cases/assertions                                       |

No generic policy exception, body authorization change, lifecycle state jump, test removal, increased budget, production activation or extra issue chain belongs here.

## Qualification and delivery boundary

First observe the genuine captured16 restart failing because remaining continuation is unavailable. Then prove the new behavior through the original fixture, not a reconstructed synthetic membership or fake tail:

- Fresh original restart verifies the existing comment with no POST and no duplicate publication, performs only the actual new17/18 work, preserves all sixteen prior step records, resource identities and retained clock, and stops truthfully before19. Current resources change only as the original17/18 operations prescribe; cache18 may update its declared active-task bytes.
- Caller context and physical source drift, direct/overlapping public calls, copied or expired read results, late request/response/result accessors, duplicate/changed/missing comments and incompatible whole resources refuse without unauthorized mutation or getter invocation.
- Exact completed17 and incomplete/unknown/compensated prefixes remain excluded; completed1–15 retain their current admission-only frontier.
- Inject interruption before/after each new17/18 intent/effect/readback boundary. Retain the exact landed prefix and verified partial facts, release resource locks, and leave the transaction pending without a false success claim.
- Preserve the existing known-prefix, policy/interlock, public-stage, original cache/dispatch, partial-reporting, complete recovery and vertical-saga cases. The full recovery cases remain failed until their owned later repairs compose.

The implementation plan must supply the exact original-fixture cases, commands, red/green expectations, actual API comparisons and one fresh final review before code begins. Keep every file/semantic-section budget at600000ms, focused1200s and sandbox45 minutes; at most four isolated native processes. Update source coordinates only if needed while retaining complete discovery inventories.

All mandatory exact-head Linux/aggregate checks and normal child Test, Review, delivery and closure remain required. #1928 and #1957 stay open and their branches protected until their own verified disposition. This design does not approve blanket merging #1983 or claim #1915 complete.

## Review decision

Approval accepts approach A and this completed16-only contract, permitting the implementation plan to be written. The plan remains subject to its normal review and execution-method handoff. Approval grants no new event-body predicate or verification waiver.
