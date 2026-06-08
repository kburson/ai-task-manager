#!/usr/bin/env node
// Unit tests for scripts/task-tracker/lib/markers.mjs — the hidden-marker
// helpers used by approve / check verbs and body-gates.
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

// ── dod-verified: insert replaces stale SHA (re-test must refresh) ───────────
{
  const { insertDodVerifiedMarker, parseDodVerifiedMarker } = await import('../lib/markers.mjs');
  const initial = insertDodVerifiedMarker('## AC\n- [ ] x\n', 'aaa1111', TS);
  const parsed1 = parseDodVerifiedMarker(initial);
  assert.equal(parsed1.sha, 'aaa1111');

  // Re-stamping with a new SHA must REPLACE, not preserve (#139 fix).
  const refreshed = insertDodVerifiedMarker(initial, 'bbb2222', '2026-05-17T12:00:00Z');
  const parsed2 = parseDodVerifiedMarker(refreshed);
  assert.equal(parsed2.sha, 'bbb2222');
  assert.equal(parsed2.ts, '2026-05-17T12:00:00Z');
  // Exactly one marker — no duplicates.
  const matches = refreshed.match(/aitm-dod-verified:/g) || [];
  assert.equal(matches.length, 1, 'must not leave a stale marker behind');
}

// ── #333: phantom-marker hardening — fenced code blocks are stripped before
//        body-wide marker detection runs. Verifies all three plan/review-gate
//        detectors (`hasPlanApprovedMarker`, `hasReviewApprovedMarker`,
//        `hasDeepDiveCompleteMarker`) reject phantoms inside fences and still
//        detect real markers outside fences.
{
  const { stripFencedCodeBlocks } = await import('../lib/markers.mjs');

  // 1. Strip helper drops both ``` and ~~~ fenced blocks.
  const fenced =
    'before\n```\n<!-- aitm-plan-approved: PHANTOM -->\n```\nafter\n~~~\n<!-- aitm-review-approved: PHANTOM -->\n~~~\nend';
  const stripped = stripFencedCodeBlocks(fenced);
  assert.ok(!stripped.includes('PHANTOM'), 'fenced contents removed');
  assert.ok(stripped.includes('before') && stripped.includes('after') && stripped.includes('end'));

  // 2. Plan-approved: phantom in a ``` fence does NOT register as a stamp.
  const planPhantomOnly =
    '## Plan\n\n```\n<!-- aitm-plan-approved: 2026-06-08T00:00:00Z -->\n```\n';
  assert.ok(
    !hasPlanApprovedMarker(planPhantomOnly),
    'phantom plan-approved inside fenced block must not be detected'
  );

  // 3. Plan-approved: real marker outside the fence IS detected even when a
  //    phantom coexists inside one (the #277 repro shape).
  const planRealPlusPhantom =
    '## Plan\n\n```\nillustrative: <!-- aitm-plan-approved: PHANTOM -->\n```\n\n' +
    `${buildPlanApprovedMarker(TS)}\n`;
  assert.ok(
    hasPlanApprovedMarker(planRealPlusPhantom),
    'real plan-approved outside fence still detected alongside phantom'
  );

  // 4. Review-approved: parallel coverage.
  const reviewPhantomOnly = '```\n<!-- aitm-review-approved: PHANTOM -->\n```\n';
  assert.ok(!hasReviewApprovedMarker(reviewPhantomOnly), 'phantom review-approved rejected');
  const reviewReal = `${buildReviewApprovedMarker(TS)}\n${reviewPhantomOnly}`;
  assert.ok(hasReviewApprovedMarker(reviewReal), 'real review-approved alongside phantom detected');

  // 5. Deep-dive-complete: parallel coverage — the marker family the
  //    move-state.mjs:436 inline regex also checked.
  const ddcPhantomOnly =
    '## Deep-Dive Analysis\n\n```\n<!-- aitm-deep-dive-complete: PHANTOM -->\n```\n';
  assert.ok(
    !hasDeepDiveCompleteMarker(ddcPhantomOnly),
    'phantom deep-dive-complete inside fence rejected'
  );
  const ddcReal = `${buildDeepDiveCompleteMarker(TS)}\n${ddcPhantomOnly}`;
  assert.ok(
    hasDeepDiveCompleteMarker(ddcReal),
    'real deep-dive-complete alongside phantom detected'
  );

  // 6. Tilde fences are also stripped (CommonMark accepts both).
  const tildeFence = '~~~\n<!-- aitm-plan-approved: PHANTOM -->\n~~~\n';
  assert.ok(!hasPlanApprovedMarker(tildeFence), 'phantom inside ~~~ fence rejected');

  // 7. Indented opening fence (up to 3 spaces per CommonMark) still strips.
  const indentedFence = '  ```\n<!-- aitm-plan-approved: PHANTOM -->\n  ```\n';
  assert.ok(!hasPlanApprovedMarker(indentedFence), 'phantom inside indented fence rejected');
}

console.log('markers.test.mjs: all passed');
