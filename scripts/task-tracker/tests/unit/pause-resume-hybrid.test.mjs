// @story #534
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalPauseReason,
  isOtherReason,
  CANONICAL_PAUSE_SLUGS,
} from '../../lib/canonical-pause-reason.mjs';
import { resolveBindEvent, lastOpenInterruption } from '../../lib/bind-event.mjs';

const HEADER = [
  '| Timestamp | Event | Active | Idle | ΔWords | Word Marker | Description |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
const body = (...rows) => [...HEADER, ...rows].join('\n');
const row = (event, ts = '2026-06-25 10:00:00 +00:00', desc = event) =>
  `| ${ts} | ${event} | | | 0 | 1,234 | ${desc} |`;

test('canonical slugs map directly', () => {
  for (const slug of CANONICAL_PAUSE_SLUGS) {
    assert.equal(canonicalPauseReason(slug), slug);
  }
});

test('synonyms collapse onto canonical slugs', () => {
  assert.equal(canonicalPauseReason('quick question for the user'), 'question');
  assert.equal(canonicalPauseReason("let's discuss the approach"), 'discuss');
  assert.equal(canonicalPauseReason('brainstorm options'), 'discuss');
  assert.equal(canonicalPauseReason('blocked on the API'), 'blocked');
  assert.equal(canonicalPauseReason('lunch break'), 'break');
  assert.equal(canonicalPauseReason('afk'), 'break');
});

test('unmatched free text falls back to other', () => {
  assert.equal(canonicalPauseReason('refactoring the parser'), 'other');
  assert.equal(canonicalPauseReason(''), 'other');
  assert.equal(canonicalPauseReason(undefined), 'other');
  assert.ok(isOtherReason(canonicalPauseReason('something idiosyncratic')));
});

test('an open pause:<slug> resolves to a symmetric resume:<slug>', () => {
  const b = body(row('start', '2026-06-25 09:00:00 +00:00'), row('pause:question'));
  assert.deepEqual(lastOpenInterruption(b), { kind: 'pause', reason: 'question' });
  assert.equal(resolveBindEvent({ hasTimingHistory: true, timingBody: b }), 'resume:question');
});

test('pause:other resolves to a (paired) generic resumed', () => {
  const b = body(row('start', '2026-06-25 09:00:00 +00:00'), row('pause:other'));
  assert.deepEqual(lastOpenInterruption(b), { kind: 'pause', reason: 'other' });
  // reason is present → resume:other keeps the pair explicit.
  assert.equal(resolveBindEvent({ hasTimingHistory: true, timingBody: b }), 'resume:other');
});

test('a resume:<slug> closes the open pause (no longer open)', () => {
  const b = body(
    row('start', '2026-06-25 09:00:00 +00:00'),
    row('pause:break'),
    row('resume:break', '2026-06-25 10:30:00 +00:00')
  );
  assert.equal(lastOpenInterruption(b), null);
});

test('legacy bare paused/resumed still parse as pause/close', () => {
  const open = body(row('start', '2026-06-25 09:00:00 +00:00'), row('paused'));
  assert.deepEqual(lastOpenInterruption(open), { kind: 'pause', reason: null });
  const closed = body(
    row('start', '2026-06-25 09:00:00 +00:00'),
    row('paused'),
    row('resumed', '2026-06-25 10:30:00 +00:00')
  );
  assert.equal(lastOpenInterruption(closed), null);
});
