#!/usr/bin/env node
// @story #441
// #441 — fleet-registry GC: kind tag, staleness predicate, opt-in auto-reap on
// readFleet, fleet prune, and back-compat path-inference migration.
import { strict as assert } from 'node:assert';
import { rmSync } from 'node:fs';
import { mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';
import {
  fleetRegistryPath,
  findMainWorktreePath,
  readFleet,
  writeFleet,
  registerTask,
  classifyBindKind,
  effectiveKind,
  isStaleEntry,
  reapStaleEntries,
  pruneFleet,
  STALE_MS_DEFAULT,
} from '../../fleet-registry.mjs';
import { liveWorktreeAgents } from '../../verbs/chore-mode.mjs';

const tmp = mkdtempProjectIsolated('tt-fleet-gc-');

try {
  const mainPath = findMainWorktreePath(tmp);
  const rPath = fleetRegistryPath(tmp);

  // --- classifyBindKind ---
  assert.equal(classifyBindKind(tmp, tmp), 'main', 'projectDir == main worktree → main');
  assert.equal(
    classifyBindKind(tmp, '/some/other/worktree'),
    'worktree',
    'differing worktreePath → worktree'
  );

  // --- registerTask stamps kind (derived) ---
  registerTask(tmp, '#1', tmp, '1-main');
  registerTask(tmp, '#2', '/wt/agent-2', '2-agent');
  let fleet = readFleet(rPath);
  assert.equal(fleet['#1'].kind, 'main', 'main-thread bind tagged main');
  assert.equal(fleet['#2'].kind, 'worktree', 'worktree bind tagged worktree');

  // explicit kind override is honored
  registerTask(tmp, '#3', '/wt/agent-3', '3-agent', 'main');
  fleet = readFleet(rPath);
  assert.equal(fleet['#3'].kind, 'main', 'explicit kind arg wins');

  // --- effectiveKind: legacy entries lacking kind inferred from path ---
  assert.equal(
    effectiveKind({ worktreePath: mainPath }, mainPath),
    'main',
    'legacy entry at main path → main'
  );
  assert.equal(
    effectiveKind({ worktreePath: '/wt/x' }, mainPath),
    'worktree',
    'legacy entry off main path → worktree'
  );
  assert.equal(effectiveKind({ kind: 'main', worktreePath: '/wt/x' }, mainPath), 'main');

  // --- liveWorktreeAgents: #405@trunk-class main bind no longer blocks ---
  const legacyFleet = {
    '#405': { worktreePath: mainPath, branch: 'trunk', status: 'active' }, // legacy main bind, no kind
    '#500': { worktreePath: '/wt/real-agent', branch: '500-x', status: 'active', kind: 'worktree' },
    '#600': { worktreePath: '/wt/paused', branch: '600-x', status: 'paused', kind: 'worktree' },
  };
  const live = liveWorktreeAgents(legacyFleet, mainPath);
  const liveRefs = live.map((a) => a.ref).sort();
  assert.deepEqual(liveRefs, ['#500'], 'only the real active worktree agent counts as live');

  // --- isStaleEntry branches ---
  const now = Date.parse('2026-06-17T12:00:00Z');
  const dirExists = (p) => p === mainPath || p === '/wt/live';
  const baseCtx = {
    nowMs: now,
    staleMs: STALE_MS_DEFAULT,
    activeRef: '#1',
    mainWorktreePath: mainPath,
    dirExists,
  };

  // malformed
  assert.equal(isStaleEntry('#x', null, baseCtx), true, 'malformed entry is stale');
  // main bind that IS active → keep
  assert.equal(
    isStaleEntry(
      '#1',
      { kind: 'main', worktreePath: mainPath, status: 'active', startedAt: '2026-06-17T11:59:00Z' },
      baseCtx
    ),
    false,
    'active main bind kept'
  );
  // main bind that is NOT active → stale
  assert.equal(
    isStaleEntry(
      '#9',
      { kind: 'main', worktreePath: mainPath, status: 'active', startedAt: '2026-06-17T11:59:00Z' },
      baseCtx
    ),
    true,
    'non-active main bind is stale'
  );
  // paused main bind is intentional → keep (only active-leaked main is stale)
  assert.equal(
    isStaleEntry(
      '#9',
      { kind: 'main', worktreePath: mainPath, status: 'paused', startedAt: '2026-06-17T11:59:00Z' },
      baseCtx
    ),
    false,
    'paused main bind kept even when not the active ref'
  );
  // worktree whose dir is gone → stale
  assert.equal(
    isStaleEntry(
      '#2',
      {
        kind: 'worktree',
        worktreePath: '/wt/gone',
        status: 'active',
        startedAt: '2026-06-17T11:59:00Z',
      },
      baseCtx
    ),
    true,
    'worktree with missing dir is stale'
  );
  // worktree, dir present, fresh → keep
  assert.equal(
    isStaleEntry(
      '#3',
      {
        kind: 'worktree',
        worktreePath: '/wt/live',
        status: 'active',
        startedAt: '2026-06-17T11:59:00Z',
      },
      baseCtx
    ),
    false,
    'fresh live worktree kept'
  );
  // worktree, dir present, active but older than threshold → stale
  assert.equal(
    isStaleEntry(
      '#4',
      {
        kind: 'worktree',
        worktreePath: '/wt/live',
        status: 'active',
        startedAt: '2026-06-15T00:00:00Z',
      },
      baseCtx
    ),
    true,
    'stale-aged active worktree is stale'
  );
  // worktree, dir present, paused (not active) older than threshold → keep (only active ages out)
  assert.equal(
    isStaleEntry(
      '#5',
      {
        kind: 'worktree',
        worktreePath: '/wt/live',
        status: 'paused',
        startedAt: '2026-06-15T00:00:00Z',
      },
      baseCtx
    ),
    false,
    'paused worktree not aged out'
  );

  // --- reapStaleEntries (pure) ---
  const dirty = {
    '#1': {
      kind: 'main',
      worktreePath: mainPath,
      status: 'active',
      startedAt: '2026-06-17T11:59:00Z',
    },
    '#9': {
      kind: 'main',
      worktreePath: mainPath,
      status: 'active',
      startedAt: '2026-06-17T11:59:00Z',
    },
    '#2': {
      kind: 'worktree',
      worktreePath: '/wt/gone',
      status: 'active',
      startedAt: '2026-06-17T11:59:00Z',
    },
  };
  const reaped = reapStaleEntries(dirty, baseCtx);
  assert.deepEqual(reaped.evicted.sort(), ['#2', '#9'], 'evicts non-active main + gone worktree');
  assert.deepEqual(Object.keys(reaped.kept), ['#1'], 'keeps active main bind');

  // --- readFleet({ reap }) rewrites only when stale ---
  writeFleet(rPath, dirty);
  const cleaned = readFleet(rPath, {
    reap: true,
    reapCtx: { nowMs: now, activeRef: '#1', mainWorktreePath: mainPath, dirExists },
  });
  assert.deepEqual(Object.keys(cleaned).sort(), ['#1'], 'reap on read drops stale entries');
  // persisted
  assert.deepEqual(Object.keys(readFleet(rPath)).sort(), ['#1'], 'reap rewrote the file');
  // second reap is a clean no-op (no throw)
  const again = readFleet(rPath, {
    reap: true,
    reapCtx: { nowMs: now, activeRef: '#1', mainWorktreePath: mainPath, dirExists },
  });
  assert.deepEqual(Object.keys(again), ['#1'], 'clean reap is a stable no-op');

  // --- pruneFleet dry-run vs real ---
  writeFleet(rPath, dirty);
  const plan = pruneFleet(
    rPath,
    { nowMs: now, activeRef: '#1', mainWorktreePath: mainPath, dirExists },
    { dryRun: true }
  );
  assert.deepEqual(plan.evicted.sort(), ['#2', '#9'], 'dry-run reports evictions');
  assert.deepEqual(
    Object.keys(readFleet(rPath)).sort(),
    ['#1', '#2', '#9'],
    'dry-run writes nothing'
  );

  const done = pruneFleet(
    rPath,
    { nowMs: now, activeRef: '#1', mainWorktreePath: mainPath, dirExists },
    { dryRun: false }
  );
  assert.deepEqual(done.evicted.sort(), ['#2', '#9'], 'real prune reports evictions');
  assert.deepEqual(Object.keys(readFleet(rPath)).sort(), ['#1'], 'real prune rewrote the file');

  console.log('fleet-registry-gc.test.mjs: all passed');
} finally {
  rmSync(tmp, { recursive: true });
}
