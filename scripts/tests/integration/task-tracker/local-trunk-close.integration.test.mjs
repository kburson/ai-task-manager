// @story #1825
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';
import {
  evaluateLocalTrunkCloseProof,
  collectLocalTrunkCloseProof,
  observeFreshLocalTrunkGraph,
  observeLocalTrunkGraph,
  parseCompletePullRequestPages,
} from '../../../task-tracker/lib/local-trunk-close-proof.mjs';

const SHA = 'a'.repeat(40);
const operation = '00000000000000000000000001';
const scope = {
  schema: 'aitm.delivery-exception-scope/v1',
  repository: 'owner/repo',
  issue: 1825,
  exceptionKind: 'delivery.local-trunk-close-authorization',
  pullRequest: null,
  acceptedHeadSha: SHA,
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId: 'delivery.local-trunk-close-authorization',
  deliveryOperationId: operation,
};
const facts = () => ({
  repository: 'owner/repo',
  issue: 1825,
  state: 'review',
  topLevel: true,
  commitBearing: true,
  branchBound: true,
  worktreeBound: true,
  acceptedSha: SHA,
  testSha: SHA,
  reviewSha: SHA,
  localRef: 'trunk',
  remoteRef: 'origin/trunk',
  pullRequests: { complete: true, values: [] },
  graph: { complete: true, shallow: false, localContains: true, remoteContains: true },
  grant: { scope, active: true },
});

test('pure proof admits only an exact, complete no-PR trunk case', () => {
  assert.equal(evaluateLocalTrunkCloseProof(facts()).outcome, 'authorized-local-trunk-close');
  const cases = [
    [{ testSha: 'b'.repeat(40) }, 'test-sha-mismatch'],
    [{ reviewSha: 'b'.repeat(40) }, 'review-sha-mismatch'],
    [
      { graph: { complete: true, shallow: false, localContains: true, remoteContains: false } },
      'remote-unreachable',
    ],
    [
      { graph: { complete: false, shallow: false, localContains: true, remoteContains: true } },
      'graph-incomplete',
    ],
    [
      { graph: { complete: true, shallow: true, localContains: true, remoteContains: true } },
      'graph-shallow',
    ],
    [{ pullRequests: { complete: false, values: [] } }, 'pr-inventory-incomplete'],
    [
      { pullRequests: { complete: true, values: [{ number: 1, headRefOid: SHA }] } },
      'pr-candidate',
    ],
    [{ grant: { scope: { ...scope, issue: 1826 }, active: true } }, 'grant-scope-mismatch'],
  ];
  for (const [change, reasonId] of cases) {
    assert.equal(evaluateLocalTrunkCloseProof({ ...facts(), ...change }).reasonId, reasonId);
  }
});

test('complete paginated PR inventory rejects malformed pages', () => {
  assert.deepEqual(parseCompletePullRequestPages([[]], 'branch'), { complete: true, values: [] });
  assert.throws(() => parseCompletePullRequestPages([{}], 'branch'));
  assert.throws(() => parseCompletePullRequestPages([[{ number: 1 }]], 'branch'));
});

test('disposable Git graph observes accepted SHA on both independently named refs', async () => {
  const dir = await mkdtemp(join(projectScratchDir('test'), 'aitm-local-trunk-proof-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init', '-q', '-b', 'work');
    git('config', 'user.email', 'proof@example.test');
    git('config', 'user.name', 'Proof');
    git('commit', '--allow-empty', '-qm', 'accepted');
    const acceptedSha = git('rev-parse', 'HEAD');
    git('branch', 'trunk');
    git('update-ref', 'refs/remotes/origin/trunk', acceptedSha);
    const run = async (args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      if (result.status !== 0) {
        const error = new Error(result.stderr);
        error.code = result.status;
        throw error;
      }
      return result.stdout.trim();
    };
    const observed = await observeLocalTrunkGraph({
      acceptedSha,
      localRef: 'trunk',
      remoteRef: 'origin/trunk',
      run,
    });
    assert.equal(observed.complete, true);
    assert.equal(observed.localContains, true);
    assert.equal(observed.remoteContains, true);
    git('commit', '--allow-empty', '-qm', 'divergent');
    const divergentSha = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/trunk', divergentSha);
    assert.equal(
      (
        await observeLocalTrunkGraph({
          acceptedSha: divergentSha,
          localRef: 'trunk',
          remoteRef: 'origin/trunk',
          run,
        })
      ).localContains,
      false
    );
    await assert.rejects(
      observeLocalTrunkGraph({
        acceptedSha: 'b'.repeat(40),
        localRef: 'trunk',
        remoteRef: 'origin/trunk',
        run,
      })
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fresh remote tip and complete inventory are required by the shared collector', async () => {
  const dir = await mkdtemp(join(projectScratchDir('test'), 'aitm-local-trunk-remote-'));
  const git = (...args) => {
    const value = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (value.status !== 0) throw new Error(value.stderr);
    return value.stdout.trim();
  };
  try {
    git('init', '-q', '-b', 'work');
    git('config', 'user.email', 'proof@example.test');
    git('config', 'user.name', 'Proof');
    git('commit', '--allow-empty', '-qm', 'accepted');
    const acceptedSha = git('rev-parse', 'HEAD');
    git('branch', 'trunk');
    git('init', '--bare', '-q', join(dir, 'remote.git'));
    git('remote', 'add', 'origin', join(dir, 'remote.git'));
    git('push', '-q', 'origin', 'trunk');
    const runGit = async (args) => {
      const value = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      if (value.status !== 0) {
        const error = new Error(value.stderr);
        error.code = value.status;
        throw error;
      }
      return value.stdout.trim();
    };
    const observed = await observeFreshLocalTrunkGraph({
      acceptedSha,
      localRef: 'trunk',
      remote: 'origin',
      branch: 'trunk',
      run: runGit,
    });
    assert.equal(observed.remoteSha, acceptedSha);
    assert.equal(observed.remoteContains, true);
    const eligible = {
      ...facts(),
      acceptedSha,
      testSha: acceptedSha,
      reviewSha: acceptedSha,
      grant: { active: true, scope: { ...scope, acceptedHeadSha: acceptedSha } },
    };
    const args = {
      facts: eligible,
      branch: 'work',
      remote: 'origin',
      remoteBranch: 'trunk',
      runGit,
      listPullRequestPages: async () => [[]],
    };
    assert.equal((await collectLocalTrunkCloseProof(args)).outcome, 'authorized-local-trunk-close');
    assert.equal(
      (
        await collectLocalTrunkCloseProof({
          ...args,
          listPullRequestPages: async () => {
            throw new Error('rate limit');
          },
        })
      ).reasonId,
      'pr-inventory-incomplete'
    );
    assert.equal(
      (
        await collectLocalTrunkCloseProof({
          ...args,
          listPullRequestPages: async () => [
            [{ number: 9, head: { ref: 'work', sha: acceptedSha }, base: { ref: 'trunk' } }],
          ],
        })
      ).reasonId,
      'pr-candidate'
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
