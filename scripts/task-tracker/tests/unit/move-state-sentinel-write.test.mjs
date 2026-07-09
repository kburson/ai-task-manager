// @story #756
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWriteSentinel } from '../../lib/move-state/move-state-core.mjs';

// The `_mutateBody` seam mirrors mutateIssueBody's real contract: it applies the
// caller's `mutate(base) → next` closure to the live body and returns the
// verified post-write body as `{ body }` (issue-body-mutate.mjs §34-39).
function ctxWith(bodyRef) {
  return {
    issueArg: '999',
    stateArg: 'test',
    cfg: { repo: 'o/r' },
    _mutateBody: async ({ mutate }) => {
      bodyRef.body = mutate(bodyRef.body);
      return { body: bodyRef.body };
    },
  };
}

test('sentinel is written and re-read-verified as target', async () => {
  const bodyRef = { body: 'existing body' };
  const res = await defaultWriteSentinel(ctxWith(bodyRef));
  assert.equal(res.verified, true);
  assert.match(bodyRef.body, /aitm-move-complete state=test/);
});

test('sentinel verify fails closed when the verified body does not show target', async () => {
  const bodyRef = { body: 'existing body' };
  const ctx = ctxWith(bodyRef);
  // Dropped write: the verified body comes back WITHOUT the sentinel.
  ctx._mutateBody = async () => ({ body: bodyRef.body });
  const res = await defaultWriteSentinel(ctx);
  assert.equal(res.verified, false);
  assert.equal(res.exit, 7);
});
