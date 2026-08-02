// Plan-exit guard: planned-estimate appendix (#336).
//
// Wraps `planPlannedEstimateGate` so the plan→develop transition refuses
// when the `### 🛠 Refine estimate` comment lacks a `### Planned Estimate`
// appendix. Reached via `runGuards('plan', 'develop', ctx)` at
// scripts/gh/move-state.mjs:394.
//
// Context contract:
//   { cfg: Config, issueNumber: number, deps?: { plannedEstimate?: GhDeps } }
//
// Scope: only fires for plan → develop (other tos no-op). Fail-open when
// ctx is missing cfg/issueNumber.

import { planPlannedEstimateGate } from './refine-estimate-comment.mjs';
import { loadForecastProjection } from './estimation/runtime-adapter.mjs';
import { readPlanApprovedForecastRecordId } from './markers.mjs';

export const GUARD_ID = 'plan-exit-planned-estimate';
const FORECAST_READY_RE =
  /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i;

export function validateForecastProjection({
  forecast,
  activeForecastRecordIds,
  readyForecastRecordId,
  board,
  bodyFields,
} = {}) {
  if (
    !forecast ||
    forecast.recordId !== readyForecastRecordId ||
    forecast.supersededBy !== null ||
    !Array.isArray(activeForecastRecordIds) ||
    activeForecastRecordIds.length !== 1 ||
    activeForecastRecordIds[0] !== readyForecastRecordId
  ) {
    return { ok: false, blockers: ['plan-forecast-ready-mismatch'] };
  }
  const plan = forecast.payload?.plan;
  if (
    !plan ||
    board?.size !== plan.size ||
    board?.estimate !== plan.humanHours ||
    bodyFields?.size !== plan.size ||
    bodyFields?.estimate !== plan.humanHours
  ) {
    return { ok: false, blockers: ['plan-forecast-projection-divergence'] };
  }
  return { ok: true, forecastRecordId: forecast.recordId };
}

export const planExitPlannedEstimateGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) return { ok: true };
    const result = await planPlannedEstimateGate({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      deps: ctx.deps?.plannedEstimate,
    });
    if (!result.ok) {
      return {
        ok: false,
        reason: (result.blockers || []).join('; ') || 'planned-estimate-missing',
        blockers: result.blockers || [],
      };
    }
    const ready = String(ctx.body ?? '').match(FORECAST_READY_RE)?.[1] ?? null;
    const frozen = readPlanApprovedForecastRecordId(ctx.body);
    if (frozen !== null && frozen !== ready) {
      return {
        ok: false,
        reason: 'plan-forecast-freeze-mismatch',
        blockers: ['plan-forecast-freeze-mismatch'],
      };
    }
    const adaptiveConfigured =
      Number.isInteger(ctx.cfg.estimationRubricIssue) && ctx.cfg.estimationRubricIssue > 0;
    if ((ready !== null || adaptiveConfigured) && frozen === null) {
      return {
        ok: false,
        reason: 'plan-forecast-freeze-missing',
        blockers: ['plan-forecast-freeze-missing'],
      };
    }
    if (ready !== null || adaptiveConfigured) {
      const loadProjection =
        ctx.deps?.plannedEstimate?.forecastProjection ?? loadForecastProjection;
      const projection = validateForecastProjection({
        ...(await loadProjection({
          cfg: ctx.cfg,
          issueNumber: ctx.issueNumber,
          deps: ctx.deps?.plannedEstimate,
        })),
        readyForecastRecordId: ready,
      });
      if (!projection.ok) {
        return {
          ok: false,
          reason: projection.blockers.join('; '),
          blockers: projection.blockers,
        };
      }
      return projection;
    }
    return { ok: true };
  },
};
