// @story #2039 #2043
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as adapter from '../../../../../task-tracker/lib/story-cache/stage-body.mjs';
test('invalid mutations refuse before reading claim or store', async () => {
  assert.equal(typeof adapter.stageStoryMutation, 'function', 'local staging adapter is missing');
  const input = {
    key: 'issue:I_test',
    mutate: 'captured body',
    get store() {
      return assert.fail('store accessed');
    },
    get claim() {
      return assert.fail('claim accessed');
    },
  };
  await assert.rejects(adapter.stageStoryMutation(input), { code: 'STORY_MUTATION_INVALID' });
});
test('invalid titles refuse before reading claim or store', async () => {
  assert.equal(
    typeof adapter.stageStoryTitle,
    'function',
    'local title staging adapter is missing'
  );
  for (const title of [null, 3, '', '   ', 'two\nlines', '\ud800']) {
    const input = {
      title,
      get store() {
        return assert.fail('store accessed');
      },
      get claim() {
        return assert.fail('claim accessed');
      },
    };
    await assert.rejects(adapter.stageStoryTitle(input), { code: 'STORY_MUTATION_INVALID' });
  }
});
