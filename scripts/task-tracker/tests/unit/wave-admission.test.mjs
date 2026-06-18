#!/usr/bin/env node
// @story #49
// Unit tests for scripts/gh/lib/wave-admission.mjs
//
// Covers:
//   - solo bypass (no parentEpicNumber)
//   - lower-Sequence sibling in Development → blocker
//   - lower-Sequence sibling in Backlog → ok (Backlog excluded)
//   - lower-Sequence sibling in Review or Done → ok (terminal excluded)
//   - same-Sequence sibling in Development → ok (newcomer rule)
//   - higher-Sequence sibling in Development → ok (next wave)

import { strict as assert } from 'node:assert';
import { admit } from '../../../gh/lib/wave-admission.mjs';

function stub(siblings) {
  return async () => siblings;
}

// 1. Solo bypass — no parentEpicNumber
{
  const r = await admit({ parentEpicNumber: null, sequence: 3 });
  assert.equal(r.ok, true, 'solo issue with no parent should pass');
  assert.deepEqual(r.blockers, []);
}

// 2. Lower-Sequence sibling in development → blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, sequence: 1, state: 'develop' }]),
  });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 1);
  assert.equal(r.blockers[0].issue, 47);
}

// 3. Lower-Sequence sibling in backlog → not a blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, sequence: 1, state: 'backlog' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 4. Lower-Sequence sibling in Review → not a blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, sequence: 1, state: 'r4r' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 5. Lower-Sequence sibling in Done → not a blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, sequence: 1, state: 'done' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 6. Same-Sequence sibling in development → not a blocker (newcomer rule)
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 50, sequence: 3, state: 'develop' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 7. Higher-Sequence sibling in development → not a blocker
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 51, sequence: 4, state: 'develop' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 8. Mixed siblings — only lower in-flight ones block
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([
      { number: 47, sequence: 1, state: 'done' }, // ignored
      { number: 48, sequence: 2, state: 'review' }, // BLOCKS (in-flight, lower)
      { number: 50, sequence: 3, state: 'develop' }, // same wave, ignored
      { number: 51, sequence: 4, state: 'refine' }, // higher, ignored
      { number: 52, sequence: 1, state: 'backlog' }, // backlog, ignored
    ]),
  });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 1, JSON.stringify(r.blockers));
  assert.equal(r.blockers[0].issue, 48);
  assert.equal(r.blockers[0].state, 'review');
}

// 9. Sequence values that aren't numbers are skipped (no crash)
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 99, sequence: null, state: 'develop' }]),
  });
  assert.equal(r.ok, true, JSON.stringify(r));
}

// 10. plan state is treated as in-flight
{
  const r = await admit({
    parentEpicNumber: 41,
    sequence: 3,
    repo: 'o/r',
    projectId: 'P',
    fetchSiblings: stub([{ number: 47, sequence: 1, state: 'plan' }]),
  });
  assert.equal(r.ok, false);
  assert.equal(r.blockers[0].state, 'plan');
}

console.log('wave-admission.test.mjs: all passed');
