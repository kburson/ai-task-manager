// @story #792
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GUARD_NAMES,
  guardEntrypointCandidates,
  resolveGuardEntrypoint,
  guardBootstrapCommand,
} from '../../../lib/guard-entrypoint.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

const CWD = '/proj';
const NM = resolve(CWD, 'node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs');
const REPO = resolve(CWD, 'scripts/task-tracker/bash-guard.mjs');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

// A fake `exists` that returns true only for the paths in `present`.
const existsFrom = (present) => (p) => present.has(p);

test('candidates: node_modules is tried before repo-relative', () => {
  assert.deepEqual(guardEntrypointCandidates('bash-guard'), [
    'node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs',
    'scripts/task-tracker/bash-guard.mjs',
  ]);
});

test('candidates: rejects a non-string name', () => {
  assert.throws(() => guardEntrypointCandidates(''), TypeError);
  assert.throws(() => guardEntrypointCandidates(null), TypeError);
});

// --- AC4: all three branches for the bash-guard entrypoint ---

test('branch 1 — node_modules present → resolves to node_modules candidate', () => {
  const got = resolveGuardEntrypoint('bash-guard', {
    cwd: CWD,
    exists: existsFrom(new Set([NM, REPO])), // both present → first still wins
  });
  assert.equal(got, NM);
});

test('branch 2 — node_modules absent, repo present → resolves to repo-relative candidate', () => {
  const got = resolveGuardEntrypoint('bash-guard', {
    cwd: CWD,
    exists: existsFrom(new Set([REPO])),
  });
  assert.equal(got, REPO);
});

test('branch 3 — both absent → returns null (fail-closed signal)', () => {
  const got = resolveGuardEntrypoint('bash-guard', {
    cwd: CWD,
    exists: existsFrom(new Set()),
  });
  assert.equal(got, null);
});

// --- AC1/AC2/AC3: the emitted hook command carries the fallback chain ---

test('bootstrap command embeds both candidate paths (node_modules first)', () => {
  const cmd = guardBootstrapCommand('bash-guard');
  const nmIdx = cmd.indexOf('node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs');
  const repoIdx = cmd.indexOf('\\"scripts/task-tracker/bash-guard.mjs\\"');
  assert.ok(nmIdx !== -1, 'node_modules candidate present');
  assert.ok(repoIdx !== -1, 'repo-relative candidate present');
  assert.ok(nmIdx < repoIdx, 'node_modules candidate is ordered first');
});

test('bootstrap command carries the fail-closed branch (exit 2 + stderr diagnostic)', () => {
  const cmd = guardBootstrapCommand('bash-guard');
  assert.match(cmd, /process\.exit\(2\)/);
  assert.match(cmd, /process\.stderr\.write\(/);
  assert.match(cmd, /aitm bash-guard: guard entrypoint unresolved/);
  assert.match(cmd, /failing closed/);
});

test('bootstrap command dynamic-imports the resolved path in-process', () => {
  const cmd = guardBootstrapCommand('bash-guard');
  assert.match(cmd, /import\(pathToFileURL\(p\)\.href\)/);
  assert.match(cmd, /runGuardBootstrap/);
  assert.ok(cmd.startsWith('node -e "'));
});

test('GUARD_NAMES covers the direct-node guards and each yields a bootstrap command', () => {
  assert.ok(GUARD_NAMES.includes('bash-guard'));
  assert.ok(GUARD_NAMES.includes('agent-guard'));
  assert.ok(GUARD_NAMES.includes('activity-guard'));
  for (const name of GUARD_NAMES) {
    assert.match(guardBootstrapCommand(name), new RegExp(`aitm ${name}: guard entrypoint`));
  }
});

function installedGuardSandbox({ active, state } = {}) {
  const dir = mkdtempProjectIsolated('aitm-guard-bootstrap-');
  mkdirSync(resolve(dir, 'node_modules'), { recursive: true });
  symlinkSync(ROOT, resolve(dir, 'node_modules', 'ai-task-manager'), 'dir');
  mkdirSync(resolve(dir, '.ai-task-manager'), { recursive: true });
  if (active) {
    const stateDir = resolve(dir, '.tmp', 'aitm', 'state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      resolve(stateDir, 'task-tracker-state.json'),
      JSON.stringify({ active, lastActive: active, state })
    );
  }
  return dir;
}

function runBootstrap(name, cwd, input) {
  return spawnSync(guardBootstrapCommand(name), {
    cwd,
    input,
    encoding: 'utf8',
    shell: true,
  });
}

test('#1049: exact installed source bootstrap executes and blocks a governed edit', () => {
  const dir = installedGuardSandbox();
  try {
    const result = runBootstrap(
      'source-edit-gate',
      dir,
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/guarded.mjs' } })
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /no bound issue/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed activity bootstrap executes and blocks pure state refusal', () => {
  const dir = installedGuardSandbox({ active: '#1049', state: 'refine' });
  try {
    const result = runBootstrap(
      'activity-guard',
      dir,
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/guarded.mjs' } })
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /WRITE_CODE/);
    assert.match(decision.reason, /refine/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed source and activity bootstraps pass malformed payloads', () => {
  const dir = installedGuardSandbox();
  try {
    for (const name of ['source-edit-gate', 'activity-guard']) {
      const result = runBootstrap(name, dir, '{malformed');
      assert.equal(result.status, 0, `${name} exit: ${result.stderr}`);
      assert.equal(result.stdout, '', `${name} stdout`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
