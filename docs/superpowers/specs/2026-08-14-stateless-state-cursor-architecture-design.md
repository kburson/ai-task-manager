# Stateless State Cursor Architecture Design

- **Status:** Review draft R2
- **Issue:** #1117
- **Blocks:** #937
- **Date:** 2026-08-14

## Summary

AITM will model each lifecycle state as an immutable component containing exactly three ordered active lists:

1. entry-guard validations;
2. action-state steps; and
3. exit-guard validations.

A factory composes the lifecycle state definitions from direct, shared references to stateless guard and action methods. It validates the definitions against the canonical `lifecycle-policy` state IDs and transition edges; it does not derive a competing transition policy. The resulting state machine is only a frozen container for definitions and policy-backed navigation.

A stateless Cursor executes those definitions. On every invocation it reconstructs task state from durable Git, GitHub issue/Project, receipt, comment, and bound-worktree evidence. It verifies or resumes the first incomplete resident action step. Only a movement trigger with an explicit policy-valid target may then challenge the current exit and target entry guards and cross at most one boundary. After a confirmed crossing, the target is current and its resident action list begins. No Cursor, action index, or hidden program counter survives the invocation.

The task's stable parking area is the current state's resident-action list. When an action waits, pauses, or fails, the process ends and the task becomes dormant. A later turn, rebind, callback, or explicit resume follows the same reconstruction path.

## Problem

The present architecture has several partially overlapping models:

- state modules declare `entryGuards`, `exitGuards`, and an empty `onEnter` list;
- the current `onEnter` contract describes short, best-effort post-status hooks that cannot refuse or invalidate a transition;
- deep state work is implemented independently in dedicated verbs;
- the combined mutable guard registry is populated by the `state-bootstrap.mjs` import-time walker, while `guard-bootstrap.mjs` is only its deprecation shim;
- the movement host and post-commit tail contain state-specific orchestration and side effects;
- Review already behaves like a resident action, while the `develop-exit-sandbox-proof` and `develop-exit-commit-trail-head` guards currently require proof that belongs to the planned Test workflow before the issue has left Develop.

The result is an ownership mismatch. State work, boundary validation, transition persistence, and post-commit infrastructure are not represented consistently. #937 exposed the concrete consequence: Test evidence is presently required to satisfy a Develop exit guard even though Test work should begin only after Test becomes current.

Implementing #937 directly would add another special-case orchestration path and then require replacement when the state/action architecture is corrected. #1117 therefore becomes the prerequisite foundation.

## Goals

- Give every lifecycle state returned by `stateIds()` the same three-list component shape.
- Keep all scripts, definitions, registries, guards, and actions stateless across invocations.
- Reconstruct progress exclusively from durable repository and issue evidence.
- Make action execution ordered, verify-first, idempotent, resumable, and crash-safe.
- Keep entry and exit guards separate so states remain semi-autonomous and reorderable.
- Make the Cursor the sole executor of state lists and the sole requester of boundary movement through the shipped `moveState(ctx)` primitive.
- Preserve one canonical ordered state chain while retaining explicitly sanctioned rework edges.
- Migrate Review as the first production resident action without changing its already-shipped stay-in-Review failure behavior.
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

An immutable, task-neutral component assembled by the factory. The architecture standardizes on `id`; compatibility adapters expose the shipped `name` property until callers migrate. It owns three ordered lists of direct, stable method references:

```js
{
  id: 'test',
  entryGuards: [contiguityEntryGuard, bodyGatesEntryGuardTest],
  residentActions: [testCreatePr, testAwaitQuickCi, testRecordReceipt],
  exitGuards: [testExitReceiptCurrentGuard],
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

### Resident actions

`residentActions` is the new name for the state-owned work performed while that state is current. After a state successfully becomes current, the Cursor starts or verifies this list. `onEnter` remains reserved for the legacy best-effort hook/tail contract until that contract is removed; it is neither an alias nor a fourth configurable list.

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
    source: 'move-completion-reconciliation',
    signals: {
      statusState: 'test',
      sentinelState: 'test',
      entryMarkerPresent: true,
      exitRowPresent: true,
      entryRowPresent: true,
    },
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

Required evidence that is missing, stale, or insufficiently attributable fails closed. Contradictory state evidence is interpreted using the shipped move-saga reconciliation rules below rather than a blanket contradiction failure.

### Current-state reconciliation

The snapshot records all five signals used by `isMoveComplete`, not only Project Status:

- `sentinelState` from `aitm-move-complete`;
- `statusState` from the live Project Status;
- `entryMarkerPresent` for the intended target;
- `exitRowPresent` for the same shared transition timestamp; and
- `entryRowPresent` for that timestamp.

It also records `lastKnownState` from `aitm-last-known-state`. The completed current state is the target only when `isMoveComplete({ ...signals, target })` succeeds. Marker-ahead-of-board is an expected, recoverable mid-saga condition after entry markers are stamped and before Status confirms; a failed Status write compensates by rolling the marker back. Status-at-target without the matching sentinel/evidence means the move is incomplete and must be replayed to converge, not silently accepted. Sentinel/status/marker disagreement after the saga post-condition is genuine drift and returns exit 8.

`/task reconcile backfill` repairs missing historical entry evidence without selecting a different current state. `/task reconcile accept-live` is the explicit human/operator decision to accept the live board when durable sources genuinely diverge. The Cursor reports the appropriate reconcile command and never performs either policy choice implicitly.

## State definitions and factory

State modules import guard and resident-action objects directly. Multiple states may share the same frozen object reference or use named parameterized instances from a shared factory. Definitions never use imperative `register()` calls and contain no copied method bodies or task-specific closures.

The state factory:

1. validates that the configured state IDs are unique;
2. normalizes aliases through `normalizeStateId` and rejects duplicate normalized state IDs;
3. validates every list member's contract and rejects duplicate method IDs within one list;
4. checks definition order and membership against `stateIds()`;
5. validates every policy edge through `forwardTarget`, `backwardTargets`, and `validateExecutableTransition`;
6. freezes every list, definition, derived method-ID index, state-ID index, and exported container; and
7. returns an ordered array plus an ID map.

The method-ID index is derived from the direct references the factory already walked; it is for diagnostics and lookup compatibility, never an input authority. The ordered array and ID map provide inspectable linked-list semantics without mutable cyclic pointers, while `lifecycle-policy` remains the sole transition authority.

## Topology

The canonical forward chain remains:

```text
Backlog → Refine → Ready for Planning → Plan → Develop → Test → Review → Done
```

Forward navigation delegates to `forwardTarget`. Reverse navigation delegates to `backwardTargets`; it is intentionally not the inverse of every forward edge.

| From               | Forward target     | Sanctioned reverse targets |
| ------------------ | ------------------ | -------------------------- |
| Backlog            | Refine             | none                       |
| Refine             | Ready for Planning | Backlog                    |
| Ready for Planning | Plan               | Backlog                    |
| Plan               | Develop            | Ready for Planning         |
| Develop            | Test               | none                       |
| Test               | Review             | Develop                    |
| Review             | Done               | Develop, Test              |
| Done               | none               | none                       |

The table is explanatory; executable truth stays in `lifecycle-policy/executable-transitions.mjs`. Movement intent is resolved once through `computeTransitionPlan({ fromState, toState, flags })`, which delegates ordinary matrix decisions to lifecycle policy while preserving the shipped `force`/`supersede` bypass and no-op rules. The Cursor never infers an exceptional edge from array position or recreates this plan inline.

## Guard contract

Entry and exit guards are separate because ownership belongs to different state components:

- the current state owns the requirements for leaving it;
- the target state owns the requirements for entering it.

Each guard preserves the shipped contract and is a quick, read-only validation:

```js
{
  id: 'develop-exit-action-complete',
  async run(context) {
    return { ok: true, warn };
    // or { ok: false, reason, blockers, warn }
  },
}
```

`reason` remains the canonical CLI refusal string; `blockers` is an optional structured list; `warn` is non-blocking. A thrown or malformed result is coerced to a refusal exactly as `runGuards` does today. Guards may read hydrated evidence or perform a narrowly bounded authoritative refresh through the repository adapter. They do not run state work, mutate checkboxes, create receipts, create pull requests, run CI, repair issue bodies, or update board status.

Both lists are evaluated and all refusals and warnings are aggregated: current exit guards first, then target entry guards. There is no refusal short-circuit. The mutable `refinementPlan` context side channel is retired behind a compatibility adapter: a guard may return `derived: { refinementPlan }`, and the aggregator folds it into an immutable `snapshot.derived` replacement passed to the transition host. During migration, the adapter mirrors that value to the legacy context only for existing callers.

Entry guards are evaluated only when attempting to enter their owning state. Resuming an action in the already-current state does not replay that state's entry guards.

## Resident-action contract

Resident actions are ordered, stateless methods with verify-first semantics. Every externally mutating action declares how to record and resolve a durable correlation key, such as a branch name, the PR head SHA used at creation time, a check-run name plus submitted SHA, or a receipt ULID:

```js
{
  id: 'test-create-pr',

  async verify(snapshot, context) {
    const correlation = snapshot.actionRecord?.correlation;
    return { status: 'complete', evidence };
    // or { status: 'incomplete', reason }
  },

  async run(snapshot, context) {
    const correlation = {
      kind: 'pull-request-head',
      value: snapshot.headSha.value,
    };
    const intent = await context.withCorrelationIntent(
      { stateVisitId: snapshot.stateVisitId, actionId: this.id, correlation },
      async (winner) => {
        // The short intent lock revalidates the visit immediately before this call.
        await context.pullRequests.create({ idempotencyKey: winner.correlation });
        return winner;
      }
    );
    return { status: 'complete', correlation: intent.correlation, evidence };
    // or { status: 'waiting', correlation, deadline }
    // or paused | failed
  },
}
```

The closed outcome set is:

- `complete` — durable, fresh evidence proves the step complete;
- `waiting` — external work is in progress or awaiting a callback/turn and includes a correlation key plus an ISO deadline;
- `paused` — execution intentionally yielded without a failure;
- `failed` — the step produced blockers or diagnostics and remains incomplete.

The correlation candidate is captured and offered as an intent before `run` initiates the effect. `withCorrelationIntent` takes a short issue lock, either appends the first intent for `(stateVisitId, actionId)` or reads the verified existing open intent, then rehydrates and revalidates that exact visit immediately before invoking the provider callback. A visit mismatch returns `paused: stale-state-visit` without invoking the callback. The lock is released after provider submission/read-back, not held while waiting for completion. Concurrent Cursors therefore use the same authoritative provider idempotency key even when their candidates differ. Later invocations read the winning record first; they never recompute identity from a volatile live field. An action whose effect cannot be discovered by its correlation key is invalid.

Action progress is an append-only, hash-chained issue-comment ledger. The issue body stores only a bounded current-visit head anchor:

```text
<!-- aitm-resident-action-ledger-head visit="<stateVisitId>" audit="<comment-id>:sha256:<hex>" actions="<base64url-map>" -->

<!-- each protected event issue comment -->
AITM resident-action evidence. Do not edit or delete this comment.
Use `npx aitm action-ledger reconcile #N` if correction is required.
<!-- aitm-resident-action-event id="<deterministic-hash>" data="<base64url-json>" -->
```

The decoded `aitm.resident-action-event/v1` record contains `eventId`, `previousCommentId`, `previousHash`, `actionPreviousCommentId`, `actionPreviousHash`, `issue`, `state`, `stateVisitId`, `actionId`, `attemptId`, `phase`, `correlation`, `ts`, optional `deadline`, and optional evidence fingerprint. `stateVisitId` is derived from the exact current `aitm-entered-<state>-N` visit marker and its timestamp after move completion; it is not merely the state name or a process-local counter.

`attemptId` is the one-based attempt ordinal for `(stateVisitId, actionId)`. Under the short issue lock, the appender reads the current action head: no head derives attempt 1; an open head reuses its ordinal; and a closed `failed` head derives the next ordinal. Two writers therefore cannot both create a distinct attempt N. `eventId` is the SHA-256 hash of the canonical `(repository, issue, stateVisitId, actionId, attemptId, phase)` tuple. Exact retries recompute the same ID and no-op after byte-for-byte read-back verification.

The head's `actions` value is a canonical map from each action ID in the current immutable state definition to its latest `{ commentId, hash, attemptId, phase }`; its serialized size is capped at 8 KiB and validated against the factory's bounded action count before the state definition is accepted. The `audit` pair links the global history without requiring hot-path traversal. On a new state visit, the appender archives the prior map in the first event and replaces it with the new visit's bounded map. The issue-body cost is therefore bounded independently of visits and attempts. Each event comment is capped at 4 KiB; large evidence stays in its existing receipt/comment artifact and the event stores only a fingerprint.

The head uses a new `ledger-head` body invariant, not the presence-only `single` kind. Generic body mutations and `gh-edit-guard` must preserve its exact bytes. Only `advanceActionLedgerHead` may change it, under the issue lock, after verifying that the new event's global predecessor equals the exact current `audit` pair, its action predecessor equals the exact current action head, and its attempt/phase transition is monotonic. A stale, regressing, or non-advancing replacement is refused. The update is read-back verified through `mutateIssueBody`/`versionedWriteBody`.

Appending an event creates and read-back-verifies the comment before advancing the head. Crash recovery scans comments newer than the recorded audit comment, newest first, within a configured page budget; it accepts only the deterministic event whose global and action predecessors equal the recorded heads, then completes the head advance. A first append establishes and verifies a genesis head before creating the event, so recovery never has to guess an unknown initial predecessor. Read-only hydration reports an orphan but writes nothing. A write-authorized Cursor repairs it; exhaustion of the orphan-search budget returns `paused: ledger-orphan-search-budget` with the explicit reconcile command.

The managed command guard rejects `gh issue comment` and `gh api` edit/delete operations when the target comment contains an AITM resident-action event or correction marker; an ambiguous `--edit-last`/`--delete-last` is refused unless a preflight proves the selected comment is not protected. This is defense in depth, not a claim that the GitHub web UI is immutable. Every event comment includes the visible warning above. Missing or altered current evidence fails closed, but it has a named repair path: `npx aitm action-ledger reconcile #N --accept-live --reason <text> --approved-by <human>`.

`action-ledger reconcile` is a standalone maintenance command, distinct from movement `/task reconcile`; it never writes Status, movement markers, or transition timing. It runs under the issue lock, performs an explicitly paginated full audit, and requires declared human approval. It never fabricates or recreates deleted event bytes. It appends an `aitm.resident-action-ledger-correction/v1` comment containing the prior head, last verifiable ancestor, missing/altered comment IDs and hashes, operator, reason, timestamp, and fingerprints of the live provider/Git/receipt evidence inspected. It then advances the protected head to a new correction baseline and marks affected action heads `unproven`; normal verify-first execution must re-establish completion. The correction remains linked to the abandoned head for audit. This is the only path allowed to authorize live evidence after a damaged chain.

Normal hydration does not enumerate the issue timeline. It reads the bounded head, point-fetches the latest comment for only the current action, and follows at most the three links in that attempt (`intent`, optional `waiting`, terminal phase). Prior attempts and visits are irrelevant to execution and are traversed only by the explicit audit/reconcile command or scheduled integrity audit. Per phase, the acknowledged network cost is lock acquisition, event-comment creation, comment read-back, monotonic body-head update, and body read-back; stories B and C include this cost in their estimates.

`withCorrelationIntent` rehydrates and confirms the requested `stateVisitId` under its short issue lock immediately before recording intent and again immediately before its provider callback; a mismatch returns `paused` with `stale-state-visit` and no provider effect.

Within one visit/action, the locked append permits only one open attempt. The finite phase graph is `intent → waiting → resolved|failed` or `intent → resolved|failed`; `resolved` and `failed` close the attempt. A later write-authorized actions-only or forward invocation may begin the next ordinal after `failed`; an open `intent` is retried with the same correlation rather than superseded. A user's next `/task promote #N` therefore retries the current resident action first and challenges exit guards only after it completes. No actor emits a `superseded` phase. Events are permanent audit evidence: a new state visit has a new `stateVisitId`, so prior visits remain inspectable but cannot satisfy the new visit.

Hydration distinguishes an empty fold from a damaged one. No head anchor and no events means normal first execution, including legacy issues that predate this feature; no migration is required. Once an anchor exists, a missing predecessor, a later phase without its required earlier phase, or a hash-chain gap is damaged required evidence and fails closed. Provider evidence alone cannot silently repair that gap; only the human-approved correction path may establish a new unproven baseline from inspected live evidence.

If `run` returns `waiting` but a verified `waiting` event with correlation and deadline is absent or malformed, the step is `failed`, not dormant. Hydration is always read-only: it classifies an expired wait as failed in the immutable snapshot but writes nothing. The next write-authorized Cursor actions-only or forward invocation appends the deterministic `failed` event before returning recovery diagnostics. Read-only status, callbacks configured as observation-only, `TT_SKIP_NETWORK`, and offline hydration never append. The Cursor processes actions in order:

1. call `verify` against the current snapshot;
2. when complete, continue without calling `run`;
3. when incomplete, call `run`;
4. rehydrate when `run` may have mutated durable evidence;
5. verify the step again before treating it as complete; and
6. stop dormant on waiting, paused, failed, or unverifiable results.

No Cursor or action index is persisted. The event family is durable action evidence, not a program counter: on every invocation the Cursor still scans from the beginning and skips steps whose folded evidence remains fresh. This makes retries and crash recovery idempotent.

Resident action execution is not globally serialized for its full duration. Each action declares `serialization: 'correlation' | 'issue-lock'`, and both use the shipped issue-lock primitive for bounded ledger critical sections. The default `correlation` class locks only intent selection, final visit validation, provider submission/read-back, and individual event appends; completion waiting remains unlocked and provider idempotency/deduplication is mandatory. The `issue-lock` class additionally wraps one short local mutation that lacks independent deduplication. Neither class may hold the lock while waiting for CI, an agent, or another long-running provider completion. Lock-budget exhaustion in either action class returns `paused: issue-lock-contended` with holder and retry diagnostics; it is not movement exit 7 because no boundary was attempted.

Agentic or human work can be represented by steps whose `run` returns instructions/waiting and whose `verify` detects the resulting repository evidence. A long-lived process is not required.

Resident actions may write state-owned durable evidence: issue-body action records, comments, receipts, Git commits/refs within the bound worktree, pull requests, and external check requests. Only `moveState(ctx)` may write Project Status, transition phase rows, entry/last-known markers, or the `aitm-move-complete` sentinel. An action must never invoke a movement verb or write those reserved transition facts.

The concrete receipt primitive for #937 is `VERIFICATION_RECEIPT_SCHEMA` (`aitm.verification-receipt/v1`) serialized in the `aitm-verification-receipt` issue-body marker, with exact-head freshness evidence.

### Resident action context

Actions receive a frozen, constructor-injected capability object rather than importing ambient clients:

```js
{
  now,
  hydrateTask,
  resolveCorrelation,
  withCorrelationIntent,
  appendActionEvent,
  advanceActionLedgerHead,
  mutateActionEvidence,
  git,
  pullRequests,
  checks,
  receipts,
  instructions,
}
```

`now` is the injected clock. Ledger methods enforce visit checks, attempt derivation, bounded reads, locks, deterministic IDs, hashes, monotonic head advancement, and verified read-back. `withCorrelationIntent` is the only route to an external provider effect and holds its short action lock through final visit revalidation and provider submission/read-back. `git`, `pullRequests`, `checks`, and `receipts` are narrow provider adapters whose mutating methods require the recorded correlation/idempotency key. `instructions` emits the durable human/agent work request for a waiting action. Actions may not import `gh`, issue mutation, movement, lock, clock, or provider modules outside this capability surface.

## Repository adapter and offline mode

The Cursor receives one constructor-injected `RepositoryAdapter`. Production and tests implement the same method interface:

```js
class RepositoryAdapter {
  hydrateTask({ issue, cwd, mode }) {}
  resolveLiveState({ issue }) {}
  readIssueBody({ issue }) {}
  readActionLedger({ issue, stateVisitId, actionId, maxLinks }) {}
  readGitSnapshot({ cwd }) {}
  readChecks({ issue, headSha }) {}
  readBoundWorktree({ issue, cwd }) {}
  appendActionEvent({ issue, event }) {}
  advanceActionLedgerHead({ issue, expectedHead, event }) {}
  withCorrelationIntent({ issue, stateVisitId, actionId, correlation }, operation) {}
  mutateActionEvidence({ issue, mutate }) {}
  now() {}
  withIssueLock({ issue, verb, projDir, sessionId, timeoutMs, retries }, operation) {}
  runPreMutationGate({ moveContext, snapshot, plan }) {}
  requestTransition({ moveContext, plan, gateResult }) {} // delegates to moveState(ctx)
}
```

`withIssueLock` delegates to the shipped function of the same name and preserves its full options object, holder diagnostics, `AsyncLocalStorage` nesting, and issue-scoped `AITM_ISSUE_LOCK_HELD` child-process re-entrancy. `readActionLedger`, `appendActionEvent`, `advanceActionLedgerHead`, and `withCorrelationIntent` own the bounded current-attempt read, verified comment chain, monotonic body-head update, deterministic retry, and stale-visit rules described above. `now()` defaults to `Date.now` in production and is deterministic in tests.

`hydrateTask` returns immutable provenance-bearing values, the five `isMoveComplete` signals, `lastKnownState`, action correlations, and per-field freshness. A boundary may proceed only when every field required by its actions and guards is authoritative and fresh; unrelated stale optional fields remain diagnostic warnings. This adjudicates partially fresh snapshots per consumer rather than treating the entire snapshot as uniformly fresh.

The test corpus ships one stateful in-memory adapter under `scripts/tests/helpers/`. It persists issue body, Project Status, Git snapshot, checks, worktree binding, and mutation history across calls so tests exercise read-after-write shapes instead of constant-output `gh` stubs.

`TT_SKIP_NETWORK=1` maps to adapter mode `offline`. Offline hydration may use injected in-memory records and local Git/worktree evidence, but it performs no GitHub reads or writes. Production boundary requests fail closed offline. Unit and characterization tests may make deterministic simulated transitions through the in-memory adapter; they do not weaken the production authority rule. `--force` and `--supersede` are explicit movement intents carried in `moveContext`: they preserve the shipped guard-bypass policy and audit behavior, while still delegating all reserved writes to `moveState`. Out-of-band Status drift is never normalized by the Cursor and requires `/task reconcile`.

## Cursor triggers and execution

Each invocation has one trigger. Triggers either request resident work only or request exactly one target boundary. Only actions-only and ordinary forward triggers require the current resident actions to complete; reverse and abandonment/bypass movement must remain available specifically when resident work is incomplete.

| Invocation surface                                                     | Cursor trigger    | Target selection                                                        | Run current resident actions? | Boundary permitted |
| ---------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- | ----------------------------- | ------------------ |
| `/task promote`, `/task next`                                          | `advance-forward` | `forwardTarget(current)`                                                | yes                           | at most one        |
| `/task refine`                                                         | `advance-forward` | Backlog→Refine or Refine→Ready for Planning, based on its current phase | yes                           | at most one        |
| `/task plan`                                                           | `advance-forward` | Ready for Planning→Plan                                                 | yes                           | at most one        |
| `/task test`                                                           | `advance-forward` | Develop→Test after its resident work is migrated by #937                | yes                           | at most one        |
| `/task review` / `REVIEW_COMPLETE` while in Test                       | `advance-forward` | Test→Review                                                             | yes                           | at most one        |
| `/task review --probe`, callback, or retry while in Review             | `actions-only`    | none                                                                    | yes                           | no                 |
| `/task close`                                                          | `advance-forward` | Review→Done                                                             | yes                           | at most one        |
| `/task demote`, `/task reject`                                         | `advance-reverse` | explicit policy member of `backwardTargets(current)`                    | no                            | at most one        |
| `/task shelve`, `/task park`, `/task cancel-plan`                      | `advance-reverse` | explicit Backlog or Ready for Planning target                           | no                            | at most one        |
| `/task supersede` or an operator-forced move                           | `bypass`          | explicit target carried by the sanctioned caller                        | no                            | at most one        |
| `/task plan-approve`, `/task approve`, resume, bind/rebind, agent turn | `actions-only`    | none                                                                    | yes                           | no                 |
| CI/provider callback, scheduled reconciler                             | `actions-only`    | none                                                                    | yes                           | no                 |

Every requested target is normalized, then `computeTransitionPlan` decides matrix applicability, bypass, no-op, and whether the guard pipeline runs. A Cursor never auto-selects another target after completing actions and never crosses a second boundary in the same invocation. Human approval and dedicated verb semantics therefore remain at the command surface.

The execution algorithm is:

```js
async function executeCursor({ issue, cwd, trigger, requestedTarget }) {
  let snapshot = await repository.hydrateTask({ issue, cwd });
  const current = machine.get(snapshot.currentState.value);

  if (trigger === 'actions-only' || trigger === 'advance-forward') {
    const actionResult = await actions.resume(current.residentActions, snapshot, { trigger });
    if (actionResult.status !== 'complete') return dormant(actionResult);
    if (trigger === 'actions-only') return residentComplete(current.id);
  }

  const moveContext = buildMoveContext(snapshot, current.id, requestedTarget, trigger);
  const plan = computeTransitionPlan({
    fromState: current.id,
    toState: requestedTarget,
    flags: moveContext.flags,
  });
  if (plan.matrix.applies && !plan.matrix.ok) return matrixRefused(plan.matrix);
  if (plan.noop) return moveNoop(plan);

  let boundary;
  try {
    boundary = await repository.withIssueLock(
      lockOptions({ issue, verb: moveContext.verb, cwd }),
      async () => {
        snapshot = await repository.hydrateTask({ issue, cwd });
        if (snapshot.currentState.value !== current.id) {
          return {
            kind: 'drift',
            expectedState: current.id,
            actualState: snapshot.currentState.value,
          };
        }

        const gateResult = await repository.runPreMutationGate({ moveContext, snapshot, plan });
        if (gateResult.exit != null) {
          return { kind: 'gate-refused', phase: 'guard', gateResult };
        }

        const move = await repository.requestTransition({ moveContext, plan, gateResult });
        if (move.exit != null) return { kind: 'move-refused', move };
        return { kind: 'moved', move };
      }
    );
  } catch (error) {
    if (error instanceof IssueLockError) return boundaryLockRefused(error);
    throw error;
  }
  if (boundary.kind === 'drift') return concurrentDrift(boundary);
  if (boundary.kind === 'gate-refused') return gateRefused(boundary);
  if (boundary.kind === 'move-refused') return moveRefused(boundary.move);
  if (boundary.kind !== 'moved') return invalidBoundaryResult(boundary);

  // Release the boundary lock before starting target resident work.
  snapshot = await repository.hydrateTask({ issue, cwd });
  return actions.resume(machine.get(requestedTarget).residentActions, snapshot, {
    trigger: 'resident-entry',
  });
}
```

All control-flow results are discriminated. `matrixRefused` returns `{ kind: 'matrix-refused', reason, allowedTargets }`; `moveNoop` returns `{ kind: 'noop', state }`; `concurrentDrift` returns `{ kind: 'drift', expectedState, actualState }`; `gateRefused` preserves `{ kind: 'gate-refused', phase: 'guard', exit, refusals, warns }`; `moveRefused` preserves `{ kind: 'move-refused', phase, exit, itemId, sentinelPresent, boardMoved }` plus any saga diagnostics; and `boundaryLockRefused` returns `{ kind: 'boundary-lock-refused', phase: 'lock', exit: 7, holder, retry }`. `invalidBoundaryResult` returns `{ kind: 'invalid-boundary-result', phase: 'internal', exit: 1, reason, receivedKind }` and emits an internal-contract diagnostic. Only `{ kind: 'moved' }` reaches target resident execution. Gate exits 3/4/6 retain their guard phase, refusal IDs, blockers, warnings, timing, and recovery banners rather than being flattened into a move refusal.

The issue-scoped lock spans the final hydration, complete pre-mutation gate, and `moveState` call. The adapter delegates to shipped `withIssueLock`, so Cursor→`moveState`, existing verb nesting, and child processes reuse the `AsyncLocalStorage`/`AITM_ISSUE_LOCK_HELD` contract automatically.

`ISSUE_LOCK_STALE_MS` remains the shipped 30-minute orphan backstop; guard latency does not tune it. The implementation measures p50/p95/p99 hold time and configures a bounded retry/backoff acquisition budget at least as large as measured p95 plus jitter, subject to an operator-facing maximum. Exhausting that budget on a mutating boundary is caught and classified as exit 7, and the caller rehydrates before retrying. Read-only and actions-only surfaces do not acquire this boundary lock, although a resident action may acquire the distinct bounded ledger/action critical section defined above. This network cost is deliberate until a separately scoped multi-source revision-token architecture exists.

Every ledger critical section uses the shipped primitive with an action-specific `verb` and acquisition profile after any boundary lock has been released. Correlation-class sections cover only intent/provider initiation or one event append; issue-lock-class sections may additionally cover one short local mutation. On contention either returns `paused` with `issue-lock-contended` and retry diagnostics, never movement exit 7. Legacy C adapters that invoke an action inside an already-held issue lock rely on the shipped re-entrant short-circuit; D's final path does not intentionally nest them.

## Boundary and transition consistency

A normal forward boundary crossing is approved in this order; reverse triggers skip resident completion, and `computeTransitionPlan.bypass` skips both matrix and guard gates:

```text
current resident actions complete
→ current exit and target entry guards aggregate under the issue lock
→ moveState(ctx) commits the target
→ target becomes current
→ target resident actions start/verify
```

The Cursor delegates transition persistence to the shipped `scripts/task-tracker/lib/move-state/move-state-core.mjs::moveState(ctx)` primitive; it does not reimplement or reorder the saga. The commit boundary contains:

1. `probeCompletion` plus `isMoveComplete` as the idempotent replay gate;
2. `emitPhasePairRows`, writing exit and entry rows under one timestamp before Status;
3. `stampEntryMarkers`, advancing `aitm-last-known-state` and returning `priorState` for compensation;
4. `runStatusWrite`, a verified fail-closed Status mutation that calls `rollbackRecordedState(priorState)` on failure;
5. `writeSentinel`, writing and re-read-verifying `aitm-move-complete` after Status;
6. `assertBoardMarkerConsistent`, enforcing the post-condition after sentinel confirmation; and
7. `runPostCommitTail`, isolating every best-effort projection failure without changing a committed move's exit code.

Story D moves the complete shipped `runGuardExecution` responsibility inside the same issue lock immediately before this saga. `RepositoryAdapter.runPreMutationGate` always delegates to that refactored seam; the seam itself uses `plan.runGuardPipeline` so bypass moves skip matrix/guards without losing non-blocking warnings. It preserves all of its responsibilities, including:

1. dirty-workspace warning on entry to Review;
2. issue-body fetch with #511 fail-closed classification;
3. complete guard-context assembly, including `fetchBlockerState`, `cfg`, `buildCloseGatesDeps`, and `lifecycleEvidence`;
4. exit-plus-entry aggregation plus #1017 targeted `refreshPreRefineContiguity`; and
5. guard-identity-dependent handling, including the #359 `gate-refused` timing row and contiguity banner;
6. lifecycle-warning timing emitted from the aggregated `warns` payload; and
7. the sized-and-estimated Backlog warning.

Its guard payload retains the shipped `{ ok, refusals: [{ id, reason, blockers? }], warns?: [{ id, warn }] }` shape. Today the saga override is the underscore-private `ctx._runGuardExecution`. Story D promotes this to the public production option `ctx.runGuardExecution`, with precedence `runGuardExecution ?? _runGuardExecution ?? defaultRunGuardExecution`; the underscore form remains only for test/backward compatibility. The adapter passes an already-evaluated function through the public option so the saga does not repeat the gate. Body-fetch failure remains exit 3; generic guard refusal remains exit 4; contiguity refusal remains exit 6; lock, Status confirmation, or sentinel failure remains exit 7; and post-commit board/marker drift remains exit 8.

Post-commit cache and synchronization failures do not retroactively report the committed move as failed. They remain separately classified infrastructure results unless a specific operation is deliberately promoted into an action step with durable completion semantics.

## Resident entry, dormancy, and recovery

After a task successfully enters a new state, that state becomes current and the Cursor begins its prescribed `residentActions`.

If the process stops before invoking the first target action, the next invocation hydrates the new Status, finds no fresh completion evidence, and begins the first incomplete target step. If the process stops after an external side effect but before recording a local return value, verify-first execution discovers the durable external result and avoids duplication.

When an action waits, pauses, or fails:

- the current Status does not change;
- completed step evidence remains durable;
- blockers or waiting correlation key and deadline are written to the appropriate repository record;
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
- issue-lock enforcement;
- process-local cache refresh; and
- best-effort synchronization projections.

Lifecycle actions are state-owned work whose completion matters to the task and can be durably verified and resumed. Examples include Develop validation, Test PR/CI, and Review agent validation.

The existing tail stays infrastructure during #1117 and retains its shipped `scope` selection:

| Existing tail step        | Scope   | #1117 classification                                                          |
| ------------------------- | ------- | ----------------------------------------------------------------------------- |
| `dispatchOnEnterActions`  | project | legacy best-effort hook; compatibility only, not resident actions             |
| `refreshKanbanStateCache` | project | projection infrastructure                                                     |
| `emitFullAutoReviewAudit` | issue   | audit projection                                                              |
| `unparkDoneDependents`    | project | best-effort dependency projection; not promoted to a resident action in #1117 |
| `emitOutOfBandAudit`      | issue   | audit projection                                                              |
| `syncTrackerState`        | session | session projection                                                            |
| `syncEventFields`         | issue   | issue projection                                                              |
| `endTaskTracking`         | session | session projection                                                            |

`tail-profiles.mjs` continues selecting these by `project`, `issue`, and `session` scope. Any later proposal to make `unparkDoneDependents` completion-critical must first give it durable verify-first semantics and explicitly change the Done policy; this design does not silently promote it.

## Review pilot

Review is the first migrated resident action because #881 already established the required behavior:

1. Test exit and Review entry guards permit the boundary;
2. the board moves to Review;
3. the agent-review action runs;
4. an objection writes durable failure evidence and leaves the issue in Review; and
5. a later Review invocation retries in place.

The migration re-plumbs that shipped behavior behind the shared resident-action/Cursor contract. It must not move the review gate back before the boundary, rerun Review entry guards on an in-place retry, or demote automatically on an objection. Review alone is not proof of ordering, waiting, or crash convergence.

Every resident action must pass a shared conformance suite proving that `verify` is read-only and deterministic for one snapshot, `run` followed by fresh hydration converges to `verify: complete`, correlation keys discover already-created effects, and stale evidence does not pass. A table-driven interruption harness aborts before and after every action boundary, after transition confirmation, and before the first target action, then asserts that a fresh Cursor converges without duplicate effects.

## Implementation split and compatibility

The reviewed design is too risky as one XL implementation. #1117 remains the architecture/prerequisite record and is delivered through four independently green, sequential implementation stories:

| Story | Scope                                                                               | Estimate | Behavior boundary                                                                                                   |
| ----- | ----------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------- |
| A     | Topology single-sourcing and pure factory                                           |       6h | Consume `lifecycle-policy`, freeze direct-reference definitions, expose derived indexes; no runtime behavior change |
| B     | Repository adapter, bounded ledger reads, task snapshot, and in-memory test double  |      10h | Add provenance/reconciliation/offline hydration without production Cursor routing                                   |
| C     | Resident actions, Cursor, ledger protection/repair, Review, and conformance harness |      20h | Route actions-only and Review resident behavior; crossing delegates unchanged to the shipped host boundary          |
| D     | Locked-boundary TOCTOU correction                                                   |       8h | Replace C's boundary adapter with the final locked pre-mutation gate and `moveState` delegation                     |

Each story begins from green trunk, has focused characterization tests, and must not depend on unmerged behavior from a later story. In C, the Cursor may finish resident work and request Test→Review, but a compatibility adapter delegates the entire crossing to the existing host: its current unlocked `runGuardExecution`, lock acquisition, and `moveState` behavior remain byte-for-byte unchanged. D refactors that adapter so lock acquisition moves before final hydration and the complete pre-mutation gate; only then does the final algorithm above become production. C is green and shippable without D. Story D is the last prerequisite before #937 may begin.

Compatibility requirements across the split:

- retain `runGuards(from, to, ctx)` result shapes, aggregation, warnings, and thrown-guard coercion;
- retain `registerGuard` idempotency and empty-on-direct-import characterization until the factory-backed compatibility layer replaces bootstrap;
- retain all move saga ordering, timing-row pairs, exit codes 3/4/6/7/8, and post-commit tail isolation;
- retain `buildCloseGatesDeps`, worktree-aware trunk resolution, and the temporary `refinementPlan` compatibility mirror;
- add the exact-value `ledger-head` invariant, ledger-specific monotonic advance primitive, `bash-guard.mjs`/managed-command comment edit-delete protection, visible warning, bounded hot reads, and audited `action-ledger reconcile` path;
- introduce public `ctx.runGuardExecution` while retaining `_runGuardExecution` only for test/backward compatibility;
- retain `--force`, `--supersede`, `TT_SKIP_NETWORK`, and sanctioned reverse-edge behavior;
- extend and ultimately supersede `states/states-skeleton.test.mjs` with factory-shape assertions rather than creating contradictory shape tests; and
- keep legacy `onEnter` and new `residentActions` as distinct contracts until legacy tail removal.

## Relationship to #937

Issue #937 is blocked by #1117 and will have its scope revised after this specification is reviewed. It will consume, not recreate, the following #1117 outputs:

- immutable three-list state definitions;
- shared direct guard/resident-action method references;
- repository snapshot hydration;
- verify-first resumable actions;
- Cursor boundary ordering and concurrency protection;
- target resident-action invocation; and
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

| Failure point                                           | Durable current state                       | Result / exit                                                        | Next invocation                              |
| ------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| Required snapshot field missing or stale                | Existing state                              | Failed closed                                                        | Rehydrate or repair evidence                 |
| Snapshot partly fresh                                   | Existing state                              | Consumers of stale required fields refuse; unrelated fields may warn | Refresh named sources                        |
| Current action waiting before deadline                  | Existing state                              | Dormant waiting with correlation                                     | Resolve external progress                    |
| Current action waiting past deadline                    | Existing state                              | Reclassified failed                                                  | Repair/restart correlated work               |
| Action returns waiting without verified waiting event   | Existing state                              | Failed contract                                                      | Repair event append, then rerun              |
| Current action paused or failed                         | Existing state                              | Dormant paused/failed                                                | Resume first incomplete step                 |
| Action effect has no durable correlation                | Existing state                              | Contract refusal                                                     | Correct action implementation                |
| No ledger head and no events for the current visit      | Existing state                              | Normal first or legacy execution; verify first                       | Record events only if `run` is needed        |
| Required current action event is missing or altered     | Existing state                              | Failed closed; provider evidence cannot silently authorize replay    | Run human-approved `action-ledger reconcile` |
| Orphan search exceeds its configured page budget        | Existing state                              | Paused `ledger-orphan-search-budget`                                 | Run `action-ledger reconcile`                |
| Two Cursors run one correlation-class action            | Existing state                              | Short intent lock selects one key; provider calls deduplicate on it  | Rehydrate and fold the comment ledger        |
| Task leaves the recorded visit before provider submit   | New durable state                           | Paused `stale-state-visit`; provider callback is not invoked         | Rehydrate the new current state              |
| Two Cursors run one issue-lock-class action             | Existing state                              | One runs; actions-only contender returns paused with retry detail    | Losing Cursor rehydrates before retry        |
| Either action class exhausts its lock budget            | Existing state                              | Paused `issue-lock-contended`; never movement exit 7                 | Rehydrate, then retry resident action        |
| Gated-target issue body fetch fails                     | Existing state                              | Failed closed, exit 3                                                | Restore authoritative read, then retry       |
| Guard returns refusal                                   | Existing state                              | Aggregated boundary refusal, exit 4 or contiguity exit 6             | Fix all reported blockers                    |
| Guard throws or returns malformed data                  | Existing state                              | Coerced and aggregated refusal, exit 4                               | Correct guard and retry                      |
| Boundary lock exceeds retry/backoff budget              | Existing state                              | `IssueLockError`, exit 7                                             | Wait, then rehydrate                         |
| Two Cursors race for one boundary                       | Existing state                              | One owns lock; other may exhaust budget with exit 7                  | Losing Cursor retries from fresh state       |
| Boundary host returns an unknown result kind            | Existing state                              | Internal contract failure, exit 1                                    | Repair adapter/result contract               |
| Status write fails before confirmation                  | Source state; last-known marker compensated | exit 7                                                               | Replay saga                                  |
| Status reaches target but sentinel is absent            | Target board, incomplete move               | exit 7                                                               | Replay to converge sentinel/evidence         |
| Sentinel present but board/marker post-condition drifts | Explicitly inconsistent                     | exit 8                                                               | Run explicit reconcile path                  |
| Crash after confirmed move and before target action     | Target state                                | Process absent                                                       | Rehydrate target and start resident actions  |
| Any post-commit tail step fails                         | Target state                                | Move succeeds; ordered `failures[]` warning                          | Repair projection separately                 |
| `--force` or `--supersede` requested                    | Policy-defined target                       | Audited shipped bypass; saga still authoritative                     | Hydrate resulting target                     |
| `TT_SKIP_NETWORK=1` in production boundary              | Existing state                              | Offline refusal                                                      | Retry online                                 |
| Out-of-band Status mutation                             | Drifted sources                             | Cursor refuses                                                       | `/task reconcile` by operator                |

## Testing strategy

New focused suites:

- `scripts/tests/unit/task-tracker/states/state-factory.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-action-conformance.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs`

Expanded characterization suites:

- `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs`
- `scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs`
- existing guard registry/bootstrap parity tests;
- existing move-state atomicity, tail-isolation, and concurrency tests; and
- existing promote/review/close orchestration tests.

Required behaviors include:

- exact three-list immutable shape for every `stateIds()` member;
- shared reference identity without task-specific mutation;
- alias normalization plus exact parity with `forwardTarget`, `backwardTargets`, and `validateExecutableTransition`;
- `computeTransitionPlan` parity for ordinary, no-op, force, and supersede movement;
- reconstruction with no persisted action index;
- verify-first step skipping and stale-evidence rerun;
- dormant waiting, paused, and failed outcomes;
- resident completion before exit validation on forward triggers;
- reverse and bypass movement remains available from waiting, paused, and failed resident actions;
- aggregate exit and entry refusals with warning preservation and thrown-guard coercion;
- pre-mutation parity for body-fetch exit 3, contiguity refresh, gate-refused timing, dirty warning, guard context, and guard identity;
- no status write on either refusal;
- discriminated boundary outcomes, with target action reachable only after a confirmed `moved` result;
- preservation of guard phase, refusal IDs, blockers, warnings, timing, and recovery banners;
- target action only after confirmed entry and stale-visit refusal immediately before every provider effect;
- crash recovery immediately after commit;
- no replay of target entry guards on in-state resume;
- Review objection remains in Review;
- correlation stability when HEAD advances between run and verify;
- per-action/per-visit event folding, retention across later steps, and invalidation by a new state visit;
- deterministic attempt ordinals and exact retry IDs under same-action and cross-action concurrency;
- bounded current-visit head-map encoding and factory action-count refusal above 8 KiB;
- exact-value `ledger-head` protection, monotonic predecessor validation, stale/regressing-head refusal, and read-back verification;
- managed CLI comment edit/delete refusal, ambiguous last-comment preflight, and visible do-not-edit guidance;
- bounded current-attempt point reads with no unpaginated timeline fetch on hydration;
- human-approved ledger correction that records damage and leaves affected actions unproven;
- 4 KiB event-budget rejection before provider effects and oversized-evidence fingerprinting;
- empty first/legacy fold acceptance versus missing-phase, altered-event, and broken-chain refusal;
- read-only and offline hydration producing no writes, including expired-wait classification;
- crash-after-intent, genesis-head, bounded orphan recovery, waiting-event verification, and injected-clock behavior at and beyond the deadline;
- forward-trigger retry after failed action, invalid-boundary-result exit 1, and caught boundary `IssueLockError` exit 7;
- interruption convergence, in-memory offline hydration, action-contention pause semantics, correlation-class and issue-lock-class critical-section scope, boundary serialization, and compatibility parity for all sanctioned movement and escape hatches.

## Alternatives considered

### Implement #937 before #1117

Rejected. It would require a Develop/Test-specific orchestration path and then migrate it into the Cursor architecture, duplicating work and increasing transition risk.

### Implement the original #1117 literally

Rejected. The original issue treated best-effort post-commit hooks as state actions. That would formalize the same mismatch that #937 exposed and could move atomic transition evidence into a non-blocking tail.

### Persist a Cursor or action index

Rejected. It creates another state authority, introduces drift/recovery work, and is unnecessary because ordered verify-first actions can derive progress from repository evidence.

### Use mutable object-to-object linked-list pointers

Rejected. An ordered immutable array plus ID map is simpler to freeze, validate, serialize, inspect, and reorder while retaining constant-time definition lookup; navigation still delegates to lifecycle policy.

### Collapse entry and exit guards into transition guards

Rejected. Separate boundaries preserve state ownership and allow the ordered state chain to be rearranged without rewriting one monolithic edge registry.

### Keep verbs as executors and add only snapshot/action resume

Rejected. It is the smallest immediate fix for #937, but it leaves execution ownership distributed across verbs, preserves duplicate boundary orchestration, and gives callbacks/rebinds no common actions-only entry point. A thin verb-to-trigger mapping preserves each command's human gate while the Cursor supplies one stateless execution contract.

### Use optimistic revision tokens instead of a boundary lock

Rejected for #1117. A safe token must cover Git HEAD, issue body, Project fields, check runs, and blocker/sub-issue states; that multi-source monotonic revision does not exist. The implementable design holds the issue lock across final hydration, guards, and `moveState`. A future proposal may independently scope that infrastructure.

## R2 review focus for Claude

Please verify that R2 now matches the shipped topology, aggregate guard contract, `moveState` saga, current-state reconciliation, lock semantics, escape hatches, and tail profiles. Challenge especially:

1. whether the trigger table preserves every human gate while allowing actions-only resume;
2. whether the repository adapter is narrow enough to implement and rich enough to test offline;
3. whether correlation keys and waiting deadlines make every external action replay-safe;
4. whether stories A–D are independently shippable and ordered correctly; and
5. whether any current move saga or exit-code behavior is still weakened by the Cursor seam.

## Decision

Proceed with #1117 as the architecture and prerequisite umbrella for stories A–D. Keep the state machine as an immutable definition/policy container, reconstruct task progress from repository evidence on every invocation, permit at most one explicit boundary per movement trigger, and use Review plus the conformance/interruption harness as the first resident-action migration. Keep #937 blocked through story D, then revise #937 to the Develop/Test policy and evidence implementation on this shared foundation.
