// @story #2147
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  createRuntimeRootFixture,
  fixtureGitExecutable,
} from '../../helpers/runtime-root-fixture.mjs';

const source = fileURLToPath(new URL('../../../../', import.meta.url));
const originalVisit = '<!-- aitm-entered-backlog ts="2026-11-03T00:00:00Z" -->';
const nativeHost = Boolean(
  process.env.CODEX_THREAD_ID && process.env.CODEX_THREAD_ID === process.env.CODEX_SESSION_ID
);

function run(t, mode, marker = '', { bind = false, expectBoardRead = true } = {}) {
  const root = realpathSync(createRuntimeRootFixture('accept-live-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, '.tmp/provider');
  mkdirSync(bin, { recursive: true });
  mkdirSync(path.join(root, '.ai-task-manager'));
  mkdirSync(path.join(root, 'node_modules/@kburson'), { recursive: true });
  symlinkSync(source, path.join(root, 'node_modules/@kburson/ai-task-manager'), 'dir');
  writeFileSync(
    path.join(root, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({
      repo: 'fixture-b1/reconcile',
      projectId: 'PVT_71',
      kanbanFieldId: 'STATUS',
    })
  );
  writeFileSync(path.join(root, '.gitignore'), '.tmp/\n.scratch/\nnode_modules/\n');
  const git = (...args) =>
    execFileSync(fixtureGitExecutable, ['-C', root, ...args], { stdio: 'pipe' });
  git('add', '.gitignore', '.ai-task-manager/task-tracker.json');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'fixture'
  );
  writeFileSync(path.join(bin, 'package.json'), '{"type":"module"}');
  symlinkSync(process.execPath, path.join(bin, 'node'));
  symlinkSync(fixtureGitExecutable, path.join(bin, 'git'));
  const gh = path.join(bin, 'gh');
  copyFileSync(new URL('../../fixtures/reconcile-accept-live-provider.mjs', import.meta.url), gh);
  chmodSync(gh, 0o755);
  const initial = [
    marker,
    'Fixture prose.',
    originalVisit,
    '<!-- aitm-body-version version="1" -->',
    '',
  ].join('\n');
  const file = path.join(bin, 'state.json');
  writeFileSync(file, JSON.stringify({ mode, initial, body: initial, setup: bind }));
  writeFileSync(path.join(bin, 'events'), '');
  const env = { PATH: bin, HOME: process.env.HOME, AITM_GRAPHQL_USAGE: '0' };
  for (const key of ['CODEX_THREAD_ID', 'CODEX_SESSION_ID'])
    if (process.env[key]) env[key] = process.env[key];
  const entry = path.join(root, 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs');
  let activeFile, before;
  if (bind) {
    git('switch', '--detach');
    const started = spawnSync(process.execPath, [entry, 'start', '71', '--role', 'agent'], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(started.status, 0, started.stderr);
    activeFile = path.join(root, '.tmp/aitm/sessions', env.CODEX_THREAD_ID, 'active-task.json');
    before = JSON.parse(readFileSync(activeFile, 'utf8'));
    const state = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(before.kanbanState, 'backlog', started.stderr);
    assert.ok(before.bindingGenerationId && before.entryStartTs);
    assert.ok(
      state.comments?.some((c) => c.body.includes('⏱ Timing Log')),
      started.stderr
    );
    Object.assign(state, {
      setup: false,
      live: 'Plan',
      initial: state.body,
      hasReadBase: false,
      markerWritten: false,
    });
    writeFileSync(file, JSON.stringify(state));
  }
  const cli = spawnSync(process.execPath, [entry, 'reconcile', '71', '--mode', 'accept-live'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.ifError(cli.error);
  const { body } = JSON.parse(readFileSync(file, 'utf8'));
  const events = readFileSync(path.join(bin, 'events'), 'utf8').trim().split('\n');
  assert.ok(!events.some((e) => e.startsWith('unexpected')), events.join('\n'));
  assert.equal(events.includes('query.board'), expectBoardRead, cli.stderr);
  const after = activeFile ? JSON.parse(readFileSync(activeFile, 'utf8')) : null;
  return {
    cli,
    body,
    initial,
    events,
    before,
    after,
    readState: () => JSON.parse(readFileSync(file, 'utf8')),
    updateState: (patch) =>
      writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...patch })),
    readCache: () => JSON.parse(readFileSync(activeFile, 'utf8')),
    readEvents: () => readFileSync(path.join(bin, 'events'), 'utf8').trim().split('\n'),
    command: (...args) => {
      const result = spawnSync(process.execPath, [entry, ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 30000,
      });
      assert.ifError(result.error);
      return result;
    },
  };
}

// The native binding assertion needs a real host identity. The public writer
// tests below also run without any provider session (including in CI).
for (const mode of ['reject', 'stale', 'confirm']) {
  test(
    'native Start cache after ' + mode,
    {
      skip: !nativeHost,
    },
    (t) => {
      const { cli, before, after, events } = run(t, mode, '', { bind: true });
      assert.ok(events.includes('marker.write'));
      if (mode === 'confirm') {
        assert.equal(cli.status, 0, cli.stderr);
        assert.deepEqual(after, { ...before, kanbanState: 'plan' });
      } else {
        assert.notEqual(cli.status, 0, cli.stdout);
        assert.deepEqual(after, before);
        assert.ok(!events.includes('audit.write'));
      }
    }
  );
}

for (const mode of [
  'audit-reject',
  'audit-lost-ack',
  'audit-fleeting-state',
  'audit-fleeting-visit',
]) {
  for (const bind of [false, true]) {
    test(
      `${bind ? 'native cache' : 'public writer'} after ${mode}`,
      { skip: bind && !nativeHost },
      (t) => {
        const { cli, body, before, after, events } = run(t, mode, '', { bind });
        assert.equal(events.filter((e) => e === 'audit.write').length, 1);
        assert.equal(
          body.match(/<!-- aitm-reconciled\b/g)?.length ?? 0,
          mode === 'audit-reject' ? 0 : 1
        );
        assert.match(body, bind ? /state="plan"/ : /state="backlog"/);
        assert.ok(body.includes(originalVisit));
        assert.equal(body.match(/<!-- aitm-entered-/g)?.length, 2);
        if (mode.startsWith('audit-fleeting-')) {
          assert.ok(events.includes('audit.conflict'));
          assert.notEqual(cli.status, 0);
          assert.match(cli.stderr, /partial/);
          assert.doesNotMatch(body, /state="review"|aitm-entered-review/);
          if (bind) assert.deepEqual(after, before);
        } else {
          assert.equal(cli.status, 0, cli.stderr);
          const afterAudit = events.slice(events.indexOf('audit.write') + 1);
          assert.ok(afterAudit.includes('query.body'));
          assert.ok(afterAudit.includes('query.board'));
          if (bind) assert.deepEqual(after, { ...before, kanbanState: 'plan' });
        }
      }
    );
  }
}

for (const seedWarning of [false, true]) {
  test(
    `native partial recovery${seedWarning ? ' after seed warning' : ''}`,
    { skip: !nativeHost },
    (t) => {
      const fixture = run(t, 'unavailable', '', { bind: true });
      const { cli, body, before, after } = fixture;
      const diagnostic = { stdout: cli.stdout, stderr: cli.stderr, status: cli.status };
      assert.notEqual(diagnostic.status, 0);
      assert.match(diagnostic.stderr, /partial.*readback/i);
      assert.deepEqual(after, before);
      assert.match(body, /aitm-last-known-state state="plan"/);
      const visits = body.match(/<!-- aitm-entered-[\s\S]*?-->/g);
      assert.equal(visits.length, 2);
      assert.doesNotMatch(body, /aitm-reconciled/);
      fixture.updateState({ setup: true, mode: 'confirm', seedUnavailable: seedWarning });
      const paused = fixture.command('pause');
      assert.equal(paused.status, 0, paused.stderr);
      const resumed = fixture.command('start', '71', '--role', 'agent');
      assert.equal(resumed.status, 0, resumed.stderr);
      if (seedWarning) {
        assert.match(resumed.stderr, /kanbanState seed failed.*SeederGraphQLError/);
        assert.notEqual(fixture.readCache().kanbanState, 'plan');
        assert.ok(fixture.readEvents().filter((e) => e === 'seed.unavailable').length >= 2);
        fixture.updateState({ seedUnavailable: false });
        const pausedAgain = fixture.command('pause');
        assert.equal(pausedAgain.status, 0, pausedAgain.stderr);
        const recovered = fixture.command('start', '71', '--role', 'agent');
        assert.equal(recovered.status, 0, recovered.stderr);
        assert.doesNotMatch(recovered.stderr, /kanbanState seed failed/);
      } else assert.doesNotMatch(resumed.stderr, /kanbanState seed failed/);
      assert.equal(fixture.readCache().kanbanState, 'plan');
      const current = fixture.readState();
      assert.equal(current.live, 'Plan');
      assert.match(current.body, /aitm-last-known-state state="plan"/);
      assert.deepEqual(current.body.match(/<!-- aitm-entered-[\s\S]*?-->/g), visits);
      assert.doesNotMatch(current.body, /aitm-reconciled/);
      assert.ok(current.comments[0].body.includes('| pause:other |'));
      assert.ok(current.comments[0].body.includes('| resumed |'));
      assert.ok(!fixture.readEvents().includes('audit.write'));
      assert.ok(
        !fixture.readEvents().some((e) => e.startsWith('unexpected')),
        fixture.readEvents().join('\n')
      );
      t.diagnostic(
        JSON.stringify({ partial: diagnostic, recoveredState: 'plan', visits: visits.length })
      );
    }
  );
}

for (const mode of ['reject', 'drop']) {
  test('public accept-live refuses a ' + mode + ' from the provider', (t) => {
    const { cli, body, initial, events } = run(t, mode);
    assert.ok(events.includes('marker.write'));
    assert.ok(events.includes('failure.comment'));
    assert.notEqual(cli.status, 0);
    assert.match(cli.stderr, /recording-failed/);
    assert.doesNotMatch(cli.stdout, /reconciled/);
    assert.equal(body, initial);
    assert.ok(!events.includes('audit.write'));
  });
}
for (const mode of [
  'stale',
  'unavailable',
  'board-drift',
  'audit-board-unavailable',
  'audit-read-outage',
  'lost-ack-moved',
]) {
  test('public accept-live reports partial after confirmed write and ' + mode, (t) => {
    const { cli, body, events } = run(t, mode);
    assert.match(body, /aitm-last-known-state state="backlog"/);
    assert.notEqual(cli.status, 0);
    assert.match(cli.stderr, /partial.*readback/i);
    assert.ok(!events.includes('audit.write'));
    if (mode === 'lost-ack-moved') assert.ok(!events.includes('failure.comment'));
  });
}
test('refuse a transient competing state seen by primary verify before rebase', (t) => {
  const { cli, events } = run(t, 'verify-fleeting');
  assert.notEqual(cli.status, 0);
  assert.equal(events.filter((e) => e === 'marker.write').length, 1);
  assert.ok(!events.includes('audit.write'));
});
test('audit overlapping state change is partial and does not publish cache', (t) => {
  const bind = Boolean(
    process.env.CODEX_THREAD_ID && process.env.CODEX_THREAD_ID === process.env.CODEX_SESSION_ID
  );
  const { cli, body, before, after } = run(t, 'audit-overlap', '', { bind });
  assert.match(body, /aitm-last-known-state: review/);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /partial/);
  if (bind) assert.deepEqual(after, before);
});
test('concurrent prose after the audit write does not duplicate that audit', (t) => {
  const { cli, body, events } = run(t, 'audit-prose');
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(body, /Concurrent audit note/);
  assert.equal(body.match(/<!-- aitm-reconciled\b/g)?.length, 1);
  assert.equal(events.filter((e) => e === 'audit.write').length, 1);
});
test('public accept-live refuses a success audit on a conflicting new body', (t) => {
  const { cli, body, events } = run(t, 'audit-drift');
  assert.match(body, /aitm-last-known-state state="plan"/);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /partial/);
  assert.ok(!events.includes('audit.write'));
});
for (const mode of ['history-drift', 'marker-drift', 'prewrite-board-drift', 'fleeting-conflict']) {
  test('public accept-live refuses concurrent ' + mode, (t) => {
    const { cli, events } = run(t, mode);
    assert.notEqual(cli.status, 0);
    assert.ok(!events.includes('marker.write'));
    assert.ok(!events.includes('audit.write'));
  });
}
for (const marker of [
  '<!-- aitm-last-known-state invalid -->',
  '<!-- aitm-last-known-state state="plan" ts="garbage 1" -->',
  '<!-- aitm-last-known-state state="plan" ts="2026-02-31T00:00:00Z" -->',
  '<!-- aitm-last-known-state: plan -->\n<!-- aitm-last-known-state: plan -->',
  '<!-- aitm-last-known-state: plan -->\n<!-- aitm-last-known-state: backlog -->',
  '<!-- aitm-entered-backlog ts="2026-11-03T03:00:00Z" -->',
  '<!-- aitm-entered-backlog ts="2026-11-03T03:00:00Z" broken -->',
  '<!-- aitm-entered- ts="foo" -->',
  '<!-- aitm-entered-review ts="" -->',
  '<!-- aitm-entered-review ts="2026-06-01T00:00:00Z" ts="2026-07-01T00:00:00Z" -->',
  '<!-- aitm-entered-review ts="2026-06-01T00:00:00Z" move="one" move="two" -->',
  '<!-- aitm-entered-BACKLOG: 2026-06-10T00:00:00Z -->',
]) {
  test('public accept-live refuses ambiguous evidence ' + marker, (t) => {
    const { cli, body, initial, events } = run(t, 'confirm', marker);
    assert.notEqual(cli.status, 0);
    assert.equal(body, initial);
    assert.ok(!events.includes('marker.write'));
  });
}
test('reconciliation preserves Markdown indentation following a prior marker', (t) => {
  const { cli, body } = run(t, 'confirm', '<!-- aitm-last-known-state: plan -->\n    code block');
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(body.includes('\n    code block\n'));
});
test('accept-live normalizes a historical two-marker development state', (t) => {
  const { cli, body } = run(
    t,
    'demote',
    '<!-- aitm-last-known-state: development -->\n<!-- aitm-last-known-state-ts: 2026-05-10T14:32:11Z -->'
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(body, /aitm-last-known-state state="develop"/);
  assert.ok(body.includes(originalVisit));
  assert.match(body, /aitm-entered-develop /);
  assert.ok(!body.includes('aitm-last-known-state-ts:'));
});
for (const mode of ['lost-ack', 'rebase']) {
  test('public accept-live retains one new visit across ' + mode, (t) => {
    const { cli, body, events } = run(t, mode);
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(events.filter((e) => e === 'marker.write').length, mode === 'rebase' ? 2 : 1);
    assert.equal(events.filter((e) => e === 'audit.write').length, 1);
    assert.equal(body.match(/aitm-entered-backlog-2 /g)?.length, 1);
    assert.ok(!body.includes('aitm-entered-backlog-3 '));
    if (mode === 'rebase') {
      assert.ok(body.includes('Concurrent prefix.'));
      assert.doesNotMatch(
        cli.stderr,
        /succeeded on attempt 2/,
        'the inner versioned writer rebased the disjoint edit'
      );
    }
  });
}
test('public admission refuses an unsupported legacy board label without repair', (t) => {
  const { cli, body, initial, events } = run(
    t,
    'legacy-destination',
    '<!-- aitm-last-known-state: validate -->',
    { expectBoardRead: false }
  );
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /could not verify the assignee/);
  assert.equal(body, initial);
  assert.ok(events.includes('query.owner'));
  assert.ok(!events.includes('marker.write'));
  assert.ok(!events.includes('audit.write'));
});
for (const mode of ['demote', 'retired-demote', 'restored-proof']) {
  test('public demotion invalidation with ' + mode, (t) => {
    const declarations = Array.from(
      { length: 15 },
      (_, i) =>
        `- [x] Requirement ${i} <!-- aitm-verified vc-list="vc:1" sha="abc1234" ts="2026-10-01T00:00:00Z" exit="0" bound-issue="#71" worktree="/fixture/worktree" branch="fixture" -->`
    );
    const { cli, body, events } = run(
      t,
      mode,
      [
        `<!-- aitm-last-known-state: ${mode === 'retired-demote' ? 'validate' : 'test'} -->`,
        '<!-- aitm-entered-validate ts="2026-11-03T01:00:00Z" -->',
        ...declarations,
      ].join('\n')
    );
    assert.match(body, /aitm-last-known-state state="develop"/);
    assert.ok(body.includes('<!-- aitm-entered-validate ts="2026-11-03T01:00:00Z" -->'));
    if (mode === 'restored-proof') {
      assert.notEqual(cli.status, 0);
      assert.match(cli.stderr, /partial/);
      assert.ok(!events.includes('audit.write'));
    } else {
      assert.equal(cli.status, 0, cli.stderr);
      assert.doesNotMatch(body, /sha="abc1234"/);
      assert.equal(body.match(/- \[ \] Requirement/g)?.length, 15);
    }
  });
}
test('public accept-live preserves concurrent prose and visits, verifies the repair then audits', (t) => {
  const { cli, body, events } = run(t, 'prose');
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(body.includes('Concurrent prose.'));
  assert.ok(body.includes(originalVisit));
  assert.match(body, /aitm-entered-backlog-2 /);
  assert.match(body, /aitm-last-known-state state="backlog"/);
  assert.match(body, /aitm-reconciled/);
  const marker = events.indexOf('marker.write'),
    audit = events.indexOf('audit.write');
  assert.ok(marker >= 0 && audit > marker);
  assert.ok(events.slice(marker + 1, audit).includes('query.body'));
  assert.ok(events.slice(marker + 1, audit).includes('query.board'));
});
