// @story #1325
import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseClosedBinding } from '../../../../task-tracker/verbs/close.mjs';

test('close releases authoritative occupancy even when fleet cleanup fails', () => {
  const releases = [];
  const result = releaseClosedBinding({
    projectDir: '/repo',
    issue: '#1325',
    ctx: {
      deregisterTask: () => {
        throw new Error('fleet unavailable');
      },
      releaseBindingOccupancy: (input) => {
        releases.push(input);
        return { status: 'released' };
      },
    },
  });
  assert.deepEqual(result, { status: 'released' });
  assert.deepEqual(releases, [{ projectDir: '/repo', issue: '#1325' }]);
});

test('close cannot report success when authoritative occupancy release fails', () => {
  assert.throws(
    () =>
      releaseClosedBinding({
        projectDir: '/repo',
        issue: '#1325',
        ctx: {
          deregisterTask: () => {},
          releaseBindingOccupancy: () => {
            throw new Error('occupancy retained');
          },
        },
      }),
    /occupancy retained/
  );
});
