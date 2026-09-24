// @story #1729
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateExactTrunkAttribution } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';

for (const localRef of ['refs/remotes/origin/trunk', 'origin/trunk']) {
  test(`local trunk authority refuses ${localRef} without a git read`, async () => {
    let reads = 0;
    const result = await evaluateExactTrunkAttribution({
      issue: 1729,
      cwd: '/repo-under-test',
      localRef,
      execGit: async () => {
        reads += 1;
        throw new Error('unexpected git read');
      },
    });
    assert.equal(result.status, 'indeterminate');
    assert.equal(result.reason, 'unsupported-ref');
    assert.equal(reads, 0);
  });
}
