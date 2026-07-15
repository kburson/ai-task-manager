# Timing Model v2 — pause-bracketed idle, phase-span active

**Date:** 2026-07-14
**Epic:** #823 (promoted from a single fix)
**Status:** Approved (design), pending implementation

## Problem

The ⏱ Timing Log manufactures idle time by heuristic. A 5-minute transcript-gap
threshold reclassifies any quiet window as `idle`, and the #534/#821 machinery
pairs an `active-work` row with an `idle` row at a shared checkpoint timestamp.
This is wrong in two directions:

- **Long tool executions** (a sandbox run, a full test suite) are quiet on the
  transcript but are burning compute — they get mislabeled `idle`.
- **Ordinary between-turn gaps** (the human simply hasn't sent the next prompt)
  get logged as `idle` even though nothing was blocked.

The result is logs polluted with phantom `idle` rows that must be hand-repaired
before an issue can be approved (most recently #813, whose develop phase carried
ten `active-work` rows and zero real pauses). The `active-work`/`idle` stamping
should never have existed. This epic rips it out and rebuilds timing on the state
machine.

## Model

The timing log is a **phase state machine**. Time is accounted purely from phase
boundaries and explicit human-blocking brackets. There is no inference.

### Row vocabulary — the complete set

| Row | Carries | Meaning |
|---|---|---|
| `<phase>:started` | ts only (`activeSec: 0`, `words: 0`) | phase entry (including demote re-entry) |
| `<phase>:completed` | ts, **`activeSec`**, **`Δwords`** | phase exit; the only row that carries totals |
| `pause:{reason}` | ts | idle-bracket opens (agent blocked on human) |
| `switch-out:{issue}` | ts | idle-bracket opens (context-switch to another issue) |
| `resume:{reason}` | ts | idle-bracket closes; re-enters the last action-verb phase |

`phase ∈ {refine, plan, develop, test, review}`. `done` is terminal (but
re-openable — see reverse edges).

**`idle` and `active-work` rows are retired forever.** No row type outside the
table above may be emitted.

### Active time is derived, stamped at close

For each `<phase>:completed`:

```
activeSec = (completed.ts − started.ts) − Σ(resume.ts − departure.ts)
```

…summed over every `pause`/`switch-out` → `resume` bracket that falls inside
`[started, completed]`. Idle is **never stored** — it is exactly the bracket
delta. `Δwords` = context-words accrued since that phase's `:started`.

Consequences that fall out of this definition:
- Tool execution, API round-trips, and model thinking are **active** by
  construction — the agent has not yielded, so no bracket is open.
- A between-turn gap with no open `pause` is **active** phase time. Passive
  human-away time therefore counts toward the phase; this is accepted (the phase
  boundary is the unit of "engaged on this issue").
- Idle exists **only** inside an explicit `pause`/`switch-out` → `resume`
  bracket. Correctness depends on one disciplined behavior: the agent emits
  `pause:{reason}` whenever it genuinely blocks on the human, and `resume:{reason}`
  when it returns. (This is the existing `/task pause` / `/task resume` path — no
  new yield-detection is introduced. **Option A** from design dialogue.)

### Pause emission contract (Option A)

The agent emits `pause:{reason}` **only** when it asks the human something and
cannot proceed without the answer (approval gate, design fork, clarification).
An ordinary turn-end — work delivered, next prompt not yet sent — is **not** a
pause. Full-auto continuous drive never asks → never pauses → the phase is fully
active by construction.

### Demotes are re-entries

A demote does not rewind a phase; it **re-enters** the target phase. The
demoted-to state's `:started` is the opening salvo (fresh span,
`activeSec: 0`); its `:completed` at re-promote carries that re-entry's active
time and Δwords. A phase can therefore appear more than once in a log; the
phase's grand total = the **sum across its entries**.

**Legal reverse edges** (the state-machine validator accepts exactly these; every
other reverse edge and every forward skip is rejected):

- `Test → Develop`
- `Review → Test`
- `Review → Develop`
- `Done → Test` (re-open a closed issue; from Test the normal demotes apply, so
  `Done → Test → Develop` is two hops)

Forward path is monotonic: `Refine → Plan → Develop → Test → Review → Done`.

## Work breakdown — epic #823 → 5 children

Ordering: **C1 → C2** (rip out, then rewrite the writer); **C3, C4, C5** depend
on C2's schema/calc (C4 reuses C2's recompute). C1↔C2 share files heavily
(`orphan-finalize.mjs`, `timing-event-map.mjs`), so this is a **sequential
main-thread drive**, not a parallel worktree fan-out.

### C1 — Rip out the emitters and the auto-pause machinery

Delete every producer of `active-work`/`idle` and the natural-gap apparatus:

- `scripts/task-tracker/orphan-finalize.mjs` — remove `emitActiveWorkSegment`
  and the `idle`-row post in `postOrEnqueue`; remove/retire
  `finalizeOrphanPause`, `finalizePauseForSwitch`, `sweepStaleSessionDirs`
  idle-emission paths.
- `scripts/task-tracker/hooks/on-stop.mjs` — remove the `pending-pause.json`
  auto-writer (the automatic natural-gap marker).
- `scripts/task-tracker/lib/timing-event-map.mjs` — remove `active-work` from
  `AUDIT_PHASE_SLUGS` and remove the `idle` departure classification.

After C1, nothing auto-manufactures idle. `/task pause` / `/task resume` (explicit
brackets) and phase transitions are the only timing-event sources.

### C2 — Phase-close writer

The `<phase>:completed` writer computes and stamps:

- `activeSec = span − Σ idle-brackets` (per the model above).
- `Δwords` = context-words accrued since that phase's `:started`.

Handles demote re-entry (fresh `:started`; totals summed across a phase's
entries) and `pause`/`switch-out` → `resume` bracket subtraction. `resume`
re-enters the last action-verb phase.

### C3 — Consumers recompute from spans

`scripts/task-tracker/lib/.../active-time.mjs`, the timing rollups, and the
ai-value-framework "Actual Session Time" read **phase + pause/switch-out/resume
rows only** and compute from phase spans − pause deltas. They **ignore** any
legacy `idle`/`active-work` rows (which C4 removes anyway). No dual code path —
one uniform phase-span calculation.

### C4 — Heal all historical logs

One-time, **idempotent, re-runnable** sweep across **open and closed** issues:

- Strip every `idle` and `active-work` row.
- Recompute each `<phase>:completed.activeSec` from its phase span − brackets.
- Fold the stripped `active-work` rows' word counts into the enclosing
  `:completed` `Δwords` (lossless).

#813's develop phase collapses to a single `develop:started → develop:completed`
span (~2h38m52s active, zero idle). The heal treats history "as if the
`active-work`/`idle` stamping never existed."

### C5 — V3 validator + test suite

- `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs`:
  departures = `pause`/`switch-out` only; reengagement = `resume`; phases
  re-enterable via the four legal reverse edges; **zero** `idle`/`active-work`
  rows expected; healed logs pass.
- Rewrite `scripts/task-tracker/tests/unit/orphan-finalize.test.mjs` (the
  old tests assert `idle`-row emission — remove/replace) and
  `.../timing-log-sequence.test.mjs` to the new grammar.

## Testing

- Per-phase: each child runs its own targeted `node --test` files at Develop
  (`verify-develop.mjs`).
- C4 heal: unit test with a synthetic legacy log (idle + active-work rows) →
  asserts stripped output + recomputed `activeSec` + folded `Δwords`;
  idempotence assertion (heal twice = heal once).
- C5: state-machine regression — legal reverse edges accepted, illegal reverse
  edges and forward skips rejected; a develop phase with no `idle`/`active-work`
  rows passes; a `pause:question` → `resume:answer` bracket is accepted.
- Full `npm run test:all` runs once per child at Test (isolated worktree).

## Out of scope / non-goals

- No new yield-detection or auto-pause heuristic (Option A is deliberate).
- No change to the forward monotonic chain or to `/task` verb names.
- No new headline metric; `Δwords` per phase preserves the existing value-framework signal.
