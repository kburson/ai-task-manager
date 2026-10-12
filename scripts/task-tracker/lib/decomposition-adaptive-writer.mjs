// @story #1988 — concrete six-effect adaptive Plan adapter.
import {
  executeEstimateWriter,
  estimateOperationId,
  readEstimateWriterAuthority,
  intendedPublishedRevisionInput,
  observedEstimateEffect,
} from './estimate-writer-publication.mjs';
import { estimateEffectDigest } from './decomposition-publication.mjs';
import { runLogicalRecordClaim, withProcessRecordClaim } from './estimation/record-claim.mjs';
const appendix = (value) =>
  value?.refine && value?.plan
    ? {
        refine: { size: value.refine.size, humanHours: value.refine.humanHours },
        plan: { size: value.plan.size, humanHours: value.plan.humanHours },
      }
    : null;
export async function publishAdaptivePlanAuthority({ issueNumber, forecastEnvelope, deps }) {
  const cfg = deps.cfg,
    plan = forecastEnvelope.payload.plan,
    refine = forecastEnvelope.payload.refine;
  if (!cfg?.repo || !cfg.projectId) throw new Error('plan-estimate-authority:publication-config');
  const proposal = {
    estimate: { basis: 'published', hours: plan.humanHours, proposalId: null },
    size: plan.size,
  };
  return withProcessRecordClaim({ key: `plan-publication-prepare:${issueNumber}` }, () =>
    executeEstimateWriter({
      cfg,
      issueNumber,
      writerId: 'plan-estimate-adaptive',
      key: { recordId: forecastEnvelope.recordId, payloadHash: forecastEnvelope.payloadHash },
      proposal,
      deriveIntendedInput: (initial) => {
        const input = intendedPublishedRevisionInput(initial, proposal),
          fields = { estimate: plan.humanHours, size: plan.size };
        const forecast = {
          ...initial.sourceObservations.readForecast.value,
          estimate: plan.humanHours,
          size: plan.size,
          recordId: forecastEnvelope.recordId,
          proposals: [],
          observedProjections: [fields, fields],
        };
        const observation = input.observations.find((o) => o.resource === 'forecast');
        observation.identity = forecastEnvelope.recordId;
        observation.digest = estimateEffectDigest(forecast);
        return input;
      },
      deps: {
        ...deps,
        withPublicationEffects: (run) =>
          runLogicalRecordClaim(
            deps,
            { key: `forecast:${issueNumber}:${forecastEnvelope.payloadHash}`, issue: issueNumber },
            run
          ),
      },
      effects: async ({ subject }) => {
        const effect = (id, resource, targetIdentity, value, select, write, input) => ({
          id,
          resource,
          targetIdentity,
          value,
          read: async () => observedEstimateEffect(select(await deps.readProjection())),
          apply: () => deps[write](input),
        });
        const fields = { estimate: plan.humanHours, size: plan.size };
        return [
          effect(
            'appendix',
            'plan-appendix',
            `${cfg.repo}#${issueNumber}:planned-estimate`,
            appendix({ refine, plan }),
            (state) => appendix(state.refineAppendix),
            'writeRefineAppendix',
            { issueNumber, refine, plan }
          ),
          effect(
            'estimate',
            'project-estimate',
            subject.projectItemId,
            plan.humanHours,
            (state) => state.board?.estimate ?? null,
            'writeBoardEstimate',
            { issueNumber, estimate: plan.humanHours }
          ),
          effect(
            'size',
            'project-size',
            subject.projectItemId,
            plan.size,
            (state) => state.board?.size ?? null,
            'writeBoardSize',
            { issueNumber, size: plan.size }
          ),
          effect(
            'fields',
            'body-fields',
            `${cfg.repo}#${issueNumber}:fields`,
            fields,
            (state) => state.bodyFields,
            'writeBodyFields',
            { issueNumber, ...fields }
          ),
          effect(
            'forecast',
            'forecast',
            `record:${forecastEnvelope.recordId}`,
            { recordId: forecastEnvelope.recordId, payloadHash: forecastEnvelope.payloadHash },
            (state) => {
              const matches = state.forecasts.filter(
                (record) =>
                  record.recordId === forecastEnvelope.recordId && record.supersededBy == null
              );
              if (matches.length > 1) throw new Error('plan-estimate-authority:duplicate-forecast');
              return matches.length
                ? { recordId: matches[0].recordId, payloadHash: matches[0].payloadHash }
                : null;
            },
            'writeForecast',
            { issueNumber, envelope: forecastEnvelope }
          ),
          effect(
            'ready',
            'ready-marker',
            `${cfg.repo}#${issueNumber}:ready-marker`,
            forecastEnvelope.recordId,
            (state) => state.readyForecastRecordId,
            'writeForecastReadyMarker',
            { issueNumber, recordId: forecastEnvelope.recordId }
          ),
        ];
      },
    })
  );
}

export async function hasPendingAdaptivePublication({ issueNumber, forecastEnvelope, deps }) {
  const current = await readEstimateWriterAuthority({ cfg: deps.cfg, issueNumber, deps });
  const operationId = estimateOperationId('plan-estimate-adaptive', {
    recordId: forecastEnvelope.recordId,
    payloadHash: forecastEnvelope.payloadHash,
  });
  return (
    current.publication?.status === 'pending' &&
    current.publication.writerId === 'plan-estimate-adaptive' &&
    current.publication.operationId === operationId
  );
}
