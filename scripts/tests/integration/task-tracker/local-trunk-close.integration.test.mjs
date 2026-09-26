// @story #1825
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import {
  loadCloseLocalTrunkProof,
  requireCloseReceiptOrLocalTrunkProof,
} from '../../../task-tracker/lib/local-trunk-close-read-port.mjs';
import {
  canonicalVerificationCommandSet,
  createVerificationReceipt,
  upsertVerificationReceipt,
  VERIFICATION_COMMAND_IDENTITIES,
} from '../../../task-tracker/lib/verification-receipt.mjs';
import { parseVerificationCommands } from '../../../task-tracker/lib/verification-commands.mjs';
import { collectCloseReadiness } from '../../../task-tracker/lib/action-decision/close.mjs';
import { createObservationAttempt } from '../../../task-tracker/lib/action-decision/observations.mjs';
import { computeScopeIdentity } from '../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { buildDeliveryScope } from '../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import { parseAitmRecord } from '../../../task-tracker/lib/github-records/record-envelope.mjs';
import { hashAuthorizationStatement } from '../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
import {
  parseWorkflowExceptionRequest,
  runWorkflowException,
} from '../../../task-tracker/verbs/workflow-exception.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';
import {
  evaluateLocalTrunkCloseProof,
  collectLocalTrunkCloseProof,
  observeFreshLocalTrunkGraph,
  observeLocalTrunkGraph,
  parseCompletePullRequestPages,
} from '../../../task-tracker/lib/local-trunk-close-proof.mjs';

const SHA = 'a'.repeat(40);
const operation = '00000000000000000000000001';
const scopeIdentity = `sha256:${'f'.repeat(64)}`;
const scope = {
  schema: 'aitm.delivery-exception-scope/v1',
  repository: 'owner/repo',
  issue: 1825,
  exceptionKind: 'delivery.local-trunk-close-authorization',
  pullRequest: null,
  acceptedHeadSha: SHA,
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId: 'delivery.local-trunk-close-authorization',
  deliveryOperationId: operation,
};
const facts = () => ({
  repository: 'owner/repo',
  issue: 1825,
  state: 'review',
  topLevel: true,
  commitBearing: true,
  branchBound: true,
  worktreeBound: true,
  acceptedSha: SHA,
  testSha: SHA,
  reviewSha: SHA,
  localRef: 'trunk',
  remoteRef: 'origin/trunk',
  pullRequests: { complete: true, values: [] },
  graph: { complete: true, shallow: false, localContains: true, remoteContains: true },
  deliveryOperationId: operation,
  waiverScopeDigest: buildDeliveryScope(scope).waiverScopeDigest,
  scopeIdentity,
  grant: { scope, active: true, scopeIdentity },
});

test('pure proof admits only an exact, complete no-PR trunk case', () => {
  assert.equal(evaluateLocalTrunkCloseProof(facts()).outcome, 'authorized-local-trunk-close');
  const cases = [
    [{ testSha: 'b'.repeat(40) }, 'test-sha-mismatch'],
    [{ reviewSha: 'b'.repeat(40) }, 'review-sha-mismatch'],
    [
      { graph: { complete: true, shallow: false, localContains: true, remoteContains: false } },
      'remote-unreachable',
    ],
    [
      { graph: { complete: false, shallow: false, localContains: true, remoteContains: true } },
      'graph-incomplete',
    ],
    [
      { graph: { complete: true, shallow: true, localContains: true, remoteContains: true } },
      'graph-shallow',
    ],
    [{ pullRequests: { complete: false, values: [] } }, 'pr-inventory-incomplete'],
    [
      { pullRequests: { complete: true, values: [{ number: 1, headRefOid: SHA }] } },
      'pr-candidate',
    ],
    [
      { grant: { scope: { ...scope, issue: 1826 }, active: true, scopeIdentity } },
      'grant-scope-mismatch',
    ],
    [{ deliveryOperationId: '00000000000000000000000002' }, 'grant-scope-mismatch'],
  ];
  for (const [change, reasonId] of cases) {
    assert.equal(evaluateLocalTrunkCloseProof({ ...facts(), ...change }).reasonId, reasonId);
  }
});

test('complete paginated PR inventory rejects malformed pages', () => {
  assert.deepEqual(parseCompletePullRequestPages([[]], 'branch'), { complete: true, values: [] });
  assert.throws(() => parseCompletePullRequestPages([{}], 'branch'));
  assert.throws(() => parseCompletePullRequestPages([[{ number: 1 }]], 'branch'));
});

test('disposable Git graph observes accepted SHA on both independently named refs', async () => {
  const dir = await mkdtemp(join(projectScratchDir('test'), 'aitm-local-trunk-proof-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init', '-q', '-b', 'work');
    git('config', 'user.email', 'proof@example.test');
    git('config', 'user.name', 'Proof');
    git('commit', '--allow-empty', '-qm', 'accepted');
    const acceptedSha = git('rev-parse', 'HEAD');
    git('branch', 'trunk');
    git('update-ref', 'refs/remotes/origin/trunk', acceptedSha);
    const run = async (args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      if (result.status !== 0) {
        const error = new Error(result.stderr);
        error.code = result.status;
        throw error;
      }
      return result.stdout.trim();
    };
    const observed = await observeLocalTrunkGraph({
      acceptedSha,
      localRef: 'trunk',
      remoteRef: 'origin/trunk',
      run,
    });
    assert.equal(observed.complete, true);
    assert.equal(observed.localContains, true);
    assert.equal(observed.remoteContains, true);
    git('commit', '--allow-empty', '-qm', 'divergent');
    const divergentSha = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/trunk', divergentSha);
    assert.equal(
      (
        await observeLocalTrunkGraph({
          acceptedSha: divergentSha,
          localRef: 'trunk',
          remoteRef: 'origin/trunk',
          run,
        })
      ).localContains,
      false
    );
    git('tag', 'trunk', acceptedSha);
    git('checkout', '--orphan', 'unrelated');
    git('commit', '--allow-empty', '-qm', 'unrelated root');
    git('update-ref', 'refs/heads/trunk', git('rev-parse', 'HEAD'));
    assert.equal(
      (
        await observeLocalTrunkGraph({
          acceptedSha,
          localRef: 'trunk',
          remoteRef: 'origin/trunk',
          run,
        })
      ).localContains,
      false
    );
    await assert.rejects(
      observeLocalTrunkGraph({
        acceptedSha: 'b'.repeat(40),
        localRef: 'trunk',
        remoteRef: 'origin/trunk',
        run,
      })
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fresh remote tip and complete inventory are required by the shared collector', async () => {
  const dir = await mkdtemp(join(projectScratchDir('test'), 'aitm-local-trunk-remote-'));
  const git = (...args) => {
    const value = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (value.status !== 0) throw new Error(value.stderr);
    return value.stdout.trim();
  };
  try {
    git('init', '-q', '-b', 'work');
    git('config', 'user.email', 'proof@example.test');
    git('config', 'user.name', 'Proof');
    git('commit', '--allow-empty', '-qm', 'accepted');
    const acceptedSha = git('rev-parse', 'HEAD');
    git('branch', 'trunk');
    git('init', '--bare', '-q', join(dir, 'remote.git'));
    git('remote', 'add', 'origin', join(dir, 'remote.git'));
    git('push', '-q', 'origin', 'trunk');
    const runGit = async (args) => {
      const value = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      if (value.status !== 0) {
        const error = new Error(value.stderr);
        error.code = value.status;
        throw error;
      }
      return value.stdout.trim();
    };
    const observed = await observeFreshLocalTrunkGraph({
      acceptedSha,
      localRef: 'trunk',
      remote: 'origin',
      branch: 'trunk',
      run: runGit,
    });
    assert.equal(observed.remoteSha, acceptedSha);
    assert.equal(observed.remoteContains, true);
    const clone = spawnSync(
      'git',
      [
        'clone',
        '--quiet',
        '--depth',
        '1',
        '--branch',
        'trunk',
        `file://${join(dir, 'remote.git')}`,
        join(dir, 'shallow'),
      ],
      { cwd: dir, encoding: 'utf8' }
    );
    assert.equal(clone.status, 0, clone.stderr);
    const shallowRun = async (args) => {
      const value = spawnSync('git', args, { cwd: join(dir, 'shallow'), encoding: 'utf8' });
      if (value.status !== 0) throw new Error(value.stderr);
      return value.stdout.trim();
    };
    assert.equal(
      (
        await observeLocalTrunkGraph({
          acceptedSha,
          localRef: 'trunk',
          remoteRef: 'origin/trunk',
          run: shallowRun,
        })
      ).shallow,
      true
    );
    const eligible = {
      ...facts(),
      acceptedSha,
      testSha: acceptedSha,
      reviewSha: acceptedSha,
      grant: { active: true, scope: { ...scope, acceptedHeadSha: acceptedSha }, scopeIdentity },
      waiverScopeDigest: buildDeliveryScope({ ...scope, acceptedHeadSha: acceptedSha })
        .waiverScopeDigest,
    };
    const args = {
      facts: eligible,
      branch: 'work',
      remote: 'origin',
      remoteBranch: 'trunk',
      runGit,
      listPullRequestPages: async () => [[]],
    };
    assert.equal((await collectLocalTrunkCloseProof(args)).outcome, 'authorized-local-trunk-close');
    assert.equal(
      (
        await collectLocalTrunkCloseProof({
          ...args,
          listPullRequestPages: async () => {
            throw new Error('rate limit');
          },
        })
      ).reasonId,
      'pr-inventory-incomplete'
    );
    assert.equal(
      (
        await collectLocalTrunkCloseProof({
          ...args,
          listPullRequestPages: async () => [
            [{ number: 9, head: { ref: 'work', sha: acceptedSha }, base: { ref: 'trunk' } }],
          ],
        })
      ).reasonId,
      'pr-candidate'
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('locked Close consumes proof and refuses Done until the burn receipt exists', async () => {
  const gateInput = {
    lineage: { parentIssueNumber: null },
    pullRequests: [],
    body: '## Scope\ncode',
  };
  const noPr = () => {
    const error = new Error('no PR');
    error.category = 'ambiguous-pr';
    throw error;
  };
  let reads = 0;
  await assert.rejects(
    requireCloseReceiptOrLocalTrunkProof({
      gateInput,
      requireReceipt: noPr,
      readProof: async () => {
        reads += 1;
        return { outcome: 'authorized-local-trunk-close' };
      },
    }),
    (error) => error.message.includes('local-trunk-close-receipt-pending')
  );
  assert.equal(reads, 1);
  await assert.rejects(
    requireCloseReceiptOrLocalTrunkProof({
      gateInput,
      requireReceipt: noPr,
      readProof: async () => ({ outcome: 'indeterminate', reasonId: 'graph-incomplete' }),
    }),
    (error) => error.message.includes('local-trunk-close-proof:graph-incomplete')
  );
  const ordinary = { skipped: false, receipt: { result: 'delivered' } };
  assert.equal(
    await requireCloseReceiptOrLocalTrunkProof({
      gateInput,
      requireReceipt: () => ordinary,
      readProof: async () => {
        throw new Error('unexpected proof');
      },
    }),
    ordinary
  );
});

test('close read port gathers exact Review evidence and fresh PR and trunk observations', async () => {
  const acceptedSha = 'b'.repeat(40);
  const projectDir = process.cwd();
  const branch = 'codex/proof';
  const base = [
    '## User Story',
    'As an operator',
    'I want an exact close',
    'So that delivery is proven',
    '## Scope',
    'One issue.',
    '## Acceptance Criteria',
    '- [x] Exact close.',
    '## Verification Commands',
    '- [ ] `npm test`',
    '- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->',
    `<!-- aitm-review-approved ts="2026-09-26T08:00:00.000Z" approved-sha="${acceptedSha}" -->`,
    '<!-- aitm-last-known-state state="review" ts="2026-09-26T08:00:00.000Z" -->',
    `<!-- aitm-worktree-location worktree="${projectDir}" branch="${branch}" sid="test" ts="2026-09-26T08:00:00.000Z" -->`,
  ].join('\n');
  const verificationCommands = canonicalVerificationCommandSet(parseVerificationCommands(base), {
    projectDir,
  });
  const receipt = createVerificationReceipt({
    issueNumber: 1825,
    stage: 'test',
    fingerprint: {
      commitSha: acceptedSha,
      verificationCommands,
      environment: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        lockfileHash: `sha256:${'a'.repeat(64)}`,
        configHashes: {},
        sandbox: { kind: 'worktree', identity: projectDir, clean: true },
      },
    },
    commands: Object.entries(VERIFICATION_COMMAND_IDENTITIES).map(([classification, identity]) => ({
      classification,
      command: identity.command,
      args: [...identity.args],
      exitCode: 0,
      durationMs: 1,
    })),
    now: () => '2026-09-26T08:00:00.000Z',
  });
  const body = upsertVerificationReceipt(base, receipt);
  const scoped = { ...scope, acceptedHeadSha: acceptedSha };
  const grant = {
    active: true,
    scope: scoped,
    scopeIdentity: computeScopeIdentity({ repository: 'owner/repo', issue: 1825, body }),
    deliveryOperationId: operation,
    waiverScopeDigest: buildDeliveryScope(scoped).waiverScopeDigest,
  };
  const calls = [];
  const pexec = async (command, args) => {
    calls.push([command, args]);
    if (command === 'gh') return { stdout: '[[]]' };
    if (args[0] === 'branch') return { stdout: branch };
    if (args[0] === 'ls-remote') return { stdout: `${acceptedSha}\trefs/heads/trunk\n` };
    if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository')
      return { stdout: 'false' };
    if (args[0] === 'rev-parse' && args[1] === '--verify') return { stdout: acceptedSha };
    if (args[0] === 'cat-file' || args[0] === 'merge-base') return { stdout: '' };
    throw new Error(`unexpected ${command} ${args.join(' ')}`);
  };
  const result = await loadCloseLocalTrunkProof({
    gateInput: {
      body,
      branch,
      issueNumber: 1825,
      acceptedSha,
      lineage: { parentIssueNumber: null },
    },
    grant,
    cfg: { repo: 'owner/repo', trunkRef: 'origin/trunk' },
    projectDir,
    pexec,
    fetchRemoteTip: false,
    deliveryOperationId: operation,
    waiverScopeDigest: grant.waiverScopeDigest,
  });
  assert.equal(result.outcome, 'authorized-local-trunk-close');
  assert.ok(calls.some(([command, args]) => command === 'gh' && args.includes('--paginate')));
  assert.ok(
    calls.some(([command, args]) => command === 'git' && args.includes('refs/heads/trunk^{commit}'))
  );
  const mismatch = await loadCloseLocalTrunkProof({
    gateInput: {
      body,
      branch,
      issueNumber: 1825,
      acceptedSha,
      lineage: { parentIssueNumber: null },
    },
    grant,
    cfg: { repo: 'owner/repo', trunkRef: 'origin/trunk' },
    projectDir,
    pexec,
    fetchRemoteTip: false,
    deliveryOperationId: '00000000000000000000000002',
    waiverScopeDigest: grant.waiverScopeDigest,
  });
  assert.equal(mismatch.reasonId, 'grant-scope-mismatch');

  const records = [];
  let exactStatement;
  const runtime = {
    async fetchIssue() {
      return { number: 1825, body };
    },
    async fetchDeliveryFacts() {
      return {
        repository: 'owner/repo',
        issue: 1825,
        scopeIdentity: grant.scopeIdentity,
        pullRequest: null,
        acceptedHeadSha: acceptedSha,
        baseRef: 'trunk',
        resolvedTrunkRef: 'origin/trunk',
        originalIntentRecordId: null,
        prior: null,
        now: '2026-09-26T08:00:00.000Z',
        existingDeliveryRecords: records,
      };
    },
    async listRecords() {
      return [...records];
    },
    async resolveAuthority() {
      return {
        status: 'verified',
        authority: {
          reference: 'codex://sessions/01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed/messages/msg_local',
          statement: exactStatement,
          principal: null,
          recordingActor: 'codex/session:01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
          origin: 'codex-session-transcript',
          verificationLevel: 'host-verified-user-message',
        },
      };
    },
    async appendRecord({ body: comment }) {
      records.push({
        ...parseAitmRecord({
          commentNodeId: 'IC_local_1825',
          body: comment,
          expectedRepository: 'owner/repo',
          expectedIssue: 1825,
        }),
        body: comment,
      });
    },
    nextIds() {
      return { recordId: '01M2H000000000000000000012', grantId: '01M2H000000000000000000013' };
    },
  };
  const draft = await runWorkflowException({
    action: 'prepare',
    issues: [1825],
    repository: 'owner/repo',
    request: {
      schema: 'aitm.local-trunk-close-proposal/v1',
      action: 'record',
      exceptionId: null,
      priorRecordId: null,
      priorRevision: null,
      requirementId: 'delivery.local-trunk-close-authorization',
      reason: 'The operator accepts this exact verified no-PR close.',
      expiresAt: '2026-09-27T08:00:00.000Z',
      deliveryOperationId: null,
    },
    now: '2026-09-26T08:00:00.000Z',
    runtime,
  });
  assert.equal(draft.status, 'prepared');
  exactStatement = draft.results[0].statement;
  const recorded = await runWorkflowException({
    action: 'record',
    issues: [1825],
    repository: 'owner/repo',
    request: parseWorkflowExceptionRequest(
      {
        ...draft.results[0].request,
        authorizationSource: {
          schema: 'aitm.authorization-source/v1',
          adapter: 'codex-session/v1',
          sessionId: '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed',
          messageId: 'msg_local',
          statementHash: hashAuthorizationStatement(exactStatement),
        },
      },
      { action: 'record' }
    ),
    now: '2026-09-26T08:00:00.000Z',
    runtime,
  });
  assert.equal(recorded.status, 'recorded', JSON.stringify(recorded));
  let verified = 0;
  const readStored = (verifyStoredAuthority) =>
    loadCloseLocalTrunkProof({
      gateInput: {
        body,
        branch,
        issueNumber: 1825,
        acceptedSha,
        lineage: { parentIssueNumber: null },
      },
      cfg: { repo: 'owner/repo', trunkRef: 'origin/trunk' },
      projectDir,
      pexec,
      fetchRemoteTip: false,
      listGrantRecords: async () => [[{ node_id: 'IC_local_1825', body: records[0].body }]],
      verifyStoredAuthority,
    });
  assert.equal(
    (
      await readStored(async () => {
        verified += 1;
      })
    ).outcome,
    'authorized-local-trunk-close'
  );
  assert.equal(verified, 1);
  await assert.rejects(
    readStored(async () => {
      throw new Error('source missing');
    }),
    /source missing/
  );
});

test('Explain consumes local proof and stays blocked before a burn receipt', async () => {
  const issue = 1825;
  const body = [
    '## User Story',
    'Close safely',
    '## Scope',
    'Read-only close',
    '## Acceptance Criteria',
    '- [x] Close safely',
    '<!-- aitm-last-known-state state="review" ts="2026-09-26T08:00:00Z" -->',
  ].join('\n');
  const sha = 'a'.repeat(40);
  const values = {
    'issue-body': { number: issue, body, state: 'OPEN' },
    'project-board': { state: 'review' },
    worktree: { matches: true, headSha: sha },
    [`evidence:${issue}:1`]: {
      mode: 'ordinary',
      gateInput: {
        issueNumber: issue,
        repository: 'owner/repo',
        body,
        branch: 'codex/proof',
        acceptedSha: sha,
        lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
        pullRequests: [],
      },
    },
    [`evidence:${issue}:2`]: {
      status: 'attributed',
      tip: {
        status: 'observed',
        remote: 'origin',
        ref: 'refs/heads/trunk',
        sha,
        objectComplete: true,
        shallow: false,
      },
    },
    [`evidence:${issue}:3`]: { complete: true, children: [] },
  };
  const attempt = createObservationAttempt({
    repository: 'owner/repo',
    issue,
    boundaryId: 'local-trunk-close-test',
    now: () => '2026-09-26T08:00:00.000Z',
    read: async (request) => ({
      ...request,
      value: values[request.identity] ?? values[request.resource],
    }),
  });
  let reads = 0;
  const result = await collectCloseReadiness({
    issue,
    attempt,
    ports: {
      scope: computeScopeIdentity({ repository: 'owner/repo', issue, body }),
      cfg: { repo: 'owner/repo' },
      head: sha,
      projectDir: process.cwd(),
      evaluatedAt: '2026-09-26T08:00:00.000Z',
      readLocalTrunkProof: async () => {
        reads += 1;
        return { outcome: 'authorized-local-trunk-close', reasonId: null };
      },
      runGuards: async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null }),
    },
  });
  assert.equal(reads, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.deliveryExceptions[0].outcome, 'authorized-local-trunk-close');
});
