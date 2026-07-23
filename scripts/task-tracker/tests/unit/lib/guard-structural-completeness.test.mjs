// @story #536
// Tests for the #536 structural-completeness check on the flag-bearing path.
//
// #522 guards proof PROVENANCE: a newly-introduced execution-proof marker
// written WITHOUT `evidenceStamp: true` throws `FabricatedProofError`. But when
// a sanctioned stamper passes `evidenceStamp: true`, #522 skips the entire guard
// — so a buggy/half-written stamper could mint a structurally-junk marker
// (missing `sha`, missing `ts`, or a `sha` that is neither a git commit sha nor
// the `sandbox` sentinel) and have it silently persist as trusted "proof".
//
// #536 adds the symmetric STRUCTURAL check that runs ONLY on the flag-bearing
// branch: every newly-introduced proof marker must carry a present `ts` and a
// `sha` that is either 7–40 hex chars (git short-or-full form) or `sandbox`.
// A defect throws `IncompleteProofError`. The two arms are mutually exclusive,
// so #522's provenance behavior is untouched (covered in fabrication-guard.test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findStructurallyIncompleteIntroducedProof,
  IncompleteProofError as IPEFromInvariants,
} from '../../../lib/body-invariants.mjs';
import { mutateIssueBody, IncompleteProofError } from '../../../lib/issue-body-mutate.mjs';

function fakeDeps(initialBody) {
  let body = initialBody;
  return {
    fetchBody: async () => body,
    pushBody: async (_repo, _n, next) => {
      body = next;
    },
    getBody: () => body,
  };
}

const BASE = '## DoD\n- [ ] verify behavior\n<!-- aitm-body-version: 1 -->\n';

// Well-formed proof markers (should pass the structural check).
const GOOD_SHORT =
  '<!-- aitm-verified cmd="`npm test`" sha="abc1234" ts="2026-06-12T00:00:00.000Z" -->';
const GOOD_FULL =
  '<!-- aitm-verified cmd="`npm test`" sha="3dfc553380805a1bfb2be7f51df123396ccf7e55" ts="2026-06-12T00:00:00.000Z" -->';
const GOOD_SANDBOX =
  '<!-- aitm-verified cmd="`npm test`" sha="sandbox" ts="2026-06-12T00:00:00.000Z" -->';

// Structurally-incomplete proof markers (should be rejected even when flag-bearing).
const MISSING_SHA = '<!-- aitm-verified cmd="`npm test`" ts="2026-06-12T00:00:00.000Z" -->';
const MISSING_TS = '<!-- aitm-verified cmd="`npm test`" sha="abc1234" -->';
const BAD_SHA = '<!-- aitm-verified cmd="`npm test`" sha="zzz" ts="2026-06-12T00:00:00.000Z" -->';

function flipWith(marker) {
  return (body) => body.replace('- [ ] verify behavior', `- [x] verify behavior ${marker}`);
}

// ── pure predicate unit behavior ────────────────────────────────────────────

test('predicate flags a newly-introduced marker missing its sha', () => {
  const before = '- [ ] item\n';
  const after = `- [x] item ${MISSING_SHA}\n`;
  const offenders = findStructurallyIncompleteIntroducedProof(before, after);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].lineIndex, 0);
});

test('predicate flags a newly-introduced marker missing its ts', () => {
  const before = '- [ ] item\n';
  const after = `- [x] item ${MISSING_TS}\n`;
  const offenders = findStructurallyIncompleteIntroducedProof(before, after);
  assert.equal(offenders.length, 1);
});

test('predicate flags a newly-introduced marker whose sha is neither hex nor sandbox', () => {
  const before = '- [ ] item\n';
  const after = `- [x] item ${BAD_SHA}\n`;
  const offenders = findStructurallyIncompleteIntroducedProof(before, after);
  assert.equal(offenders.length, 1);
});

test('predicate passes a well-formed short-sha marker', () => {
  const before = '- [ ] item\n';
  const after = `- [x] item ${GOOD_SHORT}\n`;
  assert.deepEqual(findStructurallyIncompleteIntroducedProof(before, after), []);
});

test('predicate passes a well-formed full-sha marker', () => {
  const before = '- [ ] item\n';
  const after = `- [x] item ${GOOD_FULL}\n`;
  assert.deepEqual(findStructurallyIncompleteIntroducedProof(before, after), []);
});

test('predicate passes a sandbox-sentinel marker', () => {
  const before = '- [ ] item\n';
  const after = `- [x] item ${GOOD_SANDBOX}\n`;
  assert.deepEqual(findStructurallyIncompleteIntroducedProof(before, after), []);
});

test('predicate ignores a marker carried through unchanged (only NEW markers checked)', () => {
  const before = `- [x] item ${BAD_SHA}\n## Notes\noriginal\n`;
  const after = `- [x] item ${BAD_SHA}\n## Notes\nedited\n`;
  assert.deepEqual(findStructurallyIncompleteIntroducedProof(before, after), []);
});

test('IncompleteProofError is the same class exported from both modules', () => {
  assert.equal(IncompleteProofError, IPEFromInvariants);
});

// ── mutateIssueBody wire-in (flag-bearing path) ─────────────────────────────

test('AC1 — flag-bearing stamp missing sha is rejected despite evidenceStamp:true', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 536,
      repo: 'fake/fake',
      mutate: flipWith(MISSING_SHA),
      deps,
      evidenceStamp: true,
    }),
    (err) => err instanceof IncompleteProofError
  );
});

test('AC2 — flag-bearing stamp missing ts is rejected', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 536,
      repo: 'fake/fake',
      mutate: flipWith(MISSING_TS),
      deps,
      evidenceStamp: true,
    }),
    (err) => err instanceof IncompleteProofError
  );
});

test('AC3 — flag-bearing stamp with non-hex non-sandbox sha is rejected', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 536,
      repo: 'fake/fake',
      mutate: flipWith(BAD_SHA),
      deps,
      evidenceStamp: true,
    }),
    (err) => err instanceof IncompleteProofError
  );
});

test('AC4 — well-formed flag-bearing stamp (short sha) still passes', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 536,
    repo: 'fake/fake',
    mutate: flipWith(GOOD_SHORT),
    deps,
    evidenceStamp: true,
  });
  assert.equal(r.status, 'ok');
});

test('AC4 — well-formed flag-bearing stamp (sandbox sentinel) still passes', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 536,
    repo: 'fake/fake',
    mutate: flipWith(GOOD_SANDBOX),
    deps,
    evidenceStamp: true,
  });
  assert.equal(r.status, 'ok');
});
