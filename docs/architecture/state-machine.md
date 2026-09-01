# State Machine — kanban states as first-class objects

Status: **active** (post-#292, parent epic #259).

## Why this exists

For most of the project's life, the kanban lifecycle states lived only as
string constants threaded through `state-machine.mjs`'s transition matrix and
the per-verb files. Guards (the "may this transition happen?" predicates) sat in two
parallel places:

1. inline checks in `/task <verb>` modules, and
2. inline checks in `scripts/gh/move-state.mjs` and `verbs/promote.mjs`.

That layout made the guard-registry refactor (#286, #276) one-off rather than
systemic — there was no shared place for a state to _own_ its guards or its
on-enter behavior. #292 fixes that by elevating each state to a first-class
container.

## The container shape

Each state in `scripts/task-tracker/states/<state>.mjs` exports one immutable
definition with exactly three ordered method-reference lists:

```js
{
  id: 'plan',
  entryGuards: [/* Guard[] */],
  residentActions: [/* ResidentAction[] */],
  exitGuards: [/* Guard[] */],
}
```

`createStateMachine` validates the canonical eight-state order, freezes copied
definitions, builds an ID map, and derives `previous`, `next`, and supported
backward targets from lifecycle policy. The ordered array plus ID map supplies
doubly navigable topology without mutable object pointers. The legacy `STATES`
and `FORWARD_CHAIN` exports are projections of that machine, not independent
authorities.

## Guard contract

```ts
Guard = {
  id: string,
  run(ctx) => { ok: true }
            | { ok: false, reason: string }
            | Promise<...>
}
```

- `id` is the idempotency key. Re-registering the same `id` is a no-op.
- A guard that throws is treated as a refusal with the stringified error
  as the reason.
- Guards do not mutate state on success. The one sanctioned channel is
  stashing a value on `ctx` (e.g. `planEntryFieldsBody` writes
  `ctx.refinementPlan`).

## Resident-action contract

```ts
ResidentAction = {
  id: string,
  verify(ctx, snapshot) => ActionResult,
  run(ctx, snapshot, correlation) => ActionResult
}
```

- The Cursor always verifies before running. Complete durable evidence skips
  the effect; stale or absent evidence begins the next correlated attempt.
- `waiting`, `paused`, and `failed` end the process and leave the issue dormant
  in its current state's action area. No action index or Cursor is persisted.
- Durable progress is an append-only per-visit resident-action ledger whose
  protected head is stored inline or through a verified spill pointer.
- Resident actions never write Status, transition markers, or timing rows.
  Those remain transition infrastructure owned by the movement saga.
- `onEnter` is the semantic event after a target becomes current: it asks the
  Cursor to verify or run that target's resident actions. It is not a fourth
  configurable list.

## How the registry sees this

`scripts/task-tracker/lib/state-bootstrap.mjs` projects machine guards into the
flat compatibility registry. Existing `runGuards(from, to, ctx)` consumers keep
working, but the immutable machine remains the definition and topology source.

The state-objects are the new source of truth; the registry is the runtime
dispatch layer. Adding a guard means adding it to the state's `exitGuards`
or `entryGuards` list — never registering directly against the registry.

## Stateless Cursor and repository authority

Every invocation constructs a fresh Cursor and hydrates an immutable task
snapshot. Reconciliation uses five durable movement signals: configured-project
Status, the issue body's last-known-state marker, the current entry marker, the
move-complete sentinel, and paired exit/entry timing rows. Git HEAD, worktree
binding, checks, comments, receipts, and the resident-action ledger supply the
remaining provenance needed by actions and guards. Missing or contradictory
required authority fails closed; the Cursor never normalizes drift.

A movement command resolves exactly one trigger and, when applicable, exactly
one target before entering the Cursor:

- `advance-forward` runs current resident actions, then may cross one boundary;
- `advance-reverse` preserves the sanctioned rework/parking escape;
- `bypass` carries explicit force or supersede audit intent; and
- `actions-only` verifies or resumes residents without requesting a boundary.

After current actions complete, the Cursor rehydrates under the final boundary
lock, evaluates source exit guards then target entry guards, records any required
damaged-ledger carry, and delegates one Status/evidence commit. It rehydrates the
confirmed target before invoking the first target action. A crash after commit is
therefore recovered by the next invocation without replaying the boundary.

Resident effects and movement use deliberately different lock scopes. Action
ledger appends and correlation selection use short per-action or issue-lock
critical sections and release them while waiting on providers. The final
boundary uses one issue lock around its fresh snapshot, gates, carry evidence,
and transition commit. Cache refresh, synchronization, dependent unpark, and
other best-effort post-commit tail work remain infrastructure rather than false
resident progress.

Review is the first production resident-action proof. Test→Review makes Review
current before agent validation runs; an objection remains dormant in Review,
and a later `review`, bind, rebind, resume, or callback uses `actions-only` to
verify or retry the same action without replaying Review entry guards.

## Guard migration status

All guard-migration work is shipped: the per-state `exitGuards` and
`entryGuards` arrays are the live dispatch path for every forward transition.

| Issue | Scope                                            |
| ----- | ------------------------------------------------ |
| #277  | plan→develop entry gates → `plan.exitGuards`     |
| #278  | develop→test entry gates → `develop.exitGuards`  |
| #267  | test→review preflight → `test.exitGuards`        |
| #279  | review→done close-gates → `review.exitGuards`    |
| #271  | strip `promote.mjs` / `demote.mjs` inline checks |

Issue #937 installs the Develop verification and Test PR/quick-CI resident
actions. Develop exit consumes only its final exact-head receipt; Test work
begins after Test is current and is resumed in place through actions-only
requests. Transition infrastructure remains limited to guard evaluation and the
single durable state commit.

## Entry markers

On every successful transition, `stampEntryMarkers`
(`scripts/task-tracker/lib/move-state/github-mutation.mjs`, delegating to
`stampEntryMarker` in `scripts/task-tracker/lib/stage-entry-markers.mjs`)
stamps an `<!-- aitm-entered-<stage>: <iso-ts> -->` marker into the issue
body as a tamper-evident, append-only audit trail of every stage the issue
has visited. First-stamp wins per stage; a stage re-entered on a later
visit is recorded with a `-N` suffix (e.g. `aitm-entered-develop-2`).

Ordering is: **fresh locked guards → Status/evidence commit → target
rehydration → resident-action entry**.

- **Reader/writer:** `scripts/task-tracker/lib/stage-entry-markers.mjs`
  (`stampEntryMarker`, `parseEntryMarkers`, `getStageVisitCount`,
  `verifyChainIntegrity`).
- **Consumers.** `lib/contiguity-entry-guard.mjs` refuses a transition that
  would skip a required stage (missing `aitm-entered-<stage>` in the
  expected prefix); `lib/close-gates.mjs` refuses a close whose chain has a
  `chain-hole-at-<stage>` for the same reason.
- **Invariant.** Registered in `lib/body-invariants.mjs` as the
  `aitm-entered-<stage>` multi-marker (`kind: 'multi'`): every stage present
  in a body before a `mutateIssueBody` write must still be present after, or
  the call throws `MarkerLossError`.
