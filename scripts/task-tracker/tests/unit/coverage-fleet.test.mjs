#!/usr/bin/env node
// @story #596
// Coverage tests for scripts/task-tracker/verbs/fleet.mjs.
//
// `verbFleet` dispatches on rest[0]: `prune` → fleetPrune, anything else →
// fleetList. Neither path is DI-injectable — both resolve the fleet registry
// through the real `findMainWorktreePath`/`fleetRegistryPath` helpers. The test
// drives them against a real temp registry. CRITICAL: the project dir MUST live
// OUTSIDE any git repo — `findMainWorktreePath` shells `git worktree list`, and
// from a dir inside this repo's worktree it would resolve to the *real* main
// worktree and read/rewrite the live fleet registry. `mkdtempOutsideRepo` anchors
// under the system tmpdir so the git probe fails and the helper falls back to
// projectDir itself; the registry is then seeded with the real `writeFleet`.
// console.log is trapped to assert rendered output, and the prune branches
// (nothing-stale, evicted, dry-run) use worktree entries whose dirs do / don't
// exist.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { rmSync, existsSync, readFileSync } from 'node:fs';

import { verbFleet } from '../../verbs/fleet.mjs';
import { fleetRegistryPath, writeFleet } from '../../fleet-registry.mjs';
import { mkdtempOutsideRepo } from '../../lib/scratch-dir.mjs';

let tmpRoot;

before(() => {
  tmpRoot = mkdtempOutsideRepo('fleet-cov-');
});

after(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

// Each case gets its own project dir so its registry is isolated.
function freshProject(name) {
  const dir = path.join(tmpRoot, name);
  return dir;
}

function seed(projectDir, fleet) {
  writeFleet(fleetRegistryPath(projectDir), fleet);
}

// Run verbFleet with console.log trapped; returns the captured output string.
function runFleet(ctx) {
  const realLog = console.log;
  let out = '';
  console.log = (...args) => {
    out += args.join(' ') + '\n';
  };
  try {
    verbFleet(ctx);
  } finally {
    console.log = realLog;
  }
  return out;
}

test('list: empty registry → "No fleet tasks registered."', () => {
  const projectDir = freshProject('empty');
  seed(projectDir, {});
  const out = runFleet({ projectDir, rest: [] });
  assert.match(out, /No fleet tasks registered\./);
});

test('list: renders entries, covering both age formats and effectiveKind', () => {
  const projectDir = freshProject('list');
  const recent = new Date(Date.now() - 5 * 60000).toISOString(); // 5m → "Nm"
  const old = new Date(Date.now() - 130 * 60000).toISOString(); // 130m → "2h 10m"
  seed(projectDir, {
    '#100': {
      worktreePath: '/wt/a',
      branch: 'claude/a',
      kind: 'worktree',
      status: 'active',
      startedAt: recent,
    },
    '#200': {
      worktreePath: projectDir,
      branch: 'trunk',
      kind: 'main',
      status: 'paused',
      startedAt: old,
    },
  });
  const out = runFleet({ projectDir, rest: ['unrecognized-subcommand'] });
  assert.match(out, /Fleet: 2 tasks/);
  assert.match(out, /#100/);
  assert.match(out, /worktree/);
  assert.match(out, /main/);
  assert.match(out, /5m ago/);
  assert.match(out, /2h 10m ago/);
});

test('prune: nothing stale → "nothing stale", no eviction', () => {
  const projectDir = freshProject('prune-clean');
  // A paused main bind is intentional and never stale.
  seed(projectDir, {
    '#300': {
      worktreePath: projectDir,
      branch: 'trunk',
      kind: 'main',
      status: 'paused',
      startedAt: new Date().toISOString(),
    },
  });
  const out = runFleet({
    projectDir,
    statePath: path.join(projectDir, 'nope-state.json'),
    rest: ['prune'],
  });
  assert.match(out, /nothing stale/);
});

test('prune: evicts a worktree entry whose directory is gone', () => {
  const projectDir = freshProject('prune-evict');
  seed(projectDir, {
    '#400': {
      worktreePath: path.join(tmpRoot, 'does-not-exist-wt'),
      branch: 'claude/gone',
      kind: 'worktree',
      status: 'active',
      startedAt: new Date().toISOString(),
    },
  });
  // statePath omitted → loadState(undefined) throws inside fleetPrune and is
  // caught, leaving activeRef unset (exercises the catch branch).
  const out = runFleet({ projectDir, rest: ['prune'] });
  assert.match(out, /Evicted 1:/);
  assert.match(out, /#400/);
  // The registry was actually rewritten without the stale entry.
  const after = JSON.parse(readFileSync(fleetRegistryPath(projectDir), 'utf8'));
  assert.equal(Object.keys(after).length, 0);
});

test('prune --dry-run: reports "Would evict" but leaves the registry intact', () => {
  const projectDir = freshProject('prune-dry');
  seed(projectDir, {
    '#500': {
      worktreePath: path.join(tmpRoot, 'also-gone-wt'),
      branch: 'claude/gone2',
      kind: 'worktree',
      status: 'active',
      startedAt: new Date().toISOString(),
    },
  });
  const out = runFleet({
    projectDir,
    statePath: path.join(projectDir, 'nope-state.json'),
    rest: ['prune', '--dry-run'],
  });
  assert.match(out, /Would evict 1/);
  assert.match(out, /#500/);
  // dry-run must NOT mutate the registry.
  assert.ok(existsSync(fleetRegistryPath(projectDir)));
  const after = JSON.parse(readFileSync(fleetRegistryPath(projectDir), 'utf8'));
  assert.equal(Object.keys(after).length, 1);
});

console.log('coverage-fleet.test.mjs: defined');
