// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  createRuntimeRootFixture,
  createActivatedRuntimeRootFixture,
} from '../../../helpers/runtime-root-fixture.mjs';
import { planRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-plan.mjs';
import {
  beginCapturedAction,
  completeCapturedAction,
  setActionCaptureEnabled,
} from '../../../../task-tracker/lib/action-capture.mjs';
import { classifyCaptureRecord } from '../../../../task-tracker/lib/runtime-capture-catalog.mjs';
import { readdirSync } from 'node:fs';
import {
  readPhysicalRuntimeIdentity,
  withRuntimeRootAdapters,
} from '../../../../task-tracker/lib/runtime-storage.mjs';

test('one plan observes each physical root independently of file count and rechecks its final census', async () => {
  const root = createRuntimeRootFixture('1857-root-census-budget-');
  try {
    const identity = readPhysicalRuntimeIdentity(root);
    for (let index = 0; index < 20; index++) {
      const file = path.join(
        root,
        '.tmp',
        'aitm',
        'sessions',
        'session-' + index,
        'active-task.json'
      );
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, '{}');
    }
    let observations = 0;
    const plan = await withRuntimeRootAdapters(
      {
        readIdentity: () => {
          observations++;
          return identity;
        },
      },
      () => planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters })
    );
    assert.equal(plan.files.length, 20);
    assert.ok(observations <= 6, 'Git identity must not be re-observed for every source file');
    let changed = false;
    const shifted = await withRuntimeRootAdapters(
      {
        readIdentity: () =>
          changed
            ? {
                ...identity,
                worktreeIdentity: {
                  ...identity.worktreeIdentity,
                  registeredRoots: [root, root + '/new-root'],
                },
              }
            : identity,
      },
      () =>
        planRuntimeMigration({
          projectRoot: root,
          mainRoot: root,
          adapters: {
            ...adapters,
            writerCensus: () => {
              changed = true;
              return { complete: true, writers: [], claims: [] };
            },
          },
        })
    );
    assert.ok(shifted.blockers.some((entry) => entry.code === 'root-census-changed'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('supported legacy roots have an explicit byte-preserving route and duplicates refuse', async () => {
  const root = createRuntimeRootFixture('1857-legacy-route-');
  try {
    const source = path.join(root, '.claude/task-tracker-state.json');
    mkdirSync(path.dirname(source), { recursive: true });
    const bytes = Buffer.from('{"active":null}\n');
    writeFileSync(source, bytes);
    writeFileSync(path.join(root, '.claude/config.json'), '{"trackedConfig":true}');
    const plan = await planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters });
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.files.length, 1);
    assert.equal(plan.files[0].source, source);
    assert.equal(
      plan.files[0].destination,
      path.join(root, '.ai-task-manager/runtime/store/state/task-tracker-state.json')
    );
    assert.deepEqual(readFileSync(source), bytes);
    const duplicate = path.join(root, '.tmp/aitm/state/task-tracker-state.json');
    mkdirSync(path.dirname(duplicate), { recursive: true });
    writeFileSync(duplicate, bytes);
    const conflict = await planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters });
    assert.ok(conflict.blockers.some((entry) => entry.code === 'ambiguous-source'));
    assert.equal(conflict.files.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('empty legacy lock directories remain active-source blockers, never invisible empty inventory', async () => {
  const root = createRuntimeRootFixture('1857-empty-lock-');
  try {
    const lock = path.join(root, '.tmp/aitm/locks/issue-1857.lock');
    mkdirSync(lock, { recursive: true });
    const plan = await planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters });
    assert.ok(
      plan.blockers.some(
        (entry) => entry.code === 'source-lock-recovery-required' && entry.target === lock
      )
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('capture catalog accepts actual producer records and validates each stored payload', async () => {
  const root = await createActivatedRuntimeRootFixture('1857-real-capture-catalog-');
  const legacyRoot = createRuntimeRootFixture('1857-capture-upgrade-source-');
  try {
    const context = {
      projectDir: root,
      repository: 'owner/repo',
      issue: 1857,
      enabled: true,
      args: ['issue', 'view', '1857'],
      stdin: Buffer.from([255, 0, 128]),
      invocationId: 'fixture',
      command: 'fixture',
    };
    const deps = { findMainWorktreePath: () => root };
    const enabled = setActionCaptureEnabled(context, deps);
    const handle = beginCapturedAction(context, deps);
    completeCapturedAction(handle, {
      exitCode: 0,
      stdout: Buffer.from([254, 10]),
      stderr: Buffer.alloc(0),
    });
    const store = path.join(root, '.ai-task-manager', 'runtime', 'store');
    const files = [
      enabled.markerPath,
      path.join(path.dirname(handle.actionDir), '.sequence'),
      ...readdirSync(handle.actionDir).map((name) => path.join(handle.actionDir, name)),
    ];
    for (const file of files) {
      const legacyStore = path.join(root, '.tmp', 'aitm');
      assert.ok(
        file.startsWith(store + path.sep) || file.startsWith(legacyStore + path.sep),
        'actual capture bytes stay in a declared source root'
      );
      const sourceRoot = file.startsWith(store + path.sep) ? store : legacyStore;
      const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
      const classified = classifyCaptureRecord({
        relative,
        readSibling: (name) => readFileSync(path.join(path.dirname(file), name)),
      });
      assert.ok(classified, relative);
      assert.equal(classified.validate(readFileSync(file)), true, relative);
      const legacy = path.join(legacyRoot, '.tmp', 'aitm', relative);
      mkdirSync(path.dirname(legacy), { recursive: true });
      writeFileSync(legacy, readFileSync(file));
    }
    const plan = await planRuntimeMigration({
      projectRoot: legacyRoot,
      mainRoot: legacyRoot,
      adapters,
    });
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.files.length, files.length);
    assert.equal(
      plan.files.find((entry) => entry.source.endsWith('/stdin.bin')).size,
      context.stdin.length
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(legacyRoot, { recursive: true, force: true });
  }
});

const adapters = {
  trustLegacy: () => 'explicit-operator-trust',
  writerCensus: () => ({ complete: true, writers: [], claims: [] }),
};

test('default migration catalog validates supported state and actor formats without caller-supplied classification', async () => {
  const root = createRuntimeRootFixture('1857-default-catalog-');
  try {
    const records = {
      'state/task-tracker-state.json': { active: '#1857', entryStartTs: '2026-10-01T00:00:00Z' },
      'state/task-tracker-queue.json': { schema: 'aitm.timing-queue/v1', items: [] },
      'fleet/task-fleet.json': {},
      'fleet/occupancy.json': {},
    };
    for (const [relative, value] of Object.entries(records)) {
      const target = path.join(root, '.tmp/aitm', relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, JSON.stringify(value));
    }
    const plan = await planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters });
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.files.length, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('migration classifiers receive exact binary capture bytes without text decoding', async () => {
  const root = createRuntimeRootFixture('1857-binary-census-');
  try {
    const source = path.join(root, '.tmp', 'aitm', 'action-capture', 'payload.bin');
    mkdirSync(path.dirname(source), { recursive: true });
    const bytes = Buffer.from([0, 255, 254, 128, 10]);
    writeFileSync(source, bytes);
    const plan = await planRuntimeMigration({
      projectRoot: root,
      mainRoot: root,
      adapters: {
        ...adapters,
        classifyLegacy: ({ relative }) => ({
          family: 'action-capture',
          scope: 'shared',
          destination: relative,
          validate: (input) => Buffer.isBuffer(input) && input.equals(bytes),
        }),
      },
    });
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.files[0].size, bytes.length);
    assert.deepEqual(readFileSync(source), bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an artifact-contained registered root is a typed census blocker, not a thrown planner failure', async () => {
  const root = createRuntimeRootFixture('1857-unsafe-census-');
  const child = path.join(root, '.tmp', 'registered');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  try {
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'fixture'
    );
    mkdirSync(path.dirname(child), { recursive: true });
    git('worktree', 'add', '-q', '--detach', child, 'HEAD');
    const plan = await planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters });
    assert.ok(
      plan.blockers.some(
        (blocker) =>
          blocker.code === 'root-unadmittable' &&
          blocker.target === child &&
          blocker.detail === 'ROOT_OVERRIDE_UNSAFE'
      )
    );
    assert.ok(
      plan.roots.includes(child),
      'retain the observed census instead of hiding the unsafe root'
    );
  } finally {
    git('worktree', 'remove', '--force', child);
    rmSync(root, { recursive: true, force: true });
  }
});
