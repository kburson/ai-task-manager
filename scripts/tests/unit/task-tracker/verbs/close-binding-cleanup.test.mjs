// @story #1297
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { releaseClosedBinding } from '../../../../task-tracker/verbs/close.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

test('shared close cleanup sweeps bindings before fleet deregistration and occupancy release', () => {
  const order = [];
  const result = releaseClosedBinding({
    projectDir: '/repo/wt',
    issue: '#1297',
    ctx: {
      releaseIssueBindings: () => {
        order.push('bindings');
        return { released: ['/repo/wt', '/repo/other'] };
      },
      deregisterTask: () => order.push('fleet'),
      releaseBindingOccupancy: () => {
        order.push('occupancy');
        return { status: 'released' };
      },
    },
  });
  assert.deepEqual(order, ['bindings', 'fleet', 'occupancy']);
  assert.deepEqual(result, { status: 'released' });
});

test('binding cleanup is mandatory and prevents false close success', () => {
  assert.throws(
    () =>
      releaseClosedBinding({
        projectDir: '/repo/wt',
        issue: '#1297',
        ctx: {
          releaseIssueBindings: () => {
            throw new Error('binding ledger unavailable');
          },
          deregisterTask: () => assert.fail('must not deregister after binding cleanup failure'),
          releaseBindingOccupancy: () => assert.fail('must not report cleanup success'),
        },
      }),
    /binding ledger unavailable/
  );
});

test('Done, disposition, and convergence close lanes retain the shared cleanup boundary', () => {
  const source = readFileSync(path.join(ROOT, 'scripts/task-tracker/verbs/close.mjs'), 'utf8');
  const calls = source.match(/releaseClosedBinding\(\{ ctx, projectDir, issue:/g) ?? [];
  assert.ok(calls.length >= 4, 'every terminal close lane calls the shared cleanup boundary');
  assert.match(source, /releaseIssueBindings/);
  assert.match(
    source,
    /issue', 'close', String\(child\.num\)[\s\S]*?releaseClosedBinding\(\{[\s\S]*?issue: `#\$\{child\.num\}`/
  );
});
