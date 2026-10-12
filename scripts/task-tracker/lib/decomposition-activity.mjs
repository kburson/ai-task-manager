// @story #1990
import {
  validateDecompositionAssessment,
  validateDecompositionPublication,
  deriveDecompositionCapabilities,
} from './decomposition-assessment.mjs';
import { sessionNetworkSkipped } from './verb-preflight.mjs';
import { stripBodyVersion } from './versioned-issue-write.mjs';
import { collectHookDecompositionSnapshot } from './decomposition-hook-authority.mjs';

export function decompositionActivityUnavailable(
  issue,
  reason = 'current authority unavailable',
  operationId = null
) {
  return {
    decision: 'block',
    code: 'decomposition-authority-unavailable',
    args: { issue, operationId },
    reason: '[task-tracker] Decomposition authority unavailable for #' + issue + ': ' + reason,
  };
}
export function evaluateDecompositionActivity({
  activity,
  targets,
  assessment,
  publication = null,
}) {
  const issue = assessment?.subject?.issue ?? null;
  try {
    validateDecompositionAssessment(assessment);
    if (publication) validateDecompositionPublication(publication);
    let needed = 'scoped-deliverable';
    if (['COMMIT_CODE', 'COMMIT_DOCS'].includes(activity)) needed = 'checkpoint';
    else if (
      activity === 'WRITE_CODE' ||
      targets.some((target) => target.activity === 'WRITE_CODE')
    )
      needed = 'scoped-implementation';
    else if (
      targets.some((target) =>
        ['WRITE_DOCS', 'WRITE_ISSUE', 'WRITE_OTHER'].includes(target.activity)
      )
    )
      needed = 'scoped-deliverable';
    else if (activity === 'READ_*') needed = 'inspect';
    else if (
      [
        'checkpoint',
        'decomposition-prepare',
        'governed-decomposition',
        'scoped-completion',
      ].includes(activity)
    )
      needed = activity;
    const capabilities = deriveDecompositionCapabilities(assessment, publication);
    if (capabilities.includes(needed))
      return { decision: 'allow', reason: 'current-decomposition-capability' };
    const code =
      assessment.status === 'pending'
        ? 'decomposition-assessment-pending'
        : assessment.status === 'indeterminate'
          ? 'decomposition-authority-unavailable'
          : 'decomposition-required';
    return {
      decision: 'block',
      code,
      args: { issue, operationId: publication?.operationId ?? null },
      reason:
        '[task-tracker] Decomposition restriction for #' +
        issue +
        ': ' +
        assessment.status +
        ' requires recovery before ' +
        needed,
    };
  } catch {
    return decompositionActivityUnavailable(issue);
  }
}
export async function evaluateHookDecomposition({
  issue,
  cfg,
  projectDir,
  targets,
  activity,
  expectedBody,
  deps = {},
}) {
  try {
    if (sessionNetworkSkipped()) throw new Error('authority-read-skipped');
    let current, signals;
    if (deps.decomposition) {
      const { subject, runtime } = deps.decomposition;
      if (
        subject.issue !== issue ||
        (cfg?.repo && subject.repository !== cfg.repo.toLowerCase()) ||
        (cfg?.projectId && subject.projectId !== cfg.projectId)
      )
        throw new Error('mixed subject');
      current = await runtime.collect(subject);
    } else
      ({ current, signals } = await collectHookDecompositionSnapshot({
        issue,
        cfg,
        projectDir,
        deps,
      }));
    if (
      expectedBody !== undefined &&
      stripBodyVersion(current.sourceObservations?.readIssue?.value?.body ?? '') !==
        stripBodyVersion(expectedBody)
    )
      return decompositionActivityUnavailable(
        issue,
        'fresh source body changed',
        current.publication?.operationId ?? null
      );
    if (
      !['decomposition-prepare', 'checkpoint', 'COMMIT_CODE', 'COMMIT_DOCS'].includes(activity) &&
      current.projection.status !== 'current' &&
      current.assessment.status !== 'pending'
    )
      return decompositionActivityUnavailable(
        issue,
        'projection ' + current.projection.status,
        current.publication?.operationId ?? null
      );
    return {
      ...evaluateDecompositionActivity({
        activity,
        targets,
        assessment: current.assessment,
        publication: current.publication,
      }),
      signals,
    };
  } catch (error) {
    return decompositionActivityUnavailable(issue, error.message);
  }
}
