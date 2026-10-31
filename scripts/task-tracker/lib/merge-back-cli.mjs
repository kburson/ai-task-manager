// @story #1882 #2134
// Registered CLI admission and real checkout routing; no alternate merge protocol.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { resolveEpicLineage } from './resolve-epic-lineage.mjs';
import { createMergeBackTestRunner } from './merge-back-verification.mjs';
import { fetchParentIssueBody } from './graph-node-authority.mjs';
import { readOccupancy } from './occupancy.mjs';
import { occupancyPath } from '../paths.mjs';
import { withLock } from '../fleet-registry.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';

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

function worktrees(git) {
  return git(['worktree', 'list', '--porcelain', '-z'])
    .split('\0\0')
    .filter(Boolean)
    .map((block) => {
      const fields = block.split('\0');
      return {
        path: fields.find((field) => field.startsWith('worktree '))?.slice(9),
        branch: fields.find((field) => field.startsWith('branch '))?.slice(7),
      };
    });
}

export async function runMergeBackCli(argv, deps) {
  const { child, childDir, preserveWorktree } = argumentsFor(argv);
  const projectPath = path.join(childDir, '.ai-task-manager', 'task-tracker.json');
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
  let criticalDeadline = null;
  const realGit = (cwd) => (args) => {
    const remaining = criticalDeadline === null ? GIT_TIMEOUT_MS : criticalDeadline - Date.now();
    if (remaining <= 0) throw new Error('merge-back: integration critical section timed out');
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: Math.min(GIT_TIMEOUT_MS, remaining),
    }).trim();
  };
  const childGit = realGit(childDir);
  if (lineage.worktreePath && path.resolve(lineage.worktreePath) !== childDir)
    throw new Error('merge-back: supplied child worktree path differs from recorded authority');
  const assertChild = () => {
    if (childGit(['branch', '--show-current']) !== lineage.branch)
      throw new Error('merge-back: child checked-out branch differs from recorded authority');
    if (childGit(['status', '--porcelain'])) throw new Error('merge-back: child checkout is dirty');
  };
  assertChild();
  const common = (git) =>
    realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const commonDir = common(childGit);
  const main = worktrees(childGit)[0]?.path;
  if (!main) throw new Error('merge-back: shared repository main checkout unavailable');
  const occupancyFile = occupancyPath(main);
  const sid = currentSessionId();
  let parentDir, parentGit, temporary, targetHead, writerSnapshot;
  const relevantWriters = () =>
    Object.values(readOccupancy(occupancyFile)).filter(
      (row) =>
        [child, lineage.parentIssue].includes(row.issue) ||
        [childDir, parentDir].includes(path.resolve(row.worktreePath))
    );
  const assertWriters = () => {
    const rows = relevantWriters();
    for (const row of rows) {
      const expected =
        row.issue === child ? childDir : row.issue === lineage.parentIssue ? parentDir : null;
      if (
        row.sid !== sid ||
        (!expected && parentDir) ||
        (expected && path.resolve(row.worktreePath) !== expected)
      )
        throw new Error('merge-back: conflicting live integration writer or occupancy');
    }
    // Heartbeats do not change ownership. Generation, identity and location do.
    const snapshot = JSON.stringify(rows.map(({ lastHeartbeatAt: _heartbeat, ...row }) => row));
    if (writerSnapshot !== undefined && snapshot !== writerSnapshot)
      throw new Error('merge-back: integration occupancy changed during verification');
    return snapshot;
  };
  const withIntegrationLock = (fn) =>
    withLock(occupancyFile, () => {
      criticalDeadline = Date.now() + 2 * GIT_TIMEOUT_MS;
      try {
        return fn();
      } finally {
        criticalDeadline = null;
      }
    });
  const assertIntegrationCheckout = () => {
    assertWriters();
    assertChild();
    if (common(parentGit) !== commonDir)
      throw new Error('merge-back: parent checkout belongs to another repository');
    if (parentGit(['branch', '--show-current']) !== parent.branch)
      throw new Error('merge-back: parent checkout branch differs from recorded authority');
    const holders = worktrees(childGit).filter(
      (entry) => entry.branch === 'refs/heads/' + parent.branch
    );
    if (holders.length !== 1 || path.resolve(holders[0].path) !== parentDir)
      throw new Error('merge-back: parent integration checkout registration changed');
    if (parentGit(['status', '--porcelain']))
      throw new Error('merge-back: parent checkout is dirty');
    if (targetHead && parentGit(['rev-parse', 'HEAD']) !== targetHead)
      throw new Error('merge-back: parent target changed during verification');
  };
  try {
    withIntegrationLock(() => {
      assertWriters();
      assertChild();
      // The durable custom branch is authoritative; an obsolete directory is audit history.
      childGit(['check-ref-format', 'refs/heads/' + parent.branch]);
      targetHead = childGit(['rev-parse', '--verify', 'refs/heads/' + parent.branch + '^{commit}']);
      const holders = worktrees(childGit).filter(
        (entry) => entry.branch === 'refs/heads/' + parent.branch
      );
      if (holders.length > 1) throw new Error('merge-back: ambiguous registered parent checkout');
      if (holders.length) parentDir = path.resolve(holders[0].path);
      else {
        const directory = path.join(main, '.tmp', 'aitm', 'integration');
        mkdirSync(directory, { recursive: true });
        temporary = mkdtempSync(path.join(directory, String(lineage.parentIssue) + '-'));
        parentDir = path.join(temporary, 'checkout');
        childGit(['worktree', 'add', parentDir, parent.branch]);
      }
      parentGit = realGit(parentDir);
      writerSnapshot = assertWriters();
      assertIntegrationCheckout();
    });
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
        withIntegrationLock,
        captureIntegrationTarget: () => {
          targetHead = parentGit(['rev-parse', 'HEAD']);
        },
      },
    });
  } finally {
    if (temporary) {
      // Normal Git removal refuses dirty/conflicted checkouts. Preserve recovery
      // context on failure rather than force-cleaning an interrupted integration.
      try {
        withIntegrationLock(() => {
          assertWriters();
          realGit(main)(['worktree', 'remove', parentDir]);
          rmSync(temporary, { recursive: true });
        });
      } catch (error) {
        process.stderr.write(
          `merge-back: retained integration checkout ${parentDir}: ${error.message}\n`
        );
      }
    }
  }
}
