// @story #1889
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { createBindingFixture } from '../../helpers/binding-generation-fixture.mjs';
import { saveState, loadState, EMPTY_STATE } from '../../../task-tracker/state.mjs';

const generation = '12345678-1234-4234-8234-123456789abc';
test('own generation survives state round trip and never enters shared state', () => {
  const f = createBindingFixture(import.meta.url);
  try {
    saveState(
      {
        ...EMPTY_STATE,
        active: '#107',
        entryStartTs: f.ctx.nowIso(),
        bindingGenerationId: generation,
        worktreePath: f.root,
      },
      f.statePath
    );
    assert.equal(f.active().bindingGenerationId, generation);
    assert.equal(loadState(f.statePath).bindingGenerationId, generation);
    assert.equal(Object.hasOwn(f.shared(), 'bindingGenerationId'), false);
    const own = loadState(f.statePath);
    saveState({ ...own, lastWordMarker: 15 }, f.statePath);
    assert.equal(f.active().bindingGenerationId, generation);
  } finally {
    f.close();
  }
});

test('explicit absent claim clears a prior same-issue generation', () => {
  const f = createBindingFixture(import.meta.url);
  try {
    saveState(
      {
        ...EMPTY_STATE,
        active: '#107',
        entryStartTs: f.ctx.nowIso(),
        bindingGenerationId: generation,
      },
      f.statePath
    );
    saveState({ ...loadState(f.statePath), bindingGenerationId: null }, f.statePath);
    assert.equal(f.active().bindingGenerationId, null);
    assert.equal(loadState(f.statePath).bindingGenerationId, undefined);
    assert.equal(Object.hasOwn(f.shared(), 'bindingGenerationId'), false);
  } finally {
    f.close();
  }
});

test('another actor cannot inherit generation from shared state or a foreign binding', () => {
  const f = createBindingFixture(import.meta.url);
  try {
    saveState(
      {
        ...EMPTY_STATE,
        active: '#107',
        entryStartTs: f.ctx.nowIso(),
        bindingGenerationId: generation,
      },
      f.statePath
    );
    writeFileSync(f.statePath, JSON.stringify({ bindingGenerationId: generation }));
    process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-foreign-1889';
    assert.equal(loadState(f.statePath).bindingGenerationId, undefined);
    assert.equal(loadState(f.statePath).active, null);
  } finally {
    f.close();
  }
});
