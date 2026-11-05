// @story #2153
import path from 'node:path';
import { stripFencedCodeBlocks } from './markers.mjs';
import { loadForecastProjection } from './estimation/runtime-adapter.mjs';
import { validateForecastProjection } from './plan-exit-planned-estimate-guard.mjs';
import { realpathSync, lstatSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import { createCurrentPlanApprovalEvidence } from './plan-approval-current-scope.mjs';
import { defaultResolveTrunkSha } from './plan-approved-guard.mjs';

const execute = promisify(execFile);
const hash = (value) => createHash('sha256').update(value).digest('hex');
export const readCurrentForecastId = (body) => {
  const visible = stripFencedCodeBlocks(body);
  const claims = visible.match(/<!--\s*aitm-estimation-forecast-ready\b/gi) ?? [];
  const matches = [
    ...visible.matchAll(
      /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/gi
    ),
  ];
  if (claims.length > 1) throw Error('current-scope-forecast-ambiguous');
  if (claims.length !== matches.length) throw Error('current-scope-forecast-malformed');
  return matches[0]?.[1] ?? null;
};
export async function observeCurrentPlanSource({
  projectDir,
  cfg,
  body,
  governedPlan,
  storyBinding,
  admission,
  issueNumber,
  deps = {},
}) {
  const root = realpathSync(projectDir);
  const planPath = governedPlan?.observation?.path;
  if (!planPath || path.isAbsolute(planPath)) throw Error('current-scope-plan-path');
  const full = path.resolve(root, planPath);
  if (!full.startsWith(root + path.sep) || realpathSync(full) !== full || !lstatSync(full).isFile())
    throw Error('current-scope-plan-path');
  const git = async (...args) =>
    (
      await execute('git', args, {
        cwd: root,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
      })
    ).stdout.trimEnd();
  if (await git('status', '--porcelain', '--untracked-files=normal'))
    throw Error('current-scope-source-dirty');
  const sourceHead = await git('rev-parse', 'HEAD');
  const entry = await git('ls-files', '--stage', '--', planPath);
  if (!/^100(?:644|755) [a-f0-9]{40} 0\t/.test(entry))
    throw Error('current-scope-plan-not-tracked');
  const working = readFileSync(full);
  const committed = (
    await execute('git', ['show', `${sourceHead}:${planPath}`], {
      cwd: root,
      encoding: 'buffer',
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    })
  ).stdout;
  if (!working.equals(committed) || hash(working) !== governedPlan.observation.contentSha256)
    throw Error('current-scope-plan-observation-changed');
  const trunkSha = await (deps.resolveTrunkSha ?? defaultResolveTrunkSha)({
    cfg,
    projectDir: root,
  });
  const forecastRecordId = readCurrentForecastId(body);
  if (cfg.estimationRubricIssue > 0 && !forecastRecordId)
    throw Error('current-scope-forecast-missing');
  if (forecastRecordId !== null || cfg.estimationRubricIssue > 0) {
    const projection = await (deps.plannedEstimate?.forecastProjection ?? loadForecastProjection)({
      cfg,
      issueNumber: Number(issueNumber),
      deps: deps.plannedEstimate,
    });
    const result = validateForecastProjection({
      ...projection,
      readyForecastRecordId: forecastRecordId,
    });
    if (!result.ok) throw Error(result.blockers.join('; '));
  }
  if (
    (await git('rev-parse', 'HEAD')) !== sourceHead ||
    (await git('status', '--porcelain', '--untracked-files=normal'))
  )
    throw Error('current-scope-source-changed');
  return createCurrentPlanApprovalEvidence({
    repository: cfg.repo,
    issue: Number(issueNumber),
    scopeIdentity: computeScopeIdentity({ repository: cfg.repo, issue: Number(issueNumber), body }),
    sourceHead,
    trunkSha,
    planPath,
    planContentSha256: hash(working),
    storyBinding,
    forecastRecordId,
    admission,
  });
}
