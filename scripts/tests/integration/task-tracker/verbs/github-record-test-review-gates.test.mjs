// @story #1143
import assert from 'node:assert/strict';
import test from 'node:test';

import { runReviewPreflight } from '../../../../task-tracker/lib/review-preflight.mjs';
import { developExitCodeCompleteGuard } from '../../../../task-tracker/lib/develop-exit-code-complete-guard.mjs';
import { developExitCommitTrailHeadGuard } from '../../../../task-tracker/lib/develop-exit-commit-trail-head-guard.mjs';
import { developExitSandboxProofGuard } from '../../../../task-tracker/lib/develop-exit-sandbox-proof-guard.mjs';
import { testExitDodVerifiedGuard } from '../../../../task-tracker/lib/test-exit-dod-verified-guard.mjs';
import { testExitPreCloseCompletenessGuard } from '../../../../task-tracker/lib/test-exit-pre-close-completeness-guard.mjs';
import { resolveReviewVerificationEvidence } from '../../../../task-tracker/verbs/review.mjs';
import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';

const issueNumber = 1143;
const repository = 'kburson/ai-task-manager';
const commitSha = 'a'.repeat(40);
const directoryBody = `<!-- aitm-last-known-state state="develop" ts="2026-08-08T00:00:00.000Z" -->

## AITM Progress Markers

<!-- aitm-directory
{"issueNodeId":"I_kwDOIssue","revision":1,"schema":"aitm.directory/v1","singletons":{"coordination":"IC_kwDOCoordination","delivery-contract":"IC_kwDOContract","evidence-projection":"IC_kwDOEvidence","timing":"IC_kwDOTiming"}}
-->`;

function acceptedDirectoryEvidence(overrides = {}) {
  return Object.freeze({
    sourceKind: 'github-records/v1',
    expectedSha: commitSha,
    evidence: Object.freeze([
      Object.freeze({
        recordId: '01J00000000000000000000001',
        recordType: 'verification-evidence',
        evidenceKind: 'test',
        result: 'passed',
        contractEpoch: 2,
        commitSha,
        provenance: 'agent',
        authority: Object.freeze({ grantId: '01J00000000000000000000002', epoch: 1 }),
      }),
    ]),
    acceptedRecordIds: Object.freeze(['01J00000000000000000000001']),
    authority: Object.freeze({
      contractRecordId: '01J00000000000000000000003',
      contractEpoch: 2,
      authorityEpoch: 1,
      coordinatorGrantId: '01J00000000000000000000002',
      commentNodeId: 'IC_kwDOContract',
    }),
    ...overrides,
  });
}

function legacyEvidence() {
  return Object.freeze({
    sourceKind: 'legacy-body/v1',
    expectedSha: commitSha,
    evidence: Object.freeze([]),
    acceptedRecordIds: Object.freeze([]),
    authority: null,
  });
}

test('Test accepts current accepted directory evidence without reading or rewriting body proof', async () => {
  const calls = { move: 0, mutate: 0, sandbox: 0, resolve: 0 };
  const acceptedEvidence = acceptedDirectoryEvidence();
  const result = await runVerbTest({
    cfg: { repo: repository },
    issueNumber,
    projectDir: process.cwd(),
    deps: {
      async fetchBody() {
        return directoryBody;
      },
      async getHeadSha() {
        return commitSha;
      },
      async resolveLifecycleEvidence(input) {
        calls.resolve += 1;
        assert.equal(input.repository, repository);
        assert.equal(input.issue, issueNumber);
        assert.equal(input.expectedSha, commitSha);
        return acceptedEvidence;
      },
      async moveState({ target, lifecycleEvidence }) {
        calls.move += 1;
        assert.equal(target, 'test');
        assert.equal(lifecycleEvidence, acceptedEvidence);
        return { ok: true };
      },
      async mutateBody() {
        calls.mutate += 1;
      },
      async createWorktree() {
        calls.sandbox += 1;
      },
    },
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.sourceKind, 'github-records/v1');
  assert.deepEqual(calls, { move: 1, mutate: 0, sandbox: 0, resolve: 1 });
});

test('shared Test and Review transition guards consume accepted directory evidence', async () => {
  const lifecycleEvidence = acceptedDirectoryEvidence();
  const ctx = {
    issueNumber,
    body: `${directoryBody}\n- [ ] stale visible checkbox`,
    lifecycleEvidence,
    toState: 'test',
    cfg: { repo: repository },
    deps: {
      codeCompleteGate: async () => {
        throw new Error('legacy code-complete gate must not run');
      },
      commitTrailHeadGate: async () => {
        throw new Error('legacy commit-trail gate must not run');
      },
    },
  };

  assert.deepEqual(await developExitCodeCompleteGuard.run(ctx), { ok: true });
  assert.deepEqual(developExitSandboxProofGuard.run(ctx), { ok: true });
  assert.deepEqual(await developExitCommitTrailHeadGuard.run(ctx), { ok: true });

  const reviewCtx = { ...ctx, toState: 'review' };
  assert.deepEqual(testExitDodVerifiedGuard.run(reviewCtx), { ok: true });
  assert.deepEqual(testExitPreCloseCompletenessGuard.run(reviewCtx), { ok: true });

  const withoutEvidence = developExitSandboxProofGuard.run({
    ...ctx,
    lifecycleEvidence: null,
  });
  assert.equal(withoutEvidence.ok, false);
  const staleEvidence = testExitDodVerifiedGuard.run({
    ...reviewCtx,
    lifecycleEvidence: acceptedDirectoryEvidence({ expectedSha: 'b'.repeat(40) }),
  });
  assert.equal(staleEvidence.ok, false);
});

test('Test fails closed before mutation when directory evidence is absent or invalid', async () => {
  for (const entry of [
    {
      name: 'missing accepted Test evidence despite stale visible body state',
      resolve: async () => acceptedDirectoryEvidence({ evidence: Object.freeze([]) }),
      code: 'directory-test-evidence-missing',
    },
    {
      name: 'old contract epoch',
      resolve: async () => {
        throw new Error('lifecycle-gate-source:contract-epoch');
      },
      code: 'lifecycle-gate-source:contract-epoch',
    },
    {
      name: 'wrong SHA',
      resolve: async () => {
        throw new Error('lifecycle-gate-source:sha');
      },
      code: 'lifecycle-gate-source:sha',
    },
    {
      name: 'stale coordinator authority',
      resolve: async () => {
        throw new Error('lifecycle-gate-source:authority');
      },
      code: 'lifecycle-gate-source:authority',
    },
  ]) {
    let mutated = false;
    let moved = false;
    const result = await runVerbTest({
      cfg: { repo: repository },
      issueNumber,
      projectDir: process.cwd(),
      deps: {
        fetchBody: async () => `${directoryBody}\n- [x] stale visible checkbox`,
        getHeadSha: async () => commitSha,
        resolveLifecycleEvidence: entry.resolve,
        mutateBody: async () => {
          mutated = true;
        },
        moveState: async () => {
          moved = true;
        },
      },
    });
    assert.equal(result.status, 'directory-evidence-invalid', entry.name);
    assert.equal(result.reasons[0].code, entry.code, entry.name);
    assert.equal(mutated, false, entry.name);
    assert.equal(moved, false, entry.name);
  }
});

test('Review preserves the legacy lane and requires accepted Test evidence for directory issues', async () => {
  const legacy = await resolveReviewVerificationEvidence({
    body: 'legacy body without a v1 receipt',
    issueNumber,
    repository,
    projectDir: process.cwd(),
    getHeadSha: async () => commitSha,
    resolveLifecycleEvidence: async () => legacyEvidence(),
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.mode, 'legacy-marker');

  const directory = await resolveReviewVerificationEvidence({
    body: directoryBody,
    issueNumber,
    repository,
    projectDir: process.cwd(),
    getHeadSha: async () => commitSha,
    resolveLifecycleEvidence: async () => acceptedDirectoryEvidence(),
  });
  assert.equal(directory.ok, true);
  assert.equal(directory.mode, 'github-records-v1');

  const missing = await resolveReviewVerificationEvidence({
    body: `${directoryBody}\n<!-- aitm-dod-verified sha="${commitSha}" -->`,
    issueNumber,
    repository,
    projectDir: process.cwd(),
    getHeadSha: async () => commitSha,
    resolveLifecycleEvidence: async () =>
      acceptedDirectoryEvidence({ evidence: Object.freeze([]) }),
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.mode, 'github-records-v1');
  assert.equal(missing.reasons[0].code, 'directory-test-evidence-missing');
});

function preflightDeps(body, resolveLifecycleEvidence) {
  return {
    gitStatus: async () => '',
    gitHeadSha: async () => commitSha,
    getIssueBody: async () => body,
    findTrailComment: async () => ({
      body: `### 🔗 Commits\n\n<!-- aitm-commits shas="${commitSha}" -->`,
    }),
    hasAttributingCommit: async () => true,
    resolveLifecycleEvidence,
  };
}

test('Review preflight reads directory lifecycle authority and retains legacy AC auditing', async () => {
  let resolved = 0;
  const directory = await runReviewPreflight({
    issueNumber,
    repo: repository,
    projectDir: process.cwd(),
    cfg: { repo: repository },
    deps: preflightDeps(directoryBody, async () => {
      resolved += 1;
      return acceptedDirectoryEvidence();
    }),
  });
  assert.equal(directory.ok, true);
  assert.equal(directory.lifecycleEvidence.sourceKind, 'github-records/v1');
  assert.equal(resolved, 1);

  const missing = await runReviewPreflight({
    issueNumber,
    repo: repository,
    projectDir: process.cwd(),
    cfg: { repo: repository },
    deps: preflightDeps(directoryBody, async () =>
      acceptedDirectoryEvidence({ evidence: Object.freeze([]) })
    ),
  });
  assert.equal(missing.ok, false);
  assert.match(missing.reasons[0], /directory-test-evidence-missing/);

  const legacyBody = `## Acceptance Criteria\n\n- [ ] missing evidence declaration`;
  const legacy = await runReviewPreflight({
    issueNumber,
    repo: repository,
    projectDir: process.cwd(),
    cfg: { repo: repository },
    deps: preflightDeps(legacyBody, async () => legacyEvidence()),
  });
  assert.equal(legacy.ok, false);
  assert.ok(legacy.reasons.some((reason) => reason.includes('missing `aitm-verified')));
});
