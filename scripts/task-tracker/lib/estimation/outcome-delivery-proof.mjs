// Public immutable projections of freshly validated delivery/Test authority.
// This leaf validates shape and correlation; the registered Close callback owns
// fresh provider/receipt verification. A projection alone grants no delivery.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
const SHA = new RegExp('^[0-9a-f]{40}$');
const HASH = new RegExp('^[0-9a-f]{64}$');
const ID = new RegExp('^[0-7][0-9A-HJKMNP-TV-Z]{25}$');
const REPO = new RegExp('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');
const STORY_KINDS = ['code', 'docs-only', 'research', 'audit', 'spike'];
function fail() {
  throw new TypeError('estimation-record:telemetry-verification-proof');
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    fail();
}
function matches(pattern, value) {
  return typeof value === 'string' && pattern.test(value);
}
function shaList(values) {
  if (
    !Array.isArray(values) ||
    values.some((value) => !matches(SHA, value)) ||
    new Set(values).size !== values.length ||
    canonicalRecordJson(values) !== canonicalRecordJson([...values].sort())
  )
    fail();
}
export function outcomeProofDigest(value) {
  return createHash('sha256').update(canonicalRecordJson(value)).digest('hex');
}
export function validateOutcomeDeliveryProof(
  proof,
  { kind, issue, repository, verificationSha } = {}
) {
  const child = proof?.mode === 'child-lineage';
  const residentChild = proof?.mode === 'child-resident-delivery';
  exact(proof, [
    'mode',
    'issueKind',
    'recordId',
    'recordDigest',
    'acceptedSha',
    ...(child ? ['lineage', 'lineageDigest'] : []),
    ...(residentChild ? ['parentIssue', 'deliverableUrl'] : []),
    ...(Object.hasOwn(proof ?? {}, 'cascadeScope') ? ['cascadeScope'] : []),
  ]);
  if (
    !matches(SHA, verificationSha) ||
    proof.acceptedSha !== verificationSha ||
    !matches(ID, proof.recordId) ||
    !matches(HASH, proof.recordDigest)
  )
    fail();
  const story = kind === 'story' && STORY_KINDS.includes(proof.issueKind);
  const epic = kind === 'epic-orchestration' && proof.issueKind === 'epic';
  if (Object.hasOwn(proof, 'cascadeScope')) {
    const cascade = proof.cascadeScope;
    exact(cascade, [
      'schema',
      'repository',
      'parentIssue',
      'parentAcceptedSha',
      'approvalMode',
      'parentProofDigest',
      'childIssues',
    ]);
    if (
      (!child && !residentChild) ||
      cascade.schema !== 'aitm.cascade-outcome-authorization/v1' ||
      cascade.repository !== repository ||
      cascade.parentIssue !== (child ? proof.lineage?.parentIssue : proof.parentIssue) ||
      !Number.isSafeInteger(cascade.parentIssue) ||
      cascade.parentIssue <= 0 ||
      !matches(SHA, cascade.parentAcceptedSha) ||
      !matches(HASH, cascade.parentProofDigest) ||
      !['human', 'full-auto'].includes(cascade.approvalMode) ||
      !Array.isArray(cascade.childIssues) ||
      !cascade.childIssues.includes(issue) ||
      cascade.childIssues.some(
        (value) => !Number.isSafeInteger(value) || value <= 0 || value === cascade.parentIssue
      ) ||
      new Set(cascade.childIssues).size !== cascade.childIssues.length ||
      canonicalRecordJson(cascade.childIssues) !==
        canonicalRecordJson([...cascade.childIssues].sort((a, b) => a - b))
    )
      fail();
  }
  if (residentChild) {
    if (
      !story ||
      !['research', 'audit', 'spike'].includes(proof.issueKind) ||
      !Number.isSafeInteger(proof.parentIssue) ||
      proof.parentIssue <= 0 ||
      proof.parentIssue === issue ||
      typeof proof.deliverableUrl !== 'string'
    )
      fail();
    let url;
    try {
      url = new URL(proof.deliverableUrl);
    } catch {
      fail();
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail();
    return { requiresTestCommand: false };
  }
  if (proof.mode === 'exact-test' && story) return { requiresTestCommand: true };
  if (
    proof.mode === 'issue-resident-delivery' &&
    story &&
    ['research', 'audit', 'spike'].includes(proof.issueKind)
  ) {
    return { requiresTestCommand: false };
  }
  if (['merged-pr-delivery', 'local-trunk-delivery'].includes(proof.mode) && epic)
    return { requiresTestCommand: false };
  if (!child || (!story && !epic)) fail();
  const evidence = proof.lineage;
  exact(evidence, [
    'schema',
    'repository',
    'issue',
    'parentIssue',
    'acceptedSha',
    'targetBranch',
    'targetHead',
    'commits',
    'children',
  ]);
  if (
    evidence.schema !== 'aitm.lineage-delivery-evidence/v1' ||
    !matches(REPO, repository) ||
    evidence.repository !== repository ||
    !Number.isSafeInteger(issue) ||
    issue <= 0 ||
    evidence.issue !== issue ||
    !Number.isSafeInteger(evidence.parentIssue) ||
    evidence.parentIssue <= 0 ||
    evidence.parentIssue === issue ||
    evidence.acceptedSha !== verificationSha ||
    !matches(SHA, evidence.targetHead) ||
    typeof evidence.targetBranch !== 'string' ||
    !new RegExp('^[A-Za-z0-9][A-Za-z0-9._/-]*$').test(evidence.targetBranch) ||
    evidence.targetBranch.includes('..') ||
    proof.lineageDigest !== outcomeProofDigest(evidence)
  )
    fail();
  shaList(evidence.commits);
  if (!Array.isArray(evidence.children)) fail();
  const childIds = [];
  for (const entry of evidence.children) {
    exact(entry, ['issue', 'disposition', 'commits']);
    if (
      !Number.isSafeInteger(entry.issue) ||
      entry.issue <= 0 ||
      entry.issue === issue ||
      childIds.includes(entry.issue)
    )
      fail();
    childIds.push(entry.issue);
    shaList(entry.commits);
    if (entry.disposition === 'delivered') {
      if (!entry.commits.length) fail();
    } else if (entry.disposition === 'not-planned') {
      if (entry.commits.length) fail();
    } else fail();
  }
  if (canonicalRecordJson(childIds) !== canonicalRecordJson([...childIds].sort((a, b) => a - b)))
    fail();
  if (epic) {
    if (
      !evidence.children.length ||
      canonicalRecordJson(evidence.commits) !==
        canonicalRecordJson(
          [...new Set(evidence.children.flatMap((entry) => entry.commits))].sort()
        )
    )
      fail();
  } else if (evidence.children.length || !evidence.commits.length) fail();
  return { requiresTestCommand: !epic };
}
