# Characterization Harness for the State-Machine Orchestrators

The code-review polish epic (#549) refactors the three orchestrators that drive
the AITM state machine:

- `scripts/gh/move-state.mjs` — the single audited Status mutator.
- `scripts/task-tracker/verbs/promote.mjs` — the forward-transition router
  (`runPromote`).
- `scripts/task-tracker/verbs/close.mjs` — the terminal-close pipeline
  (`verbClose`).

Before any of those refactors lands, their **external behavior** is pinned by a
characterization harness:

`scripts/task-tracker/tests/characterization/orchestrators.test.mjs`

## Why this exists

A characterization test captures what the code _does today_ — not what it
_should_ do — so that a behavior-preserving refactor can be verified by a green
bar and a behavior-changing one is forced to announce itself with a red bar.

This harness is the safety net for the refactor user stories that follow it:

- **US-10** (#559) — move-state.mjs internal cleanup.
- **US-11** (#560) — promote.mjs decomposition.
- **US-12** (#561) — close.mjs decomposition.

Each of those stories is allowed to move internal structure freely **only
because** this harness will go red the moment observable behavior drifts. The
harness is therefore a hard gate: US-10/US-11/US-12 may not be marked complete
unless `node --test scripts/task-tracker/tests/characterization/orchestrators.test.mjs`
is still green against the refactored code.

## The binding constraint — public boundary only

Every assertion in the harness reads **only the public boundary**:

| Orchestrator | Observable boundary asserted                                             |
| ------------ | ------------------------------------------------------------------------ |
| move-state   | process exit code (3 internal-gate, 5 matrix) + stdout/stderr text       |
| promote      | the structured value `runPromote` returns (`status`/`from`/`to`/message) |
| close        | stdout, process exit code, and the ORDER of injected side-effect calls   |

No assertion names a private function, imports an internal helper to probe it,
or inspects module shape. This is deliberate and non-negotiable: a
characterization test that secretly couples to structure is **worse than none**,
because it would give a false green during exactly the refactors it exists to
protect. If US-11 renames an internal helper inside `promote.mjs`, the harness
stays green; if it changes what a caller observes, the harness goes red.

Contrast with `scripts/task-tracker/tests/unit/close-fail-closed.test.mjs`,
which asserts on the _source text_ of `close.mjs` via regex. That style is
exactly what this harness forbids — source-regex tests pass even when behavior
changes (as long as the matched text survives) and fail on harmless renames.

## How each orchestrator is driven hermetically

- **move-state** has no injectable core, so it is driven as a subprocess under
  `TT_SKIP_NETWORK=1` against a throwaway `.ai-task-manager` sandbox. Only the
  exit code and emitted text are asserted.
- **promote** exposes `runPromote({ issueNumber, cfg, deps })` as a pure core.
  Every I/O dependency (`fetchIssueBody`, `getLiveState`, `mutateIssueBody`,
  `spawnVerb`, `runMoveState`, `assertBound`) is stubbed, so the test pins the
  router's pre-guard decision surface with zero network.
- **close** exposes `verbClose(ctx)` with a fully-injected ctx. Under
  `SKIP_NETWORK: true`, stub deps record into an ordered `sequence[]` and the
  test asserts on the resulting event order plus captured stdout.

## Running it

```
node --test scripts/task-tracker/tests/characterization/orchestrators.test.mjs
```

Expected: all tests pass against current `trunk`. A failure means either a real
behavior regression or a characterization that needs updating to match an
intentional behavior change — never silently edit the harness to make a red bar
green without confirming which of the two it is.
