#!/usr/bin/env node
// @story #480
// Unit tests for the `## AITM Progress Markers` relocation behavior in
// scripts/task-tracker/lib/markers.mjs (#480 AC5). Split out of
// markers.test.mjs to keep each test file under the 400-line cap.

import { strict as assert } from 'node:assert';
import {
  REVIEW_APPROVED_RE,
  insertReviewApprovedMarker,
  DEEP_DIVE_COMPLETE_RE,
  insertDeepDiveCompleteMarker,
  PROGRESS_MARKERS_HEADING,
} from '../../../lib/markers.mjs';

const TS = '2026-05-11T12:00:00Z';

// ── #480 AC5: relocated markers cluster under `## AITM Progress Markers` ──────
{
  // Heading const is exported for reuse by stage-entry-markers.mjs.
  assert.equal(PROGRESS_MARKERS_HEADING, '## AITM Progress Markers');

  // First insert into a plain body seeds the heading, then places the marker
  // under it.
  const plain = '## Acceptance Criteria\n\n- [ ] x\n';
  const out1 = insertReviewApprovedMarker(plain, TS);
  const headingCount = (out1.match(/^## AITM Progress Markers$/gm) || []).length;
  assert.equal(headingCount, 1, 'heading seeded exactly once');
  assert.ok(
    out1.indexOf(PROGRESS_MARKERS_HEADING) < out1.indexOf('aitm-review-approved'),
    'marker placed under the heading'
  );
  assert.ok(
    out1.indexOf('## Acceptance Criteria') < out1.indexOf(PROGRESS_MARKERS_HEADING),
    'progress-markers cluster lands after the body content'
  );

  // A second relocated marker reuses the existing heading rather than adding a
  // duplicate one.
  const out2 = insertDeepDiveCompleteMarker(out1, TS);
  assert.equal(
    (out2.match(/^## AITM Progress Markers$/gm) || []).length,
    1,
    'heading is not duplicated on subsequent inserts'
  );
  assert.match(out2, DEEP_DIVE_COMPLETE_RE);
  assert.match(out2, REVIEW_APPROVED_RE);
}

// ── #480 AC5: cluster sits before the field-DB block when one is present ──────
{
  const withFields = [
    '## Acceptance Criteria',
    '- [ ] AC',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"S"}} -->',
    '',
  ].join('\n');
  const out = insertReviewApprovedMarker(withFields, TS);
  const headingIdx = out.indexOf(PROGRESS_MARKERS_HEADING);
  const markerIdx = out.indexOf('aitm-review-approved');
  const fieldsIdx = out.indexOf('aitm-fields:');
  assert.ok(headingIdx > -1 && markerIdx > headingIdx, 'marker under heading');
  assert.ok(markerIdx < fieldsIdx, 'cluster precedes the field-DB block');
}

console.log('markers-progress-cluster.test.mjs: all passed');
