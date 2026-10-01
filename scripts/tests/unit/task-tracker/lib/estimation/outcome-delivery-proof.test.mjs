// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { validateOutcomeDeliveryProof } from '../../../../../task-tracker/lib/estimation/outcome-delivery-proof.mjs';
const head = 'a'.repeat(40),
  commit = 'c'.repeat(40);
const common = {
  recordId: '01J00000000000000000000810',
  recordDigest: '1'.repeat(64),
  acceptedSha: head,
};
const context = { kind: 'story', issue: 1857, repository: 'owner/repo', verificationSha: head };
const lineage = {
  schema: 'aitm.lineage-delivery-evidence/v1',
  repository: 'owner/repo',
  issue: 1857,
  parentIssue: 1847,
  acceptedSha: head,
  targetBranch: 'codex/1847',
  targetHead: 'b'.repeat(40),
  commits: [commit],
  children: [],
};
const hash = (value) => createHash('sha256').update(canonicalRecordJson(value)).digest('hex');
const child = () => ({
  ...common,
  mode: 'child-lineage',
  issueKind: 'code',
  lineage: structuredClone(lineage),
  lineageDigest: hash(lineage),
});
test('cascade proof retains closed parent approval scope without replacing child work proof', () => {
  const proof = child();
  proof.cascadeScope = {
    schema: 'aitm.cascade-outcome-authorization/v1',
    repository: 'owner/repo',
    parentIssue: 1847,
    parentAcceptedSha: 'e'.repeat(40),
    approvalMode: 'full-auto',
    parentProofDigest: 'f'.repeat(64),
    childIssues: [1857, 1858],
  };
  assert.equal(validateOutcomeDeliveryProof(proof, context).requiresTestCommand, true);
  for (const patch of [
    { parentIssue: 1848 },
    { repository: 'other/repo' },
    { childIssues: [1858] },
    { childIssues: [1857, 1857] },
    { approvalMode: 'missing' },
    { parentProofDigest: null },
    { parentAcceptedSha: 'bad' },
    { callerAccepted: true },
  ]) {
    assert.throws(() =>
      validateOutcomeDeliveryProof(
        { ...proof, cascadeScope: { ...proof.cascadeScope, ...patch } },
        context
      )
    );
  }
  assert.throws(() =>
    validateOutcomeDeliveryProof(
      {
        ...common,
        mode: 'exact-test',
        issueKind: 'code',
        cascadeScope: proof.cascadeScope,
      },
      context
    )
  );
});

test('child resident proof binds real Test identity, parent and posted deliverable without a receipt ID', () => {
  const proof = {
    ...common,
    mode: 'child-resident-delivery',
    issueKind: 'research',
    parentIssue: 1847,
    deliverableUrl: 'https://example.test/report',
  };
  assert.equal(validateOutcomeDeliveryProof(proof, context).requiresTestCommand, false);
  for (const patch of [
    { parentIssue: 1857 },
    { parentIssue: null },
    { deliverableUrl: '' },
    { deliverableUrl: 'javascript:alert(1)' },
    { issueKind: 'code' },
  ]) {
    assert.throws(() => validateOutcomeDeliveryProof({ ...proof, ...patch }, context));
  }
});

test('closed proof matrix preserves exact Test requirements and genuine no-command lanes', () => {
  for (const issueKind of ['code', 'docs-only']) {
    assert.equal(
      validateOutcomeDeliveryProof({ ...common, mode: 'exact-test', issueKind }, context)
        .requiresTestCommand,
      true
    );
  }
  for (const issueKind of ['research', 'audit', 'spike']) {
    assert.equal(
      validateOutcomeDeliveryProof(
        { ...common, mode: 'issue-resident-delivery', issueKind },
        context
      ).requiresTestCommand,
      false
    );
  }
  for (const mode of ['merged-pr-delivery', 'local-trunk-delivery']) {
    assert.equal(
      validateOutcomeDeliveryProof(
        { ...common, mode, issueKind: 'epic' },
        { ...context, kind: 'epic-orchestration' }
      ).requiresTestCommand,
      false
    );
  }
  assert.equal(validateOutcomeDeliveryProof(child(), context).requiresTestCommand, true);
});
test('child proof binds source census, parent, repository, issue and head without synthetic acceptance identity', () => {
  for (const mutate of [
    (value) => {
      value.lineage.issue++;
    },
    (value) => {
      value.lineage.repository = 'other/repo';
    },
    (value) => {
      value.lineage.parentIssue = 1857;
    },
    (value) => {
      value.lineage.parentIssue = null;
    },
    (value) => {
      value.lineage.acceptedSha = 'd'.repeat(40);
    },
    (value) => {
      value.lineage.commits = [];
    },
    (value) => {
      value.lineage.commits.push(commit);
    },
    (value) => {
      value.lineage.targetHead = 'unknown';
    },
    (value) => {
      value.lineage.recordId = 'invented';
    },
  ]) {
    const proof = child();
    mutate(proof);
    proof.lineageDigest = hash(proof.lineage);
    assert.throws(() => validateOutcomeDeliveryProof(proof, context));
  }
  const changed = child();
  changed.lineageDigest = '2'.repeat(64);
  assert.throws(() => validateOutcomeDeliveryProof(changed, context));
});
test('sub-epic proof keeps explicit child disposition and complete attributed census', () => {
  const proof = child();
  proof.issueKind = 'epic';
  proof.lineage.children = [
    { issue: 1858, disposition: 'delivered', commits: [commit] },
    { issue: 1859, disposition: 'not-planned', commits: [] },
  ];
  proof.lineageDigest = hash(proof.lineage);
  assert.equal(
    validateOutcomeDeliveryProof(proof, { ...context, kind: 'epic-orchestration' })
      .requiresTestCommand,
    false
  );
  proof.lineage.children[1].disposition = 'unknown';
  proof.lineageDigest = hash(proof.lineage);
  assert.throws(() =>
    validateOutcomeDeliveryProof(proof, { ...context, kind: 'epic-orchestration' })
  );
});
test('caller flags and mismatched lane modes do not authorize incomplete telemetry', () => {
  for (const proof of [
    { unavailable: true },
    { ...common, mode: 'skipped', issueKind: 'code' },
    { ...common, mode: 'issue-resident-delivery', issueKind: 'code' },
    { ...common, mode: 'merged-pr-delivery', issueKind: 'code' },
    { ...common, mode: 'exact-test', issueKind: 'code', acceptedSha: 'b'.repeat(40) },
  ]) {
    assert.throws(() => validateOutcomeDeliveryProof(proof, context));
  }
});
