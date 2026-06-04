#!/usr/bin/env node
// #297 — unit tests for the Plan→Develop Deep-Dive Analysis gate.
import { strict as assert } from 'node:assert';
import {
  hasDeepDiveMarkers,
  hasDeepDiveSection,
  hasDeepDiveCheckboxTicked,
  planDeepDiveGate,
} from '../lib/deep-dive-gate.mjs';

const POSTED = '<!-- aitm-deep-dive-posted: 2026-06-04 -->';
const COMPLETE = '<!-- aitm-deep-dive-complete: 2026-06-04T23:00:00Z -->';
const SECTION_H2 = '## Deep-Dive Analysis (2026-06-04)';
const SECTION_H3 = '### Deep-Dive Analysis (2026-06-04)';
const PICKUP = '## Pickup Directive\n\n- [x] Deep dive complete\n';
const PICKUP_UNTICKED = '## Pickup Directive\n\n- [ ] Deep dive complete\n';

function fullBody({
  posted = POSTED,
  complete = COMPLETE,
  section = SECTION_H2,
  pickup = PICKUP,
  trail = '',
} = {}) {
  return [
    '## Scope',
    'do the thing',
    '',
    pickup,
    posted,
    section,
    'details here',
    complete,
    trail,
  ].join('\n');
}

// hasDeepDiveMarkers
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

// hasDeepDiveCheckboxTicked
{
  assert.equal(hasDeepDiveCheckboxTicked(PICKUP), true);
  assert.equal(hasDeepDiveCheckboxTicked(PICKUP_UNTICKED), false, 'unticked rejected');
  assert.equal(
    hasDeepDiveCheckboxTicked('- [x] Deep dive complete\n'),
    false,
    'must live under Pickup Directive heading'
  );
  // Ticked elsewhere (e.g. inside a Functional DoD section before Pickup) — rejected.
  const offBody = [
    '## Functional',
    '- [x] Deep dive complete',
    '',
    '## Pickup Directive',
    '- [ ] Deep dive complete',
  ].join('\n');
  assert.equal(hasDeepDiveCheckboxTicked(offBody), false, 'wrong-section tick rejected');
}

// planDeepDiveGate — combined fail (all three blockers surface)
{
  const r = planDeepDiveGate({ body: '## Scope\nnope\n' });
  assert.equal(r.ok, false);
  assert.equal(r.blockers.length, 3, JSON.stringify(r.blockers));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-marker-missing')));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-section-missing')));
  assert.ok(r.blockers.some((b) => b.startsWith('plan-develop-deep-dive-checkbox-unticked')));
}

// planDeepDiveGate — combined pass
{
  const r = planDeepDiveGate({ body: fullBody() });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.blockers, undefined);
}

// planDeepDiveGate — one-missing variants
{
  // Section present but markers absent
  const noMarkers = ['## Scope', PICKUP, SECTION_H2].join('\n');
  const r1 = planDeepDiveGate({ body: noMarkers });
  assert.equal(r1.ok, false);
  assert.equal(r1.blockers.length, 1);
  assert.ok(r1.blockers[0].startsWith('plan-develop-deep-dive-marker-missing'));

  // Markers + checkbox but no section heading
  const noSection = ['## Scope', PICKUP, POSTED, COMPLETE].join('\n');
  const r2 = planDeepDiveGate({ body: noSection });
  assert.equal(r2.ok, false);
  assert.equal(r2.blockers.length, 1);
  assert.ok(r2.blockers[0].startsWith('plan-develop-deep-dive-section-missing'));

  // Markers + section but checkbox unticked
  const unticked = ['## Scope', PICKUP_UNTICKED, POSTED, SECTION_H2, COMPLETE].join('\n');
  const r3 = planDeepDiveGate({ body: unticked });
  assert.equal(r3.ok, false);
  assert.equal(r3.blockers.length, 1);
  assert.ok(r3.blockers[0].startsWith('plan-develop-deep-dive-checkbox-unticked'));
}

console.log('deep-dive-gate.test.mjs: all passed');
