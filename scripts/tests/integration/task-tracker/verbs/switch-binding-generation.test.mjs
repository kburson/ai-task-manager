// @story #1889
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBindingFixture } from '../../../helpers/binding-generation-fixture.mjs';
import { verbStart } from '../../../../task-tracker/verbs/start.mjs';
import { verbSwitch } from '../../../../task-tracker/verbs/switch.mjs';
import { loadState } from '../../../../task-tracker/state.mjs';

test('real native issue switch replaces the old claim generation with the target claim', async () => {
  const f = createBindingFixture(import.meta.url);
  try {
    await verbStart(f.ctx);
    const oldGeneration = f.rows()['107'].bindingGenerationId;
    await verbSwitch(f.ctx, '#144');
    const next = f.rows()['144'].bindingGenerationId;
    assert.notEqual(next, oldGeneration);
    assert.equal(f.rows()['107'], undefined);
    assert.equal(f.active().issue, '#144');
    assert.equal(f.active().bindingGenerationId, next);
    assert.equal(loadState(f.statePath).bindingGenerationId, next);
    assert.equal(Object.hasOwn(f.shared(), 'bindingGenerationId'), false);
  } finally {
    f.close();
  }
});

test('native self switch preserves actual generation and does not post duplicate timing', async () => {
  const f = createBindingFixture(import.meta.url);
  try {
    await verbStart(f.ctx);
    const generation = f.rows()['107'].bindingGenerationId;
    const posts = f.posts.length;
    await verbSwitch(f.ctx, '#107');
    assert.equal(f.active().bindingGenerationId, generation);
    assert.equal(f.posts.length, posts);
  } finally {
    f.close();
  }
});

test('failed cross-issue bind restores the prior generation and occupancy', async () => {
  const f = createBindingFixture(import.meta.url);
  try {
    await verbStart(f.ctx);
    const before = f.rows();
    const prior = f.active();
    await assert.rejects(
      () =>
        verbSwitch(
          {
            ...f.ctx,
            safePostTiming: async () => {
              throw new Error('timing unavailable');
            },
          },
          '#144'
        ),
      /timing unavailable/
    );
    assert.deepEqual(f.rows(), before);
    assert.equal(f.active().issue, prior.issue);
    assert.equal(f.active().entryStartTs, prior.entryStartTs);
    assert.equal(f.active().bindingGenerationId, before['107'].bindingGenerationId);
    assert.equal(loadState(f.statePath).bindingGenerationId, before['107'].bindingGenerationId);
  } finally {
    f.close();
  }
});
