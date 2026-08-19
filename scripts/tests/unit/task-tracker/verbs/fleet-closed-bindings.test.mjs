// @story #1297
import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseClosedFleetBinding } from '../../../../task-tracker/verbs/fleet.mjs';

function fixture(state = 'CLOSED') {
  const released = [];
  const deregistered = [];
  return {
    ctx: {
      projectDir: '/repo/wt',
      cfg: { repo: 'owner/repo' },
      rest: ['release-closed-binding', '#1297'],
    },
    deps: {
      readIssueState: async () => state,
      releaseIssueBindings: (input) => {
        released.push(input);
        return { released: ['/repo/wt', '/repo/other'] };
      },
      deregisterTask: (...args) => deregistered.push(args),
    },
    released,
    deregistered,
  };
}

test('verified recovery releases a confirmed closed issue without an override', async () => {
  const input = fixture();
  const result = await releaseClosedFleetBinding(input.ctx, input.deps);
  assert.deepEqual(result, { issue: '#1297', released: ['/repo/wt', '/repo/other'] });
  assert.deepEqual(input.released, [{ projectDir: '/repo/wt', issue: '#1297' }]);
  assert.deepEqual(input.deregistered, [['/repo/wt', '#1297']]);
});

test('recovery refuses to release a binding for an open issue', async () => {
  const input = fixture('OPEN');
  await assert.rejects(() => releaseClosedFleetBinding(input.ctx, input.deps), /not CLOSED/);
  assert.deepEqual(input.released, []);
  assert.deepEqual(input.deregistered, []);
});

test('recovery fails closed when GitHub issue state is unavailable', async () => {
  const input = fixture();
  input.deps.readIssueState = async () => {
    throw new Error('network unavailable');
  };
  await assert.rejects(
    () => releaseClosedFleetBinding(input.ctx, input.deps),
    /network unavailable/
  );
  assert.deepEqual(input.released, []);
});
