// @story #1911
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import '../../../fixtures/offline-gh-auto.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { verbStart } from '../../../../task-tracker/verbs/start.mjs';
import { verbResume } from '../../../../task-tracker/verbs/resume.mjs';
import { verbSwitch } from '../../../../task-tracker/verbs/switch.mjs';
import { loadState, saveState, EMPTY_STATE } from '../../../../task-tracker/state.mjs';
import { claimBindingOccupancy } from '../../../../task-tracker/lib/occupancy-lifecycle.mjs';

async function sessionFixture(state) {
  const originalCwd = process.cwd();
  const s = createSandbox();
  process.chdir(s.context.sourceRoot);
  const previous = new Map();
  for (const key of [
    'HOME',
    'AI_TASK_MANAGER_PROJECT_DIR',
    'AI_TASK_MANAGER_SESSION_ID',
    'AI_TASK_MANAGER_APP_NAME',
  ]) {
    previous.set(key, process.env[key]);
    process.env[key] = s.env[key];
  }
  const f =
    state === 'approved'
      ? await approvedFixture({
          worktree: s.context.sourceRoot,
          branch: 'trunk',
          sessionId: s.context.runId,
        })
      : await fixture(state, { worktree: s.context.sourceRoot });
  if (state === 'malformed')
    f.backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
  const statePath = path.join(s.context.sourceRoot, '.tmp/aitm/session-fixture-state.json');
  saveState(
    {
      ...EMPTY_STATE,
      active: null,
      lastActive: `#${f.context.issue}`,
      paused: true,
      pausedAtTs: new Date(Date.now() - 10_000).toISOString(),
    },
    statePath
  );
  const before = fs.readFileSync(statePath, 'utf8');
  const effects = [];
  const ctx = {
    cfg: { repo: f.context.repository },
    projectDir: s.context.sourceRoot,
    statePath,
    role: 'agent',
    verb: 'resume',
    rest: [String(f.context.issue)],
    deps: { revisionBackend: f.backend },
    nowIso: () => new Date().toISOString(),
    claimBindingOccupancy: (input, deps) => {
      effects.push('occupancy');
      return claimBindingOccupancy(input, deps);
    },
    drainQueueIfAny: async () => effects.push('queue'),
    safePostTiming: async () => effects.push('timing'),
    readTimingCommentBody: async () => ({ status: 'absent', body: '' }),
    flushActiveToGH: async () => {
      effects.push('flush');
      return { deltaMin: 0, deltaWallMin: 0, deltaWords: 0 };
    },
    runLogIssueTime: async () => effects.push('log-time'),
    seedKanban: async () => {
      effects.push('seed');
      return { kanbanState: 'develop' };
    },
    reconcileDependencyDisposition: async () => effects.push('reconcile'),
  };
  return {
    ...f,
    ctx,
    s,
    effects,
    before,
    dispose: () => {
      process.chdir(originalCwd);
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      s.dispose();
    },
  };
}

for (const [name, adapter] of [
  ['start', (f) => verbStart({ ...f.ctx, verb: 'start' })],
  ['targeted resume', (f) => verbResume(f.ctx)],
  ['remembered resume', (f) => verbResume({ ...f.ctx, rest: [] })],
  ['switch', (f) => verbSwitch(f.ctx, `#${f.context.issue}`)],
]) {
  for (const state of ['pending', 'stale', 'malformed', 'unavailable', 'baseline', 'approved']) {
    test(`actual ${name} ${state} requires fresh authority before original session effects`, async () => {
      const f = await sessionFixture(state);
      try {
        if (['baseline', 'approved'].includes(state)) {
          await adapter(f);
          const result = loadState(f.ctx.statePath);
          assert.equal(result.active, `#${f.context.issue}`);
          assert.equal(result.worktreePath, f.s.context.sourceRoot);
          assert.equal(result.worktreeBranch, 'trunk');
          assert.ok(f.effects.includes('occupancy'));
          assert.ok(f.effects.includes('timing'));
          assert.equal(f.effects.filter((effect) => effect === 'timing').length, 1);
        } else {
          let error;
          try {
            await adapter(f);
          } catch (caught) {
            error = caught;
          }
          assert.deepEqual(
            f.effects,
            [],
            'No original occupancy/queue/timing callback before current admission'
          );
          assert.equal(
            fs.readFileSync(f.ctx.statePath, 'utf8'),
            f.before,
            'Denied bind preserves original state bytes'
          );
          assert.equal(
            error?.code,
            state === 'pending'
              ? 'revision-pending'
              : state === 'stale'
                ? 'revision-approval-stale'
                : 'revision-authority-unavailable'
          );
        }
      } finally {
        f.dispose();
      }
    });
  }
}

for (const [name, change] of [
  [
    'explicit target',
    (f) => {
      f.ctx.rest[0] = String(f.context.issue + 1);
    },
  ],
  [
    'repository',
    (f) => {
      f.ctx.cfg.repo = 'foreign/repo';
    },
  ],
  [
    'project directory',
    (f) => {
      f.ctx.projectDir = path.join(f.s.root, 'foreign');
    },
  ],
  [
    'remembered target',
    (f) => {
      saveState(
        { ...loadState(f.ctx.statePath), lastActive: `#${f.context.issue + 1}` },
        f.ctx.statePath
      );
    },
  ],
]) {
  test(`actual resume refuses ${name} drift during fresh admission before occupancy`, async () => {
    const f = await sessionFixture('baseline');
    try {
      if (name === 'remembered target') f.ctx.rest = [];
      const pending = verbResume(f.ctx);
      change(f);
      const externallyChangedState = fs.readFileSync(f.ctx.statePath, 'utf8');
      let error;
      try {
        await pending;
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(f.effects, [], 'Old admission cannot authorize a changed session scope');
      assert.equal(error?.code, 'revision-conflict');
      assert.equal(fs.readFileSync(f.ctx.statePath, 'utf8'), externallyChangedState);
    } finally {
      f.dispose();
    }
  });
}

for (const [name, change] of [
  [
    'repository',
    (f) => {
      f.ctx.cfg.repo = 'foreign/repo';
    },
  ],
  [
    'project directory',
    (f) => {
      f.ctx.projectDir = path.join(f.s.root, 'foreign');
    },
  ],
]) {
  test(`actual switch refuses ${name} drift during fresh admission before occupancy`, async () => {
    const f = await sessionFixture('baseline');
    try {
      const pending = verbSwitch(f.ctx, `#${f.context.issue}`);
      change(f);
      const before = fs.readFileSync(f.ctx.statePath, 'utf8');
      let error;
      try {
        await pending;
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(f.effects, []);
      assert.equal(error?.code, 'revision-conflict');
      assert.equal(fs.readFileSync(f.ctx.statePath, 'utf8'), before);
    } finally {
      f.dispose();
    }
  });
}

for (const [name, adapter] of [
  ['resume', (f) => verbResume(f.ctx)],
  ['switch', (f) => verbSwitch(f.ctx, `#${f.context.issue}`)],
]) {
  test(`actual ${name} refuses executor drift during fresh admission`, async () => {
    const f = await sessionFixture('baseline');
    try {
      const pending = adapter(f);
      process.env.AI_TASK_MANAGER_SESSION_ID += '-changed';
      let error;
      try {
        await pending;
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(f.effects, []);
      assert.equal(error?.code, 'revision-conflict');
      assert.equal(fs.readFileSync(f.ctx.statePath, 'utf8'), f.before);
    } finally {
      f.dispose();
    }
  });
}

for (const [name, adapter] of [
  ['resume', (f) => verbResume(f.ctx)],
  ['switch', (f) => verbSwitch(f.ctx, `#${f.context.issue}`)],
]) {
  test(`actual ${name} refuses admission backend drift`, async () => {
    const f = await sessionFixture('baseline');
    try {
      const pending = adapter(f);
      f.ctx.deps.revisionBackend = {};
      let error;
      try {
        await pending;
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(f.effects, []);
      assert.equal(error?.code, 'revision-conflict');
      assert.equal(fs.readFileSync(f.ctx.statePath, 'utf8'), f.before);
    } finally {
      f.dispose();
    }
  });
}

for (const [name, adapter] of [
  ['resume', (f) => verbResume(f.ctx)],
  ['switch', (f) => verbSwitch(f.ctx, `#${f.context.issue}`)],
]) {
  test(`actual ${name} refuses binding storage drift during admission`, async () => {
    const f = await sessionFixture('baseline');
    try {
      const pending = adapter(f);
      f.ctx.statePath = path.join(f.s.context.sourceRoot, '.tmp/aitm/changed-state.json');
      let error;
      try {
        await pending;
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(f.effects, []);
      assert.equal(error?.code, 'revision-conflict');
      assert.ok(!fs.existsSync(f.ctx.statePath));
    } finally {
      f.dispose();
    }
  });
}

for (const state of ['baseline', 'approved']) {
  test(`actual start ${state} preserves no-op timing and rereads the next changed authority`, async () => {
    const f = await sessionFixture(state);
    try {
      await verbStart({ ...f.ctx, verb: 'start' });
      const first = loadState(f.ctx.statePath);
      f.effects.length = 0;
      await verbStart({ ...f.ctx, verb: 'start' });
      assert.equal(loadState(f.ctx.statePath).entryStartTs, first.entryStartTs);
      assert.ok(
        !f.effects.includes('timing'),
        'Already-active bind does not manufacture another timing row'
      );
      f.backend.addComment({
        id: 'bad',
        body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
      });
      f.effects.length = 0;
      const before = fs.readFileSync(f.ctx.statePath, 'utf8');
      await assert.rejects(
        verbStart({ ...f.ctx, verb: 'start' }),
        (error) => error.code === 'revision-authority-unavailable'
      );
      assert.deepEqual(f.effects, []);
      assert.equal(fs.readFileSync(f.ctx.statePath, 'utf8'), before);
    } finally {
      f.dispose();
    }
  });
}

import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parse } from 'acorn';
const root = fileURLToPath(new URL('../../../../..', import.meta.url));

test('source discovery identifies hooks and all session delegates reaching the admission boundary', (t) => {
  const base = path.join(root, 'scripts/task-tracker');
  const files = [
    ...fs
      .readdirSync(base)
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => path.join(base, name)),
    ...fs
      .readdirSync(path.join(base, 'verbs'))
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => path.join(base, 'verbs', name)),
  ];
  const hooks = [],
    delegates = [];
  for (const file of files) {
    const ast = parse(fs.readFileSync(file, 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    const hookNames = new Set();
    const bindings = new Set();
    for (const node of ast.body)
      if (node.type === 'ImportDeclaration') {
        for (const specifier of node.specifiers) {
          if (
            ['evaluateLocalRevisionActivity', 'quarantineLocalSourceEdit'].includes(
              specifier.imported?.name
            )
          )
            hookNames.add(specifier.local.name);
          if (['verbResume', 'verbStart', 'verbSwitch'].includes(specifier.imported?.name))
            bindings.add(specifier.local.name);
        }
      }
    let hook = false,
      delegate = false;
    function walk(node) {
      if (!node || typeof node !== 'object' || node.type === 'ImportDeclaration') return;
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        hookNames.has(node.callee.name)
      )
        hook = true;
      if (node.type === 'Identifier' && bindings.has(node.name)) delegate = true;
      if (
        node.type === 'ImportExpression' &&
        ['./verbs/start.mjs', './verbs/resume.mjs', './verbs/switch.mjs', './start.mjs'].includes(
          node.source.value
        )
      )
        delegate = true;
      for (const value of Object.values(node))
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
    }
    walk(ast);
    if (hook) hooks.push(path.relative(root, file));
    if (delegate) delegates.push(path.relative(root, file));
  }
  assert.deepEqual(hooks.sort(), [
    'scripts/task-tracker/activity-guard.mjs',
    'scripts/task-tracker/source-edit-gate.mjs',
  ]);
  assert.deepEqual(delegates.sort(), [
    'scripts/task-tracker/task-tracker.mjs',
    'scripts/task-tracker/verbs/chore-mode.mjs',
    'scripts/task-tracker/verbs/resume.mjs',
    'scripts/task-tracker/verbs/start.mjs',
  ]);
  for (const name of ['resume', 'switch']) {
    const ast = parse(fs.readFileSync(path.join(base, 'verbs', name + '.mjs'), 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    const entry = ast.body.find(
      (node) =>
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.id?.name === (name === 'resume' ? 'verbResume' : 'verbSwitch')
    );
    assert.ok(entry, 'Actual public binding entry exists');
    const source = fs
      .readFileSync(path.join(base, 'verbs', name + '.mjs'), 'utf8')
      .slice(entry.start, entry.end);
    assert.ok(
      source.includes('withRevisionConsumer('),
      'The actual exported entry reaches fresh common admission'
    );
  }
  t.diagnostic(JSON.stringify({ hooks, delegates }));
});

async function qualify(files, minimum, t) {
  const paths = files.map((file) => path.join(root, file));
  for (const file of paths)
    assert.ok(fs.statSync(file).isFile(), `Missing complete verifier: ${file}`);
  // The profile owns a native-valid actor; never inherit the controller or a filename actor containing dots.
  const env = {
    ...process.env,
    AI_TASK_MANAGER_SESSION_ID: 'fixture-1911-profile',
    AI_TASK_MANAGER_APP_NAME: 'claude',
  };
  delete env.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve) =>
    execFile(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-reporter=tap', ...paths],
      { cwd: root, env, encoding: 'utf8', timeout: 600_000 },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    )
  );
  if (result.error) t.diagnostic(result.stdout + result.stderr);
  assert.ifError(result.error);
  const count = Number(result.stdout.match(new RegExp('^# tests (\\d+)\\s*$', 'm'))?.[1]);
  assert.ok(count >= minimum, `Empty or partial original selection: ${count}`);
  for (const field of ['fail', 'cancelled', 'skipped'])
    assert.match(result.stdout, new RegExp(`^# ${field} 0\\s*$`, 'm'));
  t.diagnostic(`Complete original profile: ${count} cases`);
}

test(
  'complete original session hook and delegation profiles retain all fixtures',
  { timeout: 600_000, concurrency: true },
  async (t) => {
    await Promise.all([
      t.test(
        'actual linked worktree, next mixed commit, source hook and live delegate custody',
        { timeout: 600_000 },
        (child) =>
          qualify(
            [
              'scripts/tests/integration/task-tracker/lib/criteria-revision-consumers-admission.test.mjs',
              'scripts/tests/integration/task-tracker/lib/criteria-revision-interlock.test.mjs',
              'scripts/tests/integration/task-tracker/lib/criteria-revision/policy-source-hook.test.mjs',
            ],
            35,
            child
          )
      ),
      t.test(
        'actual original session, binding generation, rollback and worktree lifecycle',
        { timeout: 600_000 },
        (child) =>
          qualify(
            [
              'scripts/tests/integration/task-tracker/lib/cross-worktree-bind-resume.test.mjs',
              'scripts/tests/unit/task-tracker/lib/bind-context.test.mjs',
              'scripts/tests/unit/task-tracker/lib/bind-event.test.mjs',
              'scripts/tests/integration/task-tracker/lib/verb-start-resume-stop.test.mjs',
              'scripts/tests/integration/task-tracker/verbs/resume-binding-generation.test.mjs',
              'scripts/tests/integration/task-tracker/lib/worktree-binding-lifecycle.test.mjs',
              'scripts/tests/integration/task-tracker/core/self-bind-resume.test.mjs',
              'scripts/tests/integration/task-tracker/lib/resume-fresh-bind-no-switch.test.mjs',
              'scripts/tests/unit/task-tracker/lib/occupancy.test.mjs',
            ],
            72,
            child
          )
      ),
    ]);
  }
);

for (const [name, adapter] of [
  ['resume', (f) => verbResume(f.ctx)],
  ['switch', (f) => verbSwitch(f.ctx, `#${f.context.issue}`)],
]) {
  for (const [identity, change] of [
    [
      'repository',
      (f) => {
        f.ctx.cfg.repo = 'foreign/repo';
      },
    ],
    [
      'session',
      () => {
        process.env.AI_TASK_MANAGER_SESSION_ID += '-changed';
      },
    ],
    [
      'provider',
      () => {
        process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
      },
    ],
  ]) {
    test(`actual ${name} refuses ${identity} drift inside admitted queue work before later effects`, async () => {
      const f = await sessionFixture('baseline');
      try {
        f.ctx.drainQueueIfAny = async () => {
          f.effects.push('queue');
          change(f);
        };
        let error;
        try {
          await adapter(f);
        } catch (caught) {
          error = caught;
        }
        assert.deepEqual(
          f.effects,
          ['occupancy', 'queue'],
          'Verified admission/claim prefix cannot authorize later effects after drift'
        );
        assert.equal(error?.code, 'revision-conflict');
        assert.equal(fs.readFileSync(f.ctx.statePath, 'utf8'), f.before);
      } finally {
        f.dispose();
      }
    });
  }
}

import { activeTaskPath, occupancyPath } from '../../../../task-tracker/paths.mjs';
import { getActiveTask } from '../../../../task-tracker/session-state.mjs';
import { readOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';

for (const identity of ['repository', 'session']) {
  test(`actual resume late ${identity} drift preserves verified state and refuses later timing`, async () => {
    const f = await sessionFixture('baseline');
    try {
      let changedSession;
      f.ctx.seedKanban = async () => {
        f.effects.push('seed');
        if (identity === 'repository') f.ctx.cfg.repo = 'foreign/repo';
        else {
          process.env.AI_TASK_MANAGER_SESSION_ID += '-changed';
          changedSession = process.env.AI_TASK_MANAGER_SESSION_ID;
        }
        return { kanbanState: 'develop' };
      };
      let error;
      try {
        await verbResume(f.ctx);
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(f.effects, ['occupancy', 'queue', 'seed']);
      assert.deepEqual(
        readOccupancy(occupancyPath(f.s.context.sourceRoot)),
        {},
        'Original claim rollback uses its fenced identity'
      );
      if (identity === 'repository') {
        assert.equal(error?.code, 'revision-conflict');
        assert.equal(getActiveTask(f.s.context.runId, f.s.context.sourceRoot)?.issue ?? null, null);
      } else {
        assert.ok(
          error instanceof AggregateError,
          'Changed actor prevents unsafe state restoration'
        );
        assert.ok(error.errors.some((cause) => cause.code === 'revision-conflict'));
        const committed = getActiveTask(f.s.context.runId, f.s.context.sourceRoot);
        assert.equal(committed.issue, `#${f.context.issue}`);
        assert.equal(committed.worktreePath, f.s.context.sourceRoot);
        assert.ok(
          !fs.existsSync(activeTaskPath(changedSession, f.s.context.sourceRoot)),
          'Rollback must not create state for the new actor'
        );
      }
    } finally {
      f.dispose();
    }
  });
}
