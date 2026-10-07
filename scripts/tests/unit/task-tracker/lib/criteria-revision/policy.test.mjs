// @story #1855
import test from 'node:test';
import { runPlanApprove } from '../../../../../task-tracker/verbs/plan-approve.mjs';
import { createRevisionMemory } from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import path from 'node:path';
import { evaluateLocalRevisionActivity } from '../../../../../task-tracker/lib/criteria-revision/policy.mjs';
import assert from 'node:assert/strict';
import { fixture, approvedFixture } from '../../../../helpers/criteria-revision-consumers.mjs';
import { versionedWriteBody } from '../../../../../task-tracker/lib/versioned-issue-write.mjs';
import { mutateIssueBody } from '../../../../../task-tracker/lib/issue-body-mutate.mjs';

for (const [name, adapter] of [['versionedWriteBody', versionedWriteBody], ['mutateIssueBody', mutateIssueBody]]) {
  for (const [state, status, code] of [['pending', 'blocked', 'revision-pending'], ['stale', 'blocked', 'revision-approval-stale'], ['unavailable', 'indeterminate', 'revision-authority-unavailable']]) {
    test(`${name} ${state} authority refuses before caller transformation or transport effects`, async () => {
      const { backend, context } = await fixture(state);
      const effects = [];
      let remote = backend.observation.body.bytes;
      let result;
      try {
        result = await adapter({ repo: context.repository, issueNumber: context.issue,
          mutate: body => { effects.push('transform'); return body + '\nOrdinary note.\n'; },
          deps: { revisionBackend: backend, fetchBody: async () => remote, pushBody: async (_repo, _issue, body) => { effects.push('push'); remote = body; } },
        });
      } catch (error) { result = error; }
      assert.deepEqual(effects, [], `${name} must not transform or write against ${state} authority`);
      assert.equal(result.status, status);
      assert.equal(result.code, code);
    });
  }
}

import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { withGovernedRevisionMutation, evaluateRevisionPolicy } from '../../../../../task-tracker/lib/criteria-revision/policy.mjs';

for (const state of ['baseline', 'approved']) {
  test(`real ${state} authority permits ordinary body writing with deny published before effects`, async () => {
    const { backend, context } = state === 'approved' ? await approvedFixture() : await fixture('baseline');
    let remote = backend.observation.body.bytes;
    const effects = [];
    await mutateIssueBody({ repo: context.repository, issueNumber: context.issue,
      mutate: body => { effects.push(['transform', backend.admission.state]); return body + '\nOrdinary note.\n'; },
      deps: { revisionBackend: backend, fetchBody: async () => remote, pushBody: async (_repo, _issue, body) => { effects.push(['push', backend.admission.state]); remote = body; } },
    });
    assert.deepEqual(effects, [['transform', 'deny'], ['push', 'deny']]);
    assert.match(remote, /Ordinary note/);
  });
}

test('public observation objects and caller ready callbacks cannot mint authority', async () => {
  const { backend, context } = await fixture('baseline');
  assert.equal(evaluateRevisionPolicy({ activity: 'body-write', observation: { status: 'ready' }, capability: {} }).status, 'indeterminate');
  let effects = 0;
  await assert.rejects(withGovernedRevisionMutation({ context: { ...context, backend }, observe: async () => ({ status: 'ready' }) }, async () => { effects++; }), { code: 'revision-authority-unavailable' });
  assert.equal(effects, 0);
});

import { appendCapsule } from '../../../../../task-tracker/lib/github-records/capsule-chain.mjs';
import { executeContractWrite, planContractWrite, writeDirectoryContractOperation } from '../../../../../task-tracker/lib/github-records/contract-write.mjs';
import { createDraftContract } from '../../../../../task-tracker/lib/github-records/delivery-contract.mjs';
import { createIssueDirectory, renderIssueDirectory } from '../../../../../task-tracker/lib/github-records/issue-directory.mjs';
import { parseAitmRecord } from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';

function canonicalWriterFixture({ backend, context }) {
  let contract = createDraftContract({ recordId: '01KZ0000000000000000000001', authorityEpoch: 3, coordinatorGrantId: '01KZ0000000000000000000002', acceptanceCriteria: [{ logicalId: 'ac-1', text: 'Concrete check' }], verificationCommands: [{ logicalId: 'vc-1', command: 'npm test' }], definitionOfDone: [{ logicalId: 'dod-tests', text: 'Tests pass' }] });
  const records = [], effects = [];
  const plan = planContractWrite({ ...context, contract, action: 'set-check', kind: 'acceptanceCriteria', logicalId: 'ac-1' });
  const deps = {
    revisionBackend: backend,
    readContractRecord: async () => ({ envelope: { payload: contract } }),
    listRecords: async () => [...records],
    listIssueComments: async () => [...records],
    createIssueComment: async ({ body }) => {
      effects.push(['comment', backend.admission.state]);
      const commentNodeId = `COMMENT_${records.length + 1}`;
      records.push({ ...parseAitmRecord({ commentNodeId, body, expectedRepository: context.repository, expectedIssue: context.issue }), body });
      return { commentNodeId };
    },
    readBackComment: async ({ commentNodeId }) => records.find(record => record.commentNodeId === commentNodeId),
    readProjection: async () => contract,
    updateProjection: async ({ contract: next }) => { effects.push(['projection', backend.admission.state]); contract = next; },
  };
  deps.appendRecord = async candidate => (await appendCapsule({ ...context, expectedHeadRecordId: null, candidate, deps })).record;
  const issueBody = renderIssueDirectory(createIssueDirectory({ issueNodeId: 'ISSUE_TEST', singletons: { 'delivery-contract': 'CONTRACT_COMMENT', coordination: 'COORDINATION_COMMENT', 'evidence-projection': 'EVIDENCE_COMMENT', timing: 'TIMING_COMMENT' } }));
  return { effects, run: {
    appendCapsule: () => appendCapsule({ ...context, expectedHeadRecordId: null, candidate: { envelope: plan.envelope, visibleMarkdown: 'Concrete capsule.\n' }, deps }),
    executeContractWrite: () => executeContractWrite({ plan, deps }),
    writeDirectoryContractOperation: () => writeDirectoryContractOperation({ ...context, issueBody, action: 'set-check', kind: 'acceptanceCriteria', logicalId: 'ac-1', deps }),
  } };
}

for (const name of ['appendCapsule', 'executeContractWrite', 'writeDirectoryContractOperation']) {
  for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'approved']) {
    test(`${name} real adapter ${state} authority and transport effects`, async () => {
      const f = state === 'approved' ? await approvedFixture() : await fixture(state);
      if (state === 'malformed') f.backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
      const { effects, run } = canonicalWriterFixture(f);
      let error = null;
      try { await run[name](); } catch (caught) { error = caught; }
      if (['baseline', 'approved'].includes(state)) {
        assert.equal(error, null);
        assert.equal(effects.length, name === 'appendCapsule' ? 1 : 2);
        assert.ok(effects.every(([, admission]) => admission === 'deny'));
      } else {
        assert.deepEqual(effects, [], name);
        assert.equal(error?.status, ['unavailable', 'malformed'].includes(state) ? 'indeterminate' : 'blocked');
        assert.equal(error?.code, state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable');
      }
    });
  }
}

import { observeRevision } from '../../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { parseBodyVersion } from '../../../../../task-tracker/lib/body-version.mjs';

test('ordinary metadata body write retains recognized current approval for the next real backend consumer', async () => {
  const { backend, context } = await approvedFixture();
  const before = backend.observation;
  const effects = [];
  const deps = {
    revisionBackend: backend,
    fetchBody: async () => backend.observation.body.bytes,
    pushBody: async (_repo, _issue, body) => {
      const next = backend.observation;
      effects.push({ beforeVersion: next.body.version, afterVersion: parseBodyVersion(body) });
      next.body = { bytes: body, version: parseBodyVersion(body) };
      backend.replaceAuthority(next);
      backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
    },
  };
  await mutateIssueBody({ repo: context.repository, issueNumber: context.issue, mutate: body => body + '\nOrdinary metadata note.\n', deps });
  assert.equal(effects.length, 1);
  assert.equal(backend.observation.body.version, before.body.version + 1);
  assert.equal(backend.observation.stage, before.stage);
  const current = await observeRevision({ context, deps: backend });
  assert.equal(current.status, 'applied', JSON.stringify({ status: current.status, code: current.code, resourceVector: current.resourceVector }));
  await mutateIssueBody({ repo: context.repository, issueNumber: context.issue, mutate: body => body + '\nSecond ordinary metadata note.\n', deps });
  assert.equal(effects.length, 2);
});

import { runHook } from '../../../../../task-tracker/source-edit-gate.mjs';
import { memoryRuntime, authorityResult } from '../../../../fixtures/criteria-revision-runtime.mjs';
import { registerRevisionDomain } from '../../../../../task-tracker/lib/criteria-revision/domain.mjs';
import { refreshAdmission, publishAdmission } from '../../../../../task-tracker/lib/criteria-revision/admission.mjs';
import { withRevisionInterlock } from '../../../../../task-tracker/lib/criteria-revision/interlock.mjs';

test('source hook rereads shared admission on every invocation despite unchanged cached Develop signals', async () => {
  const { createSandbox } = await import('../../../../helpers/evidence-v2/sandbox.mjs');
  const { setActiveTask } = await import('../../../../../task-tracker/session-state.mjs');
  const { currentSessionId } = await import('../../../../../task-tracker/word-counter.mjs');
  const fs = await import('node:fs');
  const s = createSandbox(), root = s.context.sourceRoot, sid = currentSessionId();
  try {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'file.mjs'), 'old');
  fs.writeFileSync(path.join(root, 'docs', 'notes.md'), 'old');
  const { context, ports } = memoryRuntime();
  ports.worktree = root;
  context.executor = { ...context.executor, worktree: root, branch: 'trunk', sessionId: sid };
  setActiveTask(sid, { issue: '#1852', entryStartTs: new Date().toISOString(), worktreePath: root,
    worktreeBranch: 'trunk', kanbanState: 'develop' }, root);
  const domain = registerRevisionDomain({ repository: context.repository, commonDir: '/git/common', host: 'host-one', quiescenceConfirmed: true }, ports);
  const deps = {
    resolveInvocationDirectory: () => root, projectDir: root, cfg: { repo: context.repository }, revisionPorts: ports,
    loadBoundIssue: () => '#1852', readExactSessionBinding: () => null, isChoreModeActive: () => false,
    resolveIssueSignals: async () => ({ state: 'develop', hasPostedMarker: true, hasCompleteMarker: true, assignees: ['operator'], currentUser: 'operator' }),
  };
  const payload = { session_id: sid, tool_name: 'Edit', cwd: root, tool_input: { file_path: path.join(root, 'src', 'file.mjs') } };
  const absent = await runHook(payload, deps);
  assert.equal(absent.decision, 'block');
  assert.equal(absent.code, 'revision-authority-unavailable', 'missing source associations cannot establish editor authority');
  const { validateGovernedLinkedPlan } = await import('../../../../../task-tracker/lib/governed-plan-policy.mjs');
  const { hashRevisionValue } = await import('../../../../../task-tracker/lib/criteria-revision/schema.mjs');
  const collected = authorityResult(context, domain);
  collected.observation.protectedSourceBindings.push({ identity: 'linked-plan',
    hash: hashRevisionValue(validateGovernedLinkedPlan({ body: collected.observation.body.bytes, projectDir: root })) });
  await refreshAdmission({ context, observe: async () => collected }, ports);
  assert.equal((await runHook(payload, deps)).decision, 'allow');
  await withRevisionInterlock(context, capability => publishAdmission({ capability, observation: { issue: 1852 }, state: 'deny' }, ports), ports);
  const revoked = await runHook(payload, deps);
  assert.equal(revoked.decision, 'block');
  assert.equal(revoked.code, 'revision-approval-stale');
  const mixed = await runHook({ ...payload, tool_name: 'apply_patch', tool_input: `*** Begin Patch\n*** Update File: ${root}/docs/notes.md\n@@\n-old\n+new\n*** Update File: ${root}/src/file.mjs\n@@\n-old\n+new\n*** End Patch` }, deps);
  assert.equal(mixed.decision, 'block');
  assert.equal(mixed.code, 'revision-approval-stale');
  } finally { s.dispose(); }
});

for (const corruption of ['criterion', 'checkbox', 'control', 'scope', 'stage', 'proof-resource', 'source-resource']) {
  test(`metadata continuation does not bless ${corruption} drift`, async () => {
    const { backend, context } = await approvedFixture();
    const changed = backend.observation;
    if (corruption === 'criterion') changed.body.bytes = changed.body.bytes.replace('Independent requirement', 'Different requirement');
    if (corruption === 'checkbox') changed.body.bytes = changed.body.bytes.replace('- [x] Independent requirement', '- [ ] Independent requirement');
    if (corruption === 'control') changed.body.bytes = changed.body.bytes.replace('<!-- aitm-plan-approved ', '<!-- aitm-plan-removed ');
    if (corruption === 'scope') changed.body.bytes = changed.body.bytes.replace('Synthetic scope', 'Changed scope');
    if (corruption === 'stage') changed.stage = 'review';
    if (corruption === 'proof-resource') changed.proofRecords.push({ kind: 'test', identity: 'unbound-proof', bytes: 'unbound', criterionIdentity: null });
    if (corruption === 'source-resource') changed.protectedSourceBindings[0].hash = 'sha256:' + 'f'.repeat(64);
    backend.replaceAuthority(changed);
    const current = await observeRevision({ context, deps: backend });
    assert.notEqual(current.status, 'applied', corruption);
  });
}


for (const [name, change] of [
  ['criterion', body => body.replace('Independent requirement', 'Different requirement')],
  ['source', body => body.replace('Synthetic scope', 'Changed scope')],
  ['proof', body => body + '\n<!-- aitm-test-receipt identity="invented" -->\n'],
  ['control', body => body.replace('<!-- aitm-plan-approved ', '<!-- aitm-plan-removed ')],
]) {
  test(`ordinary body ${name} change cannot reach transport under current revision admission`, async () => {
    const { backend, context } = await approvedFixture();
    let pushes = 0;
    let remote = backend.observation.body.bytes;
    await assert.rejects(versionedWriteBody({ repo: context.repository, issueNumber: context.issue, mutate: change,
      deps: { revisionBackend: backend, fetchBody: async () => remote, pushBody: async (_repo, _issue, body) => { pushes++; remote = body; } },
    }), { code: 'criteria-revision-required' });
    assert.equal(pushes, 0);
  });
}

import { withRevisionConsumer } from '../../../../../task-tracker/lib/criteria-revision/policy.mjs';
import { createVerificationReceipt, validateVerificationReceipt, validateVerificationReceiptStructure, parseValidatedVerificationReceiptClaims, upsertVerificationReceipt } from '../../../../../task-tracker/lib/verification-receipt.mjs';
import { projectRequirements, validateInputs } from '../../../../../task-tracker/lib/evidence-v2/subject-inputs.mjs';
import { logicalRecordFixture } from '../../../../helpers/evidence-v2/logical-records.mjs';

function receiptInput(issue) {
  return { issueNumber: issue, stage: 'test', fingerprint: {
    commitSha: 'a'.repeat(40), verificationCommands: [['node', '--test']],
    environment: { node: process.version, platform: 'test-platform', lockfileHash: hashBytes('lock'), configHashes: {}, sandbox: { kind: 'worktree', identity: process.cwd(), clean: true } },
  }, commands: [{ classification: 'test-unit', command: 'npm', args: ['run', 'test:unit'], exitCode: 0, durationMs: 1 }], now: () => '2026-10-01T00:00:00.000Z' };
}
async function inApprovedConsumer(fn, options) {
  const f = await approvedFixture(options);
  return withRevisionConsumer({ ...f.context, backend: f.backend, activity: 'body-write' }, () => fn(f));
}

test('verification receipt generator binds the actual held revision instead of caller binding strings', async () => {
  await inApprovedConsumer(async ({ backend, context }) => {
    const current = await observeRevision({ context, deps: backend });
    const receipt = createVerificationReceipt({ ...receiptInput(context.issue), revisionBinding: { revisionId: 'forged' } });
    assert.deepEqual(receipt.revisionBinding, { schema: 'aitm.revision-evidence-binding/v1', repository: context.repository, issue: context.issue,
      revisionId: current.effectiveProposal.after.revisionId, semanticContractDigest: current.effectiveProposal.after.semanticContractDigest,
      contractEpoch: null, authorityEpoch: null });
    assert.equal(validateVerificationReceipt({ receipt, expectedIssue: context.issue, expectedStage: 'test', fingerprint: receiptInput(context.issue).fingerprint }).ok, true);
  });
});
for (const mutation of ['missing', 'different-revision', 'different-digest', 'extra-key']) {
  test(`verification aggregate reader rejects ${mutation} revision binding`, async () => {
    await inApprovedConsumer(({ context }) => {
      const receipt = createVerificationReceipt(receiptInput(context.issue));
      if (mutation === 'missing') delete receipt.revisionBinding;
      else receipt.revisionBinding = { ...receipt.revisionBinding, [mutation === 'different-revision' ? 'revisionId' : mutation === 'different-digest' ? 'semanticContractDigest' : 'untrusted']: mutation === 'different-digest' ? hashBytes('other') : 'other' };
      const check = validateVerificationReceipt({ receipt, expectedIssue: context.issue, expectedStage: 'test', fingerprint: receiptInput(context.issue).fingerprint });
      assert.equal(check.ok, false);
      assert.throws(() => parseValidatedVerificationReceiptClaims(upsertVerificationReceipt('', receipt), { expectedIssue: context.issue }), /revision|malformed/);
    });
  });
}

test('requirements projection derives current revision binding and rejects stripped live inputs', async () => {
  await inApprovedConsumer(({ backend, context }) => {
    const f = logicalRecordFixture();
    const requirements = projectRequirements({ body: backend.observation.body.bytes, target: f.target, policy: f.input.requirements.policy });
    assert.equal(requirements.revisionBinding?.issue, context.issue);
    assert.ok(requirements.revisionBinding?.revisionId);
    assert.doesNotThrow(() => validateInputs({ ...f.input, requirements }));
    const stripped = structuredClone(requirements); delete stripped.revisionBinding;
    assert.throws(() => validateInputs({ ...f.input, requirements: stripped }), /revision/);
  }, { unstampedIndependent: true });
});

test('never revised receipt generation preserves unbound historical format despite caller binding', () => {
  const receipt = createVerificationReceipt({ ...receiptInput(124), revisionBinding: { revisionId: 'forged' } });
  assert.equal(Object.hasOwn(receipt, 'revisionBinding'), false);
  assert.equal(validateVerificationReceiptStructure({ receipt }).ok, true);
});

import { evaluateReuse } from '../../../../../task-tracker/lib/evidence-v2/eligibility.mjs';
import { encodeRecord, decodeRecord, evidenceDigest } from '../../../../../task-tracker/lib/evidence-v2/codec.mjs';

test('evidence-v2 reuse rejects unbound historical aggregates inside an actual current revision', async () => {
  await inApprovedConsumer(({ context }) => {
    const f = logicalRecordFixture();
    const candidate = f.make('candidate', f.candidate.payload, { issueNumber: context.issue });
    const verification = f.make('verification', f.verification.payload, { issueNumber: context.issue });
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
    const candidate = f.make('candidate', { ...f.candidate.payload, subject }, { issueNumber: context.issue, repositoryId });
    const decoded = decodeRecord(encodeRecord(candidate));
    assert.deepEqual(decoded.payload.subject.revisionBinding, receipt.revisionBinding);
    const verification = f.make('verification', { ...f.verification.payload, subjectId: subject.subjectId }, { issueNumber: context.issue, repositoryId });
    assert.equal(evaluateReuse({ candidate: decoded, verification, policy: f.policy }).status, 'reuse');
    const stripped = f.make('candidate', f.candidate.payload, { issueNumber: context.issue });
    assert.equal(evaluateReuse({ candidate: stripped, verification, policy: f.policy }).status, 'refuse');
    const extra = { ...revised, revisionBinding: { ...receipt.revisionBinding, authority: true } };
    assert.throws(() => f.make('candidate', { ...f.candidate.payload, subject: { ...extra, subjectId: evidenceDigest(extra) } }), /binding/);
    assert.notEqual(subject.subjectId, oldId);
    assert.throws(() => f.make('candidate', { ...f.candidate.payload, subject }, { issueNumber: context.issue + 1, repositoryId }), /revision.*identity/);
    assert.throws(() => f.make('candidate', { ...f.candidate.payload, subject }, { issueNumber: context.issue }), /revision.*identity/);
  });
});

import { stampAcEvidenceMarker } from '../../../../../task-tracker/lib/ac-evidence.mjs';

test('requirements projection consumes actual consolidated AC stamps and native multi-VC declarations', () => {
  const body = '## Acceptance Criteria\n- [ ] Both verifiers <!-- aitm-verified vc-list="vc:1 vc:2" -->\n## Verification Commands\n- [ ] `node first.mjs` <!-- id=1 -->\n- [ ] `node second.mjs` <!-- id=2 -->\n';
  const stamped = stampAcEvidenceMarker(body, 'Both verifiers', { cmd: '`node first.mjs` `node second.mjs`', sha: 'a'.repeat(40), ts: '2026-10-01T00:00:00Z' });
  const result = projectRequirements({ body: stamped, target: { ref: 'trunk' }, policy: { id: 'p', version: '1' } });
  assert.deepEqual(result.acceptanceCriteria[0].verificationIds, ['vc:1', 'vc:2']);
  assert.equal(result.verificationCommands.length, 2);
});

for (const kind of ['legacy', 'canonical']) {
  test(`requirements projection uses observed ${kind} stable identities and current canonical epochs`, async () => {
    const { backend, context } = await approvedFixture({ kind });
    await withRevisionConsumer({ ...context, backend, activity: 'body-write' }, async () => {
      const current = await observeRevision({ context, deps: backend });
      const result = projectRequirements({ body: backend.observation.body.bytes, target: { ref: 'trunk' }, policy: { id: 'p', version: '1' } });
      assert.deepEqual(result.acceptanceCriteria.map(x => x.id), current.effectiveProposal.after.definitions.filter(x => x.section === 'ac').map(x => x.identity));
      assert.equal(result.revisionBinding.contractEpoch, current.observation.contract?.value.contractEpoch ?? null);
      assert.equal(result.revisionBinding.authorityEpoch, current.observation.contract?.value.authorityEpoch ?? null);
      assert.deepEqual(result.verificationCommands.map(x => x.id), current.effectiveProposal.after.definitions.filter(x => x.section === 'vc').map(x => x.identity));
    });
  });
}

import { parseEvidenceAcs } from '../../../../../task-tracker/lib/ac-evidence.mjs';
import { stampEvidenceMarker, parseFunctionalDodKeys } from '../../../../../task-tracker/lib/functional-dod-evidence.mjs';
import { parseProofMarker } from '../../../../../task-tracker/lib/proof-marker.mjs';

for (const section of ['ac', 'dod']) {
  test(`actual ${section} individual stamper binds current revision and its reader rejects stripped new proof`, async () => {
    await inApprovedConsumer(({ backend, context }) => {
      const before = backend.observation.body.bytes;
      const evidence = { cmd: '`node --test supported-hook.test.mjs`', sha: 'b'.repeat(40), ts: '2026-10-01T00:00:00Z', exit: 0, revisionBinding: { revisionId: 'forged' } };
      const after = section === 'ac' ? stampAcEvidenceMarker(before, 'Supported model hooks', evidence) : stampEvidenceMarker(before, 'tests', evidence);
      const read = body => section === 'ac' ? parseEvidenceAcs(body).find(x => x.label === 'Supported model hooks') : parseFunctionalDodKeys(body).find(x => x.key === 'tests');
      const row = read(after);
      const props = parseProofMarker(after.split('\n')[row.lineIndex]);
      assert.ok(props['revision-binding']);
      assert.equal(JSON.parse(props['revision-binding']).issue, context.issue);
      assert.ok(row.evidenceMarker);
      const stripped = after.replace(/ revision-binding="[^"]*"/, '');
      assert.equal(read(stripped).evidenceMarker, null);
    });
  });
}

test('only exact preserved legacy individual proof survives current revision read side', async () => {
  await inApprovedConsumer(({ backend }) => {
    const body = backend.observation.body.bytes;
    const read = value => parseEvidenceAcs(value).find(x => x.label === 'Independent requirement').evidenceMarker;
    assert.ok(read(body));
    const changed = body.replace(/(Independent requirement[^\n]*sha=")[^"]+/, '$1' + 'b'.repeat(40));
    assert.equal(read(changed), null);
  });
});

test('metadata continuation rejects duplicate body-version control claims before push', async () => {
  await inApprovedConsumer(async ({ backend, context }) => {
    let pushes = 0;
    let refusal;
    try { await mutateIssueBody({ repo: context.repository, issueNumber: context.issue,
      mutate: body => body + '\n<!-- aitm-body-version version="100" -->\n<!-- aitm-body-version version="200" -->\n<!-- aitm-body-version version="300" -->\n',
      deps: { revisionBackend: backend, fetchBody: async () => backend.observation.body.bytes, pushBody: async () => { pushes++; } },
    }); } catch (error) { refusal = error; }
    assert.equal(pushes, 0);
    assert.equal(refusal?.code, 'criteria-revision-required');
  });
});

for (const activity of ['status', 'plan-approve', 'invented-consumer']) {
  test(`caller activity ${activity} cannot turn a stale approval into mutation authority`, async () => {
    const { backend, context } = await fixture('stale');
    let effects = 0, refusal;
    try { await withRevisionConsumer({ ...context, backend, activity }, () => { effects++; }); }
    catch (error) { refusal = error; }
    assert.equal(effects, 0);
    assert.ok(refusal);
  });
}

test('unknown mutation activity cannot execute even against an empty verified chain', async () => {
  const { backend, context } = await fixture('baseline');
  let effects = 0;
  let refusal;
  try { await withRevisionConsumer({ ...context, backend, activity: 'invented-consumer' }, () => { effects++; }); }
  catch (error) { refusal = error; }
  assert.equal(effects, 0);
  assert.ok(refusal);
});


test('unconfigured activity retains ordinary gates only after fresh proof that host has no enabled revision domains', () => {
  const r = memoryRuntime();
  r.ports.inspect = () => { throw new Error('repository unavailable'); };
  assert.equal(evaluateLocalRevisionActivity({ repository: '', issue: 1855 }, r.ports).status, 'ready');
  r.ports.fs.writeFileSync(path.join(r.ports.configRoot, 'unknown-registration.json'), '{}');
  assert.equal(evaluateLocalRevisionActivity({ repository: '', issue: 1855 }, r.ports).status, 'indeterminate');
  const unreadable = { ...r.ports, fs: { ...r.ports.fs, readdirSync() { throw new Error('unreadable'); } } };
  assert.equal(evaluateLocalRevisionActivity({ repository: '', issue: 1855 }, unreadable).status, 'indeterminate');
});


import { runGuards, GUARDS } from '../../../../../task-tracker/lib/guard-registry.mjs';
import '../../../../../task-tracker/lib/guard-bootstrap.mjs';
for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'approved']) {
  test(`registered lifecycle revision guard preserves typed ${state} authority without publishing admission`, async () => {
    const { backend, context } = state === 'approved' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    assert.ok(GUARDS.done.entry.some(guard => guard.id === 'criteria-revision-admission'));
    const before = backend.effects.length;
    const result = await runGuards('', 'done', { cfg: { repo: context.repository }, issueNumber: context.issue,
      deps: { revisionBackend: backend } });
    const refusal = result.refusals.find(value => value.id === 'criteria-revision-admission');
    if (['baseline', 'approved'].includes(state)) assert.equal(refusal, undefined);
    else {
      assert.ok(refusal, JSON.stringify(result));
      assert.equal(refusal.code, state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable');
    }
    assert.equal(backend.effects.slice(before).includes('admission-deny'), false, 'read-only guard does not publish mutation admission');
  });
}


import { lintRefusalInventory } from '../../../../../maintenance/lint-action-refusals.mjs';
test('new typed guard conformance requires discovered producer and complete typed emissions while preserving frozen legacy rules', () => {
  const id = 'criteria-revision-admission';
  const source = `export const guard = { id: '${id}', run() { return { ok: false, code: 'revision-pending', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' } }; } };`;
  const lint = (value, guardId = id) => lintRefusalInventory({ inventory: { version: 1, guards: {} },
    registeredGuardIds: [guardId], sources: [{ file: 'scripts/task-tracker/lib/new-typed-guard.mjs', source: value }] });
  assert.deepEqual(lint(source), []);
  for (const invalid of [source.replace('revision-pending', 'unknown-revision-code'),
    source.replace("code: 'revision-pending', args: {}, noAutomaticRemediation: { reason: 'authority-investigation-required' }", "reason: 'untyped'"),
    source.replace("id: 'criteria-revision-admission'", 'id: callerId'),
    source.replace("code: 'revision-pending'", "code: 'authority-read-failed'"),
    `export const guard = { id: '${id}', run() { return { ok: true }; } };`,
    source.replace('run() {', "run() { if (unknown) return { ok: false, reason: 'legacy' };"),
    source.replace('run() {', 'run() { if (unknown) return alias();') + "function refusal() { return { ok: false, reason: 'legacy' }; } const alias = refusal;",
    `export const guard = { id: '${id}', run() { return helper(); } };` + source.replaceAll(id, 'different-guard').replace('const guard', 'const sibling'),
  ]) assert.ok(lint(invalid).length > 0, invalid);
  assert.ok(lint(source.replaceAll(id, 'invented-guard'), 'invented-guard').length > 0);
});


import { validateBlocker } from '../../../../../task-tracker/lib/action-decision/contract.mjs';
for (const state of ['pending', 'stale', 'unavailable', 'conflict', 'criteria-change']) {
  test(`actual body mutation ${state} emits a closed native execution blocker`, async () => {
    const { backend, context } = ['conflict', 'criteria-change'].includes(state) ? await approvedFixture() : await fixture(state);
    if (state === 'conflict') {
      const next = backend.observation;
      next.body.bytes += '\n<!-- ungoverned-control -->\n';
      backend.replaceAuthority(next);
      backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(next.body.bytes) });
    }
    let effects = 0, refused;
    try {
      await versionedWriteBody({ repo: context.repository, issueNumber: context.issue,
        mutate: body => body.replace('Supported model hooks', 'Changed requirement'),
        deps: { revisionBackend: backend, fetchBody: async () => backend.observation.body.bytes,
          pushBody: async () => { effects++; } },
      });
    } catch (error) { refused = error; }
    assert.equal(effects, 0);
    assert.ok(refused, state);
    assert.equal(refused.blocker?.guardId, 'revision-mutation');
    assert.equal(refused.blocker.code, refused.code);
    assert.deepEqual(validateBlocker(refused.blocker, { status: refused.status }), refused.blocker);
    assert.deepEqual(JSON.parse(JSON.stringify(refused)).blocker, refused.blocker);
  });
}


import { persistReadyNormalizations } from '../../../../../task-tracker/lib/action-decision/normalization.mjs';
for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`actual normalization ${state} refuses before evaluation callback and preserves its native blocker`, async () => {
    const { backend, context } = await fixture(state);
    if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    let effects = 0;
    await assert.rejects(persistReadyNormalizations({ repo: context.repository, issueNumber: context.issue,
      head: 'a'.repeat(40), evaluatedAt: '2026-09-30T00:00:00.000Z', deps: { revisionBackend: backend },
      readBack: async () => { effects++; return { body: backend.observation.body.bytes, head: 'a'.repeat(40) }; },
      refreshAndEvaluate: async () => { effects++; return { status: 'ready', ok: true, refusals: [], humanDecision: null }; },
    }), error => error.blocker?.guardId === 'revision-mutation' && error.code === (state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable'));
    assert.equal(effects, 0);
  });
}


test('actual native Plan completion retains its checked journal and ordered reference after original snapshot restart', async () => {
  const { backend, context } = await approvedFixture();
  const snapshot = JSON.parse(JSON.stringify(backend.snapshot));
  assert.equal(snapshot.nativePlanRecords?.length, 1);
  assert.equal(snapshot.nativeOrder?.length, 1);
  assert.equal(snapshot.nativeOrder[0].kind, 'plan');
  assert.equal(snapshot.nativeOrder[0].predecessor, null);
  assert.equal(snapshot.nativePlanRecords[0].revisionEventHead, snapshot.nativeOrder[0].revisionEventHead);
  const restored = createRevisionMemory(snapshot);
  assert.equal((await observeRevision({ context, deps: restored })).status, 'applied');
  assert.deepEqual(restored.snapshot.nativePlanRecords, snapshot.nativePlanRecords);
  assert.deepEqual(restored.snapshot.nativeOrder, snapshot.nativeOrder);
});

for (const phase of ['failBefore', 'failAfter']) {
  for (const step of ['native-plan-record-write', 'native-plan-record-readback']) {
    test(`actual Plan completion ${phase} ${step} resumes after restart without duplicate retained history`, async () => {
      const original = await approvedFixture();
      const prior = original.backend.snapshot.nativePlanRecords[0];
      // Rebuild the original pre-approval fixture, then execute the native verb
      // anew. No historical completion is inferred from the final body.
      let backend = createRevisionMemory({ observation: prior.before, comments: prior.comments,
        hostMessages: original.backend.snapshot.hostMessages, planning: prior.planning });
      backend[phase] = step;
      const approve = () => runPlanApprove({ issueNumber: original.context.issue, cfg: prior.planning.cfg,
        projectDir: prior.before.executor.worktree, deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } } });
      await assert.rejects(approve(), new RegExp(`interrupted:${phase}:${step}`));
      assert.ok(backend.snapshot.planJournal);
      backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
      let ordinaryEffects = 0;
      await assert.rejects(mutateIssueBody({ repo: original.context.repository, issueNumber: original.context.issue,
        mutate: body => { ordinaryEffects++; return body + '\nShould remain denied.\n'; },
        deps: { revisionBackend: backend, fetchBody: async () => { ordinaryEffects++; return backend.observation.body.bytes; },
          pushBody: async () => { ordinaryEffects++; } } }), error => error.code === 'revision-approval-stale');
      assert.equal(ordinaryEffects, 0, 'incomplete native Plan retention denies covered writer before retry');
      const result = await approve();
      assert.equal(result.status, 'approved', JSON.stringify(result));
      assert.equal(backend.snapshot.nativePlanRecords.length, 1);
      assert.equal(backend.snapshot.nativeOrder.length, 1);
      assert.equal(backend.snapshot.planJournal, undefined);
      assert.equal((await observeRevision({ context: original.context, deps: backend })).status, 'applied');
    });
  }
}

test('retained Plan index rejects absent, duplicate, changed, foreign and reordered references', async () => {
  const { backend } = await approvedFixture();
  for (const mutate of [
    snapshot => { delete snapshot.nativeOrder; },
    snapshot => { snapshot.nativeOrder.push(snapshot.nativeOrder[0]); },
    snapshot => { snapshot.nativeOrder[0].kind = 'proof'; },
    snapshot => { snapshot.nativeOrder[0].revisionEventHead = 'foreign'; },
    snapshot => { snapshot.nativeOrder[0].predecessor = snapshot.nativeOrder[0].id; },
    snapshot => { snapshot.nativePlanRecords[0].audit += 'changed'; },
  ]) {
    const snapshot = JSON.parse(JSON.stringify(backend.snapshot)); mutate(snapshot);
    assert.throws(() => createRevisionMemory(snapshot), /native-order/);
  }
});
