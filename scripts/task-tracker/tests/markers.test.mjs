#!/usr/bin/env node
// Unit tests for scripts/task-tracker/lib/markers.mjs — the hidden-marker
// helpers used by approve / approve-review / check verbs and body-gates.
//
// Covers: build, has, insert (where applicable), idempotency, and the
// field-DB normalization side-effect.

import { strict as assert } from 'node:assert';
import {
  PLAN_APPROVED_RE,
  buildPlanApprovedMarker,
  hasPlanApprovedMarker,
  REVIEW_APPROVED_RE,
  buildReviewApprovedMarker,
  hasReviewApprovedMarker,
  insertReviewApprovedMarker,
  DEEP_DIVE_COMPLETE_RE,
  buildDeepDiveCompleteMarker,
  hasDeepDiveCompleteMarker,
  insertDeepDiveCompleteMarker,
  hasDeepDiveHeading,
  hasDeepDiveEvidence,
  backfillDeepDiveCompleteMarker,
} from '../lib/markers.mjs';

const TS = '2026-05-11T12:00:00Z';

// ── plan-approved: build + has ────────────────────────────────────────────────
{
  const m = buildPlanApprovedMarker(TS);
  assert.equal(m, `<!-- aitm-plan-approved: ${TS} -->`);
  assert.ok(hasPlanApprovedMarker(`prose\n${m}\n`));
  assert.ok(!hasPlanApprovedMarker('prose only'));
  assert.ok(PLAN_APPROVED_RE.test(m));
}

// ── review-approved: build + has + insert ────────────────────────────────────
{
  const m = buildReviewApprovedMarker(TS);
  assert.equal(m, `<!-- aitm-review-approved: ${TS} -->`);
  assert.ok(hasReviewApprovedMarker(`x\n${m}`));
  assert.ok(!hasReviewApprovedMarker(''));
  assert.ok(REVIEW_APPROVED_RE.test(m));

  // Insert into plain body — appended at end.
  const out = insertReviewApprovedMarker('## AC\n\n- [ ] x\n', TS);
  assert.match(out, REVIEW_APPROVED_RE);
  assert.ok(out.indexOf('## AC') < out.indexOf('aitm-review-approved'));

  // Idempotent: re-insert leaves body unchanged.
  assert.equal(insertReviewApprovedMarker(out, TS), out);
}

// ── deep-dive-complete: build + has + insert ─────────────────────────────────
{
  const m = buildDeepDiveCompleteMarker(TS);
  assert.equal(m, `<!-- aitm-deep-dive-complete: ${TS} -->`);
  assert.ok(hasDeepDiveCompleteMarker(`pre\n${m}\npost`));
  assert.ok(!hasDeepDiveCompleteMarker('## Deep-Dive Analysis\n\ntext\n'));
  assert.ok(DEEP_DIVE_COMPLETE_RE.test(m));

  // Insert into body with no field-DB — appended at end.
  const out = insertDeepDiveCompleteMarker('## AC\n\n- [ ] x\n', TS);
  assert.match(out, DEEP_DIVE_COMPLETE_RE);

  // Idempotent.
  assert.equal(insertDeepDiveCompleteMarker(out, TS), out);
}

// ── insert normalizes legacy fenced field-DB to canonical encoding ───────────
{
  const legacy = [
    '## Acceptance Criteria',
    '- [ ] AC',
    '',
    '<!-- ai-task-manager:fields:start -->',
    '```json',
    '{"schema":1,"values":{"size":"S","estimate":3}}',
    '```',
    '<!-- ai-task-manager:fields:end -->',
    '',
  ].join('\n');

  const out = insertDeepDiveCompleteMarker(legacy, TS);
  assert.match(out, DEEP_DIVE_COMPLETE_RE, 'marker inserted');
  // Legacy fenced block must be replaced with the canonical encoding.
  assert.doesNotMatch(out, /ai-task-manager:fields:start/, 'legacy start marker removed');
  assert.doesNotMatch(out, /ai-task-manager:fields:end/, 'legacy end marker removed');
  assert.match(out, /<!--\s*aitm-fields:\s*\{/, 'canonical encoding emitted');
  // Marker placed before the field-DB block.
  const markerIdx = out.search(DEEP_DIVE_COMPLETE_RE);
  const fieldsIdx = out.indexOf('<!-- aitm-fields:');
  assert.ok(markerIdx < fieldsIdx, 'marker comes before fields block');
}

// ── insert preserves canonical field-DB ordering when already canonical ──────
{
  const canon = [
    '## AC',
    '- [ ] AC',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"M","estimate":8}} -->',
    '',
  ].join('\n');
  const out = insertReviewApprovedMarker(canon, TS);
  assert.match(out, REVIEW_APPROVED_RE);
  const markerIdx = out.search(REVIEW_APPROVED_RE);
  const fieldsIdx = out.indexOf('<!-- aitm-fields:');
  assert.ok(markerIdx < fieldsIdx, 'marker placed before canonical fields block');
}

// ── deep-dive evidence + heading + backfill (legacy-issue fallback) ──────────
{
  // Heading detection: matches plain heading and dated variant.
  assert.ok(hasDeepDiveHeading('## Deep-Dive Analysis\n\ntext'));
  assert.ok(hasDeepDiveHeading('## Deep-Dive Analysis (2026-05-11)\n\ntext'));
  assert.ok(!hasDeepDiveHeading('## Some Other Section'));

  // Evidence = marker OR heading.
  assert.ok(hasDeepDiveEvidence(`prose\n${buildDeepDiveCompleteMarker(TS)}\n`));
  assert.ok(hasDeepDiveEvidence('## Deep-Dive Analysis\n\nwork'));
  assert.ok(!hasDeepDiveEvidence('plain prose'));

  // Backfill: heading present, marker absent → marker inserted.
  const legacy = '## AC\n- [ ] x\n\n## Deep-Dive Analysis\n\nold notes\n';
  const filled = backfillDeepDiveCompleteMarker(legacy, TS);
  assert.match(filled, DEEP_DIVE_COMPLETE_RE);
  // Idempotent on already-marked body.
  assert.equal(backfillDeepDiveCompleteMarker(filled, TS), filled);
  // No-op on body with no heading.
  const noHeading = '## AC\n- [ ] x\n';
  assert.equal(backfillDeepDiveCompleteMarker(noHeading, TS), noHeading);
}

console.log('markers.test.mjs: all passed');
