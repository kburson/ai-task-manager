// @story #1988 — adapter preparation; only current reads grant ownership.
import { createHash } from 'node:crypto';
import { projectItemForIssue } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import { createDecompositionRuntime } from './decomposition-authority.mjs';
import {
  canonicalDecompositionJson,
  decompositionInputDigest,
} from './decomposition-assessment.mjs';
import { publishEstimateRevision, estimateEffectDigest } from './decomposition-publication.mjs';
export const observedEstimateEffect = (value) => ({
  status: 'observed',
  value,
  digest: estimateEffectDigest(value),
});
export function estimateOperationId(writerId, key) {
  const hex = createHash('sha256')
    .update(canonicalDecompositionJson({ writerId, key }))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
// This is an intended-value calculation, never an authority observation or admission.
export function intendedPublishedRevisionInput(initial, proposal) {
  const input = structuredClone(initial.input);
  input.estimate = structuredClone(proposal.estimate);
  input.size = proposal.size;
  const project = {
    ...initial.sourceObservations.readProject.value,
    estimate: proposal.estimate.hours,
    size: proposal.size,
  };
  input.observations.find((o) => o.resource === 'project').digest = estimateEffectDigest({
    projectId: project.projectId,
    projectItemId: project.projectItemId,
    estimate: project.estimate,
    size: project.size,
  });
  const forecast = structuredClone(initial.sourceObservations.readForecast.value);
  if (Array.isArray(forecast?.observedProjections))
    forecast.observedProjections = forecast.observedProjections.map((value) => ({
      ...value,
      estimate: proposal.estimate.hours,
      size: proposal.size,
    }));
  input.observations.find((o) => o.resource === 'forecast').digest = forecast
    ? estimateEffectDigest(forecast)
    : null;
  return input;
}
export async function executeEstimateWriter({
  cfg,
  issueNumber,
  writerId,
  key,
  proposal,
  effects: makeEffects,
  deriveIntendedInput,
  deps = {},
}) {
  const { subject, projectDir } = await resolveEstimateWriterSubject({ cfg, issueNumber, deps });
  let adapters = [];
  const runtime = createDecompositionRuntime({
    cfg,
    projectDir,
    deps: {
      ...deps.decomposition,
      readPublicationEffect: async ({ effect }) => {
        const adapter = adapters.find((e) => e.id === effect.id);
        if (!adapter) throw new Error('estimate-publication:unregistered-effect');
        return adapter.read();
      },
    },
  });
  const initial = await runtime.collect(subject),
    operationId = estimateOperationId(writerId, key);
  const prior = initial.publication?.operationId === operationId ? initial.publication : null;
  if (!prior && initial.input.availability.status !== 'complete')
    throw new Error(
      `estimate-publication:authority-unavailable:${initial.input.availability.reasons.join(',')}`
    );
  adapters = await makeEffects({
    subject,
    operationId,
    createdAt: prior?.createdAt ?? new Date().toISOString(),
    initial,
  });
  const intended =
    prior?.intendedInputDigest ??
    decompositionInputDigest(
      deriveIntendedInput
        ? deriveIntendedInput(initial)
        : intendedPublishedRevisionInput(initial, proposal)
    );
  return publishEstimateRevision({
    subject,
    operationId,
    expectedInputDigest: prior?.beforeInputDigest ?? initial.inputDigest,
    proposal,
    effects: adapters,
    deps: {
      runtime,
      writerId,
      intendedInputDigest: intended,
      beforeEffects: deps.beforePublicationEffects,
      withEffects: deps.withPublicationEffects,
    },
  });
}

export async function resolveEstimateWriterSubject({ cfg, issueNumber, deps = {} }) {
  if (!cfg?.repo || !cfg.projectId)
    throw new Error('estimate-publication:configured-membership-required');
  const item = await (deps.projectItemForIssue ?? projectItemForIssue)({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber,
  });
  if (!item?.itemId) throw new Error('estimate-publication:configured-membership-required');
  const subject = {
    repository: cfg.repo.toLowerCase(),
    issue: issueNumber,
    projectId: cfg.projectId,
    projectItemId: item.itemId,
  };
  const projectDir = deps.projectDir ?? getProjectDir();
  return { subject, projectDir };
}

export async function readEstimateWriterAuthority({ cfg, issueNumber, deps = {} }) {
  const { subject, projectDir } = await resolveEstimateWriterSubject({ cfg, issueNumber, deps });
  return createDecompositionRuntime({ cfg, projectDir, deps: deps.decomposition ?? {} }).collect(
    subject
  );
}
