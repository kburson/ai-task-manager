#!/usr/bin/env node
// @story #296
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
} from '../../lib/deep-dive-gate.mjs';

const POSTED = '<!-- aitm-deep-dive-posted: 2026-06-04 -->';
const COMPLETE = '<!-- aitm-deep-dive-complete: 2026-06-04T23:00:00Z -->';
const SECTION_H2 = '## Deep-Dive Analysis (2026-06-04)';
const SECTION_H3 = '### Deep-Dive Analysis (2026-06-04)';
const PICKUP_DIRECTIVE = '## Pickup Directive — MANDATORY, DO NOT SKIP';

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
    PICKUP_DIRECTIVE,
    '> Follow: `.ai-task-manager/pickup-directive.md`',
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

// planDeepDiveGate — combined fail (all four blockers surface when body has nothing)
{
  const r = planDeepDiveGate({ body: '## Scope\nnope\n' });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 4, JSON.stringify(r.blockers));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-posted-marker-missing')));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-section-missing')));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-complete-marker-missing')));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-pickup-directive-missing')));
}

// planDeepDiveGate — combined pass
{
  const r = planDeepDiveGate({ body: fullBody() });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.blockers, undefined);
}

// planDeepDiveGate — one-missing variants (all include PICKUP_DIRECTIVE so only one blocker fires)
{
  // Both markers present but no section heading
  const noSection = ['## Scope', PICKUP_DIRECTIVE, POSTED, COMPLETE].join('\n');
  const r1 = planDeepDiveGate({ body: noSection });
  assert.equal(r1.ok, false);
  assert.equal(r1.blockers.length, 1);
  assert.ok(r1.blockers[0].startsWith('plan-develop-deep-dive-section-missing'));

  // Posted + section but no complete marker
  const noComplete = ['## Scope', PICKUP_DIRECTIVE, POSTED, SECTION_H2].join('\n');
  const r2 = planDeepDiveGate({ body: noComplete });
  assert.equal(r2.ok, false);
  assert.equal(r2.blockers.length, 1);
  assert.ok(r2.blockers[0].startsWith('plan-develop-deep-dive-complete-marker-missing'));

  // Complete + section but no posted marker
  const noPosted = ['## Scope', PICKUP_DIRECTIVE, SECTION_H2, COMPLETE].join('\n');
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
  const checkboxOnly = [
    '## Scope',
    PICKUP_DIRECTIVE,
    POSTED,
    SECTION_H2,
    '- [x] Deep dive complete',
  ].join('\n');
  const r4 = planDeepDiveGate({ body: checkboxOnly });
  assert.equal(r4.ok, false);
  assert.equal(r4.blockers.length, 1);
  assert.ok(r4.blockers[0].startsWith('plan-develop-deep-dive-complete-marker-missing'));
}

// planDeepDiveGate — #469 Pickup Directive presence check
{
  // (a) No Pickup Directive heading anywhere → gate fails
  const bodyA = fullBody().replace(
    PICKUP_DIRECTIVE + '\n> Follow: `.ai-task-manager/pickup-directive.md`\n',
    ''
  );
  const rA = planDeepDiveGate({ body: bodyA });
  assert.equal(rA.ok, false, '(a) absent heading should fail');
  assert.ok(
    rA.blockers.some((b) => b.startsWith('plan-develop-pickup-directive-missing')),
    `(a) expected pickup-directive-missing blocker: ${JSON.stringify(rA.blockers)}`
  );

  // (b) Pickup Directive heading only inside <details>…</details> → gate fails
  const bodyB = [
    '## Scope',
    'do the thing',
    '',
    POSTED,
    SECTION_H2,
    PADDED_DETAILS,
    COMPLETE,
    '<details>',
    '<summary>See more</summary>',
    PICKUP_DIRECTIVE,
    '> Follow: `.ai-task-manager/pickup-directive.md`',
    '</details>',
    XS_FIELDS,
  ].join('\n');
  const rB = planDeepDiveGate({ body: bodyB });
  assert.equal(rB.ok, false, '(b) heading inside <details> should fail');
  assert.ok(
    rB.blockers.some((b) => b.startsWith('plan-develop-pickup-directive-missing')),
    `(b) expected pickup-directive-missing blocker: ${JSON.stringify(rB.blockers)}`
  );

  // (c) Pickup Directive heading before <details> block → gate passes
  const bodyC = [
    '## Scope',
    'do the thing',
    '',
    PICKUP_DIRECTIVE,
    '> Follow: `.ai-task-manager/pickup-directive.md`',
    '',
    POSTED,
    SECTION_H2,
    PADDED_DETAILS,
    COMPLETE,
    '<details>',
    '<summary>See more</summary>',
    'Some collapsed content.',
    '</details>',
    XS_FIELDS,
  ].join('\n');
  const rC = planDeepDiveGate({ body: bodyC });
  assert.equal(rC.ok, true, `(c) heading before <details> should pass: ${JSON.stringify(rC)}`);

  // (d) Pickup Directive heading present, no <details> in body → gate passes
  const rD = planDeepDiveGate({ body: fullBody() });
  assert.equal(rD.ok, true, `(d) heading present, no <details>: ${JSON.stringify(rD)}`);
}

console.log('deep-dive-gate.test.mjs: all passed');
