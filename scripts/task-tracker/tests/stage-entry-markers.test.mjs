#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import {
  stampEntryMarker,
  parseEntryMarkers,
  verifyChainIntegrity,
  backfillEntryMarker,
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

console.log('stage-entry-markers.test.mjs: all passed');
