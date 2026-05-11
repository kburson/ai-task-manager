#!/usr/bin/env node
// Unit tests for scripts/gh/lib/wave-detect.mjs

import { strict as assert } from 'node:assert';
import { classify, buildBatchQuery, rejectionMessage } from '../../gh/lib/wave-detect.mjs';

function stub(parentsByChild) {
  return async ({ batch }) => batch.map(n => ({ child: Number(n), parent: parentsByChild[n] ?? null }));
}

// 1. Empty candidates
{
  const r = await classify({ candidates: [], repo: 'o/r' });
  assert.equal(r.kind, 'empty');
}

// 2. Single child → kind=single
{
  const r = await classify({ candidates: [10], repo: 'o/r', runQuery: stub({}) });
  assert.equal(r.kind, 'single');
}

// 3. All solo (>=2) → kind=all-solo
{
  const r = await classify({ candidates: [10, 11, 12], repo: 'o/r', runQuery: stub({}) });
  assert.equal(r.kind, 'all-solo');
  assert.deepEqual(r.solos.sort(), [10, 11, 12]);
  assert.equal(r.parented.length, 0);
}

// 4. All parented sharing one parent → kind=all-parented-shared
{
  const r = await classify({ candidates: [10, 11], repo: 'o/r', runQuery: stub({ 10: 99, 11: 99 }) });
  assert.equal(r.kind, 'all-parented-shared');
  assert.deepEqual([...r.parents], [99]);
}

// 5. Mixed → kind=mixed, rejection message names solos and parented
{
  const r = await classify({ candidates: [10, 11], repo: 'o/r', runQuery: stub({ 11: 99 }) });
  assert.equal(r.kind, 'mixed');
  const msg = rejectionMessage(r);
  assert.match(msg, /mixed-fanout/);
  assert.match(msg, /10/);
  assert.match(msg, /11→#99/);
}

// 6. Multi-parent → kind=multi-parent
{
  const r = await classify({ candidates: [10, 11], repo: 'o/r', runQuery: stub({ 10: 99, 11: 100 }) });
  assert.equal(r.kind, 'multi-parent');
  assert.equal(r.multiParent, true);
  const msg = rejectionMessage(r);
  assert.match(msg, /multi-parent/);
}

// 7. buildBatchQuery aliasing — N=1, N=20, N=21 (chunking handled by classify, but query renders at the chunk granularity)
{
  const q1 = buildBatchQuery([1]);
  assert.match(q1, /i0: issue\(number:\$n0\)/);
  assert.match(q1, /\$n0:Int!/);

  const q20 = buildBatchQuery(Array.from({ length: 20 }, (_, i) => i + 1));
  assert.match(q20, /i19: issue\(number:\$n19\)/);
}

// 8. Chunking — classify batches > 20
{
  const ids = Array.from({ length: 25 }, (_, i) => i + 1);
  let calls = 0;
  const r = await classify({
    candidates: ids,
    repo: 'o/r',
    runQuery: async ({ batch }) => { calls += 1; return batch.map(n => ({ child: Number(n), parent: null })); },
  });
  assert.equal(calls, 2, 'should chunk into 2 calls for 25 candidates');
  assert.equal(r.kind, 'all-solo');
  assert.equal(r.solos.length, 25);
}

console.log('wave-detect: ok');
