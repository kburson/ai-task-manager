// @story #864
// #864 — the per-section 10-minute wall-time ceiling is fail-closed.
//
// The standing directive is absolute: never a test run over ten minutes. The
// ceiling guard is a pure seam (run-tests-ceiling.mjs) so it can be proven
// without a real ten-minute sleep — the test injects an already-measured elapsed
// time and asserts the verdict. These cases pin: an over-budget section breaches
// (fail-closed), an under-budget one passes, the `all` union lane is exempt, and
// the env override resizes the ceiling.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  evaluateCeiling,
  ceilingMsForLane,
  DEFAULT_SECTION_CEILING_MS,
  CEILING_ENV,
} from '../../../../run-tests-ceiling.mjs';

test('#864: the default section ceiling is ten minutes', () => {
  assert.equal(DEFAULT_SECTION_CEILING_MS, 10 * 60 * 1000);
  // No env → default applies to a bounded lane.
  assert.equal(ceilingMsForLane('unit', {}), DEFAULT_SECTION_CEILING_MS);
});

test('#864: an over-budget section breaches (fail-closed) with a message', () => {
  const verdict = evaluateCeiling({
    lane: 'unit',
    elapsedMs: DEFAULT_SECTION_CEILING_MS + 1,
    env: {},
  });
  assert.equal(verdict.breached, true, 'a section over the ceiling must breach');
  assert.equal(verdict.exempt, false);
  assert.match(verdict.message, /section ceiling \(fail-closed\)/);
});

test('#864: an under-budget section does not breach', () => {
  const verdict = evaluateCeiling({
    lane: 'integration',
    elapsedMs: DEFAULT_SECTION_CEILING_MS - 1,
    env: {},
  });
  assert.equal(verdict.breached, false);
  assert.equal(verdict.message, undefined);
});

test('#864: exactly at the ceiling is not a breach (strict greater-than)', () => {
  const verdict = evaluateCeiling({
    lane: 'slow',
    elapsedMs: DEFAULT_SECTION_CEILING_MS,
    env: {},
  });
  assert.equal(verdict.breached, false);
});

test('#864: the all-lane union is exempt even when huge', () => {
  const verdict = evaluateCeiling({
    lane: 'all',
    elapsedMs: 60 * 60 * 1000, // an hour
    env: {},
  });
  assert.equal(verdict.breached, false, 'the internal coverage/divergence union is exempt');
  assert.equal(verdict.exempt, true);
  assert.equal(ceilingMsForLane('all', {}), null);
});

test('#864: the env override resizes the ceiling', () => {
  const env = { [CEILING_ENV]: '1000' }; // 1s ceiling
  assert.equal(ceilingMsForLane('unit', env), 1000);
  const breach = evaluateCeiling({ lane: 'unit', elapsedMs: 1500, env });
  assert.equal(breach.breached, true);
  const ok = evaluateCeiling({ lane: 'unit', elapsedMs: 500, env });
  assert.equal(ok.breached, false);
});

test('#864: a non-numeric or non-positive override falls back to the default', () => {
  assert.equal(ceilingMsForLane('unit', { [CEILING_ENV]: 'nope' }), DEFAULT_SECTION_CEILING_MS);
  assert.equal(ceilingMsForLane('unit', { [CEILING_ENV]: '0' }), DEFAULT_SECTION_CEILING_MS);
  assert.equal(ceilingMsForLane('unit', { [CEILING_ENV]: '-5' }), DEFAULT_SECTION_CEILING_MS);
});
