// @story #522
// Tests for the #522 fabrication guard: the proof-INTRODUCTION invariant.
//
// `findNewlyIntroducedExecutionProof(before, after)` flags every body line that
// newly carries an execution-proof marker (`aitm-verified` with ts/sha/evidence,
// `aitm-ac-evidence`, or `aitm-dod-evidence`) that was absent from `before`.
// Declaration-only `aitm-verified cmd="..."` markers are NOT flagged.
//
// Wired into `mutateIssueBody`: introducing a proof marker without an audited
// `evidenceStamp: true` throws `FabricatedProofError`. This closes the gap the
// #516 fabrication exploited — `guardedMutate` previously guarded proof LOSS but
// had no symmetric invariant against proof INTRODUCTION.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findNewlyIntroducedExecutionProof,
  FabricatedProofError as FPEFromInvariants,
} from '../../../lib/body-invariants.mjs';
import { mutateIssueBody, FabricatedProofError } from '../../../lib/issue-body-mutate.mjs';

function fakeDeps(initialBody) {
  let body = initialBody;
  return {
    withGovernedEffect: async (_options, callback) => callback({ reverify: async () => {} }),
    fetchBody: async () => body,
    pushBody: async (_repo, _n, next) => {
      body = next;
    },
    getBody: () => body,
  };
}

const PROOF = '<!-- aitm-verified cmd="`npm test`" sha="abc1234" ts="2026-06-12T00:00:00.000Z" -->';
const AC_EVIDENCE =
  '<!-- aitm-ac-evidence:da1b55f9 cmd="npm test" exit=0 sha=abc1234 ts=2026-06-10T00:00:00.000Z -->';
const DOD_EVIDENCE = '<!-- aitm-dod-evidence: sandbox exit 0 -->';
const DECLARATION = '<!-- aitm-verified cmd="`npm test`" -->';

// ── walker unit behavior ────────────────────────────────────────────────────

test('walker returns exactly the lines newly carrying an execution-proof marker', () => {
  const before = '## DoD\n- [ ] verify behavior\n- [ ] verify other\n';
  const after = `## DoD\n- [x] verify behavior ${PROOF}\n- [x] verify other ${AC_EVIDENCE}\n`;
  const offenders = findNewlyIntroducedExecutionProof(before, after);
  assert.equal(offenders.length, 2);
  assert.equal(offenders[0].lineIndex, 1);
  assert.match(offenders[0].text, /verify behavior/);
  assert.equal(offenders[1].lineIndex, 2);
  assert.match(offenders[1].text, /verify other/);
});

test('walker flags an aitm-dod-evidence introduction', () => {
  const before = '- [ ] item\n';
  const after = `- [x] item ${DOD_EVIDENCE}\n`;
  const offenders = findNewlyIntroducedExecutionProof(before, after);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].lineIndex, 0);
});

test('walker ignores a declaration-only cmd marker (intent, not proof)', () => {
  const before = '- [ ] item\n';
  const after = `- [ ] item ${DECLARATION}\n`;
  assert.deepEqual(findNewlyIntroducedExecutionProof(before, after), []);
});

test('walker does not re-flag a proof line carried through unchanged', () => {
  const before = `- [x] done ${PROOF}\n## Notes\noriginal\n`;
  const after = `- [x] done ${PROOF}\n## Notes\nedited\n`;
  assert.deepEqual(findNewlyIntroducedExecutionProof(before, after), []);
});

test('walker does not flag ticking a box on a line that ALREADY carried proof', () => {
  // The /task check write path toggles `- [ ]` → `- [x]` on a line whose
  // ac-evidence stamp is already present. The line TEXT changes (the checkbox)
  // but no NEW proof marker is introduced — the diff must be at proof-marker
  // granularity, not whole-line, or this legitimate tick false-positives.
  const before = `- [ ] verify behavior ${AC_EVIDENCE}\n`;
  const after = `- [x] verify behavior ${AC_EVIDENCE}\n`;
  assert.deepEqual(findNewlyIntroducedExecutionProof(before, after), []);
});

test('walker flags a second copy of an already-present proof line', () => {
  const before = `- [x] a ${PROOF}\n`;
  const after = `- [x] a ${PROOF}\n- [x] b ${PROOF}\n`;
  const offenders = findNewlyIntroducedExecutionProof(before, after);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].lineIndex, 1);
  assert.match(offenders[0].text, /\] b /);
});

test('FabricatedProofError is re-exported from both modules (same class)', () => {
  assert.equal(FabricatedProofError, FPEFromInvariants);
});

// ── mutateIssueBody wire-in ─────────────────────────────────────────────────

const BASE = '## DoD\n- [ ] verify behavior\n<!-- aitm-body-version: 1 -->\n';

test('mutateIssueBody throws FabricatedProofError when proof is introduced without evidenceStamp', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 201,
      repo: 'fake/fake',
      mutate: (b) => b.replace('- [ ] verify behavior', `- [x] verify behavior ${PROOF}`),
      deps,
    }),
    (err) => {
      assert.ok(
        err instanceof FabricatedProofError,
        `expected FabricatedProofError, got ${err?.name}`
      );
      assert.equal(err.lines.length, 1);
      assert.match(err.lines[0].text, /- \[x\] verify behavior/);
      assert.match(err.message, /evidenceStamp/);
      return true;
    }
  );
  // Push never ran — body unchanged.
  assert.match(deps.getBody(), /- \[ \] verify behavior/);
});

test('mutateIssueBody permits the same introduction when evidenceStamp: true', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 202,
    repo: 'fake/fake',
    mutate: (b) => b.replace('- [ ] verify behavior', `- [x] verify behavior ${PROOF}`),
    deps,
    evidenceStamp: true,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /- \[x\] verify behavior/);
  assert.match(deps.getBody(), /aitm-verified/);
});

test('mutateIssueBody allows a non-proof edit without evidenceStamp', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 203,
    repo: 'fake/fake',
    mutate: (b) => b.replace('verify behavior', 'verify behavior carefully'),
    deps,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /verify behavior carefully/);
});

test('mutateIssueBody does not fire on a declaration-only cmd introduction', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 204,
    repo: 'fake/fake',
    mutate: (b) => b.replace('- [ ] verify behavior', `- [ ] verify behavior ${DECLARATION}`),
    deps,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /aitm-verified cmd=/);
});
