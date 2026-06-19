// @story #358
// #358 — `planDeepDiveGate` must enforce the size-tiered substantive-chars
// floor (XS=1200, S=1800, M/L/XL=2400, default 2000). This check used to live
// inline in `scripts/gh/move-state.mjs` and was lost when that block was
// deleted in #358; it's now folded into `planDeepDiveGate` so
// `planExitDeepDiveGuard` covers it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { planDeepDiveGate } from '../../lib/deep-dive-gate.mjs';
import { DEEP_DIVE_SIZE_FLOORS } from '../../lib/body-gates.mjs';

function buildBody({ size = 'XS', sectionChars = 2000 } = {}) {
  // Pad the Deep-Dive Analysis section to a known substantive-char count.
  // Each line carries ~80 chars of substantive prose; HTML comments are
  // stripped from the measurement by `validateBody`.
  const linesNeeded = Math.max(1, Math.ceil(sectionChars / 80));
  const ddLines = [];
  for (let i = 0; i < linesNeeded; i++) {
    ddLines.push(
      `line ${i + 1}: substantive analysis paragraph providing enough content to clear the floor.`
    );
  }

  return [
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '- [x] Deep dive complete',
    '',
    '<!-- aitm-deep-dive-posted: 2026-06-08T10:00:00Z -->',
    '<!-- aitm-deep-dive-complete: 2026-06-08T10:00:00Z -->',
    '',
    '## Deep-Dive Analysis (2026-06-08)',
    '',
    ...ddLines,
    '',
    `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size } })} -->`,
  ].join('\n');
}

test('planDeepDiveGate: XS thin section under 1200 char floor → blocked', () => {
  const body = buildBody({ size: 'XS', sectionChars: 400 });
  const result = planDeepDiveGate({ body });
  assert.equal(result.ok, false);
  assert.ok(
    (result.blockers || []).some((b) => /deep-dive-complete:.*substantive content/.test(b)),
    `expected substantive-content blocker; got: ${JSON.stringify(result.blockers)}`
  );
});

test('planDeepDiveGate: XS section clearing 1200 char floor → pass', () => {
  const body = buildBody({ size: 'XS', sectionChars: 1400 });
  const result = planDeepDiveGate({ body });
  assert.equal(result.ok, true, `unexpected blockers: ${JSON.stringify(result.blockers)}`);
});

test('planDeepDiveGate: M-sized body at 1500 chars under M=2400 floor → blocked', () => {
  const body = buildBody({ size: 'M', sectionChars: 1500 });
  const result = planDeepDiveGate({ body });
  assert.equal(result.ok, false);
  assert.ok((result.blockers || []).some((b) => /deep-dive-complete:/.test(b)));
});

test('planDeepDiveGate: M-sized body clearing 2400 char floor → pass', () => {
  const body = buildBody({ size: 'M', sectionChars: 2600 });
  const result = planDeepDiveGate({ body });
  assert.equal(result.ok, true, `unexpected blockers: ${JSON.stringify(result.blockers)}`);
});

test('planDeepDiveGate: floors exported and unchanged from #325', () => {
  assert.deepEqual(DEEP_DIVE_SIZE_FLOORS, { XS: 1200, S: 1800, M: 2400, L: 2400, XL: 2400 });
});

test('planDeepDiveGate: missing complete marker — no double blocker from chars check', () => {
  const body = [
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '<!-- aitm-deep-dive-posted: 2026-06-08T10:00:00Z -->',
    '## Deep-Dive Analysis',
    'short',
    `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: 'XS' } })} -->`,
  ].join('\n');
  const result = planDeepDiveGate({ body });
  assert.equal(result.ok, false);
  // The complete-marker-missing blocker is present; the chars blocker is not
  // (its trigger is the marker itself).
  const blockers = result.blockers || [];
  assert.ok(blockers.some((b) => /complete-marker-missing/.test(b)));
  assert.ok(!blockers.some((b) => /substantive content/.test(b)));
});
