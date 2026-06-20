#!/usr/bin/env node
// @story #127
// Tests for the canonical PHASE_EVENTS lifecycle table (epic #126, sub-issue
// #127; extended #475 AC4). Asserts: table completeness (all 12 events),
// slug uniqueness,
// descriptor pass-through through `buildRow`, and back-compat (callers that
// don't supply a phase descriptor are byte-identical to the pre-change
// rendering).
import { strict as assert } from 'node:assert';
import { PHASE_EVENTS, resolvePhaseEvent } from '../../phase-events.mjs';
import { PHASE_EVENTS as PHASE_EVENTS_RE } from '../../runtime.mjs';
import { buildRow } from '../../gh-timing-comment.mjs';

// ---- 1. Table completeness: all 12 lifecycle events present --------------
// 7 enter events: backlog, refine, plan, develop, test, review, done.
// 5 complete events: refine, plan, develop, test, done (#475 AC4).
const expected = [
  ['backlog', 'enter', 'created', 'task created in Backlog'],
  ['refine', 'enter', 'refine:start', 'start refinement'],
  ['refine', 'complete', 'refine:done', 'refinement completed'],
  ['plan', 'enter', 'plan:start', 'plan started'],
  ['plan', 'complete', 'plan:done', 'plan completed — waiting approval'],
  ['develop', 'enter', 'develop:start', 'start development'],
  ['develop', 'complete', 'develop:done', 'development complete'],
  ['test', 'enter', 'test:start', 'start testing'],
  ['test', 'complete', 'test:done', 'testing complete'],
  ['review', 'enter', 'review:waiting', 'waiting in review'],
  ['done', 'enter', 'approved', 'story approved'],
  // #475 AC4 — terminal "ready for next story" event, distinct from `approved`.
  ['done', 'complete', 'closed', 'story closed — ready for next story'],
];
assert.equal(expected.length, 12, 'expected count guard');

for (const [state, kind, slug, desc] of expected) {
  const entry = PHASE_EVENTS[state]?.[kind];
  assert.ok(entry, `PHASE_EVENTS.${state}.${kind} must exist`);
  assert.equal(entry.event, slug, `${state}.${kind} event slug`);
  assert.equal(entry.description, desc, `${state}.${kind} description`);
}

// Count actual entries — guards against accidental additions.
let actualCount = 0;
for (const state of Object.keys(PHASE_EVENTS)) {
  for (const kind of Object.keys(PHASE_EVENTS[state])) {
    actualCount += 1;
  }
}
assert.equal(actualCount, 12, 'PHASE_EVENTS must have exactly 12 entries');

// ---- 2. Terminal states (no `complete`) — backlog, review only -----------
// `done` is the exception (#475 AC4): it carries BOTH enter (`approved`) and
// complete (`closed`), so it is deliberately excluded from this guard.
for (const state of ['backlog', 'review']) {
  assert.equal(
    PHASE_EVENTS[state].complete,
    undefined,
    `${state} is a terminal state — no complete kind`
  );
}
// `done.complete` MUST exist and resolve to the `closed` terminal event.
assert.deepEqual(
  resolvePhaseEvent({ state: 'done', phase: 'complete' }),
  { event: 'closed', description: 'story closed — ready for next story' },
  'done.complete resolves to the `closed` terminal event (#475 AC4)'
);
assert.deepEqual(
  resolvePhaseEvent({ state: 'done', phase: 'enter' }),
  { event: 'approved', description: 'story approved' },
  'done.enter still resolves to `approved` — approval moment, distinct from closed'
);

// ---- 3. Slug uniqueness ---------------------------------------------------
const slugs = expected.map(([, , slug]) => slug);
const slugSet = new Set(slugs);
assert.equal(slugSet.size, slugs.length, 'all 12 event slugs must be unique');

// ---- 4. Re-export from runtime.mjs matches phase-events.mjs ---------------
assert.equal(PHASE_EVENTS_RE, PHASE_EVENTS, 'runtime.mjs re-export === phase-events.mjs source');

// ---- 5. Object is frozen (defensive — table is canonical, not mutable) ----
assert.equal(Object.isFrozen(PHASE_EVENTS), true, 'PHASE_EVENTS must be frozen');
assert.equal(Object.isFrozen(PHASE_EVENTS.develop), true, 'state entries must be frozen');
assert.equal(Object.isFrozen(PHASE_EVENTS.develop.enter), true, 'kind entries must be frozen');

// ---- 6. resolvePhaseEvent — happy path & misses ---------------------------
assert.deepEqual(resolvePhaseEvent({ state: 'develop', phase: 'enter' }), {
  event: 'develop:start',
  description: 'start development',
});
assert.equal(resolvePhaseEvent(null), null);
assert.equal(resolvePhaseEvent(undefined), null);
assert.equal(resolvePhaseEvent({}), null);
assert.equal(resolvePhaseEvent({ state: 'nope', phase: 'enter' }), null);
assert.equal(resolvePhaseEvent({ state: 'develop', phase: 'nope' }), null);
// Terminal-state miss: backlog has no complete kind.
assert.equal(resolvePhaseEvent({ state: 'backlog', phase: 'complete' }), null);

// ---- 7. buildRow — descriptor pass-through (event + description derived) --
const ts = new Date().toISOString();
const rowWithDescriptor = buildRow({
  ts,
  phase: { state: 'develop', phase: 'enter' },
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 0,
});
assert.ok(
  rowWithDescriptor.includes('| develop:start |'),
  `descriptor must derive event slug; got: ${rowWithDescriptor}`
);
assert.ok(
  rowWithDescriptor.includes('start development'),
  `descriptor must derive description; got: ${rowWithDescriptor}`
);

// ---- 7b. buildRow — AC4 done split renders distinct `approved`/`closed` rows.
// move-state stamps the done move with phase {state:'done', phase:'complete'}
// (the `closed` row) and carries the approved→closed cleanup elapsed; the
// approval moment is the separate {state:'done', phase:'enter'} (`approved`) row
// emitted earlier by close.mjs. Asserting both render their own slug guards
// against the duplicate "story approved" rows AC4 eliminates.
const rowApproved = buildRow({
  ts,
  phase: { state: 'done', phase: 'enter' },
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 7,
});
assert.ok(rowApproved.includes('| approved |'), `done.enter renders approved; got: ${rowApproved}`);
assert.ok(rowApproved.includes('story approved'), `done.enter description; got: ${rowApproved}`);

const rowClosed = buildRow({
  ts,
  phase: { state: 'done', phase: 'complete' },
  activeMin: 2,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 7,
});
assert.ok(rowClosed.includes('| closed |'), `done.complete renders closed; got: ${rowClosed}`);
assert.ok(
  rowClosed.includes('story closed — ready for next story'),
  `done.complete description; got: ${rowClosed}`
);
assert.ok(
  !rowClosed.includes('| approved |'),
  `the closed row must NOT be a second approved row; got: ${rowClosed}`
);

// ---- 8. buildRow — explicit event/description override descriptor ---------
const rowOverride = buildRow({
  ts,
  event: 'pause',
  description: 'task paused',
  phase: { state: 'develop', phase: 'enter' },
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 0,
});
assert.ok(
  rowOverride.includes('| pause |'),
  `explicit event must win over descriptor; got: ${rowOverride}`
);
assert.ok(
  rowOverride.includes('task paused'),
  `explicit description must win over descriptor; got: ${rowOverride}`
);

// ---- 9. buildRow — back-compat: legacy callers (no phase) unchanged -------
const rowLegacy = buildRow({
  ts,
  event: 'pause',
  description: 'task paused',
  activeMin: 1,
  idleMin: 0,
  deltaWords: 42,
  wordMarker: 100,
});
assert.ok(rowLegacy.includes('| pause |'), 'legacy event slug preserved');
assert.ok(rowLegacy.includes('task paused'), 'legacy description preserved');
assert.ok(rowLegacy.includes('| 42 |'), 'legacy deltaWords preserved');

// ---- 10. buildRow — unresolvable descriptor falls back to caller args -----
const rowUnresolvable = buildRow({
  ts,
  event: 'pause',
  description: 'task paused',
  phase: { state: 'bogus', phase: 'enter' },
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 0,
});
assert.ok(
  rowUnresolvable.includes('| pause |'),
  'unresolvable descriptor must not clobber caller event'
);

console.log('phase-events.test.mjs: ok');
