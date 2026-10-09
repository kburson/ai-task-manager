### Correction — Plan estimate is L / 10, not M / 3

The execution-handoff record on this issue (`plan.execution-handoff-v1`) states:

> Plan estimate: M / 3 hours; forecast record `01M1HCG2VAJQD5ZJW8D6SQBNBA`.

That line is wrong, and it caused two successive handoffs to describe a metadata
divergence that does not exist. M / 3 is the **Refine** estimate. The **Plan**
estimate is **L / 10**.

Forecast record `01M1HCG2VAJQD5ZJW8D6SQBNBA` carries both halves:

- `refine`: size `M`, humanHours `3`
- `plan`: size `L`, humanHours `10`, deltaHours `7`

All five sources are mutually consistent:

| Source | Refine | Plan |
|---|---|---|
| `aitm-refinement-snapshot` (ts 2026-09-02T14:53:02.650Z) | M / 3 | n/a |
| Forecast record `01M1HCG2VAJQD5ZJW8D6SQBNBA` | M / 3 | L / 10 |
| `### Planned Estimate` appendix table | M / 3 | L / 10 (M→L, +7) |
| `aitm-fields` body cache | n/a | L / 10 |
| Live project board | n/a | L / 10 |

`plan-estimate` ran at 2026-09-02T15:41:12.426Z and converged the board, the body
field cache, and the forecast onto the Plan values. The refinement snapshot
correctly retains the Refine values: it is the historical Refine-exit record, and
`refinementSnapshotGuard` only evaluates on a transition whose target state is
`ready-for-plan`, which is already behind this issue.

Consequences for anyone picking this up:

1. There is nothing to reconcile. `npx aitm reconcile accept-live 1485` refuses
   with `no drift detected` — that verb reconciles kanban-state drift only and
   was never the instrument for field values.
2. The Plan to Develop gate that reads these values is
   `planExitPlannedEstimateGuard` to `validateForecastProjection`, which compares
   the forecast's **plan** half against the board and the body cache. L / 10
   against L / 10 and L / 10 passes.
3. A `plan-forecast-freeze-missing` refusal before `plan-approve` is expected and
   is not drift; `plan-approve` writes the freeze marker.

No field values were changed by this correction. It records the misreading so the
next reader does not re-derive it.

Filed separately during this review: #1486, tracking consolidation of the five
duplicated epic graph-node parent branch-authority adapters, deliberately
deferred by this issue's design spec (Approach 3).
