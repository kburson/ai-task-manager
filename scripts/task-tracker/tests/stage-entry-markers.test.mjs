#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import {
  stampEntryMarker,
  parseEntryMarkers,
  verifyChainIntegrity,
  backfillEntryMarker,
  stripEntryMarkersAfter,
  STAGES,
} from '../lib/stage-entry-markers.mjs';

// 1. stampEntryMarker adds marker to empty body
let b = stampEntryMarker('', 'refine', '2026-01-01T00:00:00Z');
assert.match(b, /aitm-entered-refine: 2026-01-01T00:00:00Z/);

// stampEntryMarker inserts before field-DB when present
const withFields = 'Body text\n\n<!-- aitm-fields: {"foo":"bar"} -->\n';
b = stampEntryMarker(withFields, 'plan', '2026-01-02T00:00:00Z');
assert.ok(b.indexOf('aitm-entered-plan') < b.indexOf('aitm-fields'));

// 2. Idempotency: second call with same stage returns unchanged body
const once = stampEntryMarker('', 'refine', '2026-01-01T00:00:00Z');
const twice = stampEntryMarker(once, 'refine', '2026-02-02T00:00:00Z');
assert.equal(once, twice, 'second stamp of same stage is no-op');

// 3. parseEntryMarkers
assert.deepEqual(parseEntryMarkers(''), {});
let multi = '';
for (const s of STAGES)
  multi = stampEntryMarker(
    multi,
    s,
    `2026-01-${String(STAGES.indexOf(s) + 1).padStart(2, '0')}T00:00:00Z`
  );
const parsed = parseEntryMarkers(multi);
assert.equal(Object.keys(parsed).length, 7);
assert.equal(parsed.backlog, '2026-01-01T00:00:00Z');
assert.equal(parsed.done, '2026-01-07T00:00:00Z');

// 4. verifyChainIntegrity — no holes
let chain = '';
chain = stampEntryMarker(chain, 'backlog', '2026-01-01T00:00:00Z');
chain = stampEntryMarker(chain, 'refine', '2026-01-02T00:00:00Z');
chain = stampEntryMarker(chain, 'plan', '2026-01-03T00:00:00Z');
let r = verifyChainIntegrity(chain, 'plan');
assert.equal(r.ok, true);
assert.deepEqual(r.holes, []);
assert.deepEqual(r.presentStages, ['backlog', 'refine', 'plan']);

// 5. One hole: backlog + plan, current=plan
let hole = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
hole = stampEntryMarker(hole, 'plan', '2026-01-03T00:00:00Z');
r = verifyChainIntegrity(hole, 'plan');
assert.equal(r.ok, false);
assert.deepEqual(r.holes, ['refine']);

// 6. Multiple holes: backlog + develop, current=develop
let holes2 = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
holes2 = stampEntryMarker(holes2, 'develop', '2026-01-04T00:00:00Z');
r = verifyChainIntegrity(holes2, 'develop');
assert.deepEqual(r.holes, ['refine', 'plan']);

// 7. Out-of-order: refine ts > plan ts
let ooo = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
ooo = stampEntryMarker(ooo, 'refine', '2026-01-05T00:00:00Z');
ooo = stampEntryMarker(ooo, 'plan', '2026-01-03T00:00:00Z');
r = verifyChainIntegrity(ooo, 'plan');
assert.equal(r.outOfOrder, true);
assert.equal(r.ok, false);

// Empty body → ok with no presentStages
r = verifyChainIntegrity('', 'develop');
assert.equal(r.ok, true);
assert.deepEqual(r.presentStages, []);

// 8. backfillEntryMarker writes marker AND audit comment
const bf = backfillEntryMarker('', 'refine', '2026-01-02T00:00:00Z', 'recovered-from-drift');
assert.match(bf, /aitm-entered-refine: 2026-01-02T00:00:00Z/);
assert.match(bf, /aitm-backfill: refine:recovered-from-drift:2026-01-02T00:00:00Z/);

// 9. Backfill idempotency: second call is no-op for both marker AND audit
const bf2 = backfillEntryMarker(bf, 'refine', '2026-02-02T00:00:00Z', 'different-reason');
assert.equal(bf, bf2, 'second backfill of same stage is no-op');

// Unknown stage throws
assert.throws(() => stampEntryMarker('', 'mystery', '2026-01-01T00:00:00Z'));
assert.throws(() => verifyChainIntegrity('', 'mystery'));
assert.throws(() => backfillEntryMarker('', 'mystery', 'ts', 'r'));

// Missing ts throws
assert.throws(() => stampEntryMarker('', 'refine', ''));

// 10. stripEntryMarkersAfter: no-op when no future markers
{
  let body148 = stampEntryMarker('', 'backlog', '2026-01-01T00:00:00Z');
  body148 = stampEntryMarker(body148, 'refine', '2026-01-02T00:00:00Z');
  const { body: out, stripped } = stripEntryMarkersAfter(body148, 'refine');
  assert.deepEqual(stripped, []);
  assert.equal(out, body148);
}

// 11. stripEntryMarkersAfter: strip single future marker
{
  let body148 = stampEntryMarker('', 'review', '2026-01-06T00:00:00Z');
  body148 = stampEntryMarker(body148, 'done', '2026-01-07T00:00:00Z');
  const { body: out, stripped } = stripEntryMarkersAfter(body148, 'review');
  assert.deepEqual(stripped, ['done']);
  assert.doesNotMatch(out, /aitm-entered-done/);
  assert.match(out, /aitm-entered-review/);
}

// 12. stripEntryMarkersAfter: strip multiple consecutive future markers
{
  let body148 = stampEntryMarker('', 'refine', '2026-01-02T00:00:00Z');
  body148 = stampEntryMarker(body148, 'plan', '2026-01-03T00:00:00Z');
  body148 = stampEntryMarker(body148, 'develop', '2026-01-04T00:00:00Z');
  body148 = stampEntryMarker(body148, 'test', '2026-01-05T00:00:00Z');
  body148 = stampEntryMarker(body148, 'review', '2026-01-06T00:00:00Z');
  body148 = stampEntryMarker(body148, 'done', '2026-01-07T00:00:00Z');
  const { body: out, stripped } = stripEntryMarkersAfter(body148, 'plan');
  assert.deepEqual(stripped, ['develop', 'test', 'review', 'done']);
  assert.match(out, /aitm-entered-refine/);
  assert.match(out, /aitm-entered-plan/);
  assert.doesNotMatch(out, /aitm-entered-develop/);
  assert.doesNotMatch(out, /aitm-entered-test/);
  assert.doesNotMatch(out, /aitm-entered-review/);
  assert.doesNotMatch(out, /aitm-entered-done/);
}

// 13. stripEntryMarkersAfter: unknown stage throws
assert.throws(() => stripEntryMarkersAfter('', 'mystery'));

// 14. stripEntryMarkersAfter: collapses blank line runs
{
  const messy =
    'preamble\n\n<!-- aitm-entered-refine: 2026-01-02T00:00:00Z -->\n\n<!-- aitm-entered-done: 2026-01-07T00:00:00Z -->\n\ntrailing\n';
  const { body: out, stripped } = stripEntryMarkersAfter(messy, 'refine');
  assert.deepEqual(stripped, ['done']);
  assert.doesNotMatch(out, /\n{3,}/);
}

console.log('stage-entry-markers.test.mjs: all passed');
