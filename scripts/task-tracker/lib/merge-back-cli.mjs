// @story #1882
// Registered CLI admission and real checkout routing; no alternate merge protocol.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { resolveEpicLineage } from './resolve-epic-lineage.mjs';
import { createMergeBackTestRunner } from './merge-back-verification.mjs';
import { fetchParentIssueBody } from './graph-node-authority.mjs';

function argumentsFor(argv) {
  const positional = [];
  let preserveWorktree = false;
  for (const arg of argv) {
    if (arg === '--preserve-worktree' && !preserveWorktree) preserveWorktree = true;
    else if (arg.startsWith('--'))
      throw new TypeError(`merge-back: unknown or duplicate argument ${arg}`);
    else positional.push(arg);
  }
  const child = Number(String(positional[0] || '').replace(/^#/, ''));
  if (positional.length !== 2 || !Number.isSafeInteger(child) || child <= 0 || !positional[1])
    throw new TypeError('usage: merge-back <child#> <worktree-path> [--preserve-worktree]');
  return { child, childDir: path.resolve(positional[1]), preserveWorktree };
}
const realGit = (cwd) => (args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

export async function runMergeBackCli(argv, deps) {
  const { child, childDir, preserveWorktree } = argumentsFor(argv);
  const projectPath = path.join(childDir, '.ai-task-manager', 'task-tracker.json');
  // loadConfig tolerates malformed JSON for ordinary discovery. Integration must not
  // silently replace a damaged project provider with the full-suite Node default.
  const raw = JSON.parse(readFileSync(projectPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new TypeError('merge-back: invalid child project config');
  const loadConfig = deps.loadConfig || (await import('../config.mjs')).loadConfig;
  const cfg = loadConfig({ projectPath });
  const graph = await deps.loadGraph({ child, cfg });
  const lineage = resolveEpicLineage(child, { deps: { graph, trunk: cfg.trunkRef || 'trunk' } });
  if (!lineage.parentIssue) throw new Error('merge-back: child must have an authoritative parent');
  const parent = resolveEpicLineage(lineage.parentIssue, {
    deps: { graph, trunk: cfg.trunkRef || 'trunk' },
  });
  const childGit = realGit(childDir);
  if (lineage.worktreePath && path.resolve(lineage.worktreePath) !== childDir)
    throw new Error('merge-back: supplied child worktree path differs from recorded authority');
  if (childGit(['branch', '--show-current']) !== lineage.branch)
    throw new Error('merge-back: child checked-out branch differs from recorded authority');
  const parentDir = parent.worktreePath || process.cwd();
  const parentGit = realGit(parentDir);
  const assertIntegrationCheckout = () => {
    if (!parent.worktreePath) return;
    const common = (git) =>
      realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
    if (common(parentGit) !== common(childGit))
      throw new Error('merge-back: parent checkout belongs to another repository');
    if (parentGit(['branch', '--show-current']) !== parent.branch)
      throw new Error('merge-back: parent checkout branch differs from recorded authority');
    if (parentGit(['status', '--porcelain']))
      throw new Error('merge-back: parent checkout is dirty');
  };
  assertIntegrationCheckout();
  const issueBody =
    cfg.verificationProvider == null
      ? ''
      : await (
          deps.fetchIssueBody ||
          ((issue, config) => fetchParentIssueBody({ parentIssue: issue, cfg: config }))
        )(child, cfg);
  const runTests = createMergeBackTestRunner({ cfg, projectDir: childDir, issueBody });
  const trunkTools = await import('./trunk-ref.mjs');
  await (deps.fetchTrunk || trunkTools.fetchTrunk)({ cfg, projectDir: childDir });
  const trunk = await (deps.resolveTrunkRef || trunkTools.resolveTrunkRef)({
    cfg,
    projectDir: childDir,
  });
  return deps.mergeBack({
    child,
    path: childDir,
    preserveWorktree,
    deps: {
      graph,
      git: parentGit,
      worktreeGit: childGit,
      currentWorktreeBranch: () => childGit(['branch', '--show-current']),
      trunk,
      runTests,
      currentWorktreeHead: () => childGit(['rev-parse', 'HEAD']),
      assertIntegrationCheckout,
    },
  });
}
