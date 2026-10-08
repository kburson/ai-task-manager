// @story #1855

import test from 'node:test';

import assert from 'node:assert/strict';
import { approvedFixture } from '../../../../helpers/criteria-revision-consumers.mjs';
import { versionedWriteBody } from '../../../../../task-tracker/lib/versioned-issue-write.mjs';
import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { observeRevision } from '../../../../../task-tracker/lib/criteria-revision/engine.mjs';

for (const corruption of [
  'criterion',
  'checkbox',
  'control',
  'scope',
  'stage',
  'proof-resource',
  'source-resource',
]) {
  test(`metadata continuation does not bless ${corruption} drift`, async () => {
    const { backend, context } = await approvedFixture();
    const changed = backend.observation;
    if (corruption === 'criterion')
      changed.body.bytes = changed.body.bytes.replace(
        'Independent requirement',
        'Different requirement'
      );
    if (corruption === 'checkbox')
      changed.body.bytes = changed.body.bytes.replace(
        '- [x] Independent requirement',
        '- [ ] Independent requirement'
      );
    if (corruption === 'control')
      changed.body.bytes = changed.body.bytes.replace(
        '<!-- aitm-plan-approved ',
        '<!-- aitm-plan-removed '
      );
    if (corruption === 'scope')
      changed.body.bytes = changed.body.bytes.replace('Synthetic scope', 'Changed scope');
    if (corruption === 'stage') changed.stage = 'review';
    if (corruption === 'proof-resource')
      changed.proofRecords.push({
        kind: 'test',
        identity: 'unbound-proof',
        bytes: 'unbound',
        criterionIdentity: null,
      });
    if (corruption === 'source-resource')
      changed.protectedSourceBindings[0].hash = 'sha256:' + 'f'.repeat(64);
    backend.replaceAuthority(changed);
    const current = await observeRevision({ context, deps: backend });
    assert.notEqual(current.status, 'applied', corruption);
  });
}

for (const [name, change] of [
  ['criterion', (body) => body.replace('Independent requirement', 'Different requirement')],
  ['source', (body) => body.replace('Synthetic scope', 'Changed scope')],
  ['proof', (body) => body + '\n<!-- aitm-test-receipt identity="invented" -->\n'],
  ['control', (body) => body.replace('<!-- aitm-plan-approved ', '<!-- aitm-plan-removed ')],
]) {
  test(`ordinary body ${name} change cannot reach transport under current revision admission`, async () => {
    const { backend, context } = await approvedFixture();
    let pushes = 0;
    let remote = backend.observation.body.bytes;
    await assert.rejects(
      versionedWriteBody({
        repo: context.repository,
        issueNumber: context.issue,
        mutate: change,
        deps: {
          revisionBackend: backend,
          fetchBody: async () => remote,
          pushBody: async (_repo, _issue, body) => {
            pushes++;
            remote = body;
          },
        },
      }),
      { code: 'criteria-revision-required' }
    );
    assert.equal(pushes, 0);
  });
}
import { withRevisionConsumer } from '../../../../../task-tracker/lib/criteria-revision/policy.mjs';
import {
  createVerificationReceipt,
  validateVerificationReceipt,
  validateVerificationReceiptStructure,
  parseValidatedVerificationReceiptClaims,
  upsertVerificationReceipt,
} from '../../../../../task-tracker/lib/verification-receipt.mjs';
import {
  projectRequirements,
  validateInputs,
} from '../../../../../task-tracker/lib/evidence-v2/subject-inputs.mjs';
import { logicalRecordFixture } from '../../../../helpers/evidence-v2/logical-records.mjs';

function receiptInput(issue) {
  return {
    issueNumber: issue,
    stage: 'test',
    fingerprint: {
      commitSha: 'a'.repeat(40),
      verificationCommands: [['node', '--test']],
      environment: {
        node: process.version,
        platform: 'test-platform',
        lockfileHash: hashBytes('lock'),
        configHashes: {},
        sandbox: { kind: 'worktree', identity: process.cwd(), clean: true },
      },
    },
    commands: [
      {
        classification: 'test-unit',
        command: 'npm',
        args: ['run', 'test:unit'],
        exitCode: 0,
        durationMs: 1,
      },
    ],
    now: () => '2026-10-01T00:00:00.000Z',
  };
}

async function inApprovedConsumer(fn, options) {
  const f = await approvedFixture(options);
  return withRevisionConsumer({ ...f.context, backend: f.backend, activity: 'body-write' }, () =>
    fn(f)
  );
}

test('verification receipt generator binds the actual held revision instead of caller binding strings', async () => {
  await inApprovedConsumer(async ({ backend, context }) => {
    const current = await observeRevision({ context, deps: backend });
    const receipt = createVerificationReceipt({
      ...receiptInput(context.issue),
      revisionBinding: { revisionId: 'forged' },
    });
    assert.deepEqual(receipt.revisionBinding, {
      schema: 'aitm.revision-evidence-binding/v1',
      repository: context.repository,
      issue: context.issue,
      revisionId: current.effectiveProposal.after.revisionId,
      semanticContractDigest: current.effectiveProposal.after.semanticContractDigest,
      contractEpoch: null,
      authorityEpoch: null,
    });
    assert.equal(
      validateVerificationReceipt({
        receipt,
        expectedIssue: context.issue,
        expectedStage: 'test',
        fingerprint: receiptInput(context.issue).fingerprint,
      }).ok,
      true
    );
  });
});

for (const mutation of ['missing', 'different-revision', 'different-digest', 'extra-key']) {
  test(`verification aggregate reader rejects ${mutation} revision binding`, async () => {
    await inApprovedConsumer(({ context }) => {
      const receipt = createVerificationReceipt(receiptInput(context.issue));
      if (mutation === 'missing') delete receipt.revisionBinding;
      else
        receipt.revisionBinding = {
          ...receipt.revisionBinding,
          [mutation === 'different-revision'
            ? 'revisionId'
            : mutation === 'different-digest'
              ? 'semanticContractDigest'
              : 'untrusted']: mutation === 'different-digest' ? hashBytes('other') : 'other',
        };
      const check = validateVerificationReceipt({
        receipt,
        expectedIssue: context.issue,
        expectedStage: 'test',
        fingerprint: receiptInput(context.issue).fingerprint,
      });
      assert.equal(check.ok, false);
      assert.throws(
        () =>
          parseValidatedVerificationReceiptClaims(upsertVerificationReceipt('', receipt), {
            expectedIssue: context.issue,
          }),
        /revision|malformed/
      );
    });
  });
}

test('requirements projection derives current revision binding and rejects stripped live inputs', async () => {
  await inApprovedConsumer(
    ({ backend, context }) => {
      const f = logicalRecordFixture();
      const requirements = projectRequirements({
        body: backend.observation.body.bytes,
        target: f.target,
        policy: f.input.requirements.policy,
      });
      assert.equal(requirements.revisionBinding?.issue, context.issue);
      assert.ok(requirements.revisionBinding?.revisionId);
      assert.doesNotThrow(() => validateInputs({ ...f.input, requirements }));
      const stripped = structuredClone(requirements);
      delete stripped.revisionBinding;
      assert.throws(() => validateInputs({ ...f.input, requirements: stripped }), /revision/);
    },
    { unstampedIndependent: true }
  );
});

test('never revised receipt generation preserves unbound historical format despite caller binding', () => {
  const receipt = createVerificationReceipt({
    ...receiptInput(124),
    revisionBinding: { revisionId: 'forged' },
  });
  assert.equal(Object.hasOwn(receipt, 'revisionBinding'), false);
  assert.equal(validateVerificationReceiptStructure({ receipt }).ok, true);
});
import { evaluateReuse } from '../../../../../task-tracker/lib/evidence-v2/eligibility.mjs';
import {
  encodeRecord,
  decodeRecord,
  evidenceDigest,
} from '../../../../../task-tracker/lib/evidence-v2/codec.mjs';

test('evidence-v2 reuse rejects unbound historical aggregates inside an actual current revision', async () => {
  await inApprovedConsumer(({ context }) => {
    const f = logicalRecordFixture();
    const candidate = f.make('candidate', f.candidate.payload, { issueNumber: context.issue });
    const verification = f.make('verification', f.verification.payload, {
      issueNumber: context.issue,
    });
    const result = evaluateReuse({ candidate, verification, policy: f.policy });
    assert.equal(result.status, 'refuse');
    assert.equal(result.reasons[0], 'revision-binding-mismatch');
  });
});

test('evidence-v2 subject codec retains a closed current binding and reuse rejects a stripped subject', async () => {
  await inApprovedConsumer(({ context }) => {
    const f = logicalRecordFixture();
    const receipt = createVerificationReceipt(receiptInput(context.issue));
    const { subjectId: oldId, ...identity } = f.candidate.payload.subject;
    const repositoryId = { ...f.repositoryId, nameWithOwner: context.repository };
    const revised = { ...identity, repositoryId, revisionBinding: receipt.revisionBinding };
    const subject = { ...revised, subjectId: evidenceDigest(revised) };
    const candidate = f.make(
      'candidate',
      { ...f.candidate.payload, subject },
      { issueNumber: context.issue, repositoryId }
    );
    const decoded = decodeRecord(encodeRecord(candidate));
    assert.deepEqual(decoded.payload.subject.revisionBinding, receipt.revisionBinding);
    const verification = f.make(
      'verification',
      { ...f.verification.payload, subjectId: subject.subjectId },
      { issueNumber: context.issue, repositoryId }
    );
    assert.equal(
      evaluateReuse({ candidate: decoded, verification, policy: f.policy }).status,
      'reuse'
    );
    const stripped = f.make('candidate', f.candidate.payload, { issueNumber: context.issue });
    assert.equal(
      evaluateReuse({ candidate: stripped, verification, policy: f.policy }).status,
      'refuse'
    );
    const extra = { ...revised, revisionBinding: { ...receipt.revisionBinding, authority: true } };
    assert.throws(
      () =>
        f.make('candidate', {
          ...f.candidate.payload,
          subject: { ...extra, subjectId: evidenceDigest(extra) },
        }),
      /binding/
    );
    assert.notEqual(subject.subjectId, oldId);
    assert.throws(
      () =>
        f.make(
          'candidate',
          { ...f.candidate.payload, subject },
          { issueNumber: context.issue + 1, repositoryId }
        ),
      /revision.*identity/
    );
    assert.throws(
      () =>
        f.make('candidate', { ...f.candidate.payload, subject }, { issueNumber: context.issue }),
      /revision.*identity/
    );
  });
});
import '../../../../../task-tracker/lib/guard-bootstrap.mjs';
