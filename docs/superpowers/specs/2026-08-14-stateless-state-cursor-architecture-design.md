# Stateless State Cursor Architecture Design

- **Status:** Review draft
- **Issue:** #1117
- **Blocks:** #937
- **Date:** 2026-08-14

## Summary

AITM will model each lifecycle state as an immutable component containing exactly three ordered active lists:

1. entry-guard validations;
2. action-state steps; and
3. exit-guard validations.

A factory composes the eight state definitions from shared references to stateless guard and action methods, validates their order, and derives previous/next navigation. The resulting state machine is only a container for definitions and topology.

A stateless Cursor executes those definitions. On every invocation it reconstructs task state from durable Git, GitHub issue/Project, receipt, comment, and bound-worktree evidence. It verifies or resumes the first incomplete action step, evaluates the current exit guards and target entry guards, commits an approved boundary crossing, makes the target current, and begins the target action list. No Cursor, action index, or hidden program counter survives the invocation.

The task's stable parking area is the current state's action list. When an action waits, pauses, or fails, the process ends and the task becomes dormant. A later turn, rebind, callback, or explicit resume follows the same reconstruction path.

## Problem

The present architecture has several partially overlapping models:

- state modules declare `entryGuards`, `exitGuards`, and an empty `onEnter` list;
- the current `onEnter` contract describes short, best-effort post-status hooks that cannot refuse or invalidate a transition;
- deep state work is implemented independently in dedicated verbs;
- the combined mutable guard registry is populated by import-time bootstrap;
- the movement host and post-commit tail contain state-specific orchestration and side effects;
- Review already behaves like a resident action, while Test currently performs substantial Test work before the issue has left Develop.

The result is an ownership mismatch. State work, boundary validation, transition persistence, and post-commit infrastructure are not represented consistently. #937 exposed the concrete consequence: Test evidence is presently required to satisfy a Develop exit guard even though Test work should begin only after Test becomes current.

Implementing #937 directly would add another special-case orchestration path and then require replacement when the state/action architecture is corrected. #1117 therefore becomes the prerequisite foundation.

## Goals

- Give every fixed lifecycle state the same three-list component shape.
- Keep all scripts, definitions, registries, guards, and actions stateless across invocations.
- Reconstruct progress exclusively from durable repository and issue evidence.
- Make action execution ordered, verify-first, idempotent, resumable, and crash-safe.
- Keep entry and exit guards separate so states remain semi-autonomous and reorderable.
- Make the Cursor the sole executor of state lists and boundary movement.
- Preserve one canonical ordered state chain while retaining explicitly sanctioned rework edges.
- Migrate Review as the first production resident action without changing its stay-in-Review failure behavior.
- Provide the architectural seam that #937 will use for corrected Develop and Test actions.

## Non-goals

- Implementing Develop or Test action contents, receipts, or guard ownership; #937 owns them.
- Implementing PR/CI orchestration, affected-test selection, scheduled full-suite health, or the `aitm/tia-data` branch.
- Building #680's downstream-configurable open-ended N-state product surface.
- Persisting a Cursor object, action index, daemon, worker session, or hidden workflow database.
- Treating all existing post-commit tail operations as lifecycle action steps.
- Removing existing sanctioned non-adjacent rework movement.

## Terminology

### State definition

An immutable, task-neutral component assembled by the factory. It owns three ordered lists of stable method references:

```js
{
  id: 'test',
  entryGuards: ['test-entry-contiguous', 'test-entry-body-complete'],
  actionSteps: ['test-create-pr', 'test-await-quick-ci', 'test-record-receipt'],
  exitGuards: ['test-exit-receipt-current'],
  previousId: 'develop',
  nextId: 'review',
}
```

The object contains no issue number, current SHA, receipt, cursor position, mutable cache, or action result.

### State machine

The immutable container holding the assembled definitions, their canonical order, and indexed lookup/navigation. It does not execute work and does not store task progress.

### Cursor

An ephemeral executor created for one invocation. It hydrates a task snapshot, resolves the current definition, invokes lists, and requests a concurrency-protected transition commit. It is discarded when the invocation returns.

### Task snapshot

An immutable, provenance-bearing projection of durable evidence required by guards and actions. It is reconstructed rather than resumed from process memory.

### Dormant task

A task whose issue remains in a current state with one or more action steps incomplete, waiting, paused, failed, or stale, while no Cursor process is running.

### onEnter

The semantic event after a state successfully becomes current. `onEnter` is not a fourth configurable list. The Cursor handles the event by starting or verifying the target state's `actionSteps`.

## Authority and statelessness

Durable workflow facts come from the repository and its GitHub records:

- Project Status and issue lifecycle markers identify the current state;
- Git refs, HEAD, ancestry, logs, and commit messages identify code provenance;
- issue body records, comments, check runs, and receipts identify completed external work;
- the bound worktree state file provides local session/binding evidence;
- exact-SHA fingerprints determine whether reusable evidence remains fresh.

The implementation may batch or memoize reads within one invocation. Such data is an invocation-local optimization, not workflow state. The Cursor rehydrates after any action that can change Git or issue evidence, immediately before boundary validation, and after a successful transition before starting target actions.

Every snapshot field records provenance sufficient for the consumer to decide whether it is authoritative and fresh:

```js
{
  currentState: {
    value: 'test',
    source: 'github-project-status',
    revision: 'PVTI-or-body-version',
  },
  headSha: {
    value: 'abc123',
    source: 'git-head',
  },
  testReceipt: {
    value: receipt,
    source: 'issue-record',
    fingerprint: 'exact-head-fingerprint',
  },
}
```

Required evidence that is missing, contradictory, stale, or insufficiently attributable fails closed. Reconciliation remains explicit; the Cursor does not silently choose a convenient source.

## State registries and factory

The design uses four definition inputs:

1. an ordered state specification;
2. an entry-guard method registry;
3. an action-step method registry; and
4. an exit-guard method registry.

Each method registry holds one canonical stateless implementation per stable ID. Multiple states may reference the same ID or distinct parameterized instances produced by a shared factory. State specifications contain IDs, not copied method bodies or task-specific closures.

The state factory:

1. validates that the configured state IDs are unique;
2. validates that every referenced method ID exists in the correct registry;
3. rejects duplicate method IDs within one state's list unless explicitly supported by a parameterized reference;
4. resolves ordered shared references;
5. derives `previousId` and `nextId` from the canonical order;
6. freezes every list, definition, index, and exported container; and
7. returns an ordered array plus an ID map.

An array and ID map provide doubly linked semantics without mutable cyclic object pointers. Reordering the configured array changes canonical forward/previous navigation without editing Cursor logic.

## Topology

The canonical forward chain remains:

```text
Backlog ↔ Refine ↔ Ready for Planning ↔ Plan ↔ Develop ↔ Test ↔ Review ↔ Done
```

Canonical progression uses `nextId`. Canonical adjacent reversal uses `previousId` where policy permits it.

Existing non-adjacent rework destinations, such as Review to Develop, are explicit policy edges layered on the ordered chain. They do not change the definition container into an arbitrary graph, and the Cursor never infers such edges from list position.

## Guard contract

Entry and exit guards are separate because ownership belongs to different state components:

- the current state owns the requirements for leaving it;
- the target state owns the requirements for entering it.

Each guard is a quick, read-only validation:

```js
{
  id: 'develop-exit-action-complete',
  async validate(snapshot, context) {
    return { allowed: true };
    // or { allowed: false, blockers: ['...'] }
  },
}
```

Guards may read already-hydrated evidence or perform a narrowly bounded authoritative refresh through the repository adapter. They do not run state work, mutate checkboxes, create receipts, create pull requests, run CI, repair issue bodies, or update board status.

Entry guards are evaluated only when attempting to enter their owning state. Resuming an action in the already-current state does not replay that state's entry guards.

## Action-step contract

Action steps are ordered, stateless methods with verify-first semantics:

```js
{
  id: 'test-create-pr',

  async verify(snapshot, context) {
    return { status: 'complete', evidence };
    // or { status: 'incomplete', reason }
  },

  async run(snapshot, context) {
    return { status: 'complete', evidence };
    // or waiting | paused | failed
  },
}
```

The closed outcome set is:

- `complete` — durable, fresh evidence proves the step complete;
- `waiting` — external work is in progress or awaiting a callback/turn;
- `paused` — execution intentionally yielded without a failure;
- `failed` — the step produced blockers or diagnostics and remains incomplete.

The Cursor processes action steps in order:

1. call `verify` against the current snapshot;
2. when complete, continue without calling `run`;
3. when incomplete, call `run`;
4. rehydrate when `run` may have mutated durable evidence;
5. verify the step again before treating it as complete; and
6. stop dormant on waiting, paused, failed, or unverifiable results.

No action index is persisted. On every invocation the Cursor scans from the beginning and skips steps whose evidence remains fresh. This makes retries and crash recovery idempotent.

Agentic or human work can be represented by steps whose `run` returns instructions/waiting and whose `verify` detects the resulting repository evidence. A long-lived process is not required.

## Cursor execution

The forward execution algorithm is:

```js
async function executeCursor({ issue, cwd, trigger }) {
  let snapshot = await repository.hydrate({ issue, cwd });
  const current = machine.get(snapshot.currentState.value);

  const actionResult = await actions.resume(current.actionSteps, snapshot, { trigger });
  if (actionResult.status !== 'complete') return dormant(actionResult);

  snapshot = await repository.hydrate({ issue, cwd });

  const exitResult = await guards.validate(current.exitGuards, snapshot);
  if (!exitResult.allowed) return dormantAt(current, exitResult);

  const target = machine.next(current.id);
  const entryResult = await guards.validate(target.entryGuards, snapshot);
  if (!entryResult.allowed) return dormantAt(current, entryResult);

  await transition.commit({ issue, from: current.id, to: target.id, snapshot });

  snapshot = await repository.hydrate({ issue, cwd });
  return actions.resume(target.actionSteps, snapshot, { trigger: 'onEnter' });
}
```

The Cursor may return after starting the target action, or it may continue until that action becomes waiting, paused, failed, or complete. It must cap traversal to the finite state count and reject a repeated state within one invocation so an incorrect topology or self-loop cannot create an execution loop.

## Boundary and transition consistency

A boundary crossing is approved in this order:

```text
current action complete
→ current exit guards allow
→ target entry guards allow
→ status/evidence commit
→ target becomes current
→ onEnter starts/verifies target actions
```

The guard snapshot and status write must be protected from time-of-check/time-of-use races. The implementation must use one of these equivalent contracts:

- evaluate the final boundary snapshot and commit while holding the issue-scoped lock; or
- carry authoritative revision tokens from hydration and reject the commit if any token changed.

The status/evidence commit owns the facts required to reconstruct successful entry, including the board Status and required transition markers/timing evidence. A partially observed remote write is reconciled by read-back before reporting success or retrying.

Post-commit cache and synchronization failures do not retroactively report the committed move as failed. They remain separately classified infrastructure results unless a specific operation is deliberately promoted into an action step with durable completion semantics.

## onEnter, dormancy, and recovery

After a task successfully enters a new state, that state becomes current and the Cursor handles `onEnter` by beginning its prescribed action steps.

If the process stops before invoking the first target action, the next invocation hydrates the new Status, finds no fresh completion evidence, and begins the first incomplete target step. If the process stops after an external side effect but before recording a local return value, verify-first execution discovers the durable external result and avoids duplication.

When an action waits, pauses, or fails:

- the current Status does not change;
- completed step evidence remains durable;
- blockers or waiting correlation data are written to the appropriate repository record;
- the Cursor returns and no worker remains live; and
- a later invocation reconstructs and resumes the same action list.

Wake-up sources all call the same stateless entry point:

- a new agent turn or response;
- binding the issue into a worktree;
- an explicit resume/state verb;
- a CI or provider callback; or
- a scheduled reconciler.

## Transition infrastructure versus lifecycle actions

The three-list model does not require every side effect near `move-state` to become an action step.

Transition infrastructure includes operations needed to persist or project movement safely, such as:

- authoritative Status write and read-back;
- entry/move-complete markers and phase evidence required for reconstruction;
- issue-lock or optimistic-revision enforcement;
- process-local cache refresh; and
- best-effort synchronization projections.

Lifecycle actions are state-owned work whose completion matters to the task and can be durably verified and resumed. Examples include Develop validation, Test PR/CI, Review agent validation, and Done dependent release when that release is part of completion policy.

The migration must classify each existing tail operation explicitly. Placement is determined by semantics, not merely by which state name appears in the current code.

## Review pilot

Review is the first migrated action because it already demonstrates the required behavior:

1. Test exit and Review entry guards permit the boundary;
2. the board moves to Review;
3. the agent-review action runs;
4. an objection writes durable failure evidence and leaves the issue in Review; and
5. a later Review invocation retries in place.

The migration places that behavior behind the shared action-step/Cursor contract. It must not move the review gate back before the boundary, rerun Review entry guards on an in-place retry, or demote automatically on an objection.

## Compatibility and migration

The implementation is staged to keep the repository continuously testable:

1. characterize existing topology, guard decisions, movement, Review behavior, and post-commit ordering;
2. add method registries and the pure state factory behind compatibility exports;
3. add task snapshot and Cursor interfaces without routing production verbs;
4. route guard lookup through factory-built definitions while preserving existing `runGuards` results;
5. migrate Review to the shared action contract;
6. route sanctioned movement/orchestration entry points through the Cursor or thin adapters;
7. remove superseded import-time/bootstrap and duplicated order knowledge only after parity is proven; and
8. update architecture/workflow documentation.

Compatibility adapters may retain existing public function names during the migration, but they cannot preserve the old meaning of `onEnter` as both a best-effort hook list and a resident action list. The two concepts must have distinct names and contracts.

## Relationship to #937

Issue #937 is blocked by #1117 and will have its scope revised after this specification is reviewed. It will consume, not recreate, the following #1117 outputs:

- immutable three-list state definitions;
- shared guard/action method references;
- repository snapshot hydration;
- verify-first resumable actions;
- Cursor boundary ordering and concurrency protection;
- target `onEnter` action invocation; and
- dormant/rebind/resume behavior.

Issue #937 will then own:

- Develop action steps for implementation completion, formatting, affected tests, and AC receipts;
- Develop exit guards that consume Develop evidence rather than Test proof;
- Test action steps for PR creation and exact-head quick CI;
- Test waiting/infrastructure retry behavior while parked in Test;
- explicit source-rework demotion behavior; and
- direct verb/promote parity through the shared Cursor.

The future TIA design changes which checks the Test action requests and records. It does not change Cursor traversal or state ownership.

## Failure matrix

| Failure point                       | Durable current state     | Cursor result              | Next invocation               |
| ----------------------------------- | ------------------------- | -------------------------- | ----------------------------- |
| Snapshot cannot establish authority | Existing state            | Failed closed              | Rehydrate or reconcile        |
| Current action waiting              | Existing state            | Dormant waiting            | Verify external progress      |
| Current action paused               | Existing state            | Dormant paused             | Resume first incomplete step  |
| Current action failed               | Existing state            | Dormant failed             | Verify fix, rerun step        |
| Current exit guard rejects          | Existing state            | Boundary refused           | Reverify actions, retry exit  |
| Target entry guard rejects          | Existing state            | Boundary refused           | Rehydrate, retry entry        |
| Status commit not confirmed         | Reconciled from read-back | Indeterminate/refused      | Reconcile before retry        |
| Crash after confirmed status commit | Target state              | Process absent             | Rehydrate target, run actions |
| Target action waiting/failed        | Target state              | Dormant                    | Resume target action          |
| Post-commit projection fails        | Target state              | Move succeeds with warning | Repair projection separately  |

## Testing strategy

New focused suites:

- `scripts/tests/unit/task-tracker/states/state-factory.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs`

Expanded characterization suites:

- `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs`
- existing guard registry/bootstrap parity tests;
- existing move-state atomicity, tail-isolation, and concurrency tests; and
- existing promote/review/close orchestration tests.

Required behaviors include:

- exact three-list immutable shape for all eight states;
- shared reference identity without task-specific mutation;
- previous/next derivation and explicit exceptional edges;
- reconstruction with no persisted action index;
- verify-first step skipping and stale-evidence rerun;
- dormant waiting, paused, and failed outcomes;
- action completion before exit validation;
- source exit before target entry;
- no status write on either refusal;
- target action only after confirmed entry;
- crash recovery immediately after commit;
- no replay of target entry guards on in-state resume;
- Review objection remains in Review; and
- compatibility parity for existing sanctioned movement.

## Alternatives considered

### Implement #937 before #1117

Rejected. It would require a Develop/Test-specific orchestration path and then migrate it into the Cursor architecture, duplicating work and increasing transition risk.

### Implement the original #1117 literally

Rejected. The original issue treated best-effort post-commit hooks as state actions. That would formalize the same mismatch that #937 exposed and could move atomic transition evidence into a non-blocking tail.

### Persist a Cursor or action index

Rejected. It creates another state authority, introduces drift/recovery work, and is unnecessary because ordered verify-first actions can derive progress from repository evidence.

### Use mutable object-to-object linked-list pointers

Rejected. An ordered immutable array plus ID map is simpler to freeze, validate, serialize, inspect, and reorder while retaining constant-time previous/next navigation.

### Collapse entry and exit guards into transition guards

Rejected. Separate boundaries preserve state ownership and allow the ordered state chain to be rearranged without rewriting one monolithic edge registry.

## Review focus for Claude

Please challenge the specification on these points:

1. Does the immutable three-list definition/factory design preserve per-state autonomy without creating unnecessary registry indirection?
2. Is an ordered array plus ID map the right concrete representation for doubly linked semantics and explicit rework edges?
3. Is the task snapshot authority/freshness model sufficient to keep scripts stateless while avoiding excessive GitHub reads?
4. Does verify-first action execution cover interruption, external waiting, stale exact-SHA evidence, and duplicate-side-effect prevention?
5. Is the proposed guard/commit concurrency boundary strong enough to eliminate time-of-check/time-of-use movement races?
6. Are transition infrastructure and lifecycle action steps separated at the correct semantic boundary?
7. Does the Review pilot exercise enough of the abstraction before #937 migrates Develop and Test?
8. Which existing compatibility surfaces are most likely to make this XL scope unsafe as one implementation story?

## Decision

Proceed with #1117 as the prerequisite stateless Cursor foundation. Keep the state machine as an immutable definition/topology container, reconstruct task progress from repository evidence on every invocation, and use Review as the first resident-action migration. Keep #937 blocked until #1117 completes, then revise #937 to the Develop/Test policy and evidence implementation on this shared foundation.
