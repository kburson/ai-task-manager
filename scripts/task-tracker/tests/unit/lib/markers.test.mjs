#!/usr/bin/env node
// @story #90 #1089
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
  insertPlanApprovedMarker,
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
  stripFencedCodeBlocks,
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../lib/markers.mjs';

const TS = '2026-05-11T12:00:00Z';

function verificationReceipt(stage, receiptId, supersedes = null) {
  return {
    schema: 'aitm.verification-receipt/v1',
    receiptId,
    issue: 1089,
    stage,
    commitSha: 'a'.repeat(40),
    startedAt: '2026-08-01T18:00:00.000Z',
    completedAt: '2026-08-01T18:00:01.000Z',
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity: '/tmp/receipt', clean: true },
    },
    commands: [
      {
        classification: 'lint-full',
        command: 'npm',
        args: ['run', 'lint'],
        exitCode: 0,
        durationMs: 1000,
      },
    ],
    supersedes,
  };
}

// ── #1089 verification receipts: one current marker per stage ───────────────
{
  const first = verificationReceipt('develop-final', '01J00000000000000000000000');
  const testReceipt = verificationReceipt('test', '01J00000000000000000000001');
  const replacement = verificationReceipt('develop-final', '01J00000000000000000000002');
  const visible = '## Evidence\n\nKeep this visible text exactly.\n';

  const withDevelop = upsertVerificationReceipt(visible, first);
  const withBoth = upsertVerificationReceipt(withDevelop, testReceipt);
  const replaced = upsertVerificationReceipt(withBoth, replacement);

  assert.equal(
    parseVerificationReceipt(replaced, 'develop-final').receiptId,
    replacement.receiptId
  );
  assert.equal(
    parseVerificationReceipt(replaced, 'develop-final').supersedes,
    first.receiptId,
    'same-stage replacement links to the prior immutable receipt'
  );
  assert.equal(parseVerificationReceipt(replaced, 'test').receiptId, testReceipt.receiptId);
  assert.equal((replaced.match(/aitm-verification-receipt/g) || []).length, 2);
  assert.ok(replaced.includes(visible.trim()), 'visible body text is preserved');

  const unrelated = replaced.replace('Keep this visible text exactly.', 'Unrelated prose edit.');
  assert.deepEqual(
    parseVerificationReceipt(unrelated, 'test'),
    parseVerificationReceipt(replaced, 'test'),
    'unrelated issue-body edits do not alter receipt payloads'
  );
}

// ── plan-approved: build + has ────────────────────────────────────────────────
{
  const m = buildPlanApprovedMarker(TS);
  assert.equal(m, `<!-- aitm-plan-approved ts="${TS}" -->`);
  assert.ok(hasPlanApprovedMarker(`prose\n${m}\n`));
  assert.ok(!hasPlanApprovedMarker('prose only'));
  assert.ok(PLAN_APPROVED_RE.test(m));
}

// ── review-approved: build + has + insert ────────────────────────────────────
{
  const m = buildReviewApprovedMarker(TS);
  assert.equal(m, `<!-- aitm-review-approved ts="${TS}" -->`);
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

// ── #1024: fenced marker examples do not suppress genuine insertion ─────────
{
  const cases = [
    {
      name: 'plan-approved',
      marker: `<!-- aitm-plan-approved ts="${TS}" -->`,
      insert: (body) => insertPlanApprovedMarker(body, TS),
      has: hasPlanApprovedMarker,
    },
    {
      name: 'review-approved',
      marker: `<!-- aitm-review-approved ts="${TS}" -->`,
      insert: (body) => insertReviewApprovedMarker(body, TS),
      has: hasReviewApprovedMarker,
    },
    {
      name: 'deep-dive-complete',
      marker: `<!-- aitm-deep-dive-complete ts="${TS}" -->`,
      insert: (body) => insertDeepDiveCompleteMarker(body, TS),
      has: hasDeepDiveCompleteMarker,
    },
  ];

  for (const markerCase of cases) {
    const body = [
      '## Scope',
      '',
      'Illustrative marker syntax:',
      '',
      '```html',
      markerCase.marker,
      '```',
      '',
    ].join('\n');
    assert.equal(markerCase.has(body), false, `${markerCase.name}: fenced example is not genuine`);

    const inserted = markerCase.insert(body);
    assert.notEqual(inserted, body, `${markerCase.name}: genuine marker is inserted`);
    assert.equal(
      markerCase.has(stripFencedCodeBlocks(inserted)),
      true,
      `${markerCase.name}: genuine marker exists outside the fence`
    );
    assert.equal(
      markerCase.insert(inserted),
      inserted,
      `${markerCase.name}: insertion is idempotent`
    );
  }
}

// ── deep-dive-complete: build + has + insert ─────────────────────────────────
{
  const m = buildDeepDiveCompleteMarker(TS);
  assert.equal(m, `<!-- aitm-deep-dive-complete ts="${TS}" -->`);
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
  const { insertDodVerifiedMarker, parseDodVerifiedMarker } =
    await import('../../../lib/markers.mjs');
  const initial = insertDodVerifiedMarker('## AC\n- [ ] x\n', 'aaa1111', TS);
  const parsed1 = parseDodVerifiedMarker(initial);
  assert.equal(parsed1.sha, 'aaa1111');

  // Re-stamping with a new SHA must REPLACE, not preserve (#139 fix).
  const refreshed = insertDodVerifiedMarker(initial, 'bbb2222', '2026-05-17T12:00:00Z');
  const parsed2 = parseDodVerifiedMarker(refreshed);
  assert.equal(parsed2.sha, 'bbb2222');
  assert.equal(parsed2.ts, '2026-05-17T12:00:00Z');
  // Exactly one marker — no duplicates (count is grammar-agnostic).
  const matches = refreshed.match(/aitm-dod-verified[: ]/g) || [];
  assert.equal(matches.length, 1, 'must not leave a stale marker behind');
}

// ── #377: dod-verified marker-grammar migration ─────────────────────────────
// build emits property grammar; parse round-trips new form; legacy colon form
// still parses; insert over a legacy body flips it to new grammar and refreshes.
{
  const {
    DOD_VERIFIED_RE,
    buildDodVerifiedMarker,
    hasDodVerifiedMarker,
    parseDodVerifiedMarker,
    insertDodVerifiedMarker,
  } = await import('../../../lib/markers.mjs');

  // 1. serialize → property grammar (key order sha→ts).
  const built = buildDodVerifiedMarker('abc1234', TS);
  assert.equal(built, `<!-- aitm-dod-verified sha="abc1234" ts="${TS}" -->`);
  assert.ok(DOD_VERIFIED_RE.test(built), 'combined RE detects new grammar');
  assert.ok(hasDodVerifiedMarker(`prose\n${built}\n`));

  // 2. parse the new grammar.
  const pNew = parseDodVerifiedMarker(`head\n${built}\ntail`);
  assert.deepEqual(pNew, { sha: 'abc1234', ts: TS });

  // 3. parse the legacy colon grammar (back-compat until #369 corpus sweep).
  const legacy = `<!-- aitm-dod-verified: def5678:${TS} -->`;
  assert.ok(DOD_VERIFIED_RE.test(legacy), 'combined RE detects legacy grammar');
  assert.ok(hasDodVerifiedMarker(`prose\n${legacy}\n`));
  assert.deepEqual(parseDodVerifiedMarker(legacy), { sha: 'def5678', ts: TS });

  // 4. re-stamp over a legacy body flips to new grammar, single marker, refreshed SHA.
  const fromLegacy = insertDodVerifiedMarker(`## AC\n- [ ] x\n\n${legacy}\n`, 'fed9999', TS);
  assert.deepEqual(parseDodVerifiedMarker(fromLegacy), { sha: 'fed9999', ts: TS });
  assert.ok(!/aitm-dod-verified:/.test(fromLegacy), 'legacy colon form stripped on re-stamp');
  assert.equal((fromLegacy.match(/aitm-dod-verified /g) || []).length, 1);
}

// ── #377: test-started marker-grammar migration ─────────────────────────────
{
  const {
    TEST_STARTED_RE,
    buildTestStartedMarker,
    hasTestStartedMarker,
    parseTestStartedMarker,
    insertTestStartedMarker,
  } = await import('../../../lib/markers.mjs');

  // 1. serialize → property grammar.
  const built = buildTestStartedMarker('abc1234', TS);
  assert.equal(built, `<!-- aitm-test-started sha="abc1234" ts="${TS}" -->`);
  assert.ok(TEST_STARTED_RE.test(built));
  assert.ok(hasTestStartedMarker(`prose\n${built}\n`));

  // 2. parse new grammar — `.sha` is the SHA-drift gate's prefix-match input.
  const pNew = parseTestStartedMarker(`head\n${built}\ntail`);
  assert.deepEqual(pNew, { sha: 'abc1234', ts: TS });

  // 3. parse legacy colon grammar.
  const legacy = `<!-- aitm-test-started: def5678:${TS} -->`;
  assert.ok(TEST_STARTED_RE.test(legacy));
  assert.deepEqual(parseTestStartedMarker(legacy), { sha: 'def5678', ts: TS });

  // 4. re-stamp over a legacy body flips grammar + refreshes, single marker.
  const fromLegacy = insertTestStartedMarker(`## AC\n- [ ] x\n\n${legacy}\n`, 'fed9999', TS);
  assert.deepEqual(parseTestStartedMarker(fromLegacy), { sha: 'fed9999', ts: TS });
  assert.ok(!/aitm-test-started:/.test(fromLegacy), 'legacy colon form stripped on re-stamp');
  assert.equal((fromLegacy.match(/aitm-test-started /g) || []).length, 1);
}

// ── #333: phantom-marker hardening — fenced code blocks are stripped before
//        body-wide marker detection runs. Verifies all three plan/review-gate
//        detectors (`hasPlanApprovedMarker`, `hasReviewApprovedMarker`,
//        `hasDeepDiveCompleteMarker`) reject phantoms inside fences and still
//        detect real markers outside fences.
{
  const { stripFencedCodeBlocks } = await import('../../../lib/markers.mjs');

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

// ── #375: lifecycle-timestamp markers migrated to `ts="..."` property grammar.
//        Detectors were widened to accept BOTH the legacy colon form (read
//        path, kept until #369's corpus sweep) and the new property form
//        (write path). Covers, for the gate markers, all four AC3 axes:
//        serialize (new form), parse-new, parse-legacy back-compat, and
//        fenced-code-block phantom exclusion of the NEW form.
{
  // serialize — builders now emit the property grammar.
  assert.equal(buildPlanApprovedMarker(TS), `<!-- aitm-plan-approved ts="${TS}" -->`);
  assert.equal(buildReviewApprovedMarker(TS), `<!-- aitm-review-approved ts="${TS}" -->`);
  assert.equal(buildDeepDiveCompleteMarker(TS), `<!-- aitm-deep-dive-complete ts="${TS}" -->`);

  // parse-new — detectors accept the new property form.
  assert.ok(hasPlanApprovedMarker(`x\n<!-- aitm-plan-approved ts="${TS}" -->\n`), 'new plan form');
  assert.ok(
    hasReviewApprovedMarker(`x\n<!-- aitm-review-approved ts="${TS}" -->\n`),
    'new review form'
  );
  assert.ok(
    hasDeepDiveCompleteMarker(`x\n<!-- aitm-deep-dive-complete ts="${TS}" -->\n`),
    'new deep-dive-complete form'
  );

  // parse-legacy — back-compat: legacy colon form still detected (read path).
  assert.ok(hasPlanApprovedMarker(`x\n<!-- aitm-plan-approved: ${TS} -->\n`), 'legacy plan form');
  assert.ok(
    hasReviewApprovedMarker(`x\n<!-- aitm-review-approved: ${TS} -->\n`),
    'legacy review form'
  );
  assert.ok(
    hasDeepDiveCompleteMarker(`x\n<!-- aitm-deep-dive-complete: ${TS} -->\n`),
    'legacy deep-dive-complete form'
  );

  // fenced phantom exclusion of the NEW form — a property-grammar marker inside
  // a fence is still a phantom and must not register.
  assert.ok(
    !hasPlanApprovedMarker(`## Plan\n\n\`\`\`\n<!-- aitm-plan-approved ts="${TS}" -->\n\`\`\`\n`),
    'new-form plan-approved inside fence rejected'
  );
  assert.ok(
    !hasReviewApprovedMarker(`\`\`\`\n<!-- aitm-review-approved ts="${TS}" -->\n\`\`\`\n`),
    'new-form review-approved inside fence rejected'
  );
  assert.ok(
    !hasDeepDiveCompleteMarker(`\`\`\`\n<!-- aitm-deep-dive-complete ts="${TS}" -->\n\`\`\`\n`),
    'new-form deep-dive-complete inside fence rejected'
  );
}

// ── parseFullAutoApprovedMarker: ISO-aware legacy split (#387) ────────────────
{
  const { parseFullAutoApprovedMarker, buildFullAutoApprovedMarker } =
    await import('../../../lib/markers.mjs');

  // env=-leading legacy form — preserved behavior (regression guard).
  {
    const body = '<!-- aitm-full-auto-approved: 2026-05-19T19:14:27Z:env=1,tty=0,ci=1 -->';
    const parsed = parseFullAutoApprovedMarker(body);
    assert.equal(parsed.ts, '2026-05-19T19:14:27Z', 'env=-leading ts');
    assert.equal(parsed.signals, 'env=1,tty=0,ci=1', 'env=-leading signals');
  }

  // reviewer-unset=-leading legacy form — previously corrupted by first-colon
  // fallback (split landed inside the ISO time component).
  {
    const body =
      '<!-- aitm-full-auto-approved: 2026-05-19T19:14:27Z:reviewer-unset=1,env=1,tty=1,ci=0 -->';
    const parsed = parseFullAutoApprovedMarker(body);
    assert.equal(parsed.ts, '2026-05-19T19:14:27Z', 'reviewer-unset=-leading ts not corrupted');
    assert.equal(
      parsed.signals,
      'reviewer-unset=1,env=1,tty=1,ci=0',
      'reviewer-unset=-leading signals'
    );
  }

  // Numeric +HH:MM offset terminator — the offset colon must not be the split.
  {
    const body =
      '<!-- aitm-full-auto-approved: 2026-05-19T19:14:27+02:00:reviewer-unset=1,ci=0 -->';
    const parsed = parseFullAutoApprovedMarker(body);
    assert.equal(parsed.ts, '2026-05-19T19:14:27+02:00', '+offset ts kept whole');
    assert.equal(parsed.signals, 'reviewer-unset=1,ci=0', '+offset signals');
  }

  // Numeric -HH:MM offset terminator.
  {
    const body = '<!-- aitm-full-auto-approved: 2026-05-19T19:14:27-05:00:env=0,tty=1 -->';
    const parsed = parseFullAutoApprovedMarker(body);
    assert.equal(parsed.ts, '2026-05-19T19:14:27-05:00', '-offset ts kept whole');
    assert.equal(parsed.signals, 'env=0,tty=1', '-offset signals');
  }

  // New property-grammar round trip: build → parse yields the same pair.
  {
    const ts = '2026-05-19T19:14:27Z';
    const signals = 'reviewer-unset=1,env=1,tty=1,ci=0';
    const marker = buildFullAutoApprovedMarker(ts, signals);
    const parsed = parseFullAutoApprovedMarker(`prose\n${marker}\nmore`);
    assert.equal(parsed.ts, ts, 'round-trip ts');
    assert.equal(parsed.signals, signals, 'round-trip signals');
  }
}

// NOTE: #480 AC5 (`## AITM Progress Markers` relocation) lives in the sibling
// markers-progress-cluster.test.mjs — split out to keep this file under the
// 400-line cap.

console.log('markers.test.mjs: all passed');
