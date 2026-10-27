// @story #2096
import assert from 'node:assert/strict';
import { stampAgentReviewPassed } from '../../../../task-tracker/lib/agent-review/review-gate.mjs';
import { test } from 'node:test';
import { artifactRepository as repository } from '../../../helpers/artifact-repository.mjs';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

test('delivery authority selects unique source PR while preserving actual operator branch and HEAD', async (t) => {
  const { root, candidate, tree, operatorHead } = repository(t);
  const { resolveAcceptedDeliveryAuthority } =
    await import('../../../../task-tracker/lib/delivery-authority.mjs');
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  const input = {
    issueNumber: 2096,
    branch: 'controller',
    localHeadSha: operatorHead,
    testReceiptSha: candidate,
    reviewReceiptSha: candidate,
    agentReviewPassed: true,
    artifactSubject,
    pullRequests: [
      {
        number: 1,
        headRefOid: candidate,
        headRefName: 'codex/artifact',
        sourceCommitEvidence: [{ oid: candidate, tree }],
      },
    ],
  };
  const authority = resolveAcceptedDeliveryAuthority(input);
  assert.equal(authority.acceptedSha, candidate);
  assert.equal(authority.observedLocalHeadSha, operatorHead);
  assert.equal(authority.pullRequest.headRefName, 'codex/artifact');
  assert.throws(
    () =>
      resolveAcceptedDeliveryAuthority({
        ...input,
        artifactSubject: { ...artifactSubject, treeSha: '0'.repeat(40) },
      }),
    /artifact/
  );
  assert.throws(
    () =>
      resolveAcceptedDeliveryAuthority({
        ...input,
        pullRequests: [...input.pullRequests, { ...input.pullRequests[0], number: 2 }],
      }),
    /ambiguous/
  );
});

test('Close loader reads the artifact PR and retains actual controller authority', async (t) => {
  const { root, git, candidate, tree, operatorHead } = repository(t);
  const { loadCloseDeliveryGateInput } = await import('../../../../task-tracker/verbs/close.mjs');
  const {
    createVerificationReceipt,
    upsertVerificationReceipt,
    buildArtifactVerificationFingerprint,
  } = await import('../../../../task-tracker/lib/verification-receipt.mjs');
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
    fingerprint: (() => {
      const fingerprint = buildArtifactVerificationFingerprint({
        projectDir: root,
        artifactSubject,
        operatorContext,
        verificationCommands: [],
      });
      return {
        ...fingerprint,
        environment: {
          ...fingerprint.environment,
          sandbox: { kind: 'worktree', identity: root, clean: true },
        },
      };
    })(),
    commands: [
      ['lint-full', 'lint'],
      ['format-full', 'format:check'],
      ['test-unit', 'test:unit'],
      ['test-integration', 'test:integration'],
      ['test-slow', 'test:slow'],
    ].map(([classification, script]) => ({
      classification,
      command: 'npm',
      args: ['run', script],
      exitCode: 0,
      durationMs: 1,
    })),
    now: () => '2026-10-26T18:00:00.000Z',
  });
  const body = stampAgentReviewPassed(
    upsertVerificationReceipt(
      '## Definition of Done\n### Lifecycle (verified at Review)\n- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-10-26T18:00:00Z" sha="sandbox" validators="body-sections" result="pass" -->',
      receipt
    ) +
      `\n<!-- aitm-test-started: ${candidate}:2026-10-26T18:00:00Z -->\n<!-- aitm-dod-verified: ${candidate}:2026-10-26T18:00:00Z -->`,
    { ts: '2026-10-26T18:00:00Z', validators: ['body-sections'] }
  );
  let selected;
  const result = await loadCloseDeliveryGateInput({
    issueNumber: 2096,
    cfg: { repo: 'o/r', trunkRef: 'origin/trunk' },
    projectDir: root,
    body,
    lifecycleEvidence: null,
    pexec: async (command, args) => {
      if (command === 'git')
        return { stdout: execFileSync('git', args, { cwd: root, encoding: 'utf8' }) };
      if (command === 'gh' && args[0] === 'api') return { stdout: '[]' };
      throw new Error('unexpected authority read: ' + command + ' ' + args.join(' '));
    },
    ctx: {
      artifactSubject,
      captureArtifactOperator: () => operatorContext,
      resolveCloseParentIssue: async () => null,
      resolveLiveDeliveryReviewAuthority: async () => ({
        acceptedSha: candidate,
        outcome: 'passed',
      }),
      fetchCloseArtifactPullRequests: async (selection) => {
        selected = selection;
        return [
          {
            number: 1,
            state: 'MERGED',
            merged: true,
            mergedAt: '2026-10-26T18:00:00Z',
            headRefName: 'codex/artifact',
            headRefOid: candidate,
            baseRefName: 'trunk',
            mergeCommitSha: 'e'.repeat(40),
            sourceCommitEvidence: [{ oid: candidate, tree }],
          },
        ];
      },
    },
  });
  assert.deepEqual(selected, artifactSubject);
  assert.equal(result.branch, operatorContext.branch);
  assert.equal(result.observedLocalHeadSha, operatorHead);
  assert.equal(result.acceptedSha, candidate);
});

test('historical artifact reconstruction verifies a real single-source squash without moving the controller', async (t) => {
  const { root, git, tree, operatorHead } = repository(t);
  const { deliver, makeHarness } =
    await import('../../../unit/task-tracker/verbs/deliver-test-harness.mjs');
  const candidate = git('commit-tree', tree, '-p', operatorHead, '-m', '[#939] Source repair');
  const merged = git(
    'commit-tree',
    tree,
    '-p',
    operatorHead,
    '-m',
    '[#939] Source repair (#1400)',
    '-m',
    'Refs #939'
  );
  git('update-ref', 'refs/remotes/origin/trunk', merged);
  const artifactSubject = { commitSha: candidate, treeSha: tree };
  const source = { oid: candidate, parents: [operatorHead], tree, message: '[#939] Source repair' };
  const reconcile = {
    declaredMergeMethod: 'squash',
    reason: 'Reconstruct missing intent from independently verified source and merge objects.',
    operator: 'kburson',
  };
  const h = makeHarness({
    head: operatorHead,
    prHead: candidate,
    prState: 'MERGED',
    prMergeMethod: null,
    mergeCommitSha: merged,
    testReceiptSha: candidate,
    acceptedReviewSha: candidate,
    prCommitSubjects: [source.message],
    prSourceCommits: [{ oid: candidate, messageHeadline: source.message }],
    prSourceEvidence: [source],
    sourceCommitsHeadSha: candidate,
    issueBody: stampAgentReviewPassed(
      '## Definition of Done\n### Lifecycle (verified at Review)\n- [x] Agent Review Passed',
      { ts: '2026-10-26T18:00:00Z', validators: ['body-sections'] }
    ),
  });
  h.deps.listPullRequests = async ({ headSha }) => {
    assert.equal(headSha, candidate);
    return [{ number: h.data.prNumber }];
  };
  h.deps.getCurrentBranch = async () => git('branch', '--show-current');
  h.deps.assertArtifactDeliveryContext = async (input) => {
    assert.deepEqual(input.artifactSubject, artifactSubject);
    assert.equal(git('rev-parse', 'HEAD'), operatorHead);
  };
  h.deps.inspectMergeCommit = async ({ mergeCommitSha }) => {
    const message = git('show', '-s', '--format=%B', mergeCommitSha);
    const [commitTitle, ...rest] = message.split('\n');
    return {
      parents: git('show', '-s', '--format=%P', mergeCommitSha).split(' '),
      tree: git('show', '-s', '--format=%T', mergeCommitSha),
      commitTitle,
      commitMessage: rest.join('\n').trim(),
    };
  };
  h.deps.isAncestor = async ({ ancestor, descendant }) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
        cwd: root,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  };
  h.deps.resolveLocalTrunkHeadSha = async () => merged;
  h.deps.compareDeliveryContent = async ({
    sourceBase,
    sourceHead,
    integrationBase,
    integrationHead,
  }) => {
    assert.equal(sourceBase, operatorHead);
    assert.equal(integrationBase, operatorHead);
    return (
      git('rev-parse', `${sourceHead}^{tree}`) === git('rev-parse', `${integrationHead}^{tree}`)
    );
  };
  const result = await deliver(h, { artifactSubject, reconcile });
  assert.equal(result.status, 'delivered');
  assert.equal(result.mode, 'historical-reconstruction');
  assert.equal(result.receipt.mergeMethod, 'squash');
  assert.equal(result.receipt.mergeCommitSha, merged);
  assert.equal(result.intent.expectedHeadSha, candidate);
  assert.equal(result.intent.provider, 'external');
  assert.equal(result.action, null);
  assert.equal(git('rev-parse', 'HEAD'), operatorHead);
  const count = h.data.comments.length;
  const retry = await deliver(h, { artifactSubject, reconcile });
  assert.equal(retry.status, 'already-delivered');
  assert.equal(h.data.comments.length, count);
});
