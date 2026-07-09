// #762 (AC3) — `/task ac-stamp` resolves a `vc:<n>` citation to its literal
// verifier command and stamps the AC evidence marker exactly as it does for a
// legacy embedded-command AC. `verbAcStamp` is thin gh/runner plumbing around
// two library seams — `findEvidenceAc` (which resolves the declared command via
// `resolveCitedOrLiteralCommands`) and `stampAcEvidenceAndReconcile` (the exact
// body mutate the verb applies). These tests drive that seam directly so the
// citation path is proven without a live GitHub round-trip.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findEvidenceAc,
  stampAcEvidenceAndReconcile,
  parseAcEvidence,
  acKeyForLabel,
} from '../lib/ac-evidence.mjs';
import { verbAcStamp } from './ac-stamp.mjs';

const NOW = '2026-07-09T00:00:00.000Z';
const SHA = 'abc1234';
const CMD = 'node --test scripts/task-tracker/lib/vc-authoring.test.mjs';

const CITED_BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] Cited AC <!-- aitm-verified cmd="vc:1" -->',
  '',
  '## Verification Commands',
  '',
  `- [ ] \`${CMD}\``,
  '',
].join('\n');

const LEGACY_BODY = [
  '## Acceptance Criteria',
  '',
  `- [ ] Cited AC <!-- aitm-verified cmd="\`${CMD}\`" -->`,
  '',
  '## Verification Commands',
  '',
  `- [ ] \`${CMD}\``,
  '',
].join('\n');

test('ac-stamp seam: a cited AC resolves to its literal verifier command (AC3)', () => {
  const target = findEvidenceAc(CITED_BODY, 'Cited AC');
  assert.ok(target, 'cited AC should be located');
  assert.deepEqual(target.evidenceCommands, [CMD]);
});

test('ac-stamp seam: stamping a cited AC writes a readable evidence proof (AC3)', () => {
  const stamped = stampAcEvidenceAndReconcile(CITED_BODY, 'Cited AC', {
    cmd: CMD,
    sha: SHA,
    ts: NOW,
    exit: 0,
  });
  const target = findEvidenceAc(stamped, 'Cited AC');
  const proof = parseAcEvidence(stamped.split('\n')[target.lineIndex]);
  assert.ok(proof, 'evidence proof should read back');
  assert.equal(proof.exit, 0);
  assert.equal(proof.sha, SHA);
  assert.equal(proof.ts, NOW);
  assert.equal(proof.key, acKeyForLabel('Cited AC'));
  // The declaration component is preserved as the citation it was authored as.
  assert.equal(proof.cmd, 'vc:1');
});

test('ac-stamp seam: cited stamp reconciliation is idempotent for an already-listed command (AC3)', () => {
  const stamped = stampAcEvidenceAndReconcile(CITED_BODY, 'Cited AC', {
    cmd: CMD,
    sha: SHA,
    ts: NOW,
    exit: 0,
  });
  // The cited command is already VC bullet #1, so no duplicate bullet is added.
  const occurrences = stamped.split('\n').filter((l) => l.includes(`\`${CMD}\``)).length;
  assert.equal(occurrences, 1);
});

test('ac-stamp seam: cited and legacy ACs share one key and both stamp readable proofs (AC3/AC5)', () => {
  assert.equal(acKeyForLabel('Cited AC'), acKeyForLabel('Cited AC'));

  const citedStamped = stampAcEvidenceAndReconcile(CITED_BODY, 'Cited AC', {
    cmd: CMD,
    sha: SHA,
    ts: NOW,
    exit: 0,
  });
  const legacyStamped = stampAcEvidenceAndReconcile(LEGACY_BODY, 'Cited AC', {
    cmd: CMD,
    sha: SHA,
    ts: NOW,
    exit: 0,
  });

  const citedProof = parseAcEvidence(
    citedStamped.split('\n')[findEvidenceAc(citedStamped, 'Cited AC').lineIndex]
  );
  const legacyProof = parseAcEvidence(
    legacyStamped.split('\n')[findEvidenceAc(legacyStamped, 'Cited AC').lineIndex]
  );

  // Same AC key and same execution proof regardless of declaration form.
  assert.equal(citedProof.key, legacyProof.key);
  assert.equal(citedProof.exit, 0);
  assert.equal(legacyProof.exit, 0);
  // Legacy declaration surfaces the embedded backtick-wrapped command verbatim;
  // cited surfaces the citation token. Both still resolve to the same literal.
  assert.equal(legacyProof.cmd, `\`${CMD}\``);
  assert.equal(citedProof.cmd, 'vc:1');
  assert.deepEqual(findEvidenceAc(legacyStamped, 'Cited AC').evidenceCommands, [CMD]);
  assert.deepEqual(findEvidenceAc(citedStamped, 'Cited AC').evidenceCommands, [CMD]);
});

test('verbAcStamp is exported as an async function', () => {
  assert.equal(typeof verbAcStamp, 'function');
});
