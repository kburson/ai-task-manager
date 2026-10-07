// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import { parseEvidenceAcs } from '../../../../task-tracker/lib/ac-evidence.mjs';
import * as runner from '../../../../task-tracker/lib/evidence-runner.mjs';
const exec = promisify(execFile);

for (const failure of [false, true]) {
  test(`native proof token requires actual ${failure ? 'failed' : 'successful'} runner completion`, async () => {
    const s = createSandbox();
    try {
      writeFileSync(path.join(s.context.sourceRoot, 'package-lock.json'), '{}');
      writeFileSync(path.join(s.context.sourceRoot, 'supported-hook.test.mjs'), `import assert from 'node:assert/strict'; assert.equal(${failure}, false);`);
      const { backend, context } = await approvedFixture({ worktree: s.context.sourceRoot, branch: 'trunk' });
      const ac = parseEvidenceAcs(backend.observation.body.bytes)[0];
      const commands = ac.evidenceCommands, nativeProofIntent = { kind: 'ac', target: ac.label };
      let executed = 0;
      const pexec = (bin, args, options) => {
        if (bin === 'node') executed++;
        return exec(bin, args, { ...options, env: s.env });
      };
      let result;
      await withRevisionConsumer({ ...context, backend, activity: 'ac-stamp' }, async () => {
        result = await runner.runVerifiers({ commands, cwd: s.context.sourceRoot, pexec, nativeProofIntent });
        assert.equal(executed, 1);
        assert.equal(result.allPassed, !failure);
        if (failure) {
          assert.equal(result.nativeExecutionToken, undefined);
          return;
        }
        assert.ok(result.nativeExecutionToken, 'actual successful runner must produce opaque current execution authority');
        const record = runner.readNativeVerifierExecution(result.nativeExecutionToken);
        assert.deepEqual(record.commands, commands);
        assert.deepEqual(record.intent, nativeProofIntent);
        assert.equal(record.binding.issue, context.issue);
        assert.equal(record.provenance.branch, 'trunk');
        assert.equal(record.fingerprint.environment.sandbox.identity, s.context.sourceRoot);
        assert.equal(record.results[0].exit, 0);
        assert.throws(() => runner.readNativeVerifierExecution(structuredClone(result.nativeExecutionToken)), /native-proof-token/);
        assert.throws(() => runner.readNativeVerifierExecution({ ...record, success: true }), /native-proof-token/);
      });
      if (!failure) assert.throws(() => runner.readNativeVerifierExecution(result.nativeExecutionToken), /native-proof-token/);
    } finally { s.dispose(); }
  });
}

import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { verbDodStamp } from '../../../../task-tracker/verbs/dod-stamp.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { observeRevision, prepareRevision, applyRevision, recoverRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';

async function realNativeStamp(s, fault = null, kind = 'ac') {
  writeFileSync(path.join(s.context.sourceRoot, 'package-lock.json'), '{}');
  writeFileSync(path.join(s.context.sourceRoot, 'supported-hook.test.mjs'), 'import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; assert.equal(readFileSync(new URL("./source.txt", import.meta.url), "utf8"), "baseline\\n");' );
  execFileSync('git', ['add', 'package-lock.json', 'supported-hook.test.mjs'], { cwd: s.context.sourceRoot, env: s.env });
  execFileSync('git', ['commit', '-qm', 'Native verifier fixture'], { cwd: s.context.sourceRoot, env: s.env });
  const f = await approvedFixture({ worktree: s.context.sourceRoot, branch: 'trunk', sharedDodCitation: kind === 'dod' });
  let backend = f.backend;
  const context = f.context;
  setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, s.context.sourceRoot);
  let body = backend.observation.body.bytes;
  const effects = [];
  if (fault?.before) backend.failBefore = fault.before;
  if (fault?.after) backend.failAfter = fault.after;
  const pexec = async (bin, args, options = {}) => {
    if (bin === 'gh' && args[1] === 'view') return { stdout: body };
    if (bin === 'gh' && args[1] === 'edit') {
      effects.push('push');
      assert.ok(backend.effects.includes('native-proof-journal-readback') || backend.effects.includes('native-proof-record-readback'), 'original journal must be read back before proof push');
      if (fault?.push === 'before') throw new Error('uncertain transport');
      body = options.input;
      const next = backend.observation; next.body = { bytes: body, version: parseBodyVersion(body) };
      backend.replaceAuthority(next);
      backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
      if (fault?.push === 'after') throw new Error('uncertain transport');
      return { stdout: '' };
    }
    if (bin === 'node') effects.push('verifier');
    return exec(bin, args, { ...options, cwd: s.context.sourceRoot, env: s.env });
  };
  const invoke = (target = null) => (kind === 'ac' ? verbAcStamp : verbDodStamp)({ cfg: { repo: context.repository }, projectDir: s.context.sourceRoot,
    statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
    rest: [target ?? (kind === 'ac' ? parseEvidenceAcs(body)[0].label : 'tests')], pexec, deps: { revisionBackend: backend, getLiveState: async () => 'develop' },
  });
  let error;
  try { await invoke(); } catch (caught) { error = caught; }
  return { get backend() { return backend; }, context, effects, error,
    async retry({ target, alter } = {}) {
      const snapshot = JSON.parse(JSON.stringify(backend.snapshot));
      if (alter) alter(snapshot);
      backend = createRevisionMemory(snapshot);
      body = backend.observation.body.bytes;
      if (fault) { delete fault.before; delete fault.after; delete fault.push; }
      return invoke(target);
    } };

}

test('real native verifier and AC adapter retain complete proof provenance after genuine snapshot roundtrip', async () => {
  const s = createSandbox();
  try {
    const { backend, context, effects, error } = await realNativeStamp(s);
    assert.equal(error, undefined);
    assert.deepEqual(effects, ['verifier', 'push']);
    const snapshot = JSON.parse(JSON.stringify(backend.snapshot));
    const restored = createRevisionMemory(snapshot);
    assert.equal((await observeRevision({ context, deps: restored })).status, 'applied');
    assert.equal(restored.snapshot.nativeProofRecords[0].execution.receipt.commands[0].exitCode, 0);
    for (const alter of [
      x => { x.nativeProofRecords[0].execution.results[0].exit = 1; },
      x => { x.nativeProofRecords[0].execution.receipt.commands[0].args.push('--wrong'); },
      x => { x.nativeProofRecords[0].execution.scope.definitions[0].text += ' changed'; },
      x => { x.nativeProofRecords[0].execution.binding.issue++; },
      x => { x.nativeProofRecords[0].after.body.bytes += 'unrelated'; },
      x => { x.observation.stage = 'test'; },
      x => { delete x.nativeProofRecords; },
    ]) {
      const changed = structuredClone(snapshot); alter(changed);
      let admitted = false;
      try { admitted = (await observeRevision({ context, deps: createRevisionMemory(changed) })).status === 'applied'; }
      catch { /* Closed constructor validation may refuse before collection. */ }
      assert.equal(admitted, false, alter.toString());
    }
  } finally { s.dispose(); }
});

for (const [name, fault, expected, pushes] of [
  ['before journal', { before: 'native-proof-journal-write' }, 'applied', 0],
  ['after journal', { after: 'native-proof-journal-write' }, 'pending-native-proof', 0],
  ['after journal readback', { after: 'native-proof-journal-readback' }, 'pending-native-proof', 0],
  ['before transport effect', { push: 'before' }, 'pending-native-proof', 1],
  ['after transport effect', { push: 'after' }, 'applied', 1],
]) {
  test(`native proof interruption ${name} reconstructs exact prefix without duplicate writes`, async () => {
    const s = createSandbox();
    try {
      const { backend, context, effects, error } = await realNativeStamp(s, fault);
      assert.ok(error);
      assert.equal(effects.filter(x => x === 'push').length, pushes);
      assert.equal(backend.admission.state, 'deny');
      const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
      assert.equal((await observeRevision({ context, deps: restored })).status, expected);
      if (expected === 'pending-native-proof') {
        let invoked = false;
        await assert.rejects(withRevisionConsumer({ ...context, backend: restored, activity: 'ac-stamp' }, () => { invoked = true; }), /revision-pending/);
        assert.equal(invoked, false);
      }
    } finally { s.dispose(); }
  });
}

for (const kind of ['ac', 'dod']) {
  test(`actual ${kind} adapter resumes original durable proof after restart and repeated completion has no duplicate effect`, async () => {
    const s = createSandbox();
    try {
      const run = await realNativeStamp(s, { after: 'native-proof-journal-readback' }, kind);
      assert.ok(run.error);
      assert.deepEqual(run.effects, ['verifier']);
      await run.retry();
      assert.deepEqual(run.effects, ['verifier', 'push']);
      assert.equal((await observeRevision({ context: run.context, deps: run.backend })).status, 'applied');
      await run.retry();
      assert.deepEqual(run.effects, ['verifier', 'push']);
      assert.equal(run.backend.snapshot.nativeProofRecords.length, 1);
    } finally { s.dispose(); }
  });
}

for (const kind of ['ac', 'dod']) {
  for (const [name, change] of [
    ['wrong intent', { target: 'different criterion' }],
    ['original fingerprint', { alter: x => { x.nativeProofRecords[0].execution.fingerprint.commitSha = 'b'.repeat(40); } }],
    ['receipt', { alter: x => { x.nativeProofRecords[0].execution.receipt.commands[0].args.push('--foreign'); } }],
    ['result', { alter: x => { x.nativeProofRecords[0].execution.results[0].exit = 7; } }],
    ['stage', { alter: x => { x.observation.stage = 'test'; } }],
    ['source', { alter: x => { x.observation.protectedSourceBindings[0].digest = 'sha256:' + 'b'.repeat(64); } }],
    ['event', { alter: x => { x.comments.pop(); } }],
    ['current dirty worktree', { dirty: true }],
    ['current HEAD', { head: true }],
  ]) {
    test(`actual ${kind} proof retry refuses ${name} before verifier or body effects`, async () => {
      const s = createSandbox();
      try {
        const run = await realNativeStamp(s, { after: 'native-proof-journal-readback' }, kind);
        assert.ok(run.error);
        if (change.dirty) writeFileSync(path.join(s.context.sourceRoot, 'source.txt'), 'changed');
        if (change.head) execFileSync('git', ['commit', '--allow-empty', '-qm', 'Changed fixture HEAD'], { cwd: s.context.sourceRoot, env: s.env });
        await assert.rejects(run.retry(change));
        assert.deepEqual(run.effects, ['verifier']);
      } finally { s.dispose(); }
    });
  }
}


test('successor criteria pending retains actual native proof history without any source record', async () => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
    const { backend, context } = run;
    const original = backend.snapshot;
    assert.equal(original.nativeSourceRecords?.length ?? 0, 0);
    assert.equal(original.nativeProofRecords.length, 1);
    const oldBytes = backend.observation.body.bytes.split('\n').find(line =>  /^- \[[ x]\] Supported model hooks/.test(line));
    assert.ok(oldBytes);
    const prepared = await prepareRevision({ context, deps: backend, input: {
      mode: 'revision', transactionId: 'proof-successor-tx', operationId: 'proof-successor-operation',
      reason: 'Revise after actual native verifier evidence',
      edits: { acceptanceCriteria: [{ operation: 'replace', occurrence: 1, oldBytes, oldHash: hashBytes(oldBytes),
        replacements: [{ text: 'Next supported model hooks', declaration: { kind: 'vc-list', vcIds: ['1'] } }] }], verificationCommands: [] },
    } });
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    const messageId = 'proof-successor-human-approval';
    backend.addHostMessage({ ...original.hostMessages[0], id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }] });
    const request = { schema: 'aitm.criteria-revision/v1', action: 'apply', proposal: prepared.proposal,
      authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: context.executor.adapter,
        sessionId: context.executor.sessionId, messageId, statementHash: hashBytes(prepared.approvalStatement) } };
    backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
    const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const pending = await observeRevision({ context, deps: restored });
    assert.equal(pending.status, 'pending-before', JSON.stringify(pending));
    assert.deepEqual(restored.snapshot.nativeProofRecords, original.nativeProofRecords);
    let effects = 0;
    await assert.rejects(withRevisionConsumer({ ...context, backend: restored, activity: 'ac-stamp' }, () => { effects++; }), /revision-pending/);
    assert.equal(effects, 0);
    assert.equal((await applyRevision({ context, request, deps: restored })).status, 'applied');
  } finally { s.dispose(); }
});


test('untouched abort does not retire actual native proof when a later revision changes a different criterion', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s); assert.equal(run.error, undefined);
    let backend = run.backend; const context = run.context;
    const proof = backend.snapshot.nativeProofRecords[0];
    const { assertNoSecretRecordData } = await import('../../../../task-tracker/lib/github-records/record-secret-policy.mjs');
    const inspected = await observeRevision({ context, deps: backend });
    const rejectedKeys = [];
    const inspectKeys = (value, parts = []) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        try { assertNoSecretRecordData({ [key]: null }, { safeKeyNames: ['authority', 'authorityIdentities', 'authorizer', 'authorizationSource', 'authorityEpoch'] }); }
        catch { rejectedKeys.push([...parts, key].join('.')); }
        inspectKeys(child, [...parts, key]);
      }
    };
    inspectKeys(inspected.nativeIndividualProofs);
    t.diagnostic(JSON.stringify({ nativeWitnessRejectedKeyPaths: rejectedKeys }));
    const prepare = (mode, transactionId, operationId, edits) => prepareRevision({ context, deps: backend, input: {
      mode, transactionId, operationId, reason: 'Retain proof unaffected by an untouched aborted proposal', edits } });
    const authorize = result => {
      assert.equal(result.status, 'prepared', JSON.stringify(result));
      const messageId = result.proposal.operationId + '-human';
      backend.addHostMessage({ ...backend.snapshot.hostMessages[0], id: messageId,
        content: [{ type: 'input_text', text: result.approvalStatement }] });
      return { schema: 'aitm.criteria-revision/v1', action: result.proposal.mode === 'revision' ? 'apply' : 'recover', proposal: result.proposal,
        authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: context.executor.adapter,
          sessionId: context.executor.sessionId, messageId, statementHash: hashBytes(result.approvalStatement) } };
    };
    const replacement = (prefix, occurrence, text, vc) => {
      const oldBytes = backend.observation.body.bytes.split('\n').find(line => /^- \[[ x]\]/.test(line) && line.includes(prefix));
      assert.ok(oldBytes);
      return { acceptanceCriteria: [{ operation: 'replace', occurrence, oldBytes, oldHash: hashBytes(oldBytes),
        replacements: [{ text, declaration: { kind: 'vc-list', vcIds: [vc] } }] }], verificationCommands: [] };
    };
    const request = authorize(await prepare('revision', 'proof-untouched-abort', 'proof-abort-prepare',
      replacement('Supported model hooks', 1, 'Abandoned changed hooks', '1')));
    backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const abort = await recoverRevision({ context, deps: backend, request: authorize(await prepare('abort',
      'proof-untouched-abort', 'proof-abort-operation', { acceptanceCriteria: [], verificationCommands: [] })) });
    assert.equal(abort.status, 'aborted', JSON.stringify(abort));
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const next = await prepare('revision', 'proof-preserving-next', 'proof-preserving-operation',
      replacement('Independent requirement', 3, 'Changed independent requirement', '2'));
    assert.equal(next.status, 'prepared', JSON.stringify(next));
    const result = await applyRevision({ context, deps: backend, request: authorize(next) });
    assert.equal(result.status, 'applied', JSON.stringify(result));
    assert.deepEqual(backend.snapshot.nativeProofRecords[0], proof);
    const { canonicalRecordJson } = await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const { hashSemanticContract, readRevisionDefinitions } = await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
    const { renderRevisionEvent } = await import('../../../../task-tracker/lib/criteria-revision/records.mjs');
    const { scope, ...execution } = proof.execution;
    const identities = scope.definitions.map(d => ({ identity: d.identity, section: d.section, rootId: d.rootId,
      definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]) }));
    const target = readRevisionDefinitions({ ...proof.after, identities }).find(d => d.identity === proof.criterionIdentity);
    const witness = { schema: 'aitm.native-individual-proof/v1', revisionEventHead: proof.revisionEventHead,
      criterionIdentity: proof.criterionIdentity,
      before: { body: proof.before.body, identities, protectedSourceBindings: proof.before.protectedSourceBindings,
        executor: proof.before.executor }, execution, after: { bodyHash: hashBytes(proof.after.body.bytes), proof: target.proof } };
    const event = backend.createdEvents.findLast(e => e.type === 'prepared');
    const actual = renderRevisionEvent(event);
    assert.deepEqual(event.proposal.archive.nativeIndividualProofs, [witness]);
    assert.ok(Buffer.byteLength(actual) <= 60000);
    t.diagnostic(JSON.stringify({ originalNativeJournalBytes: Buffer.byteLength(canonicalRecordJson(proof)),
      compactWitnessBytes: Buffer.byteLength(canonicalRecordJson(witness)),
      actualCompletePreparedEventBytes: Buffer.byteLength(actual),
      qualification: 'Actual closed validated rendered event; original proof witness bytes retained without truncation or allowance.' }));
    const originalAc = parseEvidenceAcs(proof.after.body.bytes)[0];
    const preservedAc = parseEvidenceAcs(backend.observation.body.bytes).find(ac => ac.label === originalAc.label);
    assert.ok(originalAc.evidenceMarker);
    assert.deepEqual(preservedAc?.evidenceMarker, originalAc.evidenceMarker);
    assert.equal(backend.observation.body.bytes.split('\n')[preservedAc.lineIndex],
      proof.after.body.bytes.split('\n')[originalAc.lineIndex]);
    const restarted = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const observedAfter = await observeRevision({ context, deps: restarted });
    assert.equal(observedAfter.status, 'applied', JSON.stringify(observedAfter));
    assert.deepEqual(restarted.snapshot.nativeProofRecords, backend.snapshot.nativeProofRecords);
    assert.deepEqual(restarted.snapshot.nativePlanRecords, backend.snapshot.nativePlanRecords);
  } finally { s.dispose(); }
});


test('untouched abort retains prior exact preserved-individual disposition for the next unrelated revision', async (t) => {
  const f = await approvedFixture();
  let backend = f.backend; const context = f.context;
  const original = parseEvidenceAcs(backend.observation.body.bytes).find(ac => ac.label.startsWith('Independent requirement'));
  assert.ok(original.evidenceMarker);
  const originalProposal = (await observeRevision({ context, deps: backend })).criteriaAuthority.proposal;
  assert.ok(originalProposal.invalidation.some(item => item.disposition === 'preserved-individual'));
  const prepare = (mode, transactionId, operationId, edits) => prepareRevision({ context, deps: backend,
    input: { mode, transactionId, operationId, reason: 'Keep exact preserved proof across untouched aborted target', edits } });
  const authorize = prepared => {
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    const messageId = prepared.proposal.operationId + '-human';
    backend.addHostMessage({ ...backend.snapshot.hostMessages[0], id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }] });
    return { schema: 'aitm.criteria-revision/v1', action: prepared.proposal.mode === 'revision' ? 'apply' : 'recover',
      proposal: prepared.proposal, authorizationSource: { schema: 'aitm.authorization-source/v1',
        adapter: context.executor.adapter, sessionId: context.executor.sessionId, messageId,
        statementHash: hashBytes(prepared.approvalStatement) } };
  };
  const replace = (prefix, occurrence, text, vc) => {
    const oldBytes = backend.observation.body.bytes.split('\n').find(line => /^- \[[ x]\]/.test(line) && line.includes(prefix));
    assert.ok(oldBytes);
    return { acceptanceCriteria: [{ operation: 'replace', occurrence, oldBytes, oldHash: hashBytes(oldBytes),
      replacements: [{ text, declaration: { kind: 'vc-list', vcIds: [vc] } }] }], verificationCommands: [] };
  };
  const request = authorize(await prepare('revision', 'prior-proof-abort', 'prior-proof-prepare',
    replace('Independent requirement', 3, 'Abandoned independent target', '2')));
  backend.failAfter = 'event-write:prepared';
  await assert.rejects(applyRevision({ context, deps: backend, request }), /interrupted/);
  backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  assert.equal((await recoverRevision({ context, deps: backend,
    request: authorize(await prepare('abort', 'prior-proof-abort', 'prior-proof-abort-operation',
      { acceptanceCriteria: [], verificationCommands: [] })) })).status, 'aborted');
  backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  const next = await prepare('revision', 'prior-proof-next', 'prior-proof-next-operation',
    replace('Supported model hooks', 1, 'Further supported hooks', '1'));
  const result = await applyRevision({ context, deps: backend, request: authorize(next) });
  assert.equal(result.status, 'applied', JSON.stringify(result));
  const retained = parseEvidenceAcs(backend.observation.body.bytes).find(ac => ac.label === original.label);
  assert.deepEqual(retained.evidenceMarker, original.evidenceMarker);
  assert.deepEqual(originalProposal, f.backend.createdEvents.find(e => e.type === 'prepared').proposal);
  await t.test('old absent archive keeps exact original conservative retirement derivation', async () => {
    // Explicit old-shape compatibility data, not authenticated historical execution.
    // The old latest-abort manifest retired all of these otherwise preserved rows.
    const old = structuredClone(next.proposal);
    delete old.archive.nativeIndividualProofs;
    assert.equal(Object.hasOwn(old.archive, 'nativeIndividualProofs'), false);
    const bodyWrite = old.writeSet.find(w => w.resource === 'issue-body');
    for (const item of old.invalidation.filter(x => x.disposition === 'preserved-individual')) {
      const before = old.archive.definitions.find(d => d.identity === item.criterionIdentity);
      const after = old.after.definitions.find(d => d.identity === item.criterionIdentity);
      assert.ok(before.proof && after);
      const stripped = before.originalBytes.replace(before.proof.bytes, before.declarationBytes).replace('- [x]', '- [ ]');
      assert.ok(bodyWrite.afterBytes.includes(before.originalBytes));
      bodyWrite.afterBytes = bodyWrite.afterBytes.replace(before.originalBytes, stripped);
      after.checked = false; after.proof = null;
      item.disposition = 'retired'; item.dependencyHash = null;
    }
    bodyWrite.afterHash = hashBytes(bodyWrite.afterBytes);
    const { hashRevisionValue, validateRevisionRequest } = await import('../../../../task-tracker/lib/criteria-revision/schema.mjs');
    const { canonicalRecordJson } = await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const { renderApprovalStatement } = await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
    delete old.proposalDigest; old.proposalDigest = hashRevisionValue(old);
    const oldBytes = canonicalRecordJson(old);
    const request = { schema: 'aitm.criteria-revision/v1', action: 'apply', proposal: old,
      authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: context.executor.adapter,
        sessionId: context.executor.sessionId, messageId: 'explicit-old-shape-data',
        statementHash: hashBytes(renderApprovalStatement(old)) } };
    assert.doesNotThrow(() => validateRevisionRequest(request));
    assert.equal(canonicalRecordJson(old), oldBytes);
    assert.deepEqual(backend.snapshot.nativePlanRecords, f.backend.snapshot.nativePlanRecords);
  });
});


test('private native proof collection never accepts caller supplied prepare witnesses', async () => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s); assert.equal(run.error, undefined);
    const { backend, context } = run;
    const observed = await observeRevision({ context, deps: backend });
    assert.equal(observed.status, 'applied', JSON.stringify(observed));
    assert.equal(observed.nativeIndividualProofs.length, 1);
    const before = backend.snapshot, effects = backend.effects.length;
    const result = await prepareRevision({ context, deps: backend, input: {
      mode: 'revision', transactionId: 'caller-witness', operationId: 'caller-witness-prepare',
      reason: 'Caller witness cannot become native authority', edits: { acceptanceCriteria: [], verificationCommands: [] },
      nativeIndividualProofs: structuredClone(observed.nativeIndividualProofs),
    } });
    assert.equal(result.status, 'refused');
    assert.match(result.code, /prepare-input/);
    assert.deepEqual(backend.snapshot, before);
    assert.equal(backend.effects.length, effects);
  } finally { s.dispose(); }
});


test('new private admission rejects missing empty and coherent substituted native archive witnesses before effects', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s); assert.equal(run.error, undefined);
    const { backend, context } = run;
    const observed = await observeRevision({ context, deps: backend });
    assert.equal(observed.nativeIndividualProofs.length, 1);
    const { deriveProposal, renderApprovalStatement } = await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
    const oldBytes = observed.observation.body.bytes.split('\n').find(line => line.includes('Independent requirement'));
    const edits = { acceptanceCriteria: [{ operation: 'replace', occurrence: 3, oldBytes, oldHash: hashBytes(oldBytes),
      replacements: [{ text: 'Unrelated criterion amendment', declaration: { kind: 'vc-list', vcIds: ['2'] } }] }], verificationCommands: [] };
    for (const variant of ['absent', 'empty', 'coherent-receipt']) await t.test(variant, async () => {
      const witnesses = structuredClone(observed.nativeIndividualProofs);
      if (variant === 'coherent-receipt') {
        // A different well-formed receipt ID leaves all execution/result/effect
        // data coherent. Only the actual retained native record can distinguish it.
        const id = witnesses[0].execution.receipt.receiptId;
        witnesses[0].execution.receipt.receiptId = id.slice(0, -1) + (id.endsWith('0') ? '1' : '0');
      }
      const proposal = deriveProposal({ observation: observed.observation, edits, executor: context.executor,
        mode: 'revision', reason: 'Exact private native archive authority', priorTransaction: null,
        transactionId: 'private-witness-' + variant, operationId: 'private-witness-' + variant,
        ...(variant === 'absent' ? {} : { nativeIndividualProofs: variant === 'empty' ? [] : witnesses }) });
      const statement = renderApprovalStatement(proposal), messageId = 'witness-human-' + variant;
      backend.addHostMessage({ ...backend.snapshot.hostMessages[0], id: messageId,
        content: [{ type: 'input_text', text: statement }] });
      const before = backend.snapshot, effects = backend.effects.length;
      const result = await applyRevision({ context, deps: backend, request: { schema: 'aitm.criteria-revision/v1', action: 'apply', proposal,
        authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: context.executor.adapter,
          sessionId: context.executor.sessionId, messageId, statementHash: hashBytes(statement) } } });
      assert.equal(result.status, 'refused', JSON.stringify(result));
      assert.match(result.code, /native-individual-authority/);
      assert.deepEqual(backend.snapshot, before);
      const reads = backend.effects.slice(effects);
      assert.deepEqual(reads, ['authority-read', 'page-read', 'native-history-readback', 'native-proof-record-readback']);
    });
  } finally { s.dispose(); }
});


test('original native proof provenance survives a fresh same-worktree executor observation', async () => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s); assert.equal(run.error, undefined);
    const original = run.backend.snapshot;
    const next = structuredClone(original);
    // Recognized memory supplies fixture current-executor authority. This is not
    // authenticated production host/session provenance or a native bind claim.
    next.observation.executor.sessionId = 'genuine-next-fixture-session';
    const context = { ...run.context, executor: next.observation.executor };
    const backend = createRevisionMemory(next);
    const observed = await observeRevision({ context, deps: backend });
    assert.equal(observed.status, 'applied', JSON.stringify(observed));
    assert.equal(observed.nativeIndividualProofs.length, 1);
    assert.deepEqual(observed.nativeIndividualProofs[0].before.executor, original.observation.executor);
    assert.deepEqual(backend.snapshot.nativeProofRecords, original.nativeProofRecords);
    assert.deepEqual(backend.snapshot.nativePlanRecords, original.nativePlanRecords);
  } finally { s.dispose(); }
});


test('native proof execution closes original provenance and receipt context fields', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s); assert.equal(run.error, undefined);
    const { validateNativeProofExecution } = await import('../../../../task-tracker/lib/criteria-revision/proof-execution.mjs');
    const original = run.backend.snapshot.nativeProofRecords[0].execution;
    for (const key of ['note', 'authorization']) await t.test(key, () => {
      const execution = structuredClone(original);
      execution.provenance[key] = 'unrecognized native provenance';
      execution.receipt.executionContext[key] = 'unrecognized native provenance';
      assert.throws(() => validateNativeProofExecution(execution), /native-proof-provenance-keys/);
      const receiptOnly = structuredClone(original);
      receiptOnly.receipt.executionContext[key] = 'unrecognized receipt context';
      assert.throws(() => validateNativeProofExecution(receiptOnly), /native-proof-receipt-context/);
    });
  } finally { s.dispose(); }
});


test('native witness semantic worktree key never exempts credential values from event scanning', async () => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s); assert.equal(run.error, undefined);
    const observed = await observeRevision({ context: run.context, deps: run.backend });
    const { deriveNativeProofJournal, projectNativeIndividualProofs, validateNativeProofExecution } = await import('../../../../task-tracker/lib/criteria-revision/proof-execution.mjs');
    const { deriveProposal, renderApprovalStatement } = await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
    const { createRevisionEvent, renderRevisionEvent } = await import('../../../../task-tracker/lib/criteria-revision/records.mjs');
    const { canonicalRecordJson } = await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const original = run.backend.snapshot.nativeProofRecords[0];
    const { assertNoSecretRecordData } = await import('../../../../task-tracker/lib/github-records/record-secret-policy.mjs');
    for (const value of [{ provenance: { worktreePath: 'Authorization: Bearer fixture-value' } },
      { receipt: { executionContext: { worktreePath: 'Authorization: Bearer fixture-value' } } }])
      assert.throws(() => assertNoSecretRecordData(value, { safeKeyNames: ['worktreePath'] }), /record-envelope:secret/);
    for (const where of ['provenance', 'receipt']) {
      const e = structuredClone(original.execution);
      const target = where === 'provenance' ? e.provenance : e.receipt.executionContext;
      target.worktreePath = path.join(target.worktreePath, 'Authorization: Bearer fixture-value');
      assert.throws(() => validateNativeProofExecution(e), /native-proof-receipt|native-proof-provenance/);
    }
    // Coherent pure fixture data reaches the actual event scanner. It is never
    // supplied as authenticated retained execution or admitted to private apply.
    const e = structuredClone(original.execution);
    const worktree = path.join(e.scope.executor.worktree, 'Authorization: Bearer fixture-value');
    e.scope.executor.worktree = worktree; e.scope.observation.executor.worktree = worktree;
    e.provenance.worktreePath = worktree; e.receipt.executionContext.worktreePath = worktree;
    e.fingerprint.environment.sandbox.identity = worktree;
    e.receipt.environment = structuredClone(e.fingerprint.environment);
    e.cacheNamespace = hashBytes(canonicalRecordJson({ binding: e.binding, fingerprint: e.fingerprint }));
    const journal = deriveNativeProofJournal(e, original.revisionEventHead);
    const observation = { ...structuredClone(observed.observation), body: journal.after.body, executor: e.scope.executor };
    const witnesses = projectNativeIndividualProofs({ observation, chain: observed.chain, completedProofRecords: [journal] });
    assert.equal(witnesses.length, 1);
    const oldBytes = observation.body.bytes.split('\n').find(line => line.includes('Independent requirement'));
    const proposal = deriveProposal({ observation, nativeIndividualProofs: witnesses,
      mode: 'revision', reason: 'Credential-bearing original data cannot publish', priorTransaction: null,
      executor: observation.executor, transactionId: 'credential-witness', operationId: 'credential-witness',
      edits: { acceptanceCriteria: [{ operation: 'replace', occurrence: 3, oldBytes, oldHash: hashBytes(oldBytes),
        replacements: [{ text: 'Unrelated requirement', declaration: { kind: 'vc-list', vcIds: ['2'] } }] }], verificationCommands: [] } });
    const event = createRevisionEvent({ request: { schema: 'aitm.criteria-revision/v1', action: 'apply', proposal,
      authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: observation.executor.adapter,
        sessionId: observation.executor.sessionId, messageId: 'credential-fixture-data', statementHash: hashBytes(renderApprovalStatement(proposal)) } }, predecessorEventId: observed.chain.head });
    assert.throws(() => renderRevisionEvent(event), /record-envelope:secret/);
    assert.equal(proposal.archive.nativeIndividualProofs[0].execution.provenance.worktreePath, worktree);
    assert.equal(proposal.archive.nativeIndividualProofs[0].execution.receipt.executionContext.worktreePath, worktree);
  } finally { s.dispose(); }
});


test('fresh legacy observer cannot relax foreign stale pending or original native authority', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s); assert.equal(run.error, undefined);
    const original = run.backend.snapshot;
    const { mutateIssueBody } = await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
    const variants = [
      ['branch', snapshot => { snapshot.observation.executor.branch = 'foreign-branch'; }],
      ['worktree', snapshot => { snapshot.observation.executor.worktree = path.join(s.context.sourceRoot, 'other-checkout'); }],
      ['domain', snapshot => { snapshot.observation.writerDomain.hostId = 'foreign-host'; }],
      ['source', snapshot => { snapshot.observation.body.bytes = snapshot.observation.body.bytes.replace('Synthetic scope', 'Foreign scope'); }],
      ['source-binding', snapshot => { snapshot.observation.protectedSourceBindings[0].hash = hashBytes('different-source'); }],
      ['stale-approval', snapshot => { snapshot.observation.body.bytes = snapshot.observation.body.bytes.replace(/<!-- aitm-plan-approved[^]*?-->/, ''); }],
      ['missing-plan-history', snapshot => {
        snapshot.nativePlanRecords = [];
        snapshot.nativeOrder = snapshot.nativeOrder.filter(ref => ref.kind !== 'plan');
        snapshot.nativeOrder[0].predecessor = null;
      }],
      ['pending-native-proof', snapshot => {
        snapshot.observation.body = structuredClone(snapshot.nativeProofRecords[0].before.body);
        snapshot.planning.bodyHash = hashBytes(snapshot.observation.body.bytes);
      }],
      ['original-proof-executor', snapshot => { snapshot.nativeProofRecords[0].execution.scope.executor.sessionId = 'altered-original'; }],
      ['original-plan-executor', snapshot => { snapshot.nativePlanRecords[0].before.executor.sessionId = 'altered-original'; }],
    ];
    for (const [name, alter] of variants) await t.test(name, async () => {
      const snapshot = structuredClone(original);
      snapshot.observation.executor.sessionId = 'fresh-negative-session'; alter(snapshot);
      if (name === 'original-proof-executor' || name === 'original-plan-executor') {
        assert.throws(() => createRevisionMemory(snapshot), /native-proof-execution|native-order-reference/);
        return; // Constructor boundary refusal, not a semantic adapter invocation.
      }
      const backend = createRevisionMemory(snapshot), admittedBefore = backend.snapshot;
      const context = { ...run.context, executor: snapshot.observation.executor };
      const observed = await observeRevision({ context, deps: backend });
      assert.notEqual(observed.status, 'applied', JSON.stringify(observed));
      let effects = 0;
      await assert.rejects(mutateIssueBody({ repo: context.repository, issueNumber: context.issue,
        mutate: body => { effects++; return body + '\nforbidden\n'; }, deps: { revisionBackend: backend,
          fetchBody: async () => { effects++; return backend.observation.body.bytes; }, pushBody: async () => { effects++; } } }));
      assert.equal(effects, 0);
      assert.deepEqual(backend.snapshot, admittedBefore);
    });
  } finally { s.dispose(); }
});

for (const fault of ['event-write:prepared', 'body-write']) {
  for (const recovery of ['original-retry', 'resume', 'forward-repair']) {
    test(`nonempty native witness ${recovery} retains original proof after ${fault}`, async (t) => {
      const s = createSandbox();
      try {
        const run = await realNativeStamp(s); assert.equal(run.error, undefined);
        let backend = run.backend; const { context } = run;
        const originalProof = structuredClone(backend.snapshot.nativeProofRecords[0]);
        const prepare = (mode, operationId, text) => {
          const oldBytes = backend.observation.body.bytes.split('\n').find(line => line.includes('Independent requirement') || line.includes('Unrelated successor'));
          return prepareRevision({ context, deps: backend, input: { mode, transactionId: 'nonempty-recovery', operationId,
            reason: 'Keep genuine unaffected native proof through exact recovery', edits: {
              acceptanceCriteria: mode === 'resume' ? [] : [{ operation: 'replace', occurrence: 3,
                oldBytes, oldHash: hashBytes(oldBytes), replacements: [{ text,
                  declaration: { kind: 'vc-list', vcIds: ['2'] } }] }], verificationCommands: [] } } });
        };
        const authorize = prepared => {
          assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
          const messageId = prepared.proposal.operationId + '-human';
          backend.addHostMessage({ ...backend.snapshot.hostMessages[0], id: messageId,
            content: [{ type: 'input_text', text: prepared.approvalStatement }] });
          return { schema: 'aitm.criteria-revision/v1', action: prepared.proposal.mode === 'revision' ? 'apply' : 'recover',
            proposal: prepared.proposal, authorizationSource: { schema: 'aitm.authorization-source/v1',
              adapter: context.executor.adapter, sessionId: context.executor.sessionId, messageId,
              statementHash: hashBytes(prepared.approvalStatement) } };
        };
        const prepared = await prepare('revision', 'nonempty-first', 'Unrelated successor requirement');
        const request = authorize(prepared);
        assert.equal(request.proposal.archive.nativeIndividualProofs.length, 1);
        backend.failAfter = fault;
        await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
        const interrupted = backend.snapshot;
        backend = createRevisionMemory(JSON.parse(JSON.stringify(interrupted)));
        let result;
        if (recovery === 'original-retry') result = await applyRevision({ context, request, deps: backend });
        else {
          const next = await prepare(recovery, 'nonempty-' + recovery, 'Unrelated successor repaired');
          t.diagnostic(JSON.stringify({ recovery, fault, status: next.status, code: next.code }));
          const nextRequest = authorize(next);
          assert.equal(nextRequest.proposal.archive.nativeIndividualProofs.length, 1);
          if (recovery === 'resume') {
            assert.deepEqual(nextRequest.proposal.after, request.proposal.after);
            assert.deepEqual(nextRequest.proposal.invalidation, request.proposal.invalidation);
          }
          result = await recoverRevision({ context, request: nextRequest, deps: backend });
        }
        assert.equal(result.status, 'applied', JSON.stringify(result));
        assert.deepEqual(backend.snapshot.nativeProofRecords, [originalProof]);
        const originalAc = parseEvidenceAcs(originalProof.after.body.bytes)[0];
        const currentAc = parseEvidenceAcs(backend.observation.body.bytes).find(ac => ac.label === originalAc.label);
        assert.deepEqual(currentAc.evidenceMarker, originalAc.evidenceMarker);
        assert.deepEqual(backend.snapshot.comments.slice(0, interrupted.comments.length), interrupted.comments);
        const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
        assert.equal((await observeRevision({ context, deps: restored })).status, 'applied');
      } finally { s.dispose(); }
    });
  }
}

test('nonempty native witness cannot hide unrelated current authority drift before admission', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s); assert.equal(run.error, undefined);
    const { backend, context } = run;
    const oldBytes = backend.observation.body.bytes.split('\n').find(line => line.includes('Independent requirement'));
    const prepared = await prepareRevision({ context, deps: backend, input: { mode: 'revision',
      transactionId: 'witness-resource-drift', operationId: 'witness-resource-drift', reason: 'Unchanged proof cannot authorize unrelated resource drift',
      edits: { acceptanceCriteria: [{ operation: 'replace', occurrence: 3, oldBytes, oldHash: hashBytes(oldBytes),
        replacements: [{ text: 'Unrelated successor requirement', declaration: { kind: 'vc-list', vcIds: ['2'] } }] }], verificationCommands: [] } } });
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    assert.equal(prepared.proposal.archive.nativeIndividualProofs.length, 1);
    const messageId = 'witness-resource-human';
    backend.addHostMessage({ ...backend.snapshot.hostMessages[0], id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }] });
    const request = { schema: 'aitm.criteria-revision/v1', action: 'apply', proposal: prepared.proposal,
      authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: context.executor.adapter,
        sessionId: context.executor.sessionId, messageId, statementHash: hashBytes(prepared.approvalStatement) } };
    for (const [name, alter] of [
      ['stage', x => { x.observation.stage = 'test'; }],
      ['issue-state', x => { x.observation.issueState = 'closed'; }],
      ['control', x => { x.observation.body.bytes += '\n<!-- aitm-test-started: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:2026-10-06T00:00:00Z -->'; }],
      ['source', x => { x.observation.protectedSourceBindings[0].hash = hashBytes('changed source'); }],
      ['unrelated-record', x => { x.observation.proofRecords.push({ kind: 'historical', identity: 'unrelated', bytes: 'unrelated record', criterionIdentity: null }); }],
      ['planning', x => { x.planning.bodyHash = hashBytes('changed planning body'); }],
    ]) await t.test(name, async () => {
      const changed = JSON.parse(JSON.stringify(backend.snapshot)); alter(changed);
      const fresh = createRevisionMemory(changed), before = fresh.snapshot;
      const result = await applyRevision({ context, deps: fresh, request });
      assert.equal(result.status, 'refused', JSON.stringify(result));
      assert.deepEqual(fresh.snapshot, before);
      assert.ok(fresh.effects.every(effect => ['authority-read', 'page-read', 'native-history-readback', 'native-proof-record-readback'].includes(effect)), JSON.stringify(fresh.effects));
    });
  } finally { s.dispose(); }
});
