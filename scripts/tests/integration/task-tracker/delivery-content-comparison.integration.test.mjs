// @story #1811
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';
import { createDefaultDeliverDeps } from '../../../task-tracker/verbs/deliver.mjs';

function repo(t) {
  const cwd = mkdtempSync(path.join(projectScratchDir('test', process.cwd()), 'delivery-content-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  writeFileSync(path.join(cwd, 'story.txt'), 'alpha\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  git('switch', '-qc', 'source');
  writeFileSync(path.join(cwd, 'story.txt'), 'alpha\nbeta\n');
  git('commit', '-qam', '[#1811] first');
  const sourceFirst = git('rev-parse', 'HEAD');
  writeFileSync(path.join(cwd, 'story.txt'), 'alpha\nbeta\ngamma\n');
  git('commit', '-qam', '[#1811] second');
  const sourceHead = git('rev-parse', 'HEAD');
  git('switch', '-q', 'main');
  writeFileSync(path.join(cwd, 'unrelated.txt'), 'base advance\n');
  git('add', '.');
  git('commit', '-qm', 'advance base');
  const integrationBase = git('rev-parse', 'HEAD');
  git('merge', '-q', '--no-ff', 'source', '-m', 'observed merge');
  const merged = git('rev-parse', 'HEAD');
  git('switch', '-q', '-c', 'squashed', integrationBase);
  git('merge', '-q', '--squash', 'source');
  git('commit', '-qm', 'observed squash');
  const squashed = git('rev-parse', 'HEAD');
  git('switch', '-q', '-c', 'replayed', 'source');
  git('rebase', '-q', '--onto', integrationBase, base);
  const replayHead = git('rev-parse', 'HEAD');
  const replayFirst = git('rev-parse', 'HEAD^');
  return {
    cwd,
    git,
    base,
    sourceFirst,
    sourceHead,
    integrationBase,
    merged,
    squashed,
    replayFirst,
    replayHead,
  };
}

test('Git tree comparison proves merge, squash, and ordered rebase across base advancement', async (t) => {
  const f = repo(t);
  const compare = createDefaultDeliverDeps({
    projectDir: f.cwd,
    cfg: { repo: 'owner/repo' },
  }).compareDeliveryContent;
  assert.equal(
    await compare({
      method: 'merge',
      sourceBase: f.base,
      sourceHead: f.sourceHead,
      integrationBase: f.integrationBase,
      integrationHead: f.merged,
    }),
    true
  );
  assert.equal(
    await compare({
      method: 'squash',
      sourceBase: f.base,
      sourceHead: f.sourceHead,
      integrationBase: f.integrationBase,
      integrationHead: f.squashed,
    }),
    true
  );
  assert.equal(
    await compare({
      method: 'rebase-step',
      sourceBase: f.base,
      sourceHead: f.sourceFirst,
      integrationBase: f.integrationBase,
      integrationHead: f.replayFirst,
    }),
    true
  );
  assert.equal(
    await compare({
      method: 'rebase-step',
      sourceBase: f.sourceFirst,
      sourceHead: f.sourceHead,
      integrationBase: f.replayFirst,
      integrationHead: f.replayHead,
    }),
    true
  );
  assert.equal(
    await compare({
      method: 'rebase-total',
      sourceBase: f.base,
      sourceHead: f.sourceHead,
      integrationBase: f.integrationBase,
      integrationHead: f.replayHead,
    }),
    true
  );
});

test('Git tree comparison refuses altered integrated content', async (t) => {
  const f = repo(t);
  f.git('switch', '-q', 'main');
  writeFileSync(path.join(f.cwd, 'intrusion.txt'), 'not in source\n');
  f.git('add', '.');
  f.git('commit', '-qm', 'unrelated after merge');
  const altered = f.git('rev-parse', 'HEAD');
  const compare = createDefaultDeliverDeps({
    projectDir: f.cwd,
    cfg: { repo: 'owner/repo' },
  }).compareDeliveryContent;
  assert.equal(
    await compare({
      method: 'merge',
      sourceBase: f.base,
      sourceHead: f.sourceHead,
      integrationBase: f.integrationBase,
      integrationHead: altered,
    }),
    false
  );
});

test('the complete proof classifies real Git merge, squash, and rebase objects', async (t) => {
  const f = repo(t);
  const deps = createDefaultDeliverDeps({ projectDir: f.cwd, cfg: { repo: 'owner/repo' } });
  const { verifyObservedIntegration } =
    await import('../../../task-tracker/lib/delivery-integration-proof.mjs');
  const sourceCommits = [f.sourceFirst, f.sourceHead].map((oid) => {
    const parents = [f.git('rev-parse', `${oid}^`)];
    return {
      oid,
      parents,
      tree: f.git('rev-parse', `${oid}^{tree}`),
      message: f.git('show', '-s', '--format=%B', oid),
    };
  });
  for (const [method, mergeCommitSha] of [
    ['merge', f.merged],
    ['squash', f.squashed],
    ['rebase', f.replayHead],
  ]) {
    const proof = await verifyObservedIntegration({
      repository: 'owner/repo',
      pullRequest: {
        headRefOid: f.sourceHead,
        mergeCommitSha,
        sourceCommitsComplete: true,
        sourceCommitsHeadSha: f.sourceHead,
      },
      acceptedHeadSha: f.sourceHead,
      mergedCommitSha: mergeCommitSha,
      sourceCommits,
      inspectCommit: ({ commitSha }) => deps.inspectMergeCommit({ mergeCommitSha: commitSha }),
      isAncestor: deps.isAncestor,
      compareContent: deps.compareDeliveryContent,
      trunkRef: mergeCommitSha,
    });
    assert.equal(proof.method, method);
  }
});
