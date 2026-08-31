// @story #1117 #1455

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateProtectedCommentMutation } from '../../../../task-tracker/lib/gh-edit-guard.mjs';

test('protected comment edits and deletes are refused', async () => {
  for (const marker of [
    'aitm-resident-action-event',
    'aitm-resident-action-head',
    'aitm-resident-action-ledger-correction',
    'aitm-resident-action-ledger-damage-carry',
    'aitm-transition-commit',
  ]) {
    const result = await evaluateProtectedCommentMutation({
      command: 'gh api repos/o/r/issues/comments/42 --method DELETE',
      readComment: async () => `AITM evidence\n<!-- ${marker} data="e30" -->`,
    });
    assert.equal(result.block, true, marker);
    assert.match(result.reason, /protected/i);
  }
});

test('ambiguous edit-last and delete-last fail closed', async () => {
  for (const flag of ['--edit-last', '--delete-last']) {
    const result = await evaluateProtectedCommentMutation({
      command: `gh issue comment 1117 ${flag}`,
    });
    assert.equal(result.block, true);
    assert.match(result.reason, /ambiguous/i);
  }
});

test('ordinary comments and the dedicated GC command pass', async () => {
  assert.deepEqual(
    await evaluateProtectedCommentMutation({
      command: 'gh api repos/o/r/issues/comments/42 --method PATCH',
      readComment: async () => 'ordinary comment',
    }),
    { block: false }
  );
  assert.deepEqual(
    await evaluateProtectedCommentMutation({
      command: 'npx aitm action-ledger 1117 gc --comment 42',
    }),
    { block: false }
  );
});
