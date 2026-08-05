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

## Migration roadmap

Future sub-issues will migrate the remaining inline guard checks into the
appropriate state container:

| Issue | Scope                                            |
| ----- | ------------------------------------------------ |
| #277  | plan→develop entry gates → `plan.exitGuards`     |
| #278  | develop→test entry gates → `develop.exitGuards`  |
| #267  | test→review preflight → `test.exitGuards`        |
| #279  | review→done close-gates → `review.exitGuards`    |
| #271  | strip `promote.mjs` / `demote.mjs` inline checks |
