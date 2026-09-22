// @story #1673
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { agentCommandCatalog } from '../../../../task-tracker/lib/command-surface/catalog.mjs';
import { EXECUTABLE_ENTRYPOINTS } from '../../../../task-tracker/lib/command-surface/entrypoints.mjs';
import { SCRIPTS, VERBS } from '../../../../../bin/aitm-registry.mjs';
import { PACKAGE_COMMANDS } from '../../../../../bin/cli.mjs';
import * as taskTracker from '../../../../task-tracker/task-tracker.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const aitm = path.join(root, 'bin/aitm.mjs');
const taskHub = path.join(root, 'scripts/task-tracker/task-tracker.mjs');
const installer = path.join(root, 'bin/cli.mjs');
const doctor = path.join(root, 'scripts/package/doctor.mjs');
const inventory = JSON.parse(
  readFileSync(path.join(root, 'scripts/tests/fixtures/1558/admission-surface.json'), 'utf8')
);

function invalidProject() {
  const dir = mkdtempProjectIsolated('guidance-admission-');
  const catalog = path.join(dir, '.ai-task-manager/aitm-guidance.yml');
  mkdirSync(path.dirname(catalog), { recursive: true });
  writeFileSync(catalog, 'schema: invalid\n');
  execFileSync('git', ['add', '-f', '.ai-task-manager/aitm-guidance.yml'], { cwd: dir });
  return dir;
}

function invoke(args, cwd, entrypoint = aitm, env = {}) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TT_SKIP_NETWORK: '1', ...env },
    timeout: 15_000,
  });
}

test('tracked invalid override refuses a read-only operational route before normal dispatch', () => {
  const dir = invalidProject();
  try {
    const result = invoke(['status'], dir);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AITM guidance catalog is invalid/);
    assert.match(result.stderr, /No action was performed/);
    assert.doesNotMatch(result.stdout, /Active task|No active task/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid catalog refuses before GitHub, lock, or session effects without network skip', () => {
  const dir = invalidProject();
  try {
    const toolsDir = path.join(dir, 'tools');
    const trace = path.join(dir, 'gh-trace');
    mkdirSync(toolsDir);
    const fakeGh = path.join(toolsDir, 'gh');
    writeFileSync(fakeGh, '#!/bin/sh\nprintf "called\\n" >> "$AITM_GH_TRACE"\nexit 90\n');
    chmodSync(fakeGh, 0o755);
    const env = {
      TT_SKIP_NETWORK: '0',
      PATH: `${toolsDir}${path.delimiter}${process.env.PATH}`,
      AITM_GH_TRACE: trace,
    };
    const frontRoutes = [
      [aitm, ['status']],
      [taskHub, ['status']],
      [installer, ['init']],
    ];
    const directRoutes = inventory.entrypoints
      .filter((row) => row.gateCall === 'enforceDirectGuidance')
      .map((row) => [path.join(root, row.path), row.command === 'guidance' ? ['unknown'] : []]);
    for (const [entrypoint, args] of [...frontRoutes, ...directRoutes]) {
      const result = invoke(args, dir, entrypoint, env);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /AITM guidance catalog is invalid/);
    }
    assert.equal(existsSync(trace), false, 'no GitHub process may start before admission');
    assert.equal(
      existsSync(path.join(dir, '.ai-task-manager/locks')),
      false,
      'no issue lock may be acquired before admission'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dynamic issue-bind route cannot bypass admission', () => {
  const dir = invalidProject();
  try {
    const result = invoke(['#123'], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AITM guidance catalog is invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('direct verb hub refuses invalid guidance before context construction', () => {
  const dir = invalidProject();
  try {
    const result = invoke(['status'], dir, taskHub);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AITM guidance catalog is invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('direct verb executables refuse invalid guidance before their own main paths', () => {
  const dir = invalidProject();
  try {
    for (const entry of EXECUTABLE_ENTRYPOINTS.filter(
      (row) => row.classification === 'agent-callable-verb'
    )) {
      const result = invoke([], dir, path.join(root, entry.path));
      assert.equal(result.status, 1, `${entry.path}: ${result.stderr}`);
      assert.match(result.stderr, /AITM guidance catalog is invalid/, entry.path);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('direct verb help-shaped arguments cannot bypass admission', () => {
  const dir = invalidProject();
  try {
    for (const entry of EXECUTABLE_ENTRYPOINTS.filter(
      (row) => row.classification === 'agent-callable-verb'
    )) {
      const result = invoke(['--help'], dir, path.join(root, entry.path));
      assert.equal(result.status, 1, `${entry.path}: ${result.stderr}`);
      assert.match(result.stderr, /AITM guidance catalog is invalid/, entry.path);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unsupported direct-hub recovery words are admitted as operational', () => {
  const dir = invalidProject();
  try {
    for (const args of [['guidance', 'validate'], ['version']]) {
      const result = invoke(args, dir, taskHub);
      assert.equal(result.status, 1, `${args.join(' ')}: ${result.stderr}`);
      assert.match(result.stderr, /AITM guidance catalog is invalid/);
      assert.doesNotMatch(result.stderr, /unknown verb/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('session annotation requires a durable issue write, not a zero-exit or local change', () => {
  const { annotationMutationSucceeded, annotationTargetIssue } = taskTracker;
  assert.equal(typeof annotationMutationSucceeded, 'function');
  for (const verb of ['resume', 'pause', 'stop', 'update', 'start', '#1673']) {
    assert.equal(annotationMutationSucceeded({ verb, durableIssueWriteObserved: false }), false);
  }
  assert.equal(
    annotationMutationSucceeded({ verb: 'resume', durableIssueWriteObserved: true }),
    true
  );
  assert.equal(
    annotationMutationSucceeded({ verb: 'update', durableIssueWriteObserved: true }),
    true
  );
  for (const verb of ['pause', 'stop', 'update']) {
    assert.equal(annotationTargetIssue({ verb, rest: [], stateBefore: { active: '#1673' } }), 1673);
    assert.equal(
      annotationTargetIssue({ verb, rest: ['123'], stateBefore: { active: '#1673' } }),
      1673
    );
  }
  assert.equal(
    annotationMutationSucceeded({ verb: 'approve', verbResult: 'already-approved' }),
    false
  );
  assert.equal(annotationMutationSucceeded({ verb: 'approve', verbResult: 'approved' }), true);
  assert.equal(
    annotationMutationSucceeded({ verb: 'plan-approve', verbResult: 'already-approved' }),
    false
  );
  assert.equal(
    annotationMutationSucceeded({ verb: 'plan-approve', verbResult: 'repaired-approval' }),
    true
  );
  for (const [verb, result] of [
    ['deliver', { status: 'already-delivered' }],
    ['test', 'already-verified'],
    ['test', 'directory-evidence-accepted'],
    ['close', { action: 'already-closed' }],
    ['end', { action: 'already-closed' }],
    ['close', { status: 'untouched' }],
    ['close', { status: 'completed' }],
  ]) {
    assert.equal(annotationMutationSucceeded({ verb, verbResult: result }), false, verb);
  }
  assert.equal(
    annotationMutationSucceeded({ verb: 'deliver', verbResult: { status: 'delivered' } }),
    true
  );
  assert.equal(annotationMutationSucceeded({ verb: 'test', verbResult: 'passed' }), true);
  assert.equal(
    annotationMutationSucceeded({
      verb: 'close',
      verbResult: { action: 'finalize', status: 'completed' },
    }),
    true
  );
  assert.equal(
    annotationMutationSucceeded({
      verb: 'close',
      verbResult: { action: 'noop', status: 'completed' },
    }),
    false
  );
  assert.equal(
    annotationMutationSucceeded({
      verb: 'close',
      verbResult: { action: 'noop', status: 'completed' },
      durableIssueWriteObserved: true,
    }),
    true
  );
});

test('timing-post observation distinguishes durable issue writes from queued rows', async () => {
  const { observeGuidanceTimingWrites } = taskTracker;
  assert.equal(typeof observeGuidanceTimingWrites, 'function');
  const outcomes = [{ ok: false, queued: true }, { ok: true, skipped: true }, { ok: true }];
  const safePostTiming = async () => outcomes.shift();
  const ctx = { safePostTiming, timingRecorder: { safePostTiming } };
  const observation = observeGuidanceTimingWrites(ctx, 1673);
  await ctx.safePostTiming('#1673', 'queued');
  assert.equal(observation.durableIssueWriteObserved, false);
  await ctx.safePostTiming('#1673', 'skipped');
  assert.equal(observation.durableIssueWriteObserved, false);
  await ctx.timingRecorder.safePostTiming('#1673', 'posted');
  assert.equal(observation.durableIssueWriteObserved, true);
});

test('package installer refuses invalid guidance before init writes', () => {
  const dir = invalidProject();
  try {
    const result = invoke(['init'], dir, installer);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AITM guidance catalog is invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('direct support-script path refuses invalid guidance before its own parser', () => {
  const dir = invalidProject();
  try {
    const result = invoke([], dir, doctor);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AITM guidance catalog is invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guidance validation remains a routed recovery command', () => {
  const dir = invalidProject();
  try {
    const result = invoke(['guidance', 'validate'], dir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Guidance invalid/);
    assert.doesNotMatch(result.stderr, /unknown command/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('top-level help remains available while the selected catalog is invalid', () => {
  const dir = invalidProject();
  try {
    const result = invoke(['help'], dir);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /operational orchestrator/);
    assert.doesNotMatch(result.stderr, /action capture unavailable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('command help, guidance source, and package version remain effect-free recovery routes', () => {
  const dir = invalidProject();
  try {
    for (const args of [
      ['status', 'help'],
      ['guidance', 'source'],
      ['ai-task-manager', 'version'],
    ]) {
      const result = invoke(args, dir);
      assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
      assert.doesNotMatch(result.stderr, /action capture unavailable/);
      assert.doesNotMatch(result.stderr, /AITM guidance catalog is invalid/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('admission inventory accounts for every canonical command, alias, and classified executable', () => {
  const actualCommands = agentCommandCatalog()
    .flatMap((record) =>
      [record.name, ...record.aliases].map((token) => ({
        token,
        canonical: record.name,
        route: record.routing,
        entrypoint:
          record.routing === 'standalone' ? record.path : 'scripts/task-tracker/task-tracker.mjs',
        alias: token !== record.name,
        fixtureId: 'invalid-tracked-override',
      }))
    )
    .sort((left, right) => left.token.localeCompare(right.token));
  assert.deepEqual(inventory.commands, actualCommands);
  assert.deepEqual(
    inventory.entrypoints.map((entry) => [entry.path, entry.classification, entry.command]),
    EXECUTABLE_ENTRYPOINTS.map((entry) => [entry.path, entry.classification, entry.command]).sort(
      (left, right) => left[0].localeCompare(right[0])
    )
  );
  for (const entry of inventory.entrypoints) {
    const source = readFileSync(path.join(root, entry.path), 'utf8');
    const staticImports = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
      .body.filter((node) => node.type === 'ImportDeclaration')
      .map((node) => node.source.value);
    assert.deepEqual(staticImports, entry.staticImports, entry.path);
    if (entry.gateCall === 'enforceDirectGuidance') {
      assert.match(source, /enforceDirectGuidance\(import\.meta\.url/, entry.path);
    }
    if (entry.gateCall === 'admitGuidance') {
      assert.match(source, /admitGuidance\(/, entry.path);
    }
    if (entry.gateCall === null) assert.ok(entry.exception, entry.path);
  }
  assert.equal(VERBS.size, 73);
  assert.equal(Object.keys(SCRIPTS).length, 23);
  assert.deepEqual(
    new Set(inventory.commands.filter((row) => row.route === 'standalone').map((row) => row.token)),
    new Set([
      ...Object.keys(SCRIPTS),
      ...Object.keys(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).bin),
    ])
  );
  assert.deepEqual(
    new Set(
      inventory.commands
        .filter((row) => row.route !== 'standalone' && !['#N', 'help', '?'].includes(row.token))
        .map((row) => row.token)
    ),
    VERBS
  );
  assert.deepEqual(new Set(inventory.packageSubcommands.map((row) => row.token)), PACKAGE_COMMANDS);
});

test('every registered operational token refuses an invalid catalog', () => {
  const dir = invalidProject();
  try {
    for (const token of [...VERBS, ...Object.keys(SCRIPTS)].filter(
      (name) => !['aitm', 'ai-task-manager', 'guidance'].includes(name)
    )) {
      const result = invoke([token], dir);
      assert.equal(result.status, 1, `${token}: ${result.stderr}`);
      assert.match(result.stderr, /AITM guidance catalog is invalid/, token);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every supported direct operational entrypoint refuses an invalid catalog', () => {
  const dir = invalidProject();
  try {
    for (const entry of inventory.entrypoints.filter(
      (row) => row.gateCall === 'enforceDirectGuidance' && row.command !== 'guidance'
    )) {
      const result = invoke([], dir, path.join(root, entry.path));
      assert.equal(result.status, 1, `${entry.path}: ${result.stderr}`);
      assert.match(result.stderr, /AITM guidance catalog is invalid/, entry.path);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
