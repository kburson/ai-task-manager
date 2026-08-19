// @story #1317
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { uncheckedPreCloseCheckboxes } from '../../../../task-tracker/close-gate.mjs';
import { testExitPreCloseCompletenessGuard } from '../../../../task-tracker/lib/test-exit-pre-close-completeness-guard.mjs';
import { resolvePreCloseCheckboxes } from '../../../../task-tracker/verbs/close.mjs';

const SUITE_VC = '- [ ] `npm run test:slow` <!-- id=2 -->';
const TESTS_DOD =
  '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" --> <!-- dod:functional:tests -->';
const TARGETED_VC = '- [ ] `node --test scripts/tests/unit/focused.test.mjs` <!-- id=3 -->';
const OTHER = '- [ ] Publish the release notes';
const BODY = [SUITE_VC, TESTS_DOD, TARGETED_VC, OTHER].join('\n');

const DOCS_SKIP = {
  reason: 'docs-only-diff',
  kind: 'docs-only',
  changedPaths: ['docs/guides/workflow.md', 'README.md'],
  lanes: ['test-unit', 'test-integration', 'test-slow'],
};

test('proof-gated scanner waives only complete-suite VC and tests DoD boxes', () => {
  assert.deepEqual(uncheckedPreCloseCheckboxes(BODY, { docsOnlyLaneSkipProven: true }), [
    TARGETED_VC,
    OTHER,
  ]);
});

test('scanner preserves byte-identical default-deny behavior without proof', () => {
  assert.deepEqual(uncheckedPreCloseCheckboxes(BODY), [SUITE_VC, TESTS_DOD, TARGETED_VC, OTHER]);
  assert.deepEqual(uncheckedPreCloseCheckboxes(BODY, { docsOnlyLaneSkipProven: false }), [
    SUITE_VC,
    TESTS_DOD,
    TARGETED_VC,
    OTHER,
  ]);
});

test('Test exit guard uses proof resolution and keeps unrelated blockers', async () => {
  const result = await testExitPreCloseCompletenessGuard.run({
    issueNumber: 1317,
    toState: 'review',
    body: BODY,
    projectDir: '/repo',
    deps: { resolveDocsOnlyLaneSkipProof: async () => true },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.blockers.map((line) =>
      line
        .replace(/^test-to-review-incomplete: /, '')
        .replace(/ \(the close gate enforces the same set\)$/, '')
    ),
    [TARGETED_VC, OTHER]
  );
});

test('close verb passes validated docs-only proof to the shared scanner', async () => {
  let scannerOptions;
  const blockers = await resolvePreCloseCheckboxes({
    body: BODY,
    issueNumber: 1317,
    projectDir: '/repo',
    resolveLaneSkipProof: async () => true,
    scan: (_body, options) => {
      scannerOptions = options;
      return [OTHER];
    },
  });
  assert.deepEqual(scannerOptions, { docsOnlyLaneSkipProven: true });
  assert.deepEqual(blockers, [OTHER]);
});

test('earned lane-skip predicate requires docs-only proof and every dropped lane', async () => {
  const receiptModule = await import('../../../../task-tracker/lib/verification-receipt.mjs');
  assert.equal(typeof receiptModule.hasEarnedDocsOnlyLaneSkip, 'function');
  const earned = receiptModule.hasEarnedDocsOnlyLaneSkip;

  assert.equal(earned({ laneSkip: DOCS_SKIP }), true);
  assert.equal(earned({ laneSkip: { ...DOCS_SKIP, kind: 'code' } }), false);
  assert.equal(earned({ laneSkip: { ...DOCS_SKIP, changedPaths: [] } }), false);
  assert.equal(
    earned({
      laneSkip: { ...DOCS_SKIP, changedPaths: ['docs/guide.md', 'scripts/task-tracker/x.mjs'] },
    }),
    false
  );
  assert.equal(earned({ laneSkip: { ...DOCS_SKIP, reason: 'claimed' } }), false);
  assert.equal(earned({ laneSkip: { ...DOCS_SKIP, lanes: ['test-slow'] } }), false);
  assert.equal(earned({ laneSkip: 'malformed' }), false);
});

test('proof resolver accepts only a validated current receipt for a live docs-only body', async () => {
  const proofModule =
    await import('../../../../task-tracker/lib/docs-only-lane-skip-proof.mjs').catch(() => ({}));
  assert.equal(typeof proofModule.resolveDocsOnlyLaneSkipProof, 'function');
  const resolveProof = proofModule.resolveDocsOnlyLaneSkipProof;
  const body = '## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="docs-only" -->';
  const receipt = { laneSkip: DOCS_SKIP };
  const deps = {
    parseVerificationReceipt: () => receipt,
    getHeadSha: async () => 'a'.repeat(40),
    buildVerificationFingerprint: async () => ({ commitSha: 'a'.repeat(40) }),
    requiredTestReceiptClassifications: () => ['lint-full', 'format-full'],
    validateVerificationReceipt: () => ({ ok: true, reasons: [] }),
    hasEarnedDocsOnlyLaneSkip: () => true,
  };

  assert.equal(await resolveProof({ body, issueNumber: 1317, projectDir: '/repo', deps }), true);
  assert.equal(
    await resolveProof({
      body,
      issueNumber: 1317,
      projectDir: '/repo',
      deps: { ...deps, validateVerificationReceipt: () => ({ ok: false }) },
    }),
    false
  );
  assert.equal(
    await resolveProof({
      body: body.replace('docs-only', 'code'),
      issueNumber: 1317,
      projectDir: '/repo',
      deps,
    }),
    false
  );
});
