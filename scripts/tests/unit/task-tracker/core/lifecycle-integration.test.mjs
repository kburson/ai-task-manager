#!/usr/bin/env node
// @story #130
// Lifecycle integration — issue #130.
//
// Asserts that walking the canonical state graph
// (Backlog → Refine → Ready for Planning → Plan → Develop → Test → Review → Done)
// produces exactly the 13 expected timing rows in order, using the same
// paired (`<prev>:complete` + `<next>:enter`) emission rule that
// `scripts/gh/move-state.mjs` implements via the canonical
// PHASE_EVENTS table.
//
// #516 — uniform `<state>:<past-tense>` vocabulary. Review is now a true
// entry/exit pair, so walking Review → Done emits `review:approved`
// (the approval moment, formerly borrowed by done.enter) before `issue:wrap` —
// one more row than the pre-#516 11-row sequence.
//
// This is a structural test: rather than running the live CLI against
// the real network (TT_SKIP_NETWORK suppresses emission anyway), we
// drive the same `buildRow` + PHASE_EVENTS pieces the chokepoint uses
// and assert the assembled row list matches the 13-event sequence in
// order, including the `backlog:created` Backlog row emitted by the `new` verb.
import { strict as assert } from 'node:assert';
import { PHASE_EVENTS } from '../../../../task-tracker/phase-events.mjs';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';

const STAGES = ['backlog', 'refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review', 'done'];

// Expected emission order (#516) — must match the slugs asserted by
// phase-events.test.mjs.
const expectedSlugs = [
  'backlog:created',
  'refine:started',
  'refine:completed',
  'ready-for-plan:started',
  'plan:started',
  'plan:completed',
  'develop:started',
  'develop:completed',
  'test:started',
  'test:passed',
  'review:started',
  'review:approved',
  'issue:wrap',
];

// Walk the state graph and accumulate paired rows just like move-state.mjs does.
const rows = [];
const ts = new Date().toISOString();

// First: backlog entry (the `new` verb posts this as `backlog:created`).
rows.push(
  buildRow({
    ts,
    phase: { state: 'backlog', phase: 'enter' },
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 0,
  })
);

// Now walk each pair: emit `<prev>:complete` (if defined) then `<next>:enter`.
for (let i = 1; i < STAGES.length; i += 1) {
  const prev = STAGES[i - 1];
  const next = STAGES[i];
  if (PHASE_EVENTS[prev]?.complete) {
    rows.push(
      buildRow({
        ts,
        phase: { state: prev, phase: 'complete' },
        activeSec: 0,
        idleSec: 0,
        deltaWords: 0,
        wordMarker: 0,
      })
    );
  }
  if (PHASE_EVENTS[next]?.enter) {
    rows.push(
      buildRow({
        ts,
        phase: { state: next, phase: 'enter' },
        activeSec: 0,
        idleSec: 0,
        deltaWords: 0,
        wordMarker: 0,
      })
    );
  }
}

assert.equal(rows.length, 13, `expected 13 lifecycle rows, got ${rows.length}`);

// Each row must contain its expected slug, in order.
for (let i = 0; i < expectedSlugs.length; i += 1) {
  const slug = expectedSlugs[i];
  assert.ok(rows[i].includes(`| ${slug} |`), `row ${i} expected slug "${slug}", got: ${rows[i]}`);
}

// No leftover legacy slugs: assert that no row contains a `move:<state>`
// or a bare `closed` token in the event column. (These were the pre-#127
// emissions replaced by paired phase rows.)
for (const r of rows) {
  assert.ok(
    !/\| move:[a-z]+ \|/.test(r),
    `lifecycle rows must not include legacy move:<state> slugs: ${r}`
  );
  assert.ok(!/\| closed \|/.test(r), `lifecycle rows must not include bare "closed" event: ${r}`);
  assert.ok(
    !/\| direct move \|/.test(r),
    `lifecycle rows must not include legacy "direct move" event: ${r}`
  );
}

console.log('lifecycle-integration.test.mjs: ok');
