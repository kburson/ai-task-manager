// @story #2145
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as api from '../../../task-tracker/sync-epic.mjs';
import { retainedIntegrationFixture } from '../../helpers/retained-integration-fixture.mjs';
import { serializeIssueWorktreeLocationMarker } from '../../../task-tracker/lib/issue-worktree-location.mjs';

function fixture(t, options) {
  const f = retainedIntegrationFixture(t, options);
  f.git(f.parent, 'checkout', 'base');
  f.upstream = f.commit(f.parent, 'upstream.txt', 'new upstream bytes\n', 'upstream');
  f.git(f.parent, 'checkout', 'codex/retained-parent');
  f.deps = { ...f.deps, projectDir: f.parent, loadPreferences: () => ({ noPushToOrigin: true }) };
  return f;
}
async function run(f) {
  assert.equal(
    typeof api.runSyncEpicCommand,
    'function',
    'registered sync must use recorded physical authority'
  );
  return api.runSyncEpicCommand(['905'], f.deps);
}

test('direct sync uses custom recorded checkout, merges additively and verifies exact head', async (t) => {
  const f = fixture(t, {
    verifier:
      "import {mkdirSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';mkdirSync('.proof',{recursive:true});writeFileSync('.proof/head',execFileSync('git',['rev-parse','HEAD']));",
  });
  const result = await run(f);
  assert.equal(result.pushed, false);
  assert.equal(result.branch, 'codex/retained-parent');
  assert.doesNotThrow(() => f.git(f.parent, 'merge-base', '--is-ancestor', f.parentHead, 'HEAD'));
  assert.doesNotThrow(() => f.git(f.parent, 'merge-base', '--is-ancestor', f.upstream, 'HEAD'));
  assert.equal(
    readFileSync(path.join(f.parent, '.proof/head'), 'utf8').trim(),
    f.git(f.parent, 'rev-parse', 'HEAD')
  );
  assert.equal(readFileSync(path.join(f.parent, 'upstream.txt'), 'utf8'), 'new upstream bytes\n');
});

test('direct nested sync chooses its authoritative parent rather than trunk', async (t) => {
  const f = fixture(t);
  f.git(f.parent, 'branch', 'custom-outer', f.childHead);
  f.nodes[905].parent = 900;
  f.nodes[905].parentAuthoritativeBranch = 'custom-outer';
  await run(f);
  assert.doesNotThrow(() => f.git(f.parent, 'merge-base', '--is-ancestor', f.childHead, 'HEAD'));
  assert.throws(() => f.git(f.parent, 'merge-base', '--is-ancestor', f.upstream, 'HEAD'));
});

for (const problem of ['wrong branch', 'dirty', 'active operation', 'ambiguous authority'])
  test(`direct sync refuses ${problem} before merge`, async (t) => {
    const f = fixture(t);
    const before = f.git(f.parent, 'rev-parse', 'HEAD');
    if (problem === 'wrong branch') f.git(f.parent, 'checkout', 'base');
    if (problem === 'dirty') writeFileSync(path.join(f.parent, 'parent.txt'), 'dirty');
    if (problem === 'active operation')
      writeFileSync(
        f.git(f.parent, 'rev-parse', '--path-format=absolute', '--git-path', 'CHERRY_PICK_HEAD'),
        f.childHead
      );
    if (problem === 'ambiguous authority')
      f.nodes[905].authorityError = 'ambiguous recorded authority';
    await assert.rejects(run(f), /branch|dirty|operation|ambiguous/);
    assert.equal(f.git(f.parent, 'rev-parse', 'codex/retained-parent'), before);
  });

test('failed exact-head verification prevents push and retains merged original history', async (t) => {
  const f = fixture(t, { verifier: 'process.exitCode=1;' });
  f.deps.loadPreferences = () => ({ noPushToOrigin: false });
  await assert.rejects(run(f), /verification|tests failed/);
  assert.doesNotThrow(() => f.git(f.parent, 'merge-base', '--is-ancestor', f.parentHead, 'HEAD'));
});

test('target movement during verification prevents publication', async (t) => {
  const f = fixture(t);
  f.commit(
    f.parent,
    'verify.mjs',
    `import {execFileSync} from 'node:child_process';execFileSync('git',['update-ref','refs/heads/base',${JSON.stringify(f.base)},${JSON.stringify(f.upstream)}]);`,
    'target-moving verifier'
  );
  f.deps.loadPreferences = () => ({ noPushToOrigin: false });
  await assert.rejects(run(f), /target changed|source or target changed/);
});

for (const unreadableParent of [false, true])
  test(`registered sync CLI uses live recorded authority (unreadable parent: ${unreadableParent})`, (t) => {
    const f = fixture(t, { runtimeFixture: true });
    const bin = path.join(f.root, 'bin');
    mkdirSync(bin);
    const provider = fileURLToPath(new URL('../../fixtures/sync-epic-gh.mjs', import.meta.url));
    writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nexec node "$AITM_SYNC_CLI_PROVIDER" "$@"\n', {
      mode: 0o755,
    });
    const cfg = { ...f.cfg, projectId: 'PVT_fixture', preferences: { noPushToOrigin: true } };
    writeFileSync(path.join(f.parent, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
    f.git(f.parent, 'add', '.ai-task-manager/task-tracker.json');
    f.git(f.parent, 'commit', '-qm', 'fixture local-only config');
    const before = f.git(f.parent, 'rev-parse', 'HEAD');
    const trace = path.join(f.root, 'provider.jsonl');
    const fixturePath = path.join(f.root, 'provider.json');
    const body = serializeIssueWorktreeLocationMarker({
      worktreePath: f.parent,
      worktreeBranch: 'codex/retained-parent',
      sessionId: 'fixture-owner',
      ts: '2026-11-08T03:00:00.000Z',
    });
    writeFileSync(fixturePath, JSON.stringify({ body, trace, unreadableParent }));
    const command = fileURLToPath(new URL('../../../task-tracker/sync-epic.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [command, '905'], {
      cwd: f.parent,
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        PATH: bin + path.delimiter + process.env.PATH,
        AITM_SYNC_CLI_FIXTURE: fixturePath,
        AITM_SYNC_CLI_PROVIDER: provider,
      },
    });
    if (unreadableParent) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /parent authority unreadable/);
      assert.equal(f.git(f.parent, 'rev-parse', 'HEAD'), before);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /synced codex\/retained-parent/);
      assert.doesNotThrow(() => f.git(f.parent, 'merge-base', '--is-ancestor', before, 'HEAD'));
    }
  });

test('canonical fallback sync publishes the verified head by ordinary fast-forward push', async (t) => {
  const f = fixture(t);
  f.git(f.parent, 'branch', '-m', 'feature/epic/905');
  delete f.nodes[905].authoritativeBranch;
  delete f.nodes[905].authoritativeWorktree;
  const remote = path.join(f.root, 'remote.git');
  f.git(f.parent, 'init', '--bare', remote);
  f.git(f.parent, 'remote', 'add', 'origin', remote);
  f.git(f.parent, 'push', 'origin', 'feature/epic/905');
  f.deps.loadPreferences = () => ({ noPushToOrigin: false });
  const result = await run(f);
  assert.equal(result.pushed, true);
  assert.equal(
    f.git(f.parent, 'rev-parse', 'HEAD'),
    f.git(remote, 'rev-parse', 'refs/heads/feature/epic/905')
  );
  assert.doesNotThrow(() =>
    f.git(remote, 'merge-base', '--is-ancestor', f.parentHead, 'refs/heads/feature/epic/905')
  );
});

test('a foreign occupied integration checkout is refused without source changes', async (t) => {
  const f = fixture(t);
  const { claimOccupancy } = await import('../../../task-tracker/lib/occupancy.mjs');
  claimOccupancy({
    projectDir: f.parent,
    issue: 905,
    sid: 'foreign-fixture-owner',
    provider: 'fixture',
    worktreePath: f.parent,
  });
  await assert.rejects(run(f), /conflicting live integration writer/);
  assert.equal(f.git(f.parent, 'rev-parse', 'HEAD'), f.parentHead);
});
