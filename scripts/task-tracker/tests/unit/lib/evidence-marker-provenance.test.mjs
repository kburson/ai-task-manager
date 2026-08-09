// @story #1167
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync, rmSync } from 'node:fs';
import test from 'node:test';

import { stampAcEvidenceMarker } from '../../../lib/ac-evidence.mjs';
import { captureEvidenceProvenance } from '../../../lib/evidence-provenance.mjs';
import { stampEvidenceMarker } from '../../../lib/functional-dod-evidence.mjs';
import { hasExecutionProof, parseProofMarker } from '../../../lib/proof-marker.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import {
  createVerificationReceipt,
  validateVerificationReceiptStructure,
} from '../../../lib/verification-receipt.mjs';

const sha = 'a'.repeat(40);
const ts = '2026-08-09T20:00:00.000Z';
const hash = `sha256:${'b'.repeat(64)}`;
const fingerprint = {
  commitSha: sha,
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    lockfileHash: hash,
    configHashes: {},
    sandbox: { kind: 'worktree', identity: '/tmp/test-sandbox', clean: true },
  },
};
const provenance = {
  worktreePath: '/tmp/actual worktree',
  branch: 'feature/actual-branch',
  boundIssue: 1167,
};

test('captures the actual checked-out branch instead of an expected issue branch', () => {
  const repo = mkdtempProjectIsolated('evidence-provenance-');
  try {
    execFileSync('git', ['branch', '-m', 'actual-executing-branch'], { cwd: repo });
    const captured = captureEvidenceProvenance({
      projectDir: repo,
      boundIssue: 1167,
      expectedBranch: 'feature/child/9999',
    });
    assert.deepEqual(captured, {
      worktreePath: realpathSync(repo),
      branch: 'actual-executing-branch',
      boundIssue: 1167,
    });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('DoD and AC evidence markers include execution provenance', () => {
  const dod = stampEvidenceMarker(
    '## Definition of Done\n\n#### Functional (verified at Test)\n\n- [ ] Tests <!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
    'tests',
    { cmd: 'npm test', exit: 0, sha, ts, ...provenance }
  );
  const ac = stampAcEvidenceMarker(
    '## Acceptance Criteria\n- [ ] It works <!-- aitm-verified cmd="`npm test`" -->',
    'It works',
    { cmd: 'npm test', exit: 0, sha, ts, ...provenance }
  );

  for (const marker of [parseProofMarker(dod), parseProofMarker(ac)]) {
    assert.equal(marker.worktree, provenance.worktreePath);
    assert.equal(marker.branch, provenance.branch);
    assert.equal(marker['bound-issue'], '1167');
  }
});

test('new receipts carry execution context while legacy receipts remain valid', () => {
  const legacy = createVerificationReceipt({
    issueNumber: 1167,
    stage: 'test',
    fingerprint,
    commands: [],
    now: () => ts,
  });
  const current = createVerificationReceipt({
    issueNumber: 1167,
    stage: 'test',
    fingerprint,
    commands: [],
    executionContext: provenance,
    now: () => ts,
  });

  assert.equal(validateVerificationReceiptStructure({ receipt: legacy }).ok, true);
  assert.deepEqual(current.executionContext, provenance);
  assert.equal(validateVerificationReceiptStructure({ receipt: current }).ok, true);
  assert.equal(
    validateVerificationReceiptStructure({
      receipt: { ...current, executionContext: { ...provenance, boundIssue: '1167' } },
    }).ok,
    false
  );
});

test('legacy and provenance-bearing proof markers remain execution proofs', () => {
  const legacy =
    '<!-- aitm-verified cmd="`npm test`" exit="0" sha="abc" ts="2026-01-01T00:00:00Z" -->';
  const current =
    '<!-- aitm-verified cmd="`npm test`" exit="0" sha="abc" ts="2026-01-01T00:00:00Z" worktree="/tmp/wt" branch="actual" bound-issue="1167" -->';
  assert.equal(hasExecutionProof(legacy), true);
  assert.equal(hasExecutionProof(current), true);
});
