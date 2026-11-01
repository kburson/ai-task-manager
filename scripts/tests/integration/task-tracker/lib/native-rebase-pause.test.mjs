// @story #2068
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { childRebaseFixture, git } from '../../../helpers/child-rebase-fixture.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';

function fixtureEnv(f) {
  // Model an actual native payload, without inheriting the test runner's root alias.
  return {
    PATH: [
      path.dirname(process.execPath),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ].join(path.delimiter),
    HOME: process.env.HOME,
    CODEX_THREAD_ID: f.sid,
    CODEX_SESSION_ID: f.sid,
    AI_TASK_MANAGER_APP_NAME: 'codex',
  };
}
function hook(f, command) {
  const result = spawnSync(
    process.execPath,
    [path.join(f.sourceRoot, 'scripts/task-tracker/bash-guard.mjs')],
    {
      cwd: f.executor,
      env: fixtureEnv(f),
      encoding: 'utf8',
      timeout: 20000,
      input: JSON.stringify({
        session_id: f.sid,
        cwd: f.executor,
        tool_name: 'Bash',
        tool_input: { command, cwd: f.executor },
      }),
    }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

// Catches blanket branch mismatch preventing a verified own-session timer pause.
test('native own-rebase blocked Pause admits only its closed public carrier without Git or binding effects', (t) => {
  const f = childRebaseFixture(t, { bindTarget: true });
  f.installFixtureCarrier();
  const before = f.state();
  const result = hook(f, 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs pause blocked');
  assert.notEqual(result?.decision, 'block', result?.reason);
  assert.deepEqual(f.state(), before);
});

test('timer-only native rebase Pause also admits an owned Review child without granting source mutation', (t) => {
  const f = childRebaseFixture(t, { bindTarget: true });
  f.installFixtureCarrier();
  setActiveTask(f.sid, { ...f.record, kanbanState: 'review' }, f.target);
  const before = f.state();
  const result = hook(f, 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs pause blocked');
  assert.notEqual(result?.decision, 'block', result?.reason);
  assert.equal(hook(f, 'git rebase --continue')?.decision, 'block');
  assert.deepEqual(f.state(), before);
});

test('Pause admission binds the parsed carrier rather than a different installed entry', (t) => {
  const f = childRebaseFixture(t, { bindTarget: true });
  f.installFixtureCarrier();
  mkdirSync(path.join(f.target, 'bin'));
  writeFileSync(
    path.join(f.target, 'bin/aitm.mjs'),
    '#!/usr/bin/env node\nthrow Error("decoy must not execute");\n'
  );
  assert.notEqual(
    hook(f, 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs pause blocked')?.decision,
    'block'
  );
  assert.equal(hook(f, 'bin/aitm.mjs pause blocked')?.decision, 'block');
});

test('source-only Pause carrier admits only the actual selected entry spelling', (t) => {
  const f = childRebaseFixture(t, { bindTarget: true });
  symlinkSync(path.join(f.sourceRoot, 'bin'), path.join(f.target, 'bin'), 'dir');
  assert.notEqual(hook(f, 'bin/aitm.mjs pause blocked')?.decision, 'block');
  assert.equal(
    hook(f, 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs pause blocked')?.decision,
    'block'
  );
});

for (const boundary of ['queue', 'flush'])
  test('Pause retains native claim authority across the ' + boundary + ' await', (t) => {
    const f = childRebaseFixture(t, { bindTarget: true });
    f.installFixtureCarrier();
    const script = `
    import assert from 'node:assert/strict';
    import { pathToFileURL } from 'node:url';
    import path from 'node:path';
    import { readFileSync, writeFileSync } from 'node:fs';
    const root = ${JSON.stringify(f.sourceRoot)};
    const get = (file) => import(pathToFileURL(path.join(root, file)));
    const { verbPause } = await get('scripts/task-tracker/verbs/pause.mjs');
    const { occupancyPath } = await get('scripts/task-tracker/paths.mjs');
    const { getActiveTask } = await get('scripts/task-tracker/session-state.mjs');
    const file = occupancyPath(${JSON.stringify(f.main)});
    const before = getActiveTask(${JSON.stringify(f.sid)}, process.cwd());
    let flushes = 0;
    const replace = () => {
      const state = JSON.parse(readFileSync(file));
      state['2068'].bindingGenerationId = '99999999-9999-4999-8999-999999999999';
      writeFileSync(file, JSON.stringify(state));
    };
    await assert.rejects(verbPause({ projectDir: process.cwd(), statePath: path.join(process.cwd(), '.tmp/aitm/state.json'), rest: ['blocked'],
      drainQueueIfAny: async () => { if (${JSON.stringify(boundary)} === 'queue') replace(); },
      flushActiveToGH: async () => { flushes++; if (${JSON.stringify(boundary)} === 'flush') replace(); return { deltaMin: null, deltaWallMin: 1, deltaWords: 0, ts: '2026-11-01T17:00:00.000Z' }; },
    }), /native-rebase-pause/);
    assert.equal(flushes, ${boundary === 'queue' ? 0 : 1});
    assert.deepEqual(getActiveTask(${JSON.stringify(f.sid)}, process.cwd()), before);
    assert.equal(JSON.parse(readFileSync(file))['2068'].bindingGenerationId, '99999999-9999-4999-8999-999999999999');
  `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: f.target,
      env: fixtureEnv(f),
      encoding: 'utf8',
      timeout: 20000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });

for (const situation of [
  'new generation',
  'foreign rebase branch',
  'changed original',
  'unsafe todo',
]) {
  test('native rebase Pause refuses ' + situation + ' with no state effects', (t) => {
    const f = childRebaseFixture(t, { bindTarget: true });
    f.installFixtureCarrier();
    const marker = (name) =>
      git(f.target, 'rev-parse', '--path-format=absolute', '--git-path', 'rebase-merge/' + name);
    if (situation === 'new generation')
      setActiveTask(f.sid, { ...f.record, bindingGenerationId: 'different-generation' }, f.target);
    if (situation === 'foreign rebase branch')
      writeFileSync(marker('head-name'), 'refs/heads/' + f.epicBranch + '\n');
    if (situation === 'changed original') writeFileSync(marker('orig-head'), f.onto + '\n');
    if (situation === 'unsafe todo') writeFileSync(marker('git-rebase-todo'), 'exec echo unsafe\n');
    const before = f.state();
    assert.equal(
      hook(f, 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs pause blocked')?.decision,
      'block'
    );
    assert.deepEqual(f.state(), before);
  });
}

test('actual task CLI rejects noncanonical Pause flags before ordinary state effects', (t) => {
  const f = childRebaseFixture(t, { bindTarget: true });
  f.installFixtureCarrier();
  const before = f.state();
  const result = spawnSync(
    process.execPath,
    [
      path.join(f.sourceRoot, 'scripts/task-tracker/task-tracker.mjs'),
      'pause',
      'blocked',
      '--allow-foreign-worktree',
    ],
    {
      cwd: f.target,
      env: fixtureEnv(f),
      encoding: 'utf8',
      timeout: 20000,
    }
  );
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /native-rebase-pause:/);
  assert.deepEqual(f.state(), before);
});

test('admitted Pause uses ordinary Unknown timing persistence once and leaves rebase and occupancy intact', (t) => {
  const f = childRebaseFixture(t, { bindTarget: true });
  f.installFixtureCarrier();
  const before = f.state();
  const script = `
    import { pathToFileURL } from 'node:url';
    import path from 'node:path';
    const root = ${JSON.stringify(f.sourceRoot)};
    const { verbPause } = await import(pathToFileURL(path.join(root, 'scripts/task-tracker/verbs/pause.mjs')));
    const { loadState } = await import(pathToFileURL(path.join(root, 'scripts/task-tracker/state.mjs')));
    const statePath = path.join(process.cwd(), '.tmp/aitm/state.json');
    const events = [];
    const ctx = { statePath, projectDir: process.cwd(), rest: ['blocked'], drainQueueIfAny: async () => {},
      flushActiveToGH: async (state, event, description, unused, options) => {
        events.push({ issue: state.active, event, description, options });
        return { deltaMin: null, deltaWallMin: 7, deltaWords: 0, ts: '2026-11-01T17:00:00.000Z' };
      } };
    await verbPause(ctx);
    await verbPause(ctx);
    console.log(JSON.stringify({ events, state: loadState(statePath) }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: f.target,
    env: fixtureEnv(f),
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unknown active min/);
  const observed = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.deepEqual(observed.events, [
    {
      issue: '#2068',
      event: 'pause:blocked',
      description: 'blocked',
      options: { suppressRowWords: true },
    },
  ]);
  assert.equal(observed.state.paused, true);
  assert.equal(observed.state.active, null);
  assert.equal(observed.state.pauseReasonSlug, 'blocked');
  assert.equal(observed.state.pausedAtTs, '2026-11-01T17:00:00.000Z');
  const after = f.state();
  assert.deepEqual(after.slice(0, 7), before.slice(0, 7));
  assert.deepEqual(after.at(-1), before.at(-1));
});

for (const command of [
  'npx aitm pause blocked',
  'node_modules/@kburson/ai-task-manager/bin/aitm.mjs pause blocked --allow-foreign-worktree',
  'node_modules/@kburson/ai-task-manager/bin/aitm.mjs pause blocked; git rebase --continue',
])
  test('native rebase Pause refuses extra transport or effects: ' + command, (t) => {
    const f = childRebaseFixture(t, { bindTarget: true });
    f.installFixtureCarrier();
    const before = f.state();
    assert.equal(hook(f, command)?.decision, 'block');
    assert.deepEqual(f.state(), before);
  });
