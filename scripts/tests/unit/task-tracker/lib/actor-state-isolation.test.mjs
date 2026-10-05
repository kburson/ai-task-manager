// @story #1857
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createUnitRootFixture, withUnitRuntimeRoot } from '../../../helpers/unit-runtime-root.mjs';
import { loadState, saveState } from '../../../../task-tracker/state.mjs';
import { getActiveTask, setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { actorTimingStatePath } from '../../../../task-tracker/lib/actor-timing-state.mjs';

function fixture(operation) {
  const root = createUnitRootFixture('actor-state-');
  const file = path.join(root, '.tmp', 'aitm', 'state', 'state.json');
  const saved = process.env.AI_TASK_MANAGER_SESSION_ID;
  const provider = process.env.AI_TASK_MANAGER_APP_NAME;
  try {
    process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
    mkdirSync(path.dirname(file), { recursive: true });
    return withUnitRuntimeRoot(
      () =>
        operation({
          root,
          file,
          actor(sid) {
            process.env.AI_TASK_MANAGER_SESSION_ID = sid;
          },
        }),
      { projectRoot: root }
    );
  } finally {
    if (saved === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = saved;
    if (provider === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
    else process.env.AI_TASK_MANAGER_APP_NAME = provider;
    rmSync(root, { recursive: true, force: true });
  }
}

test('one actor pause cannot replace another actor start or word cursors', () =>
  fixture(({ root, file, actor }) => {
    actor('fixture-actor-a');
    saveState(
      {
        active: '#1857',
        entryStartTs: '2026-10-01T01:00:00.125Z',
        wordsAtEntryStart: 10,
        lastWordMarker: 20,
        lastFullWordMarker: 30,
      },
      file
    );
    actor('fixture-actor-b');
    const fresh = loadState(file);
    assert.equal(fresh.active, null);
    assert.equal(fresh.lastWordMarker, 0);
    saveState(
      {
        active: '#1857',
        entryStartTs: '2026-10-01T01:01:00.250Z',
        wordsAtEntryStart: 100,
        lastWordMarker: 200,
        lastFullWordMarker: 300,
      },
      file
    );
    saveState(
      {
        ...loadState(file),
        active: null,
        entryStartTs: null,
        lastActive: '#1857',
        paused: true,
        pauseReasonText: 'actor b idle',
        pauseReasonSlug: 'other',
        pausedAtTs: '2026-10-01T01:02:00Z',
      },
      file
    );
    actor('fixture-actor-a');
    const a = loadState(file);
    assert.equal(a.entryStartTs, '2026-10-01T01:00:00.125Z');
    assert.equal(a.paused, undefined);
    assert.equal(a.pauseReasonText, undefined);
    assert.equal(a.pauseReasonSlug, undefined);
    assert.equal(a.lastWordMarker, 20);
    assert.equal(a.lastFullWordMarker, 30);
    assert.equal(getActiveTask('fixture-actor-a', root).issue, '#1857');
    actor('fixture-actor-b');
    const b = loadState(file);
    assert.equal(b.active, null);
    assert.equal(b.entryStartTs, null);
    assert.equal(b.paused, true);
    assert.equal(b.lastWordMarker, 200);
  }));

test('legacy own binding establishes its current interval without inheriting unattributed global history', () =>
  fixture(({ root, file, actor }) => {
    const legacy = JSON.stringify({
      active: '#99',
      lastActive: '#99',
      entryStartTs: '2026-09-01T00:00:00Z',
      lastWordMarker: 999,
      paused: true,
    });
    writeFileSync(file, legacy);
    actor('fixture-legacy-own');
    setActiveTask(
      'fixture-legacy-own',
      { issue: '#1857', entryStartTs: '2026-10-01T02:00:00Z', wordsAtStart: 40 },
      root
    );
    const own = loadState(file);
    assert.equal(own.active, '#1857');
    assert.equal(own.entryStartTs, '2026-10-01T02:00:00Z');
    assert.equal(own.wordsAtEntryStart, 40);
    assert.equal(own.paused, undefined);
    assert.equal(own.lastWordMarker, 0);
    assert.equal(readFileSync(file, 'utf8'), legacy);
    setActiveTask(
      'fixture-legacy-own',
      { issue: '#1857', entryStartTs: null, wordsAtStart: 0 },
      root
    );
    assert.equal(loadState(file).entryStartTs, null);
  }));

test('invalid actor write refuses before mutating binding or prior evidence', () =>
  fixture(({ root, file, actor }) => {
    actor('fixture-invalid');
    saveState({ active: '#1857', lastWordMarker: 20 }, file);
    const binding = getActiveTask('fixture-invalid', root);
    const local = actorTimingStatePath({ provider: 'codex', sid: 'fixture-invalid' }, root);
    const before = readFileSync(local, 'utf8');
    assert.throws(() => saveState({ active: '#999', lastWordMarker: -1 }, file), {
      code: 'ACTOR_TIMING_STATE_INVALID',
    });
    assert.deepEqual(getActiveTask('fixture-invalid', root), binding);
    assert.equal(readFileSync(local, 'utf8'), before);
  }));

test('corrupt, unsupported and mismatched actor state refuse without global fallback', () =>
  fixture(({ root, file, actor }) => {
    actor('fixture-corrupt');
    saveState({ active: '#1857', lastWordMarker: 20 }, file);
    const local = actorTimingStatePath({ provider: 'codex', sid: 'fixture-corrupt' }, root);
    const valid = JSON.parse(readFileSync(local, 'utf8'));
    for (const bytes of [
      '{broken',
      JSON.stringify({ ...valid, schema: 'future' }),
      JSON.stringify({ ...valid, sid: 'another' }),
    ]) {
      writeFileSync(local, bytes);
      assert.throws(() => loadState(file), { code: 'ACTOR_TIMING_STATE_INVALID' });
      assert.throws(() => saveState({ active: '#999', lastWordMarker: 0 }, file), {
        code: 'ACTOR_TIMING_STATE_INVALID',
      });
      assert.equal(readFileSync(local, 'utf8'), bytes);
    }
  }));

test('a genuine new binding supersedes only its own stale paused interval', () =>
  fixture(({ root, file, actor }) => {
    actor('fixture-rebind');
    saveState(
      {
        active: null,
        lastActive: '#1857',
        paused: true,
        pausedAtTs: '2026-10-01T01:00:00Z',
        lastWordMarker: 20,
      },
      file
    );
    setActiveTask(
      'fixture-rebind',
      { issue: '#2000', entryStartTs: '2026-10-01T02:00:00Z', wordsAtStart: 20 },
      root
    );
    const current = loadState(file);
    assert.equal(current.active, '#2000');
    assert.equal(current.entryStartTs, '2026-10-01T02:00:00Z');
    assert.equal(current.paused, undefined);
    assert.equal(current.pausedAtTs, null);
    assert.equal(current.lastWordMarker, 20);
  }));

test('timing updates preserve genuine same-issue binding generation and original bound time', () =>
  fixture(({ root, file, actor }) => {
    actor('fixture-generation');
    setActiveTask(
      'fixture-generation',
      {
        issue: '#1857',
        entryStartTs: '2026-10-01T01:00:00Z',
        boundAt: '2026-10-01T00:59:59Z',
        wordsAtStart: 10,
        bindingGenerationId: 'fixture-generation-id',
        cycleId: 'fixture-cycle-id',
      },
      root
    );
    saveState({ ...loadState(file), lastWordMarker: 20 }, file);
    const binding = getActiveTask('fixture-generation', root);
    assert.equal(binding.bindingGenerationId, 'fixture-generation-id');
    assert.equal(binding.cycleId, 'fixture-cycle-id');
    assert.equal(binding.boundAt, '2026-10-01T00:59:59Z');
    saveState({ ...loadState(file), active: '#2000' }, file);
    assert.equal(getActiveTask('fixture-generation', root).bindingGenerationId, undefined);
  }));
