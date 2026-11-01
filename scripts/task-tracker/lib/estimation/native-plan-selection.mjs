// @story #2069
// Current native choices come from this subject's body, actual local plan and built-in model.
// Reading facts here grants no approval, publication or lifecycle authority.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../../config.mjs';
import { resolveStoryIntentSource } from '../story-intent-source.mjs';
import { maskFencedCodeBlocksPreservingOffsets } from '../markers.mjs';
import { parseRefinementSnapshot, REFINEMENT_SNAPSHOT_MARKER_RE } from '../refinement-snapshot.mjs';
import { visibleMetadataFieldValue } from '../decomposition-policy.mjs';
import { LOCAL_ESTIMATION_MODEL } from './local-runtime.mjs';
const execute = promisify(execFile);
const hash = (value) => createHash('sha256').update(value).digest('hex');
function refuse(reason) {
  throw new Error('plan-candidate:current-selection-' + reason);
}
export async function readNativePlanForecastSelection({
  identity,
  body,
  projectDir,
  cfg,
  readPlanAtCommit,
} = {}) {
  const current = loadConfig({ projectDir });
  if (
    identity?.repository !== cfg?.repo ||
    current.repo !== cfg.repo ||
    current.projectId !== identity.projectId ||
    current.estimationRubricIssue !== cfg.estimationRubricIssue ||
    !Number.isSafeInteger(current.estimationRubricIssue) ||
    current.estimationRubricIssue <= 0
  )
    refuse('configuration');
  const source = resolveStoryIntentSource({ body, projectDir });
  if (!source.ok || !source.observation) refuse('plan');
  const commit =
    visibleMetadataFieldValue(body, 'Plan Metadata', 'Source-plan-commit') ??
    visibleMetadataFieldValue(body, 'Plan Metadata', 'Implementation-plan-commit');
  const section = visibleMetadataFieldValue(body, 'Plan Metadata', 'Source-plan-section');
  if (!/^[a-f0-9]{40}$/.test(commit ?? '') || !section || source.location?.heading !== section)
    refuse('plan-reference');
  const planPath = source.observation.path;
  const committed = readPlanAtCommit
    ? await readPlanAtCommit({ projectDir, planCommit: commit, planPath })
    : (
        await execute('git', ['show', commit + ':' + planPath], {
          cwd: projectDir,
          maxBuffer: 1024 * 1024,
        })
      ).stdout;
  if (typeof committed !== 'string' || hash(committed) !== source.observation.contentSha256)
    refuse('plan-bytes');
  const eligible = maskFencedCodeBlocksPreservingOffsets(body);
  const markers = [...eligible.matchAll(REFINEMENT_SNAPSHOT_MARKER_RE)];
  const refinement = parseRefinementSnapshot(eligible);
  if (
    markers.length !== 1 ||
    !refinement ||
    !['XS', 'S', 'M', 'L', 'XL'].includes(refinement.fields.size) ||
    refinement.fields.estimate < 0
  )
    refuse('refine');
  return {
    host: identity.host,
    repository: identity.repository,
    issue: identity.issueNumber,
    configuration: { estimationRubricIssue: current.estimationRubricIssue },
    plan: { path: planPath, commit, section, digest: source.observation.contentSha256 },
    refine: {
      size: refinement.fields.size,
      humanHours: refinement.fields.estimate,
      source: {
        kind: 'refinement-snapshot',
        id: `issue:${identity.issueNodeId}`,
        digest: hash(markers[0][0]),
      },
    },
    modelPolicy: {
      modelVersion: LOCAL_ESTIMATION_MODEL.modelVersion,
      policyVersion: LOCAL_ESTIMATION_MODEL.policyVersion,
    },
  };
}
