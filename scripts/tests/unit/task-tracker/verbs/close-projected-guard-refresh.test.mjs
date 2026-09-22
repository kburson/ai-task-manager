// @story #1669
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verifyFreshCloseProjection } from '../../../../task-tracker/verbs/close.mjs';

const HEAD = 'a'.repeat(40);
const BODY = '## Acceptance Criteria\n- [x] Close readiness\n';

test('fresh terminal guard evaluation sees current body and head', async () => {
  const seen = [];
  const result = await verifyFreshCloseProjection({
    body: BODY,
    head: HEAD,
    evaluatedAt: '2026-09-22T02:00:00.000Z',
    evaluate: async ({ projection }) => {
      seen.push(projection.body);
      return { status: 'ready', ok: true, refusals: [] };
    },
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(seen, [BODY]);
});

test('fresh terminal guard refusal and missing evaluator cannot grant a close', async () => {
  await assert.rejects(
    verifyFreshCloseProjection({
      body: BODY,
      head: HEAD,
      evaluatedAt: '2026-09-22T02:00:00.000Z',
      evaluate: async () => ({ status: 'blocked', ok: false, refusals: [{ id: 'review-exit' }] }),
    }),
    /close-authority-drift/
  );
  await assert.rejects(
    verifyFreshCloseProjection({ body: BODY, head: HEAD, evaluatedAt: '2026-09-22T02:00:00.000Z' }),
    /close-authority-drift/
  );
});
