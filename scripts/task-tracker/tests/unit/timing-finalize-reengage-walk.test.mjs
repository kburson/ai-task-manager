// @story #822
// #822 vc:6 — the whole `finalize → re-engage → pause → resume` timing-log walk
// must be a legal state-machine trace: zero `doubled step` (a departure stacked on
// an already-open idle span) and zero `skipped step` (a trailing open idle span at
// the end of the log). This locks the post-fix sequence the emitter produces once
// the Fault Z guard interposes a `resumed` reengagement after an unclosed finalize
// `idle`. It is a pure V3-validator walk (no network), the same shape as the #821
// `active-work` slug test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validate } from '../../lib/agent-review/validators/timing-log-sequence.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';
const T = (n) => `2026-07-14 04:${String(n).padStart(2, '0')}:00 -05:00`;

function logCtx(rows, enteredStages = [{ stage: 'develop' }]) {
  const body = [
    '## ⏱ Timing Log',
    '',
    HEADER,
    SEP,
    ...rows.map(([ts, ev, desc = '']) => `| ${ts} | ${ev} |  |  |  | 0 | ${desc} |`),
    '',
  ].join('\n');
  return { comments: [{ body }], markers: { enteredStages } };
}

test('finalize → re-engage → pause → resume is a fully legal walk', () => {
  // Rows 0-2: normal open + work. Rows 3-4: an orphan-finalize reconstruction
  // (active-work credit + its trailing unclosed idle). Row 5: the interposed
  // reengagement (Fault Z guard). Rows 6-7: a live pause and its resume. Row 8:
  // phase close. No departure ever stacks on an open idle; the log ends closed.
  const res = validate(
    logCtx([
      [T(0), 'start', 'bind'],
      [T(1), 'develop:started', 'enter develop'],
      [T(2), 'active-work', 'live credit'],
      [T(3), 'active-work', 'finalize segment credit'],
      [T(4), 'idle', 'finalize trailing idle'],
      [T(5), 'resumed', 're-engage after finalize'],
      [T(6), 'pause:question', 'blocking question'],
      [T(7), 'resumed', 'question answered'],
      [T(8), 'develop:completed', 'exit develop'],
    ])
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('a chain of finalize idles each closed by a reengagement stays legal', () => {
  // Two independent finalize→reengage brackets back-to-back — each open idle is
  // closed before the next departure. Exercises the guard firing more than once.
  const res = validate(
    logCtx([
      [T(0), 'start'],
      [T(1), 'develop:started'],
      [T(2), 'idle', 'finalize idle A'],
      [T(3), 'resumed', 'reengage A'],
      [T(4), 'switch-out:#821', 'switch away'],
      [T(5), 'resumed', 'switch back'],
      [T(6), 'idle', 'finalize idle B'],
      [T(7), 'resumed', 'reengage B'],
      [T(8), 'develop:completed'],
    ])
  );
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('the guard omission (idle then pause, no reengage) is still caught as a doubled step', () => {
  // Negative control: without the interposed reengagement the walk must fail, so
  // the passing tests above are proving the fix, not a lax validator.
  const res = validate(
    logCtx([
      [T(0), 'start'],
      [T(1), 'develop:started'],
      [T(2), 'idle', 'finalize trailing idle'],
      [T(3), 'pause:question', 'departure stacks on open idle'],
      [T(4), 'resumed'],
      [T(5), 'develop:completed'],
    ])
  );
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /doubled step/.test(f)),
    `expected doubled step; got ${JSON.stringify(res.failures)}`
  );
});
