#!/usr/bin/env node
// @story #130
// Regression — pause/compact during a state — issue #130.
//
// The chokepoint-based phase rows added by #128 must NOT displace the
// pre-existing pause / resumed / pre-compact-flush / post-compact-resume
// rows. This test simulates the full row stream that would land in a
// timing log during a Develop phase that contains a pause, a resume, a
// pre-compact-flush, and a post-compact-resume, and asserts:
//
//   - All four lifecycle-adjacent rows are still emitted with their
//     canonical slugs.
//   - Their interleaved order with the surrounding `develop:start` /
//     `develop:done` phase rows is preserved.
//   - None of these slugs are reserved by PHASE_EVENTS — they remain
//     orthogonal to the canonical 11-event table.
import { strict as assert } from 'node:assert';
import { PHASE_EVENTS } from '../../phase-events.mjs';
import { buildRow } from '../../gh-timing-comment.mjs';

// Slug orthogonality: pause/resumed/compact slugs must NOT collide with
// any of the 11 canonical phase-event slugs.
const phaseSlugs = new Set();
for (const state of Object.keys(PHASE_EVENTS)) {
  for (const kind of Object.keys(PHASE_EVENTS[state])) {
    phaseSlugs.add(PHASE_EVENTS[state][kind].event);
  }
}
for (const slug of ['pause', 'resumed', 'pre-compact-flush', 'post-compact-resume']) {
  assert.ok(!phaseSlugs.has(slug), `${slug} must not collide with a canonical PHASE_EVENTS slug`);
}

// Build the row stream that a typical Develop phase with a pause + a
// compact looks like. We use real (now-ish) timestamps spaced a few
// seconds apart so buildRow doesn't refuse them as retroactive.
const t0 = Date.now() - 30_000;
// All offsets must stay within +/- 60s of Date.now() to satisfy
// buildRow's retroactive-ts guard.
const tsAt = (offsetSec) => new Date(t0 + offsetSec * 1000).toISOString();

const stream = [];

// develop:start — paired entry row from the chokepoint.
stream.push(
  buildRow({
    ts: tsAt(0),
    phase: { state: 'develop', phase: 'enter' },
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 0,
  })
);

// User pauses for a question.
stream.push(
  buildRow({
    ts: tsAt(10),
    event: 'pause',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 100,
    description: 'pause for question',
  })
);

// User answers; verb chain resumes.
stream.push(
  buildRow({
    ts: tsAt(15),
    event: 'resumed',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 100,
    description: 'question answered',
  })
);

// Pre-compact flush fires mid-develop.
stream.push(
  buildRow({
    ts: tsAt(30),
    event: 'pre-compact-flush',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 50,
    wordMarker: 150,
    description: 'context compacted',
  })
);

// Post-compact resume.
stream.push(
  buildRow({
    ts: tsAt(31),
    event: 'post-compact-resume',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 150,
    description: 'resumed after compact',
  })
);

// develop:done — paired completion row from the chokepoint.
stream.push(
  buildRow({
    ts: tsAt(50),
    phase: { state: 'develop', phase: 'complete' },
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 150,
  })
);

// Assert the slug sequence in order.
const expectedSequence = [
  'develop:start',
  'pause',
  'resumed',
  'pre-compact-flush',
  'post-compact-resume',
  'develop:done',
];
assert.equal(stream.length, expectedSequence.length);
for (let i = 0; i < expectedSequence.length; i += 1) {
  const slug = expectedSequence[i];
  assert.ok(
    stream[i].includes(`| ${slug} |`),
    `row ${i} expected slug "${slug}", got: ${stream[i]}`
  );
}

// Pause and resumed rows must carry their description text (the user-
// supplied reason and answered-question token).
assert.match(stream[1], /\| pause for question \|$/);
assert.match(stream[2], /\| question answered \|$/);

// Pre-compact / post-compact rows must carry their canonical description.
assert.match(stream[3], /\| context compacted \|$/);
assert.match(stream[4], /\| resumed after compact \|$/);

console.log('regression-pause-compact.test.mjs: ok');
