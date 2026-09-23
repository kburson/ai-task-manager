// @story #1676
import assert from 'node:assert/strict';
import test from 'node:test';

import { readExactTrunkTip } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';

test('exact remote tip checks a large graph without buffering its object list', async () => {
  const tip = 'd'.repeat(40);
  const result = await readExactTrunkTip({
    remote: 'origin',
    ref: 'refs/heads/trunk',
    execGit: async (args) => {
      if (args[0] === 'ls-remote') return `${tip}\trefs/heads/trunk\n`;
      if (args[0] === 'rev-parse') return 'false\n';
      if (args[0] === 'cat-file') return '';
      if (args[0] === 'rev-list') {
        assert.deepEqual(args, ['rev-list', '--objects', '--missing=error', '--quiet', tip]);
        return '';
      }
      throw new Error('unexpected git command');
    },
  });
  assert.equal(result.status, 'observed');
  assert.equal(result.sha, tip);
});
