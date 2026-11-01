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
import { loadForecastProjection, plannedAppendix } from './estimation/runtime-adapter.mjs';
import { readPlanApprovedForecastRecordId, stripFencedCodeBlocks } from './markers.mjs';
import { parseAitmRecord } from './github-records/record-envelope.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { resolveLocalForecast } from './estimation/forecast-lineage.mjs';
import { requireCurrentSchema } from './estimation/forecast-legacy.mjs';
import { ceilEstimateHours } from './estimation/estimate-granularity.mjs';
import { visibleMetadataFieldValue } from './decomposition-policy.mjs';
import { readCandidateForecastReady } from './plan-approved-guard.mjs';
import { resolveStoryIntentSource } from './story-intent-source.mjs';

export const GUARD_ID = 'plan-exit-planned-estimate';
const FORECAST_READY_RE =
  /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i;

function forecastFailure(reason, blocker = 'plan-candidate-forecast-' + reason) {
  return {
    ok: false,
    code: 'plan-forecast-invalid',
    args: { reason },
    noAutomaticRemediation: { reason: 'operator-action-required' },
    blockers: [blocker],
  };
}
// Read-only source facts; this grants no approval actor or transition authority.
export function readPlanCandidateForecastFacts({ body, projectDir } = {}) {
  const source = resolveStoryIntentSource({ body, projectDir });
  if (!source.ok) throw new Error('plan-candidate:forecast-plan-source');
  return {
    planObservation: source.observation,
    approved: { forecastRecordId: readPlanApprovedForecastRecordId(body) },
  };
}
export function requireUniqueRefineEstimateComment(comments, issue) {
  const marker = new RegExp('<!--\\s*aitm-refined-estimate:\\s*' + issue + '\\s*-->', 'gi');
  const matches = comments.flatMap((row) =>
    [...stripFencedCodeBlocks(row.body).matchAll(marker)].map(() => row)
  );
  if (matches.length !== 1) throw new Error('plan-candidate:ambiguous-refine');
  return { ...matches[0], body: stripFencedCodeBlocks(matches[0].body) };
}

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
    return forecastFailure('ready-mismatch', 'plan-forecast-ready-mismatch');
  }
  const plan = forecast.payload?.plan;
  if (
    !plan ||
    board?.size !== plan.size ||
    board?.estimate !== plan.humanHours ||
    bodyFields?.size !== plan.size ||
    bodyFields?.estimate !== plan.humanHours
  ) {
    return forecastFailure('projection-divergence', 'plan-forecast-projection-divergence');
  }
  return { ok: true, forecastRecordId: forecast.recordId };
}

// @story #2069 — only complete observed rows plus confirmed effects reach this port.
// This port never constructs a cloud client or hydrates missing local evidence.
export function validatePlanCandidateForecast({
  admitted,
  body,
  snapshot,
  comments,
  evidenceStore,
  estimateRequired = true,
}) {
  let ready;
  try {
    ready = readCandidateForecastReady(body);
  } catch {
    return forecastFailure('ready-ambiguous');
  }
  if (ready === null && !(admitted.cfg.estimationRubricIssue > 0)) return { ok: true };
  const refuse = (reason) => forecastFailure(reason);
  if (ready === null || ready !== admitted.approved.forecastRecordId) return refuse('freeze');
  try {
    // The cache's native observations already bind each node to this subject.
    // Do not invent provider author/timestamp fields required by the cloud store.
    const records = comments
      .filter((row) => /<!--\s*aitm-record/i.test(row.body))
      .map((row) =>
        parseAitmRecord({
          commentNodeId: row.id,
          body: row.body,
          expectedRepository: admitted.repository,
          expectedIssue: admitted.issue,
        })
      )
      .filter(({ envelope }) => envelope.recordType === 'estimation-forecast');
    const byId = new Map(records.map((row) => [row.envelope.recordId, row]));
    if (
      byId.size !== records.length ||
      records.some(
        ({ envelope }) =>
          envelope.predecessor !== envelope.supersedes ||
          (envelope.predecessor !== null && !byId.has(envelope.predecessor))
      )
    )
      return refuse('lineage');
    const superseded = new Set(records.map(({ envelope }) => envelope.supersedes).filter(Boolean));
    const active = records.filter(({ envelope }) => !superseded.has(envelope.recordId));
    // A single apparent head cannot conceal a disconnected cycle or fork.
    const visited = new Set();
    let cursor = ready;
    while (cursor !== null) {
      if (visited.has(cursor) || !byId.has(cursor)) return refuse('lineage');
      visited.add(cursor);
      cursor = byId.get(cursor).envelope.predecessor;
    }
    if (visited.size !== records.length) return refuse('lineage');
    const record = byId.get(ready);
    const fields = new Map(snapshot.fields.map((row) => [row.fieldId, row.value]));
    const stored = parseIssueFieldDb(body);
    const projection = validateForecastProjection({
      forecast: record
        ? {
            recordId: ready,
            payload: record.envelope.payload,
            supersededBy: superseded.has(ready) ? true : null,
          }
        : null,
      activeForecastRecordIds: active.map(({ envelope }) => envelope.recordId),
      readyForecastRecordId: ready,
      board: {
        size: fields.get(fieldIdFor(admitted.cfg, 'size'))?.name ?? null,
        estimate: fields.get(fieldIdFor(admitted.cfg, 'estimate')) ?? null,
      },
      bodyFields: stored.ok ? stored.values : null,
    });
    if (!projection.ok) return projection;
    try {
      if (
        admitted.currentForecastSelection?.configuration?.estimationRubricIssue !==
        admitted.cfg.estimationRubricIssue
      )
        return refuse('current-selection');
      requireCurrentSchema(record.envelope.payload, {
        expectedIssue: admitted.issue,
        repository: admitted.repository,
        evidenceStore,
        identity: {
          host: snapshot.identity.host,
          repository: admitted.repository,
          issue: admitted.issue,
        },
        selection: admitted.currentForecastSelection,
      });
    } catch {
      return refuse('current-selection');
    }
    const resolved = resolveLocalForecast({
      forecast: record.envelope.payload,
      evidenceStore,
      identity: {
        host: snapshot.identity.host,
        repository: admitted.repository,
        issue: admitted.issue,
      },
    });
    if (resolved.status !== 'resolved') return refuse('local-evidence-unavailable');
    const plan = resolved.forecast.localEvidence.plan;
    const commit =
      visibleMetadataFieldValue(body, 'Plan Metadata', 'Source-plan-commit') ??
      visibleMetadataFieldValue(body, 'Plan Metadata', 'Implementation-plan-commit');
    const section = visibleMetadataFieldValue(body, 'Plan Metadata', 'Source-plan-section');
    if (
      !admitted.planObservation ||
      plan.path !== admitted.planObservation.path ||
      plan.digest !== admitted.planObservation.contentSha256 ||
      !commit ||
      plan.commit !== commit ||
      !section ||
      plan.section !== section
    )
      return refuse('plan-drift');
    const appendix = estimateRequired
      ? plannedAppendix(
          [requireUniqueRefineEstimateComment(comments, admitted.issue)],
          admitted.issue
        )
      : null;
    if (
      estimateRequired &&
      (!appendix ||
        ['refine', 'plan'].some(
          (key) =>
            appendix[key].size !== resolved.forecast[key].size ||
            ceilEstimateHours(appendix[key].humanHours) !== resolved.forecast[key].humanHours
        ))
    )
      return refuse('estimate-drift');
    return projection;
  } catch {
    return refuse('unavailable');
  }
}

export const planExitPlannedEstimateGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) return { ok: true };
    const estimateWaived = ctx.workflowPolicy?.isWaived?.('planning.planned-estimate') === true;
    const forecastWaived = ctx.workflowPolicy?.isWaived?.('planning.forecast') === true;
    if (!estimateWaived) {
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
    }
    if (forecastWaived) return { ok: true };
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
