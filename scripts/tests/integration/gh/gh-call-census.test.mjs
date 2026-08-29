// @story #1410
// Integration lane: this contract intentionally resolves a child-process PATH sentinel.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  censusPassed,
  formatCensus,
  parseLanes,
  runLaneCensus,
} from '../../tools/gh-call-census.mjs';

const pexec = promisify(execFile);

test('parseLanes accepts repeatable canonical lane flags', () => {
  assert.deepEqual(parseLanes(['--lane', 'unit', '--lane=integration', '--lane', 'slow']), [
    'unit',
    'integration',
    'slow',
  ]);
  assert.throws(() => parseLanes([]), /at least one --lane/);
  assert.throws(() => parseLanes(['--lane', 'fast']), /unit\|integration\|slow/);
  assert.throws(() => parseLanes(['--unknown']), /unknown argument/);
});

test('runLaneCensus reports zero and removes its project-local sentinel', async () => {
  const result = await runLaneCensus('unit', {
    runLane: async ({ lane, env }) => {
      assert.equal(lane, 'unit');
      assert.notEqual(env.PATH, process.env.PATH);
      return 0;
    },
  });
  assert.deepEqual(result.calls, []);
  assert.equal(result.exitCode, 0);
  assert.equal(existsSync(result.scratchDir), false);
});

test('runLaneCensus records and refuses every resolved gh argv', async () => {
  const result = await runLaneCensus('slow', {
    runLane: async ({ env }) => {
      await assert.rejects(
        () => pexec('gh', ['issue', 'view', '1410'], { env }),
        /gh-call-census: refused real gh/
      );
      return 0;
    },
  });
  assert.deepEqual(result.calls, ['gh issue view 1410']);
  assert.equal(existsSync(result.scratchDir), false);
});

test('formatCensus is deterministic and the result fails closed', () => {
  const results = [
    { lane: 'unit', exitCode: 0, calls: [] },
    { lane: 'integration', exitCode: 0, calls: ['gh api rate_limit'] },
    { lane: 'slow', exitCode: 1, calls: [] },
  ];
  assert.equal(censusPassed(results), false);
  assert.equal(
    formatCensus(results),
    [
      'gh-call-census: unit: 0 real gh invocation(s); lane exit 0',
      'gh-call-census: integration: 1 real gh invocation(s); lane exit 0',
      '  gh api rate_limit',
      'gh-call-census: slow: 0 real gh invocation(s); lane exit 1',
      'gh-call-census: FAIL',
    ].join('\n')
  );
  assert.equal(censusPassed([{ lane: 'unit', exitCode: 0, calls: [] }]), true);
});
