# State Machine — kanban states as first-class objects

Status: **active** (post-#292, parent epic #259).

## Why this exists

For most of the project's life, the kanban states (`backlog`, `on-deck`,
`refine`, `plan`, `develop`, `test`, `review`, `done`) lived only as string constants
threaded through `state-machine.mjs`'s transition matrix and the per-verb
files. Guards (the "may this transition happen?" predicates) sat in two
parallel places:

1. inline checks in `/task <verb>` modules, and
2. inline checks in `scripts/gh/move-state.mjs` and `verbs/promote.mjs`.

That layout made the guard-registry refactor (#286, #276) one-off rather than
systemic — there was no shared place for a state to _own_ its guards or its
on-enter behavior. #292 fixes that by elevating each state to a first-class
container.

## The container shape

Each state in `scripts/task-tracker/states/<state>.mjs` exports a frozen
object:

```js
{
  name: 'plan',
  entryGuards: [/* Guard[] */],
  exitGuards: [/* Guard[] */],
  onEnter: [/* Action[] */],
}
```

`scripts/task-tracker/states/index.mjs` re-exports the eight containers as
`STATES`, plus the two direction tables:

- `FORWARD_CHAIN` — `state → next-state`. Mirrors `state-machine.mjs`'s
  `FORWARD` so `/task promote` has one source of directional truth.
- `BACKWARD_CHAIN` — `state → target[]`. Index-0 is the canonical
  `/task demote` default; later entries document architecturally supported
  edges that are not yet runtime-walkable (the `validateTransition` matrix
  in `state-machine.mjs` still gates which edges actually fire).

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

## Action contract

```ts
Action = {
  id: string,
  run(ctx) => void | Promise<void>
}
```

- Actions fire **after** a successful Status write and entry-marker stamp,
  inside the `!SKIP_NETWORK` branch of `scripts/gh/move-state.mjs`.
- Actions never refuse a transition; if one throws, the failure is logged
  to stderr and the transition stands.
- Re-firing an action on a subsequent move into the same state must be safe
  (no duplicate comments, no double-stamps).

`onEnter` is **not** the place for the deep work of a state. Refining the
issue body, writing code, running tests, reviewing changes — all of that
happens inside `/task <verb>` sessions inhabiting the state. The verb
commands are inhabitants of states, not parts of state objects.

## How the registry sees this

`scripts/task-tracker/lib/state-bootstrap.mjs` walks `STATES` once at import
and feeds each guard into the flat `guard-registry.mjs` registry. Existing
`runGuards(from, to, ctx)` callers (central state-mover, parity tests) keep
working unchanged. `lib/guard-bootstrap.mjs` is now a deprecation shim that
re-exports the new bootstrap entry-point.

The state-objects are the new source of truth; the registry is the runtime
dispatch layer. Adding a guard means adding it to the state's `exitGuards`
or `entryGuards` list — never registering directly against the registry.

## Guard migration status

All five guard-migration sub-issues below are shipped (closed): the
per-state `exitGuards`/`entryGuards` arrays in
`scripts/task-tracker/states/<state>.mjs` are the live dispatch path for
every forward transition — not a future plan. Each state module's own
header comment names which former inline call site each guard replaced.

| Issue | Scope                                            |
| ----- | ------------------------------------------------ |
| #277  | plan→develop entry gates → `plan.exitGuards`     |
| #278  | develop→test entry gates → `develop.exitGuards`  |
| #267  | test→review preflight → `test.exitGuards`        |
| #279  | review→done close-gates → `review.exitGuards`    |
| #271  | strip `promote.mjs` / `demote.mjs` inline checks |

`onEnter` is the one piece of the container shape still stubbed: every
state's `onEnter: Object.freeze([])` today. The per-transition side effects
that will eventually live there (entry-timestamp stamping, pickup-directive
posting, timing-log row writes) currently still run as hardcoded steps
inside `scripts/task-tracker/lib/move-state/*` rather than as per-state
Actions. Migrating them is tracked by #1117 (open).

## Entry markers

On every successful transition, `stampEntryMarkers`
(`scripts/task-tracker/lib/move-state/github-mutation.mjs`, delegating to
`stampEntryMarker` in `scripts/task-tracker/lib/stage-entry-markers.mjs`)
stamps an `<!-- aitm-entered-<stage>: <iso-ts> -->` marker into the issue
body as a tamper-evident, append-only audit trail of every stage the issue
has visited. First-stamp wins per stage; a stage re-entered on a later
visit is recorded with a `-N` suffix (e.g. `aitm-entered-develop-2`).

Ordering, per `move-state-core.mjs`: **Status field write → entry-marker
stamp → onEnter dispatch** (the last step is currently a no-op — see above).

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
