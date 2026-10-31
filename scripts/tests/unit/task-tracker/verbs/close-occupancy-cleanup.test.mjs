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
      readTerminalIssueBindingRelease: () => ({ status: 'released' }),
      releaseIssueBindings: () => ({ released: [] }),
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
          readTerminalIssueBindingRelease: () => ({ status: 'released' }),
          releaseIssueBindings: () => ({ released: [] }),
          deregisterTask: () => {},
          releaseBindingOccupancy: () => {
            throw new Error('occupancy retained');
          },
        },
      }),
    /occupancy retained/
  );
});

test('#2134: Close adapter refuses a no-op synchronous release read-back', () => {
  assert.throws(
    () =>
      releaseClosedBinding({
        projectDir: '/repo',
        issue: '#1325',
        ctx: {
          releaseIssueBindings: () => ({ released: [] }),
          deregisterTask: () => {},
          releaseBindingOccupancy: () => ({ status: 'released' }),
          readTerminalIssueBindingRelease: () => ({ status: 'incomplete' }),
        },
      }),
    /release-readback-incomplete/
  );
});

test('#2134: Close adapter cannot accept thenable release read-back as synchronous proof', () => {
  assert.throws(
    () =>
      releaseClosedBinding({
        projectDir: '/repo',
        issue: '#1325',
        ctx: {
          releaseIssueBindings: () => ({ released: [] }),
          deregisterTask: () => {},
          releaseBindingOccupancy: () => ({ status: 'released' }),
          readTerminalIssueBindingRelease: () => ({ status: 'released', then() {} }),
        },
      }),
    /release-readback/
  );
});

test('#2134: Close adapter requires an actual synchronous inspection result object', () => {
  for (const result of [undefined, null, {}, Object.assign([], { status: 'released' })]) {
    assert.throws(
      () =>
        releaseClosedBinding({
          projectDir: '/repo',
          issue: '#1325',
          ctx: {
            releaseIssueBindings: () => ({ released: [] }),
            deregisterTask: () => {},
            releaseBindingOccupancy: () => ({ status: 'released' }),
            readTerminalIssueBindingRelease: () => result,
          },
        }),
      /release-readback/
    );
  }
});
