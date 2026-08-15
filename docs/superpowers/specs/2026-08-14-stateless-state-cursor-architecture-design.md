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
<!-- inline head -->
<!-- aitm-resident-action-ledger-head mode="inline" visit="<stateVisitId>" commit="<comment-id>:sha256:<hex>" definition="sha256:<hex>" audit="<comment-id>:sha256:<hex>" actions="<base64url-map>" -->

<!-- spilled head: constant-size body pointer -->
<!-- aitm-resident-action-ledger-head mode="spill" visit="<stateVisitId>" commit="<comment-id>:sha256:<hex>" audit="<comment-id>:sha256:<hex>" head="<comment-id>:sha256:<hex>" -->

<!-- one protected spilled-head issue comment -->
AITM resident-action head. Do not edit or delete this comment.
<!-- aitm-resident-action-head id="<deterministic-hash>" data="<base64url-json>" -->

<!-- each protected event issue comment -->
AITM resident-action evidence. Do not edit or delete this comment.
Use `npx aitm action-ledger reconcile #N` if correction is required.
<!-- aitm-resident-action-event id="<deterministic-hash>" data="<base64url-json>" -->
```

The decoded `aitm.resident-action-event/v1` record contains `eventId`, `previousCommentId`, `previousHash`, `actionPreviousCommentId`, `actionPreviousHash`, `issue`, `state`, `stateVisitId`, `actionId`, `attemptId`, `phase`, `correlation`, `ts`, optional `deadline`, optional `attribution`, and optional evidence fingerprint. `stateVisitId` is derived from the exact current `aitm-entered-<state>-N` visit marker after move completion; it is not merely the state name or a process-local counter.

Story D first consolidates and widens every entry-marker reader, then begins writing `move="<transition-id>"`. A new dependency-free `stage-entry-grammar.mjs` exports the only stage-entry matcher/parser primitives, including an explicitly named legacy-colon matcher for corpus migration. It may import only side-effect-free grammar helpers—never `node:child_process`, GitHub adapters, lifecycle policy, database code, or modules that execute processes during evaluation. `stage-entry-markers.mjs`, runtime verbs, guards, healing tools, `body-invariants.mjs`, `gh-edit-guard.mjs`, and maintenance transforms import those primitives rather than constructing independent `aitm-entered` regular expressions. A repository-wide source characterization fails if an executable module outside `stage-entry-grammar.mjs` constructs an `aitm-entered` regex; test fixtures and prose literals are excluded, but there is no runtime-module waiver. A second import-graph characterization proves the fail-closed Bash guard reaches no process-executing dependency through the grammar module. The shared grammar accepts properties in any order while retaining the legacy colon form. Characterization proves every previously parsed body still parses, modern readers agree, and legacy-only transformations call the named legacy primitive. `serializeMarker` still emits canonical `ts`, then `move`, for readability, but correctness never depends on property insertion order. This reader migration must land before the writer change.

`moveState` receives one invocation-stable transition ID and carries it through phase rows, the entry marker, and the final sentinel. Marker idempotency keys on `(state, transitionId)`, not whole-second timestamp, so same-second demote/re-promote cycles remain distinct. After sentinel confirmation, the saga attempts to create and read-back-verify a permanent `aitm.transition-commit/v1` issue comment containing transition ID, source/target, visit marker, actor, and sentinel fingerprint. This comment is audit and cross-visit ordering evidence, not movement authority: failure returns a successful committed move with `commit-provenance-missing` in ordered warnings. `probeCompletion` remains strictly read-only. After an already-complete probe returns, its write-authorized caller schedules `repairTransitionCommit` through the best-effort post-commit tail; the repair never runs inside the probe and inability to repair never changes the confirmed move result. A transition-ID marker is abandoned only when the authoritative Status/entry-marker/sentinel completion predicate does not select it; a sentinel-confirmed current marker remains the current visit with `commitProvenance: 'missing'`. Backfill assigns a deterministic `backfill:<sha256>` transition ID from repository, issue, state, visit suffix, and marker occurrence and may record authorized commit provenance. Legacy markers without `move` are valid legacy visits whose identity remains `(state, visit suffix, marker occurrence)`; their timestamp is diagnostic only. Story D supports an indefinitely mixed corpus, and backfill is optional rather than a deployment precondition.

`attemptId` is the one-based attempt ordinal for `(stateVisitId, actionId)`. Under the short issue lock, the appender derives it from the exact current action head and fresh `verify` result:

- no entry for an action defined in the current visit derives attempt 1;
- open `intent` or `waiting` reuses its ordinal and correlation;
- closed `failed` derives the next ordinal on a later retry;
- closed `resolved` remains closed while verification is fresh, but derives the next ordinal when live evidence regresses and `verify` returns incomplete; and
- a correction baseline carries `proof: 'unproven'` separately from `phase`; when verification remains incomplete, it derives the next ordinal from the last recorded attempt.

`unproven` is not an event phase. The finite event phases remain `intent`, `waiting`, `resolved`, and `failed`. Two writers therefore cannot both create a distinct attempt N. `eventId` is the SHA-256 hash of the canonical `(repository, issue, stateVisitId, actionId, attemptId, phase)` tuple. Exact retries recompute the same ID and no-op after byte-for-byte read-back verification.

The head records a definition fingerprint and an `actions` map from every action ID observed during the current visit to its latest `{ commentId, hash, attemptId, phase, proof? }`. A package upgrade never prunes an entry merely because the current definition omits that action; retired entries remain until the visit changes, preserving ordinal and chain continuity across rollback. A newly defined action with no entry is a legitimate first attempt, not damaged evidence. Definition-fingerprint mismatch is diagnostic, and the next advance writes the new fingerprint while retaining the current visit's union of entries.

Inline mode is attempted only when the exact marker is at most 8,192 characters and the resulting issue body is at most 57,344 characters, preserving an 8,192-character operational reserve below GitHub's 65,536-character limit. The factory performs an early estimate, but runtime serialization against the fresh body is authoritative and happens before any provider effect or event-comment creation.

If either inline condition would fail, the writer automatically uses spill mode; `ledger-head-budget` is not a dormant result and never forces the operator to bypass work. Spill mode writes one protected, read-back-verified head comment containing the complete current-visit map and leaves only its fixed-size ID/hash pointer in the body. The complete comment is capped at 60 KiB. The bound is derived: action IDs use the ASCII-safe grammar `[a-z0-9][a-z0-9._:-]{0,95}`; the canonical serializer rejects any encoded action-map entry over 384 bytes; the fixed envelope is at most 1,536 bytes; and a definition/retained current-visit union contains at most 96 action IDs. Thus `(96 × 384) + 1,536 = 38,400` raw bytes, base64url expands to at most 51,200 bytes, and the marker/warning wrapper is capped at 2,048 bytes, for a 52 KiB worst case and an 8 KiB reserve below 60 KiB. Exceeding a definition limit is `InvalidStateDefinitionError` before the state machine is usable. An upgrade that would exceed the retained union or an exact runtime serialization that violates any component budget is refused before effects as `resident-action-definition-cap` or `resident-action-ledger-budget`, with actual/limit details; the author must preserve/reuse stable IDs, reduce evidence to fingerprints, or perform a sanctioned state re-entry before enabling the enlarged definition. Once a visit spills it remains spilled, avoiding oscillation; each advance appends one replacement head comment. After the body pointer and successor read-back are confirmed, the predecessor spill snapshot becomes collectable because permanent event comments retain the audit chain. A failed best-effort deletion is an `orphaned-spill-snapshot` warning and the scheduled `action-ledger gc` retries only after re-proving that no body head references the comment. Current or referenced spill heads remain protected; verified superseded snapshots are not permanent evidence. A new visit resets the map and may use inline mode again. The `advance` predicate permits `inline → spill`, `spill → spill`, and new-visit `spill → inline`, while refusing same-visit regression to inline. Hot lookup adds exactly one point fetch for a spilled issue.

The `audit` pair links global history without requiring hot-path traversal. On a new state visit, the first event records the prior head's fingerprint and global audit predecessor, then the body head replaces the old action map/head pointer with the new visit's head; it does not copy the prior map into a 4-KiB event. Permanent action-event comments remain available to the full audit; spilled-head comments are replaceable materialized views and may be collected only after their successor and the permanent event chain are verified. Each event comment is capped at 4 KiB; large evidence stays in its existing receipt/comment artifact and the event stores only a fingerprint.

The head uses a fourth body-invariant kind named `advance`, not the presence-only `single` kind. Its `INVARIANT_MARKER_PATTERNS` entry registers `parse` and `validateAdvance` alongside the regex. `findLostMarkers` treats an `advance` entry like `single` for presence only. A sibling `validateMarkerAdvances(baseBody, nextBody, { allowMarkerAdvance })`, invoked by `guardedMutate` after loss/shrink checks, extracts both matches and calls the registered predicate with `{ markerId, baseMatch, nextMatch, baseBody, nextBody }`. The predicate is pure and synchronous; it validates only body-available ledger schema, exact global/action predecessors, visit rule, definition fingerprint, attempt/phase monotonicity, permitted inline/spill pointer transitions, and body budgets.

`mutateIssueBody` gains the narrow option `allowMarkerAdvance: ['aitm-resident-action-ledger-head']`; allow-listing authorizes predicate evaluation, never skipping it. An unauthorized value change or failed predicate throws `MarkerAdvanceError` with marker ID, base/next fingerprints, and reason—not `MarkerLossError`. The `body-invariants.mjs` header's registration procedure is extended for the new kind and points to this sibling validator/error. All unrelated markers and the #725 large-shrink guard remain armed; the ledger path never uses blanket `allowMarkerLoss`.

`advanceActionLedgerHead` calls `mutateIssueBody` with that one allow-listed marker. Both expected-head comparison and the registered advance predicate run inside the `mutate(baseBody)` callback, so every `versionedWriteBody` retry parses and validates its fresh base again rather than reusing a pre-retry head. Generic body mutations and `gh-edit-guard` must preserve the head's exact bytes. A stale, regressing, or non-advancing replacement is refused, and the successful update is read-back verified.

Spilled-head comment creation and read-back verification occur in `advanceActionLedgerHead` before body mutation. The synchronous predicate checks only the already-verified comment ID/hash encoded in `nextMatch`; after the body write, the adapter point-fetches and verifies that comment again. No network call or promise is permitted in `validateAdvance`, so version retries remain synchronous and do not repeat comment fetches inside `mutate(baseBody)`.

Appending an event creates and read-back-verifies the comment before advancing the head. Crash recovery paginates all comments newer than the recorded audit comment to completion and accepts only the deterministic event whose global and action predecessors equal the recorded heads, then completes the head advance. A first append establishes and verifies a genesis head before creating the event, so recovery never has to guess an unknown initial predecessor. Read-only hydration reports an orphan but writes nothing. A write-authorized Cursor performs this mechanical recovery without human approval. Operator cancellation or a transient API failure returns `paused: ledger-orphan-scan-interrupted` and retries the same scan later; only missing, altered, or ambiguous deterministic candidates route to human-approved reconcile.

The managed command guard rejects `gh issue comment` and `gh api` edit/delete operations when the target comment contains an AITM transition-commit, resident-action event, currently referenced spilled-head, damage-carry, or correction marker; an ambiguous `--edit-last`/`--delete-last` is refused unless a preflight proves the selected comment is not protected. The only deletion exception is the dedicated `action-ledger gc` reachability proof for a superseded spill snapshot. This is defense in depth, not a claim that the GitHub web UI is immutable. Every protected ledger/transition comment includes the visible warning above. Missing or altered current evidence is classified as damaged and has a named repair path: `npx aitm action-ledger reconcile #N --accept-live --reason <text> --approved-by <human>`.

`action-ledger reconcile` is a standalone maintenance command, distinct from movement `/task reconcile`; it never writes Status, movement markers, or transition timing. It runs under the issue lock, performs an explicitly paginated full audit, and requires declared human approval. It never fabricates or recreates deleted event bytes. It appends an `aitm.resident-action-ledger-correction/v1` comment containing the prior head, last verifiable ancestor, missing/altered comment IDs and hashes, operator, reason, timestamp, and fingerprints of the live provider/Git/receipt evidence inspected. It then advances the protected head to a new correction baseline and sets `proof: 'unproven'` on affected action heads without changing their last event phase; normal verify-first execution must re-establish completion. The correction remains linked to the abandoned head for audit. This is the only path allowed to authorize live evidence after a damaged chain.

Normal hydration does not enumerate the issue timeline. It reads the inline head or point-fetches the one spilled-head comment, point-fetches the latest event for only the current action, and follows at most the three phase links in that attempt (`intent`, optional `waiting`, terminal phase). If a spilled-head point fetch returns not-found, hydration re-reads the issue body: when the pointer changed it retries once against the fresh pointer, and when the currently referenced pointer still names the missing comment it diagnoses damage. A concurrent, correctly collected predecessor therefore cannot create false damage. A different transition-ID head requires up to two additional point fetches to verify the head/current commit comments; a missing current commit comment is cached as a diagnostic for the invocation and does not trigger timeline enumeration. Prior attempts and visits are irrelevant to execution and are traversed only by the explicit audit/reconcile command or scheduled integrity audit. Per phase, the acknowledged network cost is lock acquisition, any spilled-head comment write/read-back, event-comment creation/read-back, monotonic body-pointer/head update, body read-back including the one bounded pointer-race retry, and the bounded commit-provenance reads when visits differ; stories B, C, and D include this cost in their estimates.

`withCorrelationIntent` rehydrates and confirms the requested `stateVisitId` under its short issue lock immediately before recording intent and again immediately before its provider callback; a mismatch returns `paused` with `stale-state-visit` and no provider effect.

Within one visit/action, the locked append permits only one open attempt. The finite phase graph is `intent → waiting → resolved|failed` or `intent → resolved|failed`; `resolved` and `failed` close the attempt. A later write-authorized actions-only or forward invocation applies the complete derivation table above; an open `intent` is retried with the same correlation rather than superseded. A user's next `/task promote #N` therefore retries the current resident action first and challenges exit guards only after it completes. No actor emits a `superseded` phase. Events are permanent audit evidence: a new state visit has a new `stateVisitId`, so prior visits remain inspectable but cannot satisfy the new visit.

Hydration classifies the head against the authoritative current `stateVisitId`:

- no head and no events is normal first execution, including legacy issues;
- a head for the same visit folds the current action normally;
- a sentinel-confirmed current transition-ID marker with missing commit provenance is the current visit; hydration reports `commitProvenance: 'missing'`, an exact same-visit head folds normally, and a different head falls back to the same durable body-occurrence plus per-state-ordinal comparison used for legacy markers;
- for transition-ID visits, a different head is prior history only when both visits have verified transition-commit comments, the head comment ID is lower than the current comment ID, and state/visit ordinals do not contradict that order; the map then remains history until the first new event lazily fingerprints/replaces it, and no writer runs if all actions verify complete or the action list is empty;
- for legacy markers without `move`, the authoritative five-signal current-move predicate validates the current visit, while durable body occurrence order plus per-state visit ordinal classify a different legacy head; disagreement is diagnostic rather than guessed, so mixed legacy/transition corpora remain operable without mandatory backfill;
- a higher or equal commit-comment ID for a different head, contradictory body occurrence/visit ordinals, or a comparison that remains contradictory after the conservative fallback is newer/drift evidence; mere missing provenance is diagnostic, not damage; and
- malformed identity or disagreement in the current move-completion facts is drift/damaged evidence.

This classification does not order visits by timestamp: entry timestamps have only whole-second fidelity and equality is normal. It relies on the observed, not API-guaranteed, monotonic increase of GitHub comment IDs within one issue. The implementation names this assumption, checks equal/reversed IDs and ordinal contradictions defensively, and returns an ordering diagnostic rather than trusting a violation. Verified transition-commit comment IDs order post-migration visits; body occurrence plus per-state visit ordinal is the conservative legacy fallback. A marker is abandoned only when it has a transition ID but is not selected by the authoritative move-completion predicate. Abandoned markers remain as audit evidence and may be annotated by reconcile, but never satisfy visit hydration. On the first append of a new visit, the global predecessor is the prior head's `audit` pair and the action predecessor is legitimately absent. Provider evidence alone cannot silently repair damaged current-visit history; only the human-approved correction path may establish a new unproven baseline from inspected live evidence.

`hydrateTask` never throws solely because the ledger is damaged; it returns `snapshot.actionLedger.status: 'damaged'` with provenance and diagnostics. The enforcement layer is `actions.resume`: actions-only and ordinary forward triggers return dormant `failed: action-ledger-damaged` before calling any action or boundary. Read-only surfaces render the diagnostic without a process error. Reverse and explicit bypass triggers may proceed without action evidence, but their movement-required snapshot fields must still be authoritative. Thus “fail closed” means the action executor refuses normal resident/forward execution, not that hydration becomes unavailable.

Reverse or explicit bypass movement out of a damaged visit must preserve, not erase, the diagnosis. Inside the boundary lock, after the complete pre-mutation gate succeeds and before `moveState`, the Cursor appends and read-back-verifies an `aitm.resident-action-ledger-damage-carry/v1` comment containing the damaged visit/head, diagnostics, target transition ID, actor, and movement flag; failure to record it refuses the move. A refused pre-mutation gate therefore creates no carry record. The transition evidence includes that comment ID/hash. Hydration of later visits reports it as `inheritedHistoricalDamage` without blocking their clean current fold, and the first ledger write links it into the new head. It remains visible until a human-approved reconcile for the named damaged visit appends a correction; a visit change alone never clears it.

If `run` returns `waiting` but a verified `waiting` event with correlation and deadline is absent or malformed, the step is `failed`, not dormant. Hydration is always read-only: it classifies an expired wait as failed in the immutable snapshot but writes nothing. The next write-authorized Cursor actions-only or forward invocation appends the deterministic `failed` event before returning recovery diagnostics. Read-only status, callbacks configured as observation-only, `TT_SKIP_NETWORK`, and offline hydration never append. The Cursor processes actions in order:

1. call `verify` against the current snapshot;
2. when complete with no open attempt, continue without calling `run`;
3. when complete with an open `intent` or `waiting` attempt, a write-authorized invocation appends its deterministic `resolved` event with the verified evidence fingerprint and `attribution: 'correlated' | 'observed'`, rehydrates, and then continues without calling `run`;
4. when incomplete, call `run`;
5. rehydrate when `run` may have mutated durable evidence;
6. verify the step again before treating it as complete; and
7. stop dormant on waiting, paused, failed, or unverifiable results.

An observation-only hydration reports `complete-pending-terminal-event` for complete evidence plus an open attempt and performs no write; the next write-authorized invocation closes it before advancing. `correlated` means the verifier proved the evidence belongs to the attempt's recorded provider correlation. `observed` means the action is complete but causation could be a human change, earlier attempt, or provider recovery; `resolved` then closes the action attempt without claiming it produced the evidence. `status` and `action-ledger audit` render observed closures with their evidence fingerprint and attempt ID. This attribution is audit-only: it does not weaken completion, block a boundary, or set `proof: 'unproven'`. This rule also closes a `waiting` attempt whose evidence completes before its deadline. No open attempt survives a successful write-authorized verification, so a later regression derives a new ordinal and correlation rather than reusing an abandoned one.

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
  recordLedgerDamageCarry({ snapshot, movementIntent }) {}
  withCorrelationIntent({ issue, stateVisitId, actionId, correlation }, operation) {}
  mutateActionEvidence({ issue, mutate }) {}
  now() {}
  withIssueLock({ issue, verb, projDir, sessionId, timeoutMs, retries }, operation) {}
  withBoundaryLock({ issue, verb, projDir, sessionId, timeoutMs, retries }, operation) {}
  runPreMutationGate({ moveContext, snapshot, plan }) {}
  requestTransition({ moveContext, plan, gateResult }) {} // delegates to moveState(ctx)
}
```

`withIssueLock` delegates to the shipped function of the same name and preserves its full options object, holder diagnostics, `AsyncLocalStorage` nesting, and issue-scoped `AITM_ISSUE_LOCK_HELD` child-process re-entrancy. `withBoundaryLock` is a provenance wrapper: it marks whether the callback began and converts `IssueLockError` to `BoundaryLockAcquireError` only when acquisition failed before callback entry. An `IssueLockError` raised inside the callback propagates with its original provenance. `readActionLedger`, `appendActionEvent`, `advanceActionLedgerHead`, and `withCorrelationIntent` own the bounded current-attempt read, verified comment chain, monotonic body-head update, deterministic retry, and stale-visit rules described above. `now()` defaults to `Date.now` in production and is deterministic in tests.

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

A self-targeted human forward command is the explicit resume-in-place path: it runs the current resident actions and returns `noop` only after they complete. The generic `resume`, bind/rebind, and agent-turn surfaces remain actions-only aliases. Matrix refusal is always decided before resident execution because it proves the requested target is illegal; no-op is decided afterward because it represents legal in-state work with no boundary effect.

The execution algorithm is:

```js
async function executeCursor({ issue, cwd, trigger, requestedTarget, flags = {} }) {
  let snapshot = await repository.hydrateTask({ issue, cwd });
  const current = machine.get(snapshot.currentState.value);
  const movementIntent =
    trigger === 'actions-only'
      ? null
      : normalizeMovementIntent({ trigger, requestedTarget, flags });
  const plan = movementIntent
    ? computeTransitionPlan({
        fromState: current.id,
        toState: movementIntent.target,
        flags: movementIntent.flags,
      })
    : null;
  if (plan?.matrix.applies && !plan.matrix.ok) return matrixRefused(plan.matrix);

  if (
    trigger === 'actions-only' ||
    (trigger === 'advance-forward' && !plan.bypassResidentActions)
  ) {
    const actionResult = await actions.resume(current.residentActions, snapshot, { trigger });
    if (actionResult.status !== 'complete') return dormant(actionResult);
    if (trigger === 'actions-only') return residentComplete(current.id);
  }

  if (plan?.noop) return moveNoop(plan);

  let boundary;
  try {
    boundary = await repository.withBoundaryLock(
      lockOptions({ issue, verb: movementIntent.verb, cwd }),
      async () => {
        snapshot = await repository.hydrateTask({ issue, cwd });
        if (snapshot.currentState.value !== current.id) {
          return {
            kind: 'drift',
            expectedState: current.id,
            actualState: snapshot.currentState.value,
          };
        }
        const gateContext = buildMoveContext({
          snapshot,
          fromState: current.id,
          movementIntent,
          damageCarry: null,
          skippedResidentActions: plan.bypassResidentActions
            ? incompleteActionIds(current, snapshot)
            : [],
        });

        const gateResult = await repository.runPreMutationGate({
          moveContext: gateContext,
          snapshot,
          plan,
        });
        if (gateResult.exit != null) {
          return { kind: 'gate-refused', phase: 'guard', gateResult };
        }

        const damageCarry =
          snapshot.actionLedger.status === 'damaged' &&
          (trigger === 'advance-reverse' || plan.bypassResidentActions)
            ? await repository.recordLedgerDamageCarry({ snapshot, movementIntent })
            : null;
        const moveContext = damageCarry ? { ...gateContext, damageCarry } : gateContext;

        const move = await repository.requestTransition({ moveContext, plan, gateResult });
        if (move.exit != null) return { kind: 'move-refused', move };
        return { kind: 'moved', move };
      }
    );
  } catch (error) {
    if (error instanceof BoundaryLockAcquireError) return boundaryLockRefused(error);
    throw error;
  }
  if (boundary.kind === 'drift') return concurrentDrift(boundary);
  if (boundary.kind === 'gate-refused') return gateRefused(boundary);
  if (boundary.kind === 'move-refused') return moveRefused(boundary.move);
  if (boundary.kind !== 'moved') return invalidBoundaryResult(boundary);

  // Release the boundary lock before starting target resident work.
  snapshot = await repository.hydrateTask({ issue, cwd });
  return actions.resume(machine.get(movementIntent.target).residentActions, snapshot, {
    trigger: 'resident-entry',
  });
}
```

`normalizeMovementIntent` is evidence-free and uses only the command surface's trigger, requested target, and explicit flags. `computeTransitionPlan` may run before resident work because it consumes only immutable topology plus that intent; matrix refusal occurs before any resident effect, while a legal no-op returns only after any required resident work. `buildMoveContext` runs only inside the boundary lock from the same final `snapshot` passed to `runPreMutationGate`; guards read evidence from that snapshot or context fields derived from it, never from the pre-action hydration. The immutable `gateContext` already contains the committed skipped-action audit list from that snapshot. After a clean gate, the transition context is either that exact object or a shallow copy adding only the verified `damageCarry`; no guard-visible input is recomputed or changed.

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

Explicit `--force` and `--supersede` are the operator escape from a permanently wedged resident action. Hydration represents ledger damage as a provenance-bearing snapshot diagnostic rather than throwing before trigger policy can run. Their transition plan sets `bypassResidentActions`; the Cursor does not require or rerun incomplete/damaged source actions and passes their IDs plus the operator intent into `moveState`, while movement fields must still be authoritative. The saga records `resident-action-bypassed` in the committed transition timing/evidence payload before Status, with source visit, skipped action IDs, ledger diagnostics, flag, actor, and reason when the command surface supplies one. It does not append `resolved` action events or claim the skipped work completed. Ordinary forward requests never bypass resident completion, and reverse movement retains its existing incomplete-work escape semantics.

The Cursor delegates transition persistence to the shipped `scripts/task-tracker/lib/move-state/move-state-core.mjs::moveState(ctx)` primitive; it does not reimplement or reorder the saga. The commit boundary contains:

1. strictly read-only `probeCompletion` plus `isMoveComplete` as the idempotent replay gate; after it reports an already-complete move, the caller may schedule best-effort provenance repair outside the probe;
2. `emitPhasePairRows`, writing exit and entry rows under one timestamp before Status;
3. `stampEntryMarkers`, advancing `aitm-last-known-state` and returning `priorState` for compensation;
4. `runStatusWrite`, a verified fail-closed Status mutation that calls `rollbackRecordedState(priorState)` on failure;
5. `writeSentinel`, writing and re-read-verifying `aitm-move-complete` after Status;
6. `assertBoardMarkerConsistent`, enforcing the authoritative post-condition after sentinel confirmation;
7. `writeTransitionCommit`, best-effort creation and read-back verification of the permanent transition-commit audit comment, returning `commit-provenance-missing` as an ordered warning without changing a committed move's exit code; and
8. `runPostCommitTail`, isolating every best-effort projection failure—including `repairTransitionCommit` after an already-complete replay—without changing a committed move's exit code.

Story D moves the complete shipped `runGuardExecution` responsibility inside the same issue lock immediately before this saga. `RepositoryAdapter.runPreMutationGate` always delegates to that refactored seam; the seam itself uses `plan.runGuardPipeline` so bypass moves skip matrix/guards without losing non-blocking warnings. It preserves all of its responsibilities, including:

1. dirty-workspace warning on entry to Review;
2. issue-body fetch with #511 fail-closed classification;
3. complete guard-context assembly, including `fetchBlockerState`, `cfg`, `buildCloseGatesDeps`, and `lifecycleEvidence`;
4. exit-plus-entry aggregation plus #1017 targeted `refreshPreRefineContiguity`; and
5. guard-identity-dependent handling, including the #359 `gate-refused` timing row and contiguity banner;
6. lifecycle-warning timing emitted from the aggregated `warns` payload; and
7. the sized-and-estimated Backlog warning.

Its guard payload retains the shipped `{ ok, refusals: [{ id, reason, blockers? }], warns?: [{ id, warn }] }` shape. Today the saga override is the underscore-private `ctx._runGuardExecution`. Story D promotes this to the public production option `ctx.runGuardExecution`, with precedence `runGuardExecution ?? _runGuardExecution ?? defaultRunGuardExecution`; the underscore form remains only for test/backward compatibility. The adapter passes an already-evaluated function through the public option so the saga does not repeat the gate. Body-fetch failure remains exit 3; generic guard refusal remains exit 4; contiguity refusal remains exit 6; lock, Status confirmation, or sentinel failure remains exit 7; post-commit board/marker drift remains exit 8; and transition-commit comment failure is a named success warning rather than exit 7.

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
| C     | Resident actions, Cursor, ledger protection/repair, Review, and conformance harness |      28h | Route actions-only and Review resident behavior; crossing delegates unchanged to the shipped host boundary          |
| D     | Locked boundary, transition identity, and TOCTOU correction                         |      12h | Widen marker readers, add commit provenance, and replace C's adapter with the final locked gate                     |

Each story begins from green trunk, has focused characterization tests, and must not depend on unmerged behavior from a later story. In C, the Cursor may finish resident work and request Test→Review, but a compatibility adapter delegates the entire crossing to the existing host: its current unlocked `runGuardExecution`, lock acquisition, and `moveState` behavior remain byte-for-byte unchanged. D refactors that adapter so lock acquisition moves before final hydration and the complete pre-mutation gate; only then does the final algorithm above become production. C is green and shippable without D. Story D is the last prerequisite before #937 may begin.

Compatibility requirements across the split:

- retain `runGuards(from, to, ctx)` result shapes, aggregation, warnings, and thrown-guard coercion;
- retain `registerGuard` idempotency and empty-on-direct-import characterization until the factory-backed compatibility layer replaces bootstrap;
- retain all move saga ordering, timing-row pairs, exit codes 3/4/6/7/8, and post-commit tail isolation;
- consolidate every executable entry-marker reader/guard onto the dependency-free shared order-insensitive grammar before extending new entry/sentinel/timing records with one invocation-stable transition ID; enforce the no-independent-regex rule repository-wide and keep the fail-closed Bash guard's grammar import graph free of process execution; retain indefinite mixed-corpus legacy parsing and optional deterministic backfill identity, keep `probeCompletion` read-only, and treat permanent transition-commit provenance as best-effort tail audit/ordering evidence rather than movement authority;
- retain `buildCloseGatesDeps`, worktree-aware trunk resolution, and the temporary `refinementPlan` compatibility mirror;
- add the `advance` invariant, narrow fresh-base `allowMarkerAdvance` path, ledger-specific monotonic advance primitive, `bash-guard.mjs`/managed-command comment edit-delete protection, visible warning, bounded hot reads, and audited `action-ledger reconcile` path; never use blanket `allowMarkerLoss` for a ledger advance;
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

| Failure point                                            | Durable current state                       | Result / exit                                                         | Next invocation                              |
| -------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| Required snapshot field missing or stale                 | Existing state                              | Failed closed                                                         | Rehydrate or repair evidence                 |
| Snapshot partly fresh                                    | Existing state                              | Consumers of stale required fields refuse; unrelated fields may warn  | Refresh named sources                        |
| Current action waiting before deadline                   | Existing state                              | Dormant waiting with correlation                                      | Resolve external progress                    |
| Current action waiting past deadline                     | Existing state                              | Reclassified failed                                                   | Repair/restart correlated work               |
| Action returns waiting without verified waiting event    | Existing state                              | Failed contract                                                       | Repair event append, then rerun              |
| Current action paused or failed                          | Existing state                              | Dormant paused/failed                                                 | Resume first incomplete step                 |
| Action effect has no durable correlation                 | Existing state                              | Contract refusal                                                      | Correct action implementation                |
| No ledger head and no events for the current visit       | Existing state                              | Normal first or legacy execution; verify first                        | Record events only if `run` is needed        |
| Head commit comment defensively precedes current comment | Existing current state                      | Valid empty fold for current visit; no timestamp ordering             | Lazy reset only if current action appends    |
| Current visit lacks transition-commit comment            | Existing current state                      | Current visit remains valid; named audit warning                      | Retry best-effort provenance repair          |
| Missing provenance, fallback occurrence/ordinal is prior | Existing current state                      | Valid empty fold plus audit warning                                   | Lazy reset; retry provenance repair          |
| Different visit contradicts occurrence/ordinal fallback  | Existing state                              | Drift diagnostic; no guessed fold                                     | Reconcile transition/ledger provenance       |
| Legacy current/head visits form a consistent body order  | Existing current state                      | Valid mixed-corpus fold using occurrence and visit ordinal            | Optional backfill; no rollout gate           |
| Head visit is malformed or lacks durable entry evidence  | Existing state                              | Hydration diagnoses; `actions.resume` refuses normal execution        | Inspect or reconcile the ledger              |
| Defined current action has no head entry                 | Existing state                              | Legitimate attempt 1                                                  | Verify first, then record if `run` is needed |
| Required current action event is missing or altered      | Existing state                              | Hydration diagnoses; `actions.resume` returns ledger-damaged          | Run human-approved `action-ledger reconcile` |
| Mechanical orphan scan is interrupted                    | Existing state                              | Paused `ledger-orphan-scan-interrupted`                               | Retry full scan; no human repair needed      |
| Inline head/body would exceed runtime budget             | Existing state                              | Automatically writes one protected spilled-head comment before effect | Continue with constant-size body pointer     |
| State exceeds 96 actions or safe 96-byte action IDs      | No executable machine                       | `InvalidStateDefinitionError` at composition                          | Split actions/state or shorten IDs           |
| Upgrade would make retained visit union exceed 96 IDs    | Existing state                              | `resident-action-definition-cap` before effects                       | Reuse IDs or sanctioned state re-entry       |
| Exact spill component/runtime budget is exceeded         | Existing state                              | `resident-action-ledger-budget` before effects                        | Reduce definition/evidence or re-enter state |
| Spill fetch 404s but fresh body points to a successor    | Existing state                              | Retry once from fresh pointer; no damage                              | Continue hydration                           |
| Superseded spill deletion fails                          | Existing state                              | Move/action succeeds with `orphaned-spill-snapshot` warning           | Scheduled GC re-proves reachability          |
| Resolved evidence regresses within the same visit        | Existing state                              | Next ordinal begins after incomplete verification                     | Rerun with a new correlated attempt          |
| Open attempt verifies complete                           | Existing state                              | Write-authorized Cursor appends deterministic `resolved`              | Continue; later regression gets new ordinal  |
| Open attempt completes from unrelated/recovered evidence | Existing state                              | `resolved` with `attribution: observed`                               | Audit does not claim attempt caused evidence |
| Two Cursors run one correlation-class action             | Existing state                              | Short intent lock selects one key; provider calls deduplicate on it   | Rehydrate and fold the comment ledger        |
| Task leaves the recorded visit before provider submit    | New durable state                           | Paused `stale-state-visit`; provider callback is not invoked          | Rehydrate the new current state              |
| Two Cursors run one issue-lock-class action              | Existing state                              | One runs; actions-only contender returns paused with retry detail     | Losing Cursor rehydrates before retry        |
| Either action class exhausts its lock budget             | Existing state                              | Paused `issue-lock-contended`; never movement exit 7                  | Rehydrate, then retry resident action        |
| Gated-target issue body fetch fails                      | Existing state                              | Failed closed, exit 3                                                 | Restore authoritative read, then retry       |
| Guard returns refusal                                    | Existing state                              | Aggregated boundary refusal, exit 4 or contiguity exit 6              | Fix all reported blockers                    |
| Guard throws or returns malformed data                   | Existing state                              | Coerced and aggregated refusal, exit 4                                | Correct guard and retry                      |
| Boundary acquisition exceeds retry/backoff budget        | Existing state                              | `BoundaryLockAcquireError`, exit 7                                    | Wait, then rehydrate                         |
| Two Cursors race for one boundary                        | Existing state                              | One owns lock; other may exhaust budget with exit 7                   | Losing Cursor retries from fresh state       |
| Boundary host returns an unknown result kind             | Existing state                              | Internal contract failure, exit 1                                     | Repair adapter/result contract               |
| Status write fails before confirmation                   | Source state; last-known marker compensated | exit 7                                                                | Replay saga                                  |
| Status reaches target but sentinel is absent             | Target board, incomplete move               | exit 7                                                                | Replay to converge sentinel/evidence         |
| Sentinel confirms target but transition commit is absent | Target board, committed move                | Success with `commit-provenance-missing` warning                      | Replay retries audit repair                  |
| Sentinel present but board/marker post-condition drifts  | Explicitly inconsistent                     | exit 8                                                                | Run explicit reconcile path                  |
| Crash after confirmed move and before target action      | Target state                                | Process absent                                                        | Rehydrate target and start resident actions  |
| Any post-commit tail step fails                          | Target state                                | Move succeeds; ordered `failures[]` warning                           | Repair projection separately                 |
| `--force` or `--supersede` bypasses wedged actions       | Policy-defined target                       | Saga records skipped IDs; no false action resolution                  | Hydrate resulting target                     |
| Reverse/bypass leaves a damaged visit                    | Policy-defined target                       | Required damage-carry comment remains visible in later visits         | Reconcile the named historical visit         |
| `TT_SKIP_NETWORK=1` in production boundary               | Existing state                              | Offline refusal                                                       | Retry online                                 |
| Out-of-band Status mutation                              | Drifted sources                             | Cursor refuses                                                        | `/task reconcile` by operator                |

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
- `computeTransitionPlan` parity for ordinary, no-op, force, and supersede movement, with matrix refusal before effects and human self-target resume before no-op;
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
- full attempt derivation for absent, open, failed, resolved-but-stale, and separately flagged unproven heads;
- definition fingerprints, within-visit union retention across upgrades/rollback, and legitimate attempt 1 for newly defined actions;
- exact 8,192-character inline and 57,344-character final-body preflight, followed by one protected spilled-head comment rather than pause, plus derived 96-action/96-byte-safe-ID/384-byte-entry limits, encoded-size arithmetic, margin, and named overflow remedies;
- inline/spill lifecycle, verified successor before predecessor collection, failed-deletion warning plus reachability-proving GC, one-fetch hot lookup, 404 fresh-pointer reread/retry without false damage, and visit-reset return to inline;
- `findLostMarkers` presence handling plus sibling synchronous/pure `validateMarkerAdvances`, registered predicate plumbing, dedicated `MarkerAdvanceError`, and narrow `allowMarkerAdvance` evaluated from every retry's fresh base while spill comments are verified outside mutation and all unrelated invariants/#725 remain armed;
- monotonic predecessor validation, stale/regressing-head refusal, and read-back verification;
- managed CLI comment edit/delete refusal, ambiguous last-comment preflight, and visible do-not-edit guidance;
- bounded current-attempt point reads with no unpaginated timeline fetch on hydration;
- human-approved ledger correction that records damage and leaves affected actions unproven;
- 4 KiB event-budget rejection before provider effects and oversized-evidence fingerprinting;
- empty first/legacy fold acceptance versus missing-phase, altered-event, and broken-chain refusal;
- read-only hydration diagnostics without throws, `actions.resume` fail-closed enforcement, and offline hydration producing no writes;
- complete verification closing open intent/waiting attempts with explicit correlated/observed attribution before continuing, with observed closures surfaced by status/audit but treated identically by gates;
- crash-after-intent, genesis-head, full paginated orphan recovery, interrupted-scan retry without human repair, waiting-event verification, and injected-clock behavior at and beyond the deadline;
- shared order-independent entry-marker parsing before writer rollout, canonical `ts`/`move` serialization, every executable caller importing the dependency-free shared primitive, repository-wide no-independent-`aitm-entered`-regex characterization, and a fail-closed Bash-guard import graph free of process execution;
- read-only `probeCompletion`, post-probe-tail best-effort transition-commit creation/repair, successful committed movement with missing-provenance warning, conservative occurrence/ordinal fallback for a different head when current provenance is missing, bounded extra provenance reads, named monotonic-comment-ID assumption with defensive contradiction handling, mixed legacy/current classification without timestamp ordering, and lazy first-append replacement;
- damaged-visit reverse/bypass carry records created only after a clean pre-mutation gate and surviving into later visit diagnostics until correction;
- same-second demote/re-promote transition IDs, invocation-stable marker/sentinel propagation, legacy marker identity, and deterministic backfill identity;
- static pre-action transition planning plus one immutable in-lock gate context whose transition copy adds only post-gate carry evidence;
- forward-trigger retry after failed action plus audited force/supersede escape without false action resolution;
- invalid-boundary-result exit 1 and acquisition-provenance-only boundary lock exit 7;
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
