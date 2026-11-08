// @story #2145
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { runMergeBackCommand } from '../../../../task-tracker/merge-back.mjs';
import { retainedIntegrationFixture } from '../../../helpers/retained-integration-fixture.mjs';

const run = (f) => runMergeBackCommand(['910', f.child, '--preserve-worktree'], f.deps);

test('additive merge-back retains original commits, refs and bytes', async (t) => {
  const f = retainedIntegrationFixture(t);
  await run(f);
  assert.doesNotThrow(() => f.git(f.parent, 'merge-base', '--is-ancestor', f.childHead, 'HEAD'));
  assert.doesNotThrow(() => f.git(f.parent, 'merge-base', '--is-ancestor', f.parentHead, 'HEAD'));
  const retained = f.git(
    f.parent,
    'for-each-ref',
    '--format=%(objectname)',
    'refs/aitm/retained/integration'
  );
  assert.ok(retained.includes(f.childHead));
  assert.ok(retained.includes(f.parentHead));
  assert.equal(readFileSync(path.join(f.parent, 'child.txt'), 'utf8'), 'original child bytes\n');
  assert.equal(readFileSync(path.join(f.parent, 'parent.txt'), 'utf8'), 'parent bytes\n');
});

test('ignored incoming collision refuses before either head changes', async (t) => {
  const f = retainedIntegrationFixture(t);
  const head = f.commit(f.parent, 'evidence.txt', 'incoming tracked bytes', 'incoming');
  writeFileSync(path.join(f.child, 'evidence.txt'), 'original ignored evidence');
  await assert.rejects(run(f), /ignored|untracked|collision/);
  assert.equal(f.git(f.child, 'rev-parse', 'HEAD'), f.childHead);
  assert.equal(f.git(f.parent, 'rev-parse', 'HEAD'), head);
  assert.equal(
    readFileSync(path.join(f.child, 'evidence.txt'), 'utf8'),
    'original ignored evidence'
  );
});

test('successful integration retains an evidence-bearing child even without preserve flag', async (t) => {
  const f = retainedIntegrationFixture(t);
  writeFileSync(path.join(f.child, 'evidence.txt'), 'retain this');
  const result = await runMergeBackCommand(['910', f.child], f.deps);
  assert.equal(result.merged, true);
  assert.ok(existsSync(f.child));
  assert.equal(readFileSync(path.join(f.child, 'evidence.txt'), 'utf8'), 'retain this');
  assert.doesNotThrow(() => f.git(f.parent, 'rev-parse', '--verify', 'codex/retained-child'));
});

test('failed verification retains original child and any temporary parent checkout', async (t) => {
  const f = retainedIntegrationFixture(t, { verifier: 'process.exitCode=1;' });
  f.git(f.parent, 'checkout', 'base');
  await assert.rejects(run(f), /tests failed/);
  const entries = f.git(f.parent, 'worktree', 'list', '--porcelain');
  assert.match(entries, /branch refs\/heads\/codex\/retained-parent/);
  assert.equal(f.git(f.parent, 'rev-parse', 'codex/retained-parent'), f.parentHead);
  assert.doesNotThrow(() => f.git(f.child, 'merge-base', '--is-ancestor', f.childHead, 'HEAD'));
});

test('conflicts retain original commits and merge recovery state without parent advancement', async (t) => {
  const f = retainedIntegrationFixture(t);
  f.commit(f.child, 'conflict.txt', 'child side', 'child conflict');
  const original = f.git(f.child, 'rev-parse', 'HEAD');
  const parent = f.commit(f.parent, 'conflict.txt', 'parent side', 'parent conflict');
  await assert.rejects(run(f), /conflict/);
  assert.equal(f.git(f.parent, 'rev-parse', 'HEAD'), parent);
  assert.equal(f.git(f.child, 'rev-parse', 'HEAD'), original);
  assert.ok(
    existsSync(f.git(f.child, 'rev-parse', '--path-format=absolute', '--git-path', 'MERGE_HEAD'))
  );
});

for (const stale of [false, true])
  test(`retention refuses ${stale ? 'stale source' : 'conflicting create-only ref'} before branch mutation`, async (t) => {
    const f = retainedIntegrationFixture(t);
    const { createHash } = await import('node:crypto');
    const { retainIntegrationHeads } =
      await import('../../../../task-tracker/lib/integration-retention.mjs');
    const ref = 'codex/retained-child';
    const retainedRef = `refs/aitm/retained/integration/${f.childHead}/${createHash('sha256').update(ref).digest('hex')}`;
    if (!stale) f.git(f.parent, 'update-ref', retainedRef, f.parentHead, '0'.repeat(40));
    assert.throws(
      () =>
        retainIntegrationHeads({
          git: (args) => f.git(f.parent, ...args),
          heads: [{ ref, sha: stale ? f.parentHead : f.childHead }],
        }),
      /changed|retention ref conflict/
    );
    assert.equal(f.git(f.child, 'rev-parse', 'HEAD'), f.childHead);
    assert.equal(f.git(f.parent, 'rev-parse', 'HEAD'), f.parentHead);
    if (!stale) assert.equal(f.git(f.parent, 'rev-parse', retainedRef), f.parentHead);
  });
