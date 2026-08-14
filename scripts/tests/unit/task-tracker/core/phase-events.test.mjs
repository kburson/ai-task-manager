#!/usr/bin/env node
// @story #127
// Tests for the canonical PHASE_EVENTS lifecycle table (epic #126, sub-issue
// #127; extended #475 AC4; uniform vocabulary #516). Asserts: table
// completeness (all 14 events), slug uniqueness,
// descriptor pass-through through `buildRow`, and back-compat (callers that
// don't supply a phase descriptor are byte-identical to the pre-change
// rendering).
import { strict as assert } from 'node:assert';
import { PHASE_EVENTS, resolvePhaseEvent } from '../../../../task-tracker/phase-events.mjs';
import { PHASE_EVENTS as PHASE_EVENTS_RE } from '../../../../task-tracker/runtime.mjs';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';

// ---- 1. Table completeness: all 14 lifecycle events present --------------
// #516 — uniform `<state>:<past-tense>` vocabulary. 8 enter events: backlog,
// refine, ready-for-plan, plan, develop, test, review, done. 6 complete events:
// refine, plan, develop, test, review (now a true pair), done.
const expected = [
  ['backlog', 'enter', 'backlog:created', 'task created in Backlog'],
  ['refine', 'enter', 'refine:started', 'start refinement'],
  ['refine', 'complete', 'refine:completed', 'refinement completed'],
  ['ready-for-plan', 'enter', 'ready-for-plan:started', 'refinement complete — ready for planning'],
  ['plan', 'enter', 'plan:started', 'plan started'],
  ['plan', 'complete', 'plan:completed', 'plan completed — waiting approval'],
  ['develop', 'enter', 'develop:started', 'start development'],
  ['develop', 'complete', 'develop:completed', 'development complete'],
  ['test', 'enter', 'test:started', 'start testing'],
  ['test', 'complete', 'test:passed', 'testing complete'],
  ['review', 'enter', 'review:started', 'waiting in review'],
  // #516 — review now carries its own completion (was borrowed by done.enter).
  ['review', 'complete', 'review:approved', 'story approved'],
  ['done', 'enter', 'issue:wrap', 'wrap-up — finalizing for close'],
  ['done', 'complete', 'issue:closed', 'issue closed — ready for next story'],
];
assert.equal(expected.length, 14, 'expected count guard');

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
assert.equal(actualCount, 14, 'PHASE_EVENTS must have exactly 14 entries');

// ---- 2. States without `complete` — backlog and ready-for-plan ------------
// #516 — review is now a true entry/exit pair, so it is no longer terminal.
// `done` carries BOTH enter (`issue:wrap`) and complete (`issue:closed`).
for (const state of ['backlog', 'ready-for-plan']) {
  assert.equal(
    PHASE_EVENTS[state].complete,
    undefined,
    `${state} is a terminal state — no complete kind`
  );
}
// `done.complete` MUST exist and resolve to the `issue:closed` terminal event.
assert.deepEqual(
  resolvePhaseEvent({ state: 'done', phase: 'complete' }),
  { event: 'issue:closed', description: 'issue closed — ready for next story' },
  'done.complete resolves to the `issue:closed` terminal event (#516)'
);
assert.deepEqual(
  resolvePhaseEvent({ state: 'done', phase: 'enter' }),
  { event: 'issue:wrap', description: 'wrap-up — finalizing for close' },
  'done.enter resolves to `issue:wrap` — wrap-up moment, distinct from closed'
);
// #516 — review.complete is now the approval moment (no longer on done.enter).
assert.deepEqual(
  resolvePhaseEvent({ state: 'review', phase: 'complete' }),
  { event: 'review:approved', description: 'story approved' },
  'review.complete resolves to `review:approved` — the approval moment (#516)'
);

// ---- 3. Slug uniqueness ---------------------------------------------------
const slugs = expected.map(([, , slug]) => slug);
const slugSet = new Set(slugs);
assert.equal(slugSet.size, slugs.length, 'all 14 event slugs must be unique');

// ---- 4. Re-export from runtime.mjs matches phase-events.mjs ---------------
assert.equal(PHASE_EVENTS_RE, PHASE_EVENTS, 'runtime.mjs re-export === phase-events.mjs source');

// ---- 5. Object is frozen (defensive — table is canonical, not mutable) ----
assert.equal(Object.isFrozen(PHASE_EVENTS), true, 'PHASE_EVENTS must be frozen');
assert.equal(Object.isFrozen(PHASE_EVENTS.develop), true, 'state entries must be frozen');
assert.equal(Object.isFrozen(PHASE_EVENTS.develop.enter), true, 'kind entries must be frozen');

// ---- 6. resolvePhaseEvent — happy path & misses ---------------------------
assert.deepEqual(resolvePhaseEvent({ state: 'develop', phase: 'enter' }), {
  event: 'develop:started',
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
  rowWithDescriptor.includes('| develop:started |'),
  `descriptor must derive event slug; got: ${rowWithDescriptor}`
);
assert.ok(
  rowWithDescriptor.includes('start development'),
  `descriptor must derive description; got: ${rowWithDescriptor}`
);

// ---- 7b. buildRow — done split renders distinct `issue:wrap`/`issue:closed`
// rows (#516). move-state stamps the done move with phase {state:'done',
// phase:'complete'} (the `issue:closed` row) and carries the wrap→closed cleanup
// elapsed; the wrap-up moment is the separate {state:'done', phase:'enter'}
// (`issue:wrap`) row emitted earlier by close.mjs. Asserting both render their
// own slug guards against the duplicate-row asymmetry #516 eliminates.
const rowWrap = buildRow({
  ts,
  phase: { state: 'done', phase: 'enter' },
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 7,
});
assert.ok(rowWrap.includes('| issue:wrap |'), `done.enter renders issue:wrap; got: ${rowWrap}`);
assert.ok(
  rowWrap.includes('wrap-up — finalizing for close'),
  `done.enter description; got: ${rowWrap}`
);

const rowClosed = buildRow({
  ts,
  phase: { state: 'done', phase: 'complete' },
  activeMin: 2,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 7,
});
assert.ok(
  rowClosed.includes('| issue:closed |'),
  `done.complete renders closed; got: ${rowClosed}`
);
assert.ok(
  rowClosed.includes('issue closed — ready for next story'),
  `done.complete description; got: ${rowClosed}`
);
assert.ok(
  !rowClosed.includes('| issue:wrap |'),
  `the closed row must NOT be a second wrap row; got: ${rowClosed}`
);

// ---- 8. buildRow — explicit event/description override descriptor ---------
const rowOverride = buildRow({
  ts,
  event: 'pause:other',
  description: 'task paused',
  phase: { state: 'develop', phase: 'enter' },
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 0,
});
assert.ok(
  rowOverride.includes('| pause:other |'),
  `explicit event must win over descriptor; got: ${rowOverride}`
);
assert.ok(
  rowOverride.includes('task paused'),
  `explicit description must win over descriptor; got: ${rowOverride}`
);

// ---- 9. buildRow — back-compat: legacy callers (no phase) unchanged -------
const rowLegacy = buildRow({
  ts,
  event: 'pause:other',
  description: 'task paused',
  activeMin: 1,
  idleMin: 0,
  deltaWords: 42,
  wordMarker: 100,
});
assert.ok(rowLegacy.includes('| pause:other |'), 'raw canonical event slug preserved');
assert.ok(rowLegacy.includes('task paused'), 'legacy description preserved');
assert.ok(rowLegacy.includes('| 42 |'), 'legacy deltaWords preserved');

// ---- 10. buildRow — unresolvable descriptor falls back to caller args -----
const rowUnresolvable = buildRow({
  ts,
  event: 'pause:other',
  description: 'task paused',
  phase: { state: 'bogus', phase: 'enter' },
  activeMin: 0,
  idleMin: 0,
  deltaWords: 0,
  wordMarker: 0,
});
assert.ok(
  rowUnresolvable.includes('| pause:other |'),
  'unresolvable descriptor must not clobber caller event'
);

console.log('phase-events.test.mjs: ok');
