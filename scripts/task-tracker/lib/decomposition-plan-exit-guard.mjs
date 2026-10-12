// @story #1991 — shared current assessment; historical prose cannot grant admission.
import path from 'node:path';
import { getProjectDir } from '../paths.mjs';
import { collectHookDecompositionSnapshot } from './decomposition-hook-authority.mjs';
import { decompositionRuntimeFor } from './action-decision/decomposition.mjs';
import { classifyDecomposition } from './decomposition-policy.mjs';
import { ownershipDecision } from './ownership-policy.mjs';
import { stripBodyVersion } from './versioned-issue-write.mjs';

function comparableSourceBody(body) {
  return stripBodyVersion(body)
    .replace(
      /<!-- aitm-last-known-state state="(backlog|refine|ready-for-plan|plan|develop|test|review|done)" ts="([^"]+)" -->/g,
      (marker, state, ts) => {
        const parsed = Date.parse(ts);
        if (!Number.isFinite(parsed)) return marker;
        const canonical = new Date(parsed).toISOString();
        return ts === canonical || ts === canonical.replace('.000Z', 'Z')
          ? '<!-- aitm-last-known-state state="' + state + '" -->'
          : marker;
      }
    )
    .trim();
}
export const DECOMPOSITION_PLAN_EXIT_GUARD_ID = 'plan-exit-decomposition';
export async function evaluateIssueDecomposition({
  issueNumber,
  cfg,
  body,
  deps = {},
  projectDir,
} = {}) {
  const issue = Number(issueNumber);
  if (!Number.isSafeInteger(issue) || issue <= 0 || !cfg?.repo)
    throw new TypeError('decomposition:subject');
  const ports = deps.decomposition ?? deps;
  const root = ports.projectDir ?? projectDir ?? getProjectDir();
  let current, signals;
  if (ports.runtime) {
    const { subject, runtime } = ports;
    if (
      subject?.issue !== issue ||
      subject.repository !== cfg.repo.toLowerCase() ||
      subject.projectId !== cfg.projectId
    )
      throw new TypeError('decomposition:mixed-subjects');
    current = await runtime.collect(subject);
    if (ports.readOwnership) signals = await ports.readOwnership({ issueNumber: issue, cfg });
  } else
    ({ current, signals } = await collectHookDecompositionSnapshot({
      issue,
      cfg,
      projectDir: root,
      deps: ports,
    }));
  const freshBody = current.sourceObservations.readIssue.value?.body;
  if (body !== undefined && comparableSourceBody(body) !== comparableSourceBody(freshBody ?? ''))
    throw new Error('decomposition:source-body-changed');
  const input = current.input;
  return {
    ...current,
    signals,
    body: freshBody,
    projectDir: root,
    values: { size: input.size, estimate: input.estimate.hours },
    classification: classifyDecomposition({
      size: input.size,
      estimateHours: input.estimate.hours,
      planText: input.plan.content ?? '',
    }),
    effectiveStatus: current.assessment.status,
    planDiagnostic: {
      path: input.plan.path ? path.resolve(root, input.plan.path) : null,
      diagnostic:
        input.plan.availability === 'unavailable' ? 'current source plan unavailable' : null,
    },
    planSelection: {
      ok: input.plan.availability !== 'unavailable',
      applied: input.plan.section !== null,
      heading: input.plan.section,
      diagnostic:
        input.plan.availability === 'unavailable' ? 'current source plan unavailable' : null,
    },
  };
}
export function decompositionRefusal(result, issue) {
  const status = result.assessment.status;
  const code =
    status === 'pending'
      ? 'decomposition-assessment-pending'
      : status === 'indeterminate' || result.projection.status !== 'current'
        ? 'decomposition-authority-unavailable'
        : 'decomposition-required';
  const args = { issue, operationId: result.publication?.operationId ?? null };
  const guidance =
    code === 'decomposition-authority-unavailable'
      ? 'Run npx aitm resume ' + issue + ' to refresh current authority.'
      : 'Run npx aitm split-plan ' +
        issue +
        ' --dry-run, or use a reviewed scope revision and native re-estimation; reconcile pending publication first.';
  const blockers = [
    'plan-exit-decomposition: ' + status,
    guidance,
    ...result.assessment.blockers.map((b) => b.code),
  ];
  return {
    ok: false,
    code,
    args,
    reason: blockers.join('; '),
    blockers,
    ...(code === 'decomposition-authority-unavailable'
      ? { remediation: { id: 'refresh-decomposition', args: { issue } } }
      : { noAutomaticRemediation: { reason: 'operator-reviewed-evidence-required' } }),
  };
}
export async function assertGovernedDecompositionRecovery(options) {
  const result = await evaluateIssueDecomposition(options);
  const reasons = result.input.availability.reasons;
  // Recovery requires its own source/plan/ownership, not estimate publication convergence.
  const source = result.sourceObservations.readIssue;
  if (
    source.status !== 'observed' ||
    source.value?.number !== Number(options.issueNumber) ||
    typeof source.value?.body !== 'string' ||
    result.sourceObservations.readSelectedPlan.status !== 'observed' ||
    result.input.plan.availability !== 'available' ||
    reasons.includes('scope-unavailable')
  )
    throw new Error('decomposition:recovery-source-unavailable');
  const owner = ownershipDecision(result.signals);
  if (!owner.ok) throw new Error('decomposition:recovery-' + owner.kind);
  return result;
}
export async function refreshGovernedDecomposition({ issueNumber, cfg, projectDir, deps = {} }) {
  try {
    const ports = deps.decomposition ?? deps;
    const { subject, runtime } = ports.runtime
      ? ports
      : await decompositionRuntimeFor({ issue: Number(issueNumber), cfg, projectDir, deps: ports });
    const refresh = await runtime.refresh(subject);
    return { status: refresh.status, current: await runtime.collect(subject) };
  } catch (error) {
    return { status: 'unconfirmed', reason: error.message };
  }
}
export const decompositionPlanExitGuard = {
  id: DECOMPOSITION_PLAN_EXIT_GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx?.cfg || !ctx?.issueNumber) return { ok: true };
    const issue = Number(ctx.issueNumber);
    let result;
    try {
      result = await evaluateIssueDecomposition({ ...ctx, issueNumber: issue });
    } catch (error) {
      return {
        ok: false,
        code: 'decomposition-authority-unavailable',
        args: { issue, operationId: null },
        reason: error.message,
        remediation: { id: 'refresh-decomposition', args: { issue } },
      };
    }
    const { input, assessment, projection } = result;
    if (
      projection.status === 'current' &&
      !['pending', 'indeterminate', 'must-decompose'].includes(assessment.status)
    ) {
      if (input.kind === 'epic')
        return input.epicReadiness.planning ? { ok: true } : decompositionRefusal(result, issue);
      return { ok: true };
    }
    return decompositionRefusal(result, issue);
  },
};
