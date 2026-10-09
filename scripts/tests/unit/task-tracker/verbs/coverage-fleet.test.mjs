#!/usr/bin/env node
// @story #596
// Coverage tests for scripts/task-tracker/verbs/fleet.mjs.
//
// Fleet list/prune use genuinely registered, isolated activated Git roots.
// The real registry readers, validators, Git probes and rewrites remain in use.

import { strict as assert } from 'node:assert';
import { test, after } from 'node:test';
import { createCommittedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import path from 'node:path';
import { rmSync, existsSync, readFileSync } from 'node:fs';

import { verbFleet } from '../../../../task-tracker/verbs/fleet.mjs';
import { fleetRegistryPath, writeFleet } from '../../../../task-tracker/fleet-registry.mjs';

const projectRoots = [];
after(() => {
  for (const root of projectRoots) rmSync(root, { recursive: true, force: true });
});

async function freshProject(name) {
  const root = await createCommittedRuntimeRootFixture('fleet-cov-' + name + '-');
  projectRoots.push(root);
  return root;
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

test('list: empty registry → "No fleet tasks registered."', async () => {
  const projectDir = await freshProject('empty');
  seed(projectDir, {});
  const out = runFleet({ projectDir, rest: [] });
  assert.match(out, /No fleet tasks registered\./);
});

test('list: renders entries, covering both age formats and effectiveKind', async () => {
  const projectDir = await freshProject('list');
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

test('prune: nothing stale → "nothing stale", no eviction', async () => {
  const projectDir = await freshProject('prune-clean');
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

test('prune: evicts a worktree entry whose directory is gone', async () => {
  const projectDir = await freshProject('prune-evict');
  seed(projectDir, {
    '#400': {
      worktreePath: path.join(projectDir, 'does-not-exist-wt'),
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

test('prune --dry-run: reports "Would evict" but leaves the registry intact', async () => {
  const projectDir = await freshProject('prune-dry');
  seed(projectDir, {
    '#500': {
      worktreePath: path.join(projectDir, 'also-gone-wt'),
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
