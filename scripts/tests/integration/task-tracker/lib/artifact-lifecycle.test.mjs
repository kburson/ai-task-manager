// cspell:ignore optout
// @story #2096
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artifactRepository as repository } from '../../../helpers/artifact-repository.mjs';
import { realpathSync } from 'node:fs';

test('native Test interlock carries selected source while retaining operator project authority', async (t) => {
  const { root, candidate, tree } = repository(t);
  const { runTestWithEntryInterlock } = await import('../../../../task-tracker/verbs/test.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  const operatorContext = {
    sessionId: 'actual',
    boundIssue: 2096,
    bindingGenerationId: 'generation',
  };
  let observed;
  const result = await runTestWithEntryInterlock({
    cfg: { repo: 'o/r' },
    issueNumber: 2096,
    projectDir: root,
    artifactSubject,
    deps: {
      acquireIssueLock: async (_options, action) => action(),
      entryPreflight: async () => ({ status: 'ready', blockers: [] }),
      captureArtifactOperator: () => operatorContext,
      withArtifactSource: async (_options, action) => action({ sourceDir: '/selected-source' }),
      runVerbTest: async (input) => {
        observed = input;
        return { status: 'passed' };
      },
    },
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(observed.artifactSubject, artifactSubject);
  assert.deepEqual(observed.operatorContext, operatorContext);
  assert.equal(observed.sourceDir, '/selected-source');
  assert.equal(observed.projectDir, root);
});

test('commit trace attributes selected commit with actual operator branch and root', async (t) => {
  const { root, git, candidate, tree, operatorHead } = repository(t);
  const { gitInfo } = await import('../../../../task-tracker/commit-trail-handler.mjs');
  const result = await gitInfo(root, { artifactSubject: { commitSha: candidate, treeSha: tree } });
  assert.equal(result.sha, candidate);
  assert.match(result.subject, /candidate/);
  assert.equal(result.branch, git('branch', '--show-current'));
  assert.equal(git('rev-parse', 'HEAD'), operatorHead);
});

test('Develop receipt guard compares the artifact and fresh operator independently', async (t) => {
  const { root, candidate, tree, operatorHead } = repository(t);
  const { developExitReceiptGuard } =
    await import('../../../../task-tracker/lib/develop-exit-receipt-guard.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  const operatorContext = {
    sessionId: 'actual',
    worktreePath: root,
    branch: 'controller',
    headSha: operatorHead,
    boundIssue: 2096,
    bindingGenerationId: 'generation',
  };
  let receipt = {
    ok: true,
    stage: 'develop-final',
    commitSha: candidate,
    artifactSubject,
    operatorContext,
  };
  const context = {
    body: '## Scope\nArtifact acceptance',
    issueNumber: 2096,
    projectDir: root,
    headSha: operatorHead,
    artifactSubject,
    deps: { readDevelopReceipt: () => receipt, captureArtifactOperator: () => operatorContext },
  };
  assert.equal((await developExitReceiptGuard.run(context)).ok, true);
  receipt = { ...receipt, operatorContext: { ...operatorContext, sessionId: 'foreign' } };
  assert.equal((await developExitReceiptGuard.run(context)).ok, false);
  receipt = {
    ...receipt,
    operatorContext,
    artifactSubject: { ...artifactSubject, treeSha: '0'.repeat(40) },
  };
  assert.equal((await developExitReceiptGuard.run(context)).ok, false);
});

test('Review evidence compares selected source while retaining the caller checkout', async (t) => {
  const { root, git, candidate, tree, operatorHead } = repository(t);
  const { resolveReviewVerificationEvidence } =
    await import('../../../../task-tracker/verbs/review.mjs');
  const { createVerificationReceipt, upsertVerificationReceipt, canonicalVerificationCommandSet } =
    await import('../../../../task-tracker/lib/verification-receipt.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  const operatorContext = {
    sessionId: 'actual',
    worktreePath: root,
    branch: git('branch', '--show-current'),
    headSha: operatorHead,
    boundIssue: 2096,
    bindingGenerationId: 'generation',
  };
  const fingerprint = {
    commitSha: candidate,
    artifactSubject,
    operatorContext,
    verificationCommands: canonicalVerificationCommandSet([]),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: 'sha256:' + 'a'.repeat(64),
      configHashes: {},
      sandbox: { kind: 'worktree', identity: root, clean: true },
    },
  };
  const receipt = createVerificationReceipt({
    issueNumber: 2096,
    stage: 'test',
    fingerprint,
    commands: [],
    now: () => '2026-10-26T18:00:00.000Z',
  });
  const body = upsertVerificationReceipt(
    `<!-- aitm-test-started: ${candidate}:2026-10-26T18:00:00.000Z -->\n<!-- aitm-dod-verified: ${candidate}:2026-10-26T18:00:00.000Z -->`,
    receipt
  );
  let observed;
  await resolveReviewVerificationEvidence({
    body,
    issueNumber: 2096,
    projectDir: root,
    artifactSubject,
    operatorContext,
    getHeadSha: async () => operatorHead,
    buildFingerprint: async (input) => {
      observed = input;
      return fingerprint;
    },
  });
  assert.equal(observed.commitSha, candidate);
  assert.deepEqual(observed.artifactSubject, artifactSubject);
  assert.equal(observed.projectDir, root);
  assert.equal(git('rev-parse', 'HEAD'), operatorHead);
});

test('Review preflight retains actor HEAD and supplies explicit artifact to provenance audit', async (t) => {
  const { root, candidate, tree, operatorHead } = repository(t);
  const { runReviewPreflight } = await import('../../../../task-tracker/lib/review-preflight.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  let observed;
  const result = await runReviewPreflight({
    issueNumber: 2096,
    repo: 'o/r',
    projectDir: root,
    artifactSubject,
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => operatorHead,
      getIssueBody: async () => '## Scope\nSource acceptance',
      evidenceBranchReachability: async (input) => {
        observed = input;
        return { ok: true, reasons: [] };
      },
      findTrailComment: async () => ({
        body: `### 🔗 Commits\n<!-- aitm-commits shas="${candidate}" -->`,
      }),
      hasAttributingCommit: async () => true,
    },
  });
  assert.equal(result.headSha, operatorHead);
  assert.deepEqual(observed.artifactSubject, artifactSubject);
});

test('read-only Explain admits explicit source without treating it as actor HEAD', async () => {
  const { parseExplainInvocation, runExplain } =
    await import('../../../../task-tracker/verbs/explain.mjs');
  const commitSha = 'a'.repeat(40);
  const request = parseExplainInvocation([
    'explain',
    '2096',
    '--artifact-commit',
    commitSha,
    '--json',
  ]);
  assert.equal(request.artifactCommit, commitSha);
  let observed;
  await assert.rejects(
    runExplain(request, {
      evaluate: async (input) => {
        observed = input;
        throw new Error('test boundary');
      },
    }),
    /test boundary/
  );
  assert.equal(observed.artifactCommit, commitSha);
});

test('Promote forwards explicit source through its direct transition host', async () => {
  const { defaultRunMoveState } = await import('../../../../task-tracker/verbs/promote.mjs');
  const artifactSubject = { commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40) };
  let observed;
  await defaultRunMoveState(
    { issueNumber: 2096, target: 'test', projectDir: '/operator', artifactSubject },
    {
      host: async (input) => {
        observed = input;
        return 0;
      },
    }
  );
  assert.deepEqual(observed.artifactSubject, artifactSubject);
  assert.equal(observed.projectDir, '/operator');
});

test('approval stamps selected commit and refuses actor drift before durable write', async (t) => {
  const { root, git, candidate, tree, operatorHead } = repository(t);
  const { runApprove } = await import('../../../../task-tracker/verbs/approve.mjs');
  const { createVerificationReceipt, upsertVerificationReceipt } =
    await import('../../../../task-tracker/lib/verification-receipt.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  const operatorContext = {
    sessionId: 'actual',
    worktreePath: realpathSync(root),
    branch: git('branch', '--show-current'),
    headSha: operatorHead,
    boundIssue: 2096,
    bindingGenerationId: 'generation',
  };
  const receipt = createVerificationReceipt({
    issueNumber: 2096,
    stage: 'test',
    fingerprint: {
      commitSha: candidate,
      artifactSubject,
      operatorContext,
      verificationCommands: [],
      environment: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        lockfileHash: 'sha256:' + 'a'.repeat(64),
        configHashes: {},
        sandbox: { kind: 'worktree', identity: root, clean: true },
      },
    },
    commands: [],
    now: () => '2026-10-26T18:00:00.000Z',
  });
  const initial = upsertVerificationReceipt(
    '## Acceptance Criteria\n- [x] accepted\n\n## Definition of Done\n### Lifecycle\n- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-10-26T18:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->\n- [ ] Final Review Passed\n<!-- aitm-lifecycle-optout: passed-final-review -->\n',
    receipt
  );
  let body = initial;
  let actor = operatorContext;
  const deps = {
    assertBound() {},
    fetchIssueBody: async () => body,
    getBoardState: async () => 'review',
    getHeadSha: async () => operatorHead,
    captureArtifactOperator: () => actor,
    detectFullAuto: () => ({ fired: true, signals: 'test' }),
    fetchComments: async () => [],
    fetchProjectValues: async () => ({}),
    deriveDrivers: () => [],
    postComment: async () => {},
    reconcileReviewApprovedTiming: async () => ({}),
    mutateIssueBody: async ({ mutate, validateFreshBase }) => {
      await validateFreshBase?.(body);
      body = mutate(body);
      return { status: 'ok', body };
    },
  };
  const result = await runApprove({
    issueNumber: 2096,
    cfg: { repo: 'o/r' },
    projectDir: root,
    artifactSubject,
    deps,
  });
  assert.equal(result.status, 'approved');
  assert.match(body, new RegExp(`approved-sha="${candidate}"`));
  body = initial;
  deps.postComment = async () => {
    actor = { ...operatorContext, headSha: '0'.repeat(40) };
  };
  await assert.rejects(
    runApprove({
      issueNumber: 2096,
      cfg: { repo: 'o/r' },
      projectDir: root,
      artifactSubject,
      deps,
    }),
    /artifact.*operator/
  );
  assert.equal(body, initial);
});

test('Review and Close normalization projects artifact evidence while rechecking actual actor', async (t) => {
  const { root, candidate, tree, operatorHead } = repository(t);
  const { deriveAndRescan } = await import('../../../../task-tracker/lib/review-derive-rescan.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  const actor = { sessionId: 'actual', headSha: operatorHead };
  let observed;
  const deps = {
    captureArtifactOperator: () => actor,
    pexec: async () => ({ stdout: operatorHead }),
    readBack: async () => ({ body: '## Acceptance Criteria\n- [x] accepted', head: operatorHead }),
    refreshAndEvaluate: async ({ head }) => {
      observed = head;
      return { ok: true, status: 'ready', refusals: [], humanDecision: null };
    },
    mutateBody: async () => {
      throw new Error('unexpected write');
    },
  };
  await deriveAndRescan({
    issueNumber: 2096,
    repo: 'o/r',
    projectDir: root,
    artifactSubject,
    deps,
  });
  assert.equal(observed, candidate);
  let captures = 0;
  deps.captureArtifactOperator = () =>
    ++captures === 1 ? actor : { ...actor, sessionId: 'foreign' };
  await assert.rejects(
    deriveAndRescan({ issueNumber: 2096, repo: 'o/r', projectDir: root, artifactSubject, deps }),
    (error) => String(error.code).startsWith('normalization-')
  );
});

test('stamp receipt decisions fingerprint the selected tree instead of controller bytes', async (t) => {
  const { root, candidate, tree, operatorHead } = repository(t);
  const { decideStampExecutionFromEnv } =
    await import('../../../../task-tracker/lib/stamp-receipt-reuse.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  let observed;
  const result = await decideStampExecutionFromEnv({
    commands: ['git log -1'],
    body: '## Verification Commands\n- [ ] `git log -1`',
    issueNumber: 2096,
    cfg: { repo: 'o/r' },
    projectDir: root,
    artifactSubject,
    pexec: async () => ({ stdout: operatorHead }),
    deps: {
      getLiveState: async () => 'develop',
      captureArtifactOperator: () => ({ sessionId: 'actual' }),
      buildFingerprint: async (input) => {
        observed = input;
        return {};
      },
    },
  });
  assert.equal(result.headSha, candidate);
  assert.equal(observed.commitSha, candidate);
  assert.deepEqual(observed.artifactSubject, artifactSubject);
  assert.equal(observed.projectDir, root);
});

test('selected Test refuses fresh preflight blockers before materialization or dependency setup', async (t) => {
  const { root, candidate, tree } = repository(t);
  const { runTestWithEntryInterlock } = await import('../../../../task-tracker/verbs/test.mjs');
  let materializations = 0;
  const result = await runTestWithEntryInterlock({
    cfg: { repo: 'o/r' },
    issueNumber: 2096,
    projectDir: root,
    artifactSubject: { commitSha: candidate, treeSha: tree },
    deps: {
      acquireIssueLock: async (_options, action) => action(),
      entryPreflight: async () => ({
        status: 'blocked',
        blockers: [{ code: 'test-directory-evidence-invalid' }],
      }),
      captureArtifactOperator: () => ({}),
      withArtifactSource: async (_options, action) => {
        materializations++;
        return action({ sourceDir: root });
      },
      runVerbTest: async () => ({ status: 'incorrectly-executed' }),
    },
  });
  assert.equal(result.status, 'entry-preflight-refused');
  assert.equal(materializations, 0);
});
