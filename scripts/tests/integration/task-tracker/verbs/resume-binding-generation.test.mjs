// @story #1889
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBindingFixture } from '../../../helpers/binding-generation-fixture.mjs';
import { verbStart } from '../../../../task-tracker/verbs/start.mjs';
import { verbResume } from '../../../../task-tracker/verbs/resume.mjs';
import { verbPause } from '../../../../task-tracker/verbs/pause.mjs';
import { saveState, loadState } from '../../../../task-tracker/state.mjs';
import { claimOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';

function assertClaim(f) {
  const generation = f.rows()['107'].bindingGenerationId;
  assert.match(generation, /^[a-f0-9-]{36}$/);
  assert.equal(f.active().bindingGenerationId, generation);
  assert.equal(loadState(f.statePath).bindingGenerationId, generation);
  assert.equal(Object.hasOwn(f.shared(), 'bindingGenerationId'), false);
  return generation;
}

test('native start persists real claim and active rebind preserves generation and live timer', async () => {
  const f = createBindingFixture(import.meta.url);
  try {
    await verbStart(f.ctx);
    const generation = assertClaim(f);
    const before = loadState(f.statePath);
    const posts = f.posts.length;
    await verbResume(f.ctx);
    assert.equal(assertClaim(f), generation);
    assert.equal(loadState(f.statePath).entryStartTs, before.entryStartTs);
    assert.equal(f.posts.length, posts);
  } finally {
    f.close();
  }
});

for (const rest of [[], ['#107']]) {
  test(
    'paused native resume ' + JSON.stringify(rest) + ' retains occupancy generation',
    async () => {
      const f = createBindingFixture(import.meta.url);
      try {
        await verbStart(f.ctx);
        const generation = assertClaim(f);
        await verbPause({ ...f.ctx, rest: ['break'] });
        assert.equal(f.active(), null);
        await verbResume({ ...f.ctx, rest });
        assert.equal(assertClaim(f), generation);
      } finally {
        f.close();
      }
    }
  );
}

test('explicit same-issue timer reopening transports the existing claim', async () => {
  const f = createBindingFixture(import.meta.url);
  try {
    await verbStart(f.ctx);
    const generation = assertClaim(f);
    saveState({ ...loadState(f.statePath), entryStartTs: null, wordsAtEntryStart: 0 }, f.statePath);
    await verbResume(f.ctx);
    assert.equal(assertClaim(f), generation);
    assert.ok(loadState(f.statePath).entryStartTs);
  } finally {
    f.close();
  }
});

test('failed fresh bind rolls back the real claim and leaves no active authority', async () => {
  const f = createBindingFixture(import.meta.url);
  try {
    await assert.rejects(
      () =>
        verbResume({
          ...f.ctx,
          safePostTiming: async () => {
            throw new Error('timing unavailable');
          },
        }),
      /timing unavailable/
    );
    assert.deepEqual(f.rows(), {});
    assert.equal(f.active(), null);
    assert.equal(loadState(f.statePath).bindingGenerationId, undefined);
  } finally {
    f.close();
  }
});

test('failed reopening restores prior generation and closed timer on unchanged claim', async () => {
  const f = createBindingFixture(import.meta.url);
  try {
    await verbStart(f.ctx);
    const generation = assertClaim(f);
    saveState({ ...loadState(f.statePath), entryStartTs: null, wordsAtEntryStart: 0 }, f.statePath);
    await assert.rejects(
      () =>
        verbResume({
          ...f.ctx,
          safePostTiming: async () => {
            throw new Error('timing unavailable');
          },
        }),
      /timing unavailable/
    );
    assert.equal(assertClaim(f), generation);
    assert.equal(loadState(f.statePath).entryStartTs, null);
  } finally {
    f.close();
  }
});

test('foreign occupancy collision prevents bind without importing its generation', async () => {
  const f = createBindingFixture(import.meta.url);
  try {
    claimOccupancy({
      projectDir: f.root,
      issue: 107,
      sid: 'fixture-foreign-1889',
      provider: 'claude',
      worktreePath: f.root,
    });
    const before = f.rows();
    await assert.rejects(() => verbStart(f.ctx), { code: 'occupancy-issue-held' });
    assert.deepEqual(f.rows(), before);
    assert.equal(f.active(), null);
    assert.equal(loadState(f.statePath).bindingGenerationId, undefined);
    assert.equal(f.posts.length, 0);
  } finally {
    f.close();
  }
});
