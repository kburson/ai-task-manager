// @story #1989
import { sessionNetworkSkipped } from '../verb-preflight.mjs';
import { deriveDecompositionCapabilities } from '../decomposition-assessment.mjs';
// Current authority is collected; caller permissions and persisted session flags are never accepted.
import { createDecompositionRuntime } from '../decomposition-authority.mjs';
import { projectItemForIssue } from '../../../gh/lib/github-projects.mjs';

const recovery = ['inspect', 'checkpoint', 'decomposition-prepare', 'authority-recover'];
export async function decompositionRuntimeFor({ issue, cfg, projectDir, deps = {} }) {
  if (sessionNetworkSkipped()) throw new Error('decomposition:authority-read-skipped');
  const found = await (deps.projectItemForIssue ?? projectItemForIssue)({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber: issue,
  });
  const subject = {
    repository: cfg.repo,
    issue,
    projectId: cfg.projectId ?? null,
    projectItemId: found.itemId ?? null,
  };
  return {
    subject,
    runtime: createDecompositionRuntime({ cfg, projectDir, deps: deps.authority ?? {} }),
  };
}

export async function inspectBoundDecomposition(ctx, target) {
  const issue = Number(String(target).replace(/^#/, ''));
  let current;
  let confirmed = false;
  try {
    if (sessionNetworkSkipped()) throw new Error('decomposition:authority-read-skipped');
    const { subject, runtime } =
      ctx.decomposition ??
      (await decompositionRuntimeFor({ issue, cfg: ctx.cfg, projectDir: ctx.projectDir }));
    if (subject.issue !== issue) throw new Error('decomposition:mixed-subjects');
    try {
      confirmed = (await runtime.refresh(subject)).status === 'confirmed';
    } catch {
      /* Inspection binding remains valid, implementation does not. */
    }
    current = await runtime.collect(subject);
    const derived = deriveDecompositionCapabilities(current.assessment, current.publication);
    current = {
      ...current,
      capabilities:
        current.projection.status === 'current' || current.assessment.status === 'pending'
          ? derived
          : recovery.filter((capability) => derived.includes(capability)),
    };
    if (!confirmed)
      current = {
        ...current,
        capabilities: recovery.filter((capability) => current.capabilities.includes(capability)),
      };
  } catch {
    current = {
      assessment: { status: 'indeterminate' },
      projection: { status: 'absent' },
      publication: null,
      capabilities: recovery,
    };
  }
  if (!current.capabilities.includes('scoped-implementation'))
    console.log(
      'Decomposition restriction for #' +
        issue +
        ': ' +
        current.assessment.status +
        '; available: ' +
        current.capabilities.join(', ')
    );
  return { status: 'bound', decomposition: current };
}

export async function observeDecompositionForAction({
  actionId,
  state,
  subject,
  attempt,
  runtime,
}) {
  const scope = 'decomposition:' + subject.repository + ':' + subject.issue;
  const observation = await attempt.observe({
    resource: 'decomposition',
    identity: 'issue:' + subject.issue + ':3',
    scope,
    collect: async (request) => {
      if (sessionNetworkSkipped()) throw new Error('decomposition:authority-read-skipped');
      const current = await runtime.collect(subject);
      // Internal provider snapshots contain Maps; observe only decision authority in the JSON domain.
      const { input, inputDigest, assessment, publication, projection } = current;
      return { ...request, value: { input, inputDigest, assessment, publication, projection } };
    },
  });
  let current = observation.status === 'observed' ? observation.value : null;
  try {
    if (current) {
      const derived = deriveDecompositionCapabilities(current.assessment, current.publication);
      current = {
        ...current,
        capabilities:
          current.projection.status === 'current' || current.assessment.status === 'pending'
            ? derived
            : recovery.filter((capability) => derived.includes(capability)),
      };
    }
  } catch {
    current = null;
  }
  const operationId = current?.publication?.operationId ?? null;
  const codes = [];
  if (
    current?.assessment?.status === 'must-decompose' ||
    (current?.assessment?.status === 'epic-readiness-required' &&
      !(actionId === 'promote' && state === 'plan'
        ? current.input.epicReadiness.planning
        : current.capabilities.includes(
            ['close', 'deliver', 'review', 'test', 'promote'].includes(actionId)
              ? 'scoped-completion'
              : 'scoped-implementation'
          )))
  )
    codes.push('decomposition-required');
  if (current?.assessment?.status === 'pending') codes.push('decomposition-assessment-pending');
  if (
    !current ||
    current.assessment.status === 'indeterminate' ||
    (current.projection.status !== 'current' && current.assessment.status !== 'pending')
  )
    codes.push('decomposition-authority-unavailable');
  const blockers = codes.map((code) => ({
    code,
    guardId: 'decomposition-continuation',
    args: { issue: subject.issue, operationId },
    ...(code === 'decomposition-authority-unavailable'
      ? { remediation: { id: 'refresh-decomposition', args: { issue: subject.issue } } }
      : { noAutomaticRemediation: { reason: 'operator-reviewed-evidence-required' } }),
  }));
  return {
    observations: [observation],
    blockers,
    warnings: ['bind', 'resume'].includes(actionId)
      ? codes.map((reason) => ({
          code: 'decomposition-bind-restricted',
          args: { issue: subject.issue, operationId, reason },
        }))
      : [],
    current,
  };
}
