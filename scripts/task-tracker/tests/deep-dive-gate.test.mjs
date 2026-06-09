#!/usr/bin/env node
// #297 — unit tests for the Plan→Develop Deep-Dive Analysis gate.
// #300 — migrated from the deprecated `- [x] Deep dive complete` checkbox
//        signal to the hidden `aitm-deep-dive-complete` marker.
import { strict as assert } from 'node:assert';
import {
  hasDeepDiveMarkers,
  hasDeepDivePostedMarker,
  hasDeepDiveCompletedMarker,
  hasDeepDiveSection,
  planDeepDiveGate,
} from '../lib/deep-dive-gate.mjs';

const POSTED = '<!-- aitm-deep-dive-posted: 2026-06-04 -->';
const COMPLETE = '<!-- aitm-deep-dive-complete: 2026-06-04T23:00:00Z -->';
const SECTION_H2 = '## Deep-Dive Analysis (2026-06-04)';
const SECTION_H3 = '### Deep-Dive Analysis (2026-06-04)';

// #358 — `planDeepDiveGate` now enforces the size-bucketed substantive-chars
// floor (XS=1200 default fallback=2000). Build a body sized XS with enough
// section content to clear 1200 chars.
const XS_FIELDS = `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: 'XS' } })} -->`;
const PADDED_DETAILS = Array.from(
  { length: 20 },
  (_, i) =>
    `line ${i + 1}: substantive analysis paragraph describing the change, the surrounding subsystem, the risk surface, and the verification approach.`
).join('\n');

function fullBody({ posted = POSTED, complete = COMPLETE, section = SECTION_H2, trail = '' } = {}) {
  return [
    '## Scope',
    'do the thing',
    '',
    posted,
    section,
    PADDED_DETAILS,
    complete,
    XS_FIELDS,
    trail,
  ].join('\n');
}

// hasDeepDivePostedMarker
{
  assert.equal(hasDeepDivePostedMarker(POSTED), true);
  assert.equal(hasDeepDivePostedMarker(COMPLETE), false);
  assert.equal(hasDeepDivePostedMarker(''), false);
}

// hasDeepDiveCompletedMarker
{
  assert.equal(hasDeepDiveCompletedMarker(COMPLETE), true);
  assert.equal(hasDeepDiveCompletedMarker(POSTED), false);
  assert.equal(
    hasDeepDiveCompletedMarker('- [x] Deep dive complete\n'),
    false,
    'legacy checkbox is NOT a substitute for the marker'
  );
  assert.equal(hasDeepDiveCompletedMarker(''), false);
}

// hasDeepDiveMarkers (back-compat alias)
{
  assert.equal(hasDeepDiveMarkers(`${POSTED}\n${COMPLETE}`), true);
  assert.equal(hasDeepDiveMarkers(POSTED), false, 'posted alone is not enough');
  assert.equal(hasDeepDiveMarkers(COMPLETE), false, 'complete alone is not enough');
  assert.equal(hasDeepDiveMarkers(''), false);
}

// hasDeepDiveSection
{
  assert.equal(hasDeepDiveSection(SECTION_H2), true, 'H2 accepted');
  assert.equal(hasDeepDiveSection(SECTION_H3), true, 'H3 accepted');
  assert.equal(hasDeepDiveSection('Deep-Dive Analysis (no heading)'), false, 'bare text rejected');
  assert.equal(hasDeepDiveSection(''), false);
}

// planDeepDiveGate — combined fail (all three blockers surface)
{
  const r = planDeepDiveGate({ body: '## Scope\nnope\n' });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 3, JSON.stringify(r.blockers));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-posted-marker-missing')));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-section-missing')));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-complete-marker-missing')));
}

// planDeepDiveGate — combined pass
{
  const r = planDeepDiveGate({ body: fullBody() });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.blockers, undefined);
}

// planDeepDiveGate — one-missing variants
{
  // Both markers present but no section heading
  const noSection = ['## Scope', POSTED, COMPLETE].join('\n');
  const r1 = planDeepDiveGate({ body: noSection });
  assert.equal(r1.ok, false);
  assert.equal(r1.blockers.length, 1);
  assert.ok(r1.blockers[0].startsWith('plan-develop-deep-dive-section-missing'));

  // Posted + section but no complete marker
  const noComplete = ['## Scope', POSTED, SECTION_H2].join('\n');
  const r2 = planDeepDiveGate({ body: noComplete });
  assert.equal(r2.ok, false);
  assert.equal(r2.blockers.length, 1);
  assert.ok(r2.blockers[0].startsWith('plan-develop-deep-dive-complete-marker-missing'));

  // Complete + section but no posted marker
  const noPosted = ['## Scope', SECTION_H2, COMPLETE].join('\n');
  const r3 = planDeepDiveGate({ body: noPosted });
  assert.equal(r3.ok, false);
  assert.equal(r3.blockers.length, 1);
  assert.ok(r3.blockers[0].startsWith('plan-develop-deep-dive-posted-marker-missing'));
  // #294 / #325 — refusal message must point implementers at the canonical writer.
  assert.ok(
    r3.blockers[0].includes('ensureDeepDive (scripts/task-tracker/lib/deep-dive.mjs)'),
    `refusal message must name ensureDeepDive: ${r3.blockers[0]}`
  );

  // Legacy ticked checkbox is NOT a substitute for the complete marker.
  const checkboxOnly = ['## Scope', POSTED, SECTION_H2, '- [x] Deep dive complete'].join('\n');
  const r4 = planDeepDiveGate({ body: checkboxOnly });
  assert.equal(r4.ok, false);
  assert.equal(r4.blockers.length, 1);
  assert.ok(r4.blockers[0].startsWith('plan-develop-deep-dive-complete-marker-missing'));
}

console.log('deep-dive-gate.test.mjs: all passed');
