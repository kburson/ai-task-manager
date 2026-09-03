// @story #1499
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import {
  claimOccupancy,
  heartbeatOccupancy,
  releaseOccupancy,
} from '../../../../../task-tracker/lib/occupancy.mjs';
import {
  inspectBindingGeneration,
  releaseBindingGeneration,
} from '../../../../../task-tracker/lib/evidence-v2/binding-generation.mjs';

test('new claims get fresh generations while heartbeat preserves the active generation', () => {
  const root = path.join(projectScratchDir('test'), `binding-generation-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  const occupancyFile = path.join(root, 'occupancy.json');
  const identity = {
    occupancyFile,
    issue: 1499,
    sid: 'session-a',
    provider: 'codex',
    worktreePath: root,
  };
  try {
    const first = claimOccupancy({ ...identity, now: () => '2026-09-03T18:00:00.000Z' });
    const beat = heartbeatOccupancy({ ...identity, now: () => '2026-09-03T18:01:00.000Z' });
    assert.match(first.row.bindingGenerationId, /^[a-f0-9-]{36}$/);
    assert.equal(beat.row.bindingGenerationId, first.row.bindingGenerationId);
    releaseOccupancy({ ...identity, bindingGenerationId: first.row.bindingGenerationId });
    const rebound = claimOccupancy({ ...identity, now: () => '2026-09-03T18:02:00.000Z' });
    assert.notEqual(rebound.row.bindingGenerationId, first.row.bindingGenerationId);
    assert.throws(
      () => releaseOccupancy({ ...identity, bindingGenerationId: first.row.bindingGenerationId }),
      /release refused/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generation release preserves same-session newer and foreign claims under the authority lock', async () => {
  const expected = {
    status: 'owned',
    repositoryId: 'repo',
    issue: 1499,
    cycleId: randomUUID(),
    sid: 'session-a',
    worktreePath: '/repo/worktree',
    bindingGenerationId: randomUUID(),
  };
  let row = { ...expected };
  let locks = 0;
  const ports = {
    withAuthorityLock: async (fn) => {
      locks += 1;
      return fn();
    },
    readBinding: async () => row,
    clearBinding: async () => {
      row = null;
    },
  };
  assert.equal(
    (await inspectBindingGeneration({ context: { expectedBinding: expected }, ports })).status,
    'owned'
  );
  assert.equal((await releaseBindingGeneration({ expected, ports })).status, 'released');
  assert.equal((await releaseBindingGeneration({ expected, ports })).status, 'already-released');

  row = { ...expected, bindingGenerationId: randomUUID() };
  assert.equal((await releaseBindingGeneration({ expected, ports })).status, 'pending-conflict');
  assert.ok(row);
  row = { ...expected, sid: 'foreign-session', bindingGenerationId: randomUUID() };
  assert.equal((await releaseBindingGeneration({ expected, ports })).status, 'pending-conflict');
  assert.ok(locks >= 5);
});

test('absent and paused bindings remain explicit cleanup observations', async () => {
  const base = {
    repositoryId: 'repo',
    issue: 1499,
    cycleId: randomUUID(),
    sid: 'session-a',
    worktreePath: '/repo/worktree',
  };
  const absent = await inspectBindingGeneration({
    context: { expectedBinding: { ...base, status: 'absent', bindingGenerationId: null } },
    ports: { readBinding: async () => null },
  });
  assert.equal(absent.status, 'absent');
  const generation = randomUUID();
  const paused = await inspectBindingGeneration({
    context: { expectedBinding: { ...base, status: 'paused', bindingGenerationId: generation } },
    ports: {
      readBinding: async () => ({ ...base, status: 'paused', bindingGenerationId: generation }),
    },
  });
  assert.equal(paused.status, 'paused');
});
