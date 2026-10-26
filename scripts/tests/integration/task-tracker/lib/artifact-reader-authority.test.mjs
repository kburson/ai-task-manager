// @story #2096
import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactRepository } from '../../../helpers/artifact-repository.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { captureArtifactOperator } from '../../../../task-tracker/lib/artifact-execution.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
  buildArtifactVerificationFingerprint,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { stampAgentReviewPassed } from '../../../../task-tracker/lib/agent-review/review-gate.mjs';
import { assertReviewedDeclarations } from '../../../../task-tracker/lib/issue-proof-authority.mjs';
import { createDefaultDeliverDeps } from '../../../../task-tracker/verbs/deliver.mjs';
import { loadCloseDeliveryGateInput } from '../../../../task-tracker/verbs/close.mjs';
import { makeHarness, deliver } from '../../../unit/task-tracker/verbs/deliver-test-harness.mjs';
const { sid } = initializeFixtureActor(import.meta.url);
function fixture(t, commands, issueNumber = 939) {
  const r = artifactRepository(t);
  setActiveTask(
    sid,
    {
      issue: issueNumber,
      bindingGenerationId: 'fixture',
      worktreePath: r.root,
      worktreeBranch: r.git('branch', '--show-current'),
      entryStartTs: '2026-10-26T20:00:00.000Z',
    },
    r.root
  );
  const artifactSubject = { commitSha: r.candidate, treeSha: r.tree };
  const operatorContext = captureArtifactOperator({ projectDir: r.root, issueNumber });
  const fingerprint = buildArtifactVerificationFingerprint({
    projectDir: r.root,
    artifactSubject,
    operatorContext,
    verificationCommands: [],
  });
  fingerprint.environment.sandbox = { kind: 'worktree', identity: r.root, clean: true };
  const receipt = createVerificationReceipt({
    issueNumber,
    stage: 'test',
    fingerprint,
    commands,
    now: () => '2026-10-26T20:00:00.000Z',
  });
  const base =
    '## Definition of Done\n### Lifecycle (verified at Review)\n- [x] Agent Review Passed\n' +
    `<!-- aitm-test-started: ${r.candidate}:2026-10-26T20:00:00.000Z -->\n<!-- aitm-dod-verified: ${r.candidate}:2026-10-26T20:00:00.000Z -->`;
  const body = stampAgentReviewPassed(upsertVerificationReceipt(base, receipt), {
    ts: '2026-10-26T20:00:00.000Z',
    validators: ['body-sections'],
  });
  return { ...r, artifactSubject, operatorContext, receipt, body };
}
const commands = [
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
}));
test('full reviewed Test payload is bound across commands, including same-ID replacement', (t) => {
  const f = fixture(t, commands);
  assert.doesNotThrow(() => assertReviewedDeclarations(f.body));
  for (const receipt of [
    { ...f.receipt, commands: [] },
    { ...f.receipt, receiptId: '0'.repeat(26) },
  ])
    assert.throws(
      () => assertReviewedDeclarations(upsertVerificationReceipt(f.body, receipt)),
      /Review declarations/
    );
});
test('native delivery refuses incomplete current Test evidence even with matching Review digest', async (t) => {
  const f = fixture(t, []);
  assert.doesNotThrow(() => assertReviewedDeclarations(f.body));
  const h = makeHarness({
    head: f.candidate,
    issueBody: f.body,
    prSourceEvidence: [{ oid: f.candidate, tree: f.tree }],
  });
  const native = createDefaultDeliverDeps(
    { projectDir: f.root, cfg: { repo: 'kburson/ai-task-manager' } },
    {
      exec: async () => {
        throw new Error('unexpected network');
      },
    }
  );
  h.deps.assertArtifactDeliveryContext = native.assertArtifactDeliveryContext;
  h.deps.getCurrentBranch = async () => f.operatorContext.branch;
  h.deps.getLocalHeadSha = async () => f.operatorHead;
  h.deps.listPullRequests = async () => [{ number: h.data.prNumber }];
  h.deps.listCommitSubjects = async () => h.data.commitSubjects;
  await assert.rejects(
    deliver(h, { artifactSubject: f.artifactSubject }),
    /current Test evidence invalid/
  );
  assert.equal(h.calls.createIssueComment, 0);
});
test('native Close loader refuses incomplete Test evidence before reading delivery facts', async (t) => {
  const f = fixture(t, []);
  let reads = 0;
  await assert.rejects(
    loadCloseDeliveryGateInput({
      issueNumber: 939,
      cfg: { repo: 'kburson/ai-task-manager' },
      projectDir: f.root,
      body: f.body,
      lifecycleEvidence: null,
      pexec: async (_command, args) => ({
        stdout: args[0] === 'branch' ? f.operatorContext.branch : f.operatorHead,
      }),
      ctx: {
        artifactSubject: f.artifactSubject,
        resolveCloseParentIssue: async () => null,
        fetchCloseArtifactPullRequests: async () => {
          reads++;
          throw new Error('should not read PR');
        },
      },
    }),
    /current Test evidence invalid/
  );
  assert.equal(reads, 0);
});

for (const drift of [false, true, 'publication'])
  test(`native incomplete-timing outcome retains artifact authority (drift=${drift})`, async (t) => {
    const { harness, issue, forecastId, repository } =
      await import('../../../helpers/1857-timing-outcome-harness.mjs');
    const f = fixture(t, commands, issue);
    const gate = {
      gateInput: {
        repository,
        issueNumber: issue,
        body: f.body,
        acceptedSha: f.candidate,
        lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
        artifactSubject: f.artifactSubject,
        operatorContext: f.operatorContext,
      },
      deliveryBody: f.body,
      testReceiptSha: f.candidate,
      acceptedReviewSha: f.candidate,
      receipt: { skipped: false },
    };
    let authorityReads = 0;
    const h = harness({
      projectDir: f.root,
      acceptedSha: f.candidate,
      resolveDeliveryAuthority: async () => {
        authorityReads++;
        if (drift === true || (drift === 'publication' && authorityReads > 1))
          setActiveTask(
            sid,
            {
              issue,
              bindingGenerationId: 'changed',
              worktreePath: f.root,
              worktreeBranch: f.operatorContext.branch,
              entryStartTs: '2026-10-26T20:00:00.000Z',
            },
            f.root
          );
        return gate;
      },
    });
    const run = () =>
      h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body: f.body });
    if (drift) {
      await assert.rejects(run(), /artifact: operator binding changed/);
      assert.equal(h.records.length, 1);
      return;
    }
    const result = await run();
    assert.equal(result.status, 'written');
    const outcome = h.records.at(-1).envelope.payload;
    assert.equal(outcome.actual.engagedHours, null);
    assert.equal(outcome.telemetry.verification.acceptedSha, f.candidate);
    assert.equal(outcome.telemetry.verification.recordId, f.receipt.receiptId);
    assert.equal(outcome.telemetry.source.snapshot, h.getTiming());
  });
