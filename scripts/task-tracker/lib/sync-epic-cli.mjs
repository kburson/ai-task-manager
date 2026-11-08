// @story #2145
import { execFileSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, getPreferences } from '../config.mjs';
import { resolveEpicLineage } from './resolve-epic-lineage.mjs';
import { createMergeBackTestRunner } from './merge-back-verification.mjs';
import { assertNoIntegrationOperation } from './integration-retention.mjs';
import { readOccupancy } from './occupancy.mjs';
import { occupancyPath, RUNTIME_REL } from '../paths.mjs';
import { withLock } from '../fleet-registry.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';
import { fetchTrunk, resolveTrunkRef } from './trunk-ref.mjs';
import { fetchParentIssueBody } from './graph-node-authority.mjs';

export async function runSyncEpicCli(argv, deps) {
  const epic = Number(String(argv[0] || '').replace(/^#/, ''));
  if (argv.length !== 1 || !Number.isSafeInteger(epic) || epic <= 0)
    throw new TypeError('usage: sync-epic <epic#>');
  const projectDir = realpathSync(deps.projectDir || process.cwd());
  const projectPath = path.join(projectDir, RUNTIME_REL.config);
  const raw = JSON.parse(readFileSync(projectPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new TypeError('sync-epic: invalid project config');
  const cfg = (deps.loadConfig || loadConfig)({ projectPath });
  const preferences = (deps.loadPreferences || getPreferences)({ projectPath });
  const graph = await deps.loadGraph({ epic, cfg });
  await (deps.fetchTrunk || fetchTrunk)({ cfg, projectDir });
  const trunk = await (deps.resolveTrunkRef || resolveTrunkRef)({ cfg, projectDir });
  if (!trunk) throw new Error('sync-epic: trunk authority unavailable');
  const lineage = resolveEpicLineage(epic, { deps: { graph, trunk } });
  let deadline = null;
  const git = (args) => {
    const remaining = deadline === null ? GIT_TIMEOUT_MS : deadline - Date.now();
    if (remaining <= 0) throw new Error('sync-epic: integration critical section timed out');
    return execFileSync('git', args, {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: Math.min(remaining, GIT_TIMEOUT_MS),
    }).trim();
  };
  const census = () =>
    git(['worktree', 'list', '--porcelain', '-z'])
      .split('\0\0')
      .filter(Boolean)
      .map((block) => {
        const fields = block.split('\0');
        return {
          path: fields.find((x) => x.startsWith('worktree '))?.slice(9),
          branch: fields.find((x) => x.startsWith('branch '))?.slice(7),
        };
      });
  const main = census()[0]?.path;
  if (!main) throw new Error('sync-epic: main checkout unavailable');
  const common = realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const file = occupancyPath(main);
  const sid = currentSessionId();
  let writerSnapshot;
  const assertIntegrationCheckout = () => {
    if (lineage.worktreePath && realpathSync(lineage.worktreePath) !== projectDir)
      throw new Error('sync-epic: invocation differs from recorded worktree');
    if (git(['branch', '--show-current']) !== lineage.branch)
      throw new Error('sync-epic: checked-out branch differs from recorded authority');
    if (realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir'])) !== common)
      throw new Error('sync-epic: repository changed');
    const holders = census().filter((row) => row.branch === 'refs/heads/' + lineage.branch);
    if (holders.length !== 1 || realpathSync(holders[0].path) !== projectDir)
      throw new Error('sync-epic: ambiguous checkout registration');
    assertNoIntegrationOperation(git);
    if (git(['status', '--porcelain'])) throw new Error('sync-epic: checkout is dirty');
    const rows = Object.values(readOccupancy(file)).filter(
      (row) =>
        row.issue === epic ||
        row.issue === lineage.parentIssue ||
        path.resolve(row.worktreePath) === projectDir
    );
    if (
      rows.some(
        (row) =>
          row.sid !== sid || (row.issue === epic && path.resolve(row.worktreePath) !== projectDir)
      )
    )
      throw new Error('sync-epic: conflicting live integration writer');
    const snapshot = JSON.stringify(rows.map(({ lastHeartbeatAt: _heartbeat, ...row }) => row));
    if (writerSnapshot !== undefined && writerSnapshot !== snapshot)
      throw new Error('sync-epic: integration occupancy changed during verification');
    writerSnapshot = snapshot;
  };
  const withIntegrationLock = (fn) =>
    withLock(file, () => {
      deadline = Date.now() + 2 * GIT_TIMEOUT_MS;
      try {
        return fn();
      } finally {
        deadline = null;
      }
    });
  withIntegrationLock(assertIntegrationCheckout);
  const issueBody =
    cfg.verificationProvider == null
      ? ''
      : await (
          deps.fetchIssueBody ||
          ((issue, config) => fetchParentIssueBody({ parentIssue: issue, cfg: config }))
        )(epic, cfg);
  const runTests = createMergeBackTestRunner({ cfg, projectDir, issueBody });
  return deps.syncEpic({
    epic,
    deps: {
      graph,
      git,
      trunk,
      noPushToOrigin: preferences.noPushToOrigin,
      runTests: () => runTests({ path: projectDir }),
      assertIntegrationCheckout,
      withIntegrationLock,
    },
  });
}
