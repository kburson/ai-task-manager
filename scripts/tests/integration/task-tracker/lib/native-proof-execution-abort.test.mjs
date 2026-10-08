// @story #1855

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { parseEvidenceAcs } from '../../../../task-tracker/lib/ac-evidence.mjs';

const exec = promisify(execFile);
import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { verbDodStamp } from '../../../../task-tracker/verbs/dod-stamp.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import {
  observeRevision,
  prepareRevision,
  applyRevision,
  recoverRevision,
} from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { before, after } from 'node:test';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-proof-execution-abort';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-proof-execution-abort');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

async function realNativeStamp(s, fault = null, kind = 'ac') {
  writeFileSync(path.join(s.context.sourceRoot, 'package-lock.json'), '{}');
  writeFileSync(
    path.join(s.context.sourceRoot, 'supported-hook.test.mjs'),
    'import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; assert.equal(readFileSync(new URL("./source.txt", import.meta.url), "utf8"), "baseline\\n");'
  );
  execFileSync('git', ['add', 'package-lock.json', 'supported-hook.test.mjs'], {
    cwd: s.context.sourceRoot,
    env: s.env,
  });
  execFileSync('git', ['commit', '-qm', 'Native verifier fixture'], {
    cwd: s.context.sourceRoot,
    env: s.env,
  });
  const f = await approvedFixture({
    worktree: s.context.sourceRoot,
    branch: 'trunk',
    sharedDodCitation: kind === 'dod',
  });
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
      assert.ok(
        backend.effects.includes('native-proof-journal-readback') ||
          backend.effects.includes('native-proof-record-readback'),
        'original journal must be read back before proof push'
      );
      if (fault?.push === 'before') throw new Error('uncertain transport');
      body = options.input;
      const next = backend.observation;
      next.body = { bytes: body, version: parseBodyVersion(body) };
      backend.replaceAuthority(next);
      backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
      if (fault?.push === 'after') throw new Error('uncertain transport');
      return { stdout: '' };
    }
    if (bin === 'node') effects.push('verifier');
    return exec(bin, args, { ...options, cwd: s.context.sourceRoot, env: s.env });
  };
  const invoke = (target = null) =>
    (kind === 'ac' ? verbAcStamp : verbDodStamp)({
      cfg: { repo: context.repository },
      projectDir: s.context.sourceRoot,
      statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
      rest: [target ?? (kind === 'ac' ? parseEvidenceAcs(body)[0].label : 'tests')],
      pexec,
      deps: { revisionBackend: backend, getLiveState: async () => 'develop' },
    });
  let error;
  try {
    await invoke();
  } catch (caught) {
    error = caught;
  }
  return {
    get backend() {
      return backend;
    },
    context,
    effects,
    error,
    async retry({ target, alter } = {}) {
      const snapshot = JSON.parse(JSON.stringify(backend.snapshot));
      if (alter) alter(snapshot);
      backend = createRevisionMemory(snapshot);
      body = backend.observation.body.bytes;
      if (fault) {
        delete fault.before;
        delete fault.after;
        delete fault.push;
      }
      return invoke(target);
    },
  };
}

test('untouched abort does not retire actual native proof when a later revision changes a different criterion', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
    let backend = run.backend;
    const context = run.context;
    const proof = backend.snapshot.nativeProofRecords[0];
    const { assertNoSecretRecordData } =
      await import('../../../../task-tracker/lib/github-records/record-secret-policy.mjs');
    const inspected = await observeRevision({ context, deps: backend });
    const rejectedKeys = [];
    const inspectKeys = (value, parts = []) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        try {
          assertNoSecretRecordData(
            { [key]: null },
            {
              safeKeyNames: [
                'authority',
                'authorityIdentities',
                'authorizer',
                'authorizationSource',
                'authorityEpoch',
              ],
            }
          );
        } catch {
          rejectedKeys.push([...parts, key].join('.'));
        }
        inspectKeys(child, [...parts, key]);
      }
    };
    inspectKeys(inspected.nativeIndividualProofs);
    t.diagnostic(JSON.stringify({ nativeWitnessRejectedKeyPaths: rejectedKeys }));
    const prepare = (mode, transactionId, operationId, edits) =>
      prepareRevision({
        context,
        deps: backend,
        input: {
          mode,
          transactionId,
          operationId,
          reason: 'Retain proof unaffected by an untouched aborted proposal',
          edits,
        },
      });
    const authorize = (result) => {
      assert.equal(result.status, 'prepared', JSON.stringify(result));
      const messageId = result.proposal.operationId + '-human';
      backend.addHostMessage({
        ...backend.snapshot.hostMessages[0],
        id: messageId,
        content: [{ type: 'input_text', text: result.approvalStatement }],
      });
      return {
        schema: 'aitm.criteria-revision/v1',
        action: result.proposal.mode === 'revision' ? 'apply' : 'recover',
        proposal: result.proposal,
        authorizationSource: {
          schema: 'aitm.authorization-source/v1',
          adapter: context.executor.adapter,
          sessionId: context.executor.sessionId,
          messageId,
          statementHash: hashBytes(result.approvalStatement),
        },
      };
    };
    const replacement = (prefix, occurrence, text, vc) => {
      const oldBytes = backend.observation.body.bytes
        .split('\n')
        .find((line) => /^- \[[ x]\]/.test(line) && line.includes(prefix));
      assert.ok(oldBytes);
      return {
        acceptanceCriteria: [
          {
            operation: 'replace',
            occurrence,
            oldBytes,
            oldHash: hashBytes(oldBytes),
            replacements: [{ text, declaration: { kind: 'vc-list', vcIds: [vc] } }],
          },
        ],
        verificationCommands: [],
      };
    };
    const request = authorize(
      await prepare(
        'revision',
        'proof-untouched-abort',
        'proof-abort-prepare',
        replacement('Supported model hooks', 1, 'Abandoned changed hooks', '1')
      )
    );
    backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const abort = await recoverRevision({
      context,
      deps: backend,
      request: authorize(
        await prepare('abort', 'proof-untouched-abort', 'proof-abort-operation', {
          acceptanceCriteria: [],
          verificationCommands: [],
        })
      ),
    });
    assert.equal(abort.status, 'aborted', JSON.stringify(abort));
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const next = await prepare(
      'revision',
      'proof-preserving-next',
      'proof-preserving-operation',
      replacement('Independent requirement', 3, 'Changed independent requirement', '2')
    );
    assert.equal(next.status, 'prepared', JSON.stringify(next));
    const result = await applyRevision({ context, deps: backend, request: authorize(next) });
    assert.equal(result.status, 'applied', JSON.stringify(result));
    assert.deepEqual(backend.snapshot.nativeProofRecords[0], proof);
    const { canonicalRecordJson } =
      await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const { hashSemanticContract, readRevisionDefinitions } =
      await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
    const { renderRevisionEvent } =
      await import('../../../../task-tracker/lib/criteria-revision/records.mjs');
    const { scope, ...execution } = proof.execution;
    const identities = scope.definitions.map((d) => ({
      identity: d.identity,
      section: d.section,
      rootId: d.rootId,
      definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]),
    }));
    const target = readRevisionDefinitions({ ...proof.after, identities }).find(
      (d) => d.identity === proof.criterionIdentity
    );
    const witness = {
      schema: 'aitm.native-individual-proof/v1',
      revisionEventHead: proof.revisionEventHead,
      criterionIdentity: proof.criterionIdentity,
      before: {
        body: proof.before.body,
        identities,
        protectedSourceBindings: proof.before.protectedSourceBindings,
        executor: proof.before.executor,
      },
      execution,
      after: { bodyHash: hashBytes(proof.after.body.bytes), proof: target.proof },
    };
    const event = backend.createdEvents.findLast((e) => e.type === 'prepared');
    const actual = renderRevisionEvent(event);
    assert.deepEqual(event.proposal.archive.nativeIndividualProofs, [witness]);
    assert.ok(Buffer.byteLength(actual) <= 60000);
    t.diagnostic(
      JSON.stringify({
        originalNativeJournalBytes: Buffer.byteLength(canonicalRecordJson(proof)),
        compactWitnessBytes: Buffer.byteLength(canonicalRecordJson(witness)),
        actualCompletePreparedEventBytes: Buffer.byteLength(actual),
        qualification:
          'Actual closed validated rendered event; original proof witness bytes retained without truncation or allowance.',
      })
    );
    const originalAc = parseEvidenceAcs(proof.after.body.bytes)[0];
    const preservedAc = parseEvidenceAcs(backend.observation.body.bytes).find(
      (ac) => ac.label === originalAc.label
    );
    assert.ok(originalAc.evidenceMarker);
    assert.deepEqual(preservedAc?.evidenceMarker, originalAc.evidenceMarker);
    assert.equal(
      backend.observation.body.bytes.split('\n')[preservedAc.lineIndex],
      proof.after.body.bytes.split('\n')[originalAc.lineIndex]
    );
    const restarted = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const observedAfter = await observeRevision({ context, deps: restarted });
    assert.equal(observedAfter.status, 'applied', JSON.stringify(observedAfter));
    assert.deepEqual(restarted.snapshot.nativeProofRecords, backend.snapshot.nativeProofRecords);
    assert.deepEqual(restarted.snapshot.nativePlanRecords, backend.snapshot.nativePlanRecords);
  } finally {
    s.dispose();
  }
});

test('untouched abort retains prior exact preserved-individual disposition for the next unrelated revision', async (t) => {
  const f = await approvedFixture();
  let backend = f.backend;
  const context = f.context;
  const original = parseEvidenceAcs(backend.observation.body.bytes).find((ac) =>
    ac.label.startsWith('Independent requirement')
  );
  assert.ok(original.evidenceMarker);
  const originalProposal = (await observeRevision({ context, deps: backend })).criteriaAuthority
    .proposal;
  assert.ok(
    originalProposal.invalidation.some((item) => item.disposition === 'preserved-individual')
  );
  const prepare = (mode, transactionId, operationId, edits) =>
    prepareRevision({
      context,
      deps: backend,
      input: {
        mode,
        transactionId,
        operationId,
        reason: 'Keep exact preserved proof across untouched aborted target',
        edits,
      },
    });
  const authorize = (prepared) => {
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    const messageId = prepared.proposal.operationId + '-human';
    backend.addHostMessage({
      ...backend.snapshot.hostMessages[0],
      id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }],
    });
    return {
      schema: 'aitm.criteria-revision/v1',
      action: prepared.proposal.mode === 'revision' ? 'apply' : 'recover',
      proposal: prepared.proposal,
      authorizationSource: {
        schema: 'aitm.authorization-source/v1',
        adapter: context.executor.adapter,
        sessionId: context.executor.sessionId,
        messageId,
        statementHash: hashBytes(prepared.approvalStatement),
      },
    };
  };
  const replace = (prefix, occurrence, text, vc) => {
    const oldBytes = backend.observation.body.bytes
      .split('\n')
      .find((line) => /^- \[[ x]\]/.test(line) && line.includes(prefix));
    assert.ok(oldBytes);
    return {
      acceptanceCriteria: [
        {
          operation: 'replace',
          occurrence,
          oldBytes,
          oldHash: hashBytes(oldBytes),
          replacements: [{ text, declaration: { kind: 'vc-list', vcIds: [vc] } }],
        },
      ],
      verificationCommands: [],
    };
  };
  const request = authorize(
    await prepare(
      'revision',
      'prior-proof-abort',
      'prior-proof-prepare',
      replace('Independent requirement', 3, 'Abandoned independent target', '2')
    )
  );
  backend.failAfter = 'event-write:prepared';
  await assert.rejects(applyRevision({ context, deps: backend, request }), /interrupted/);
  backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  assert.equal(
    (
      await recoverRevision({
        context,
        deps: backend,
        request: authorize(
          await prepare('abort', 'prior-proof-abort', 'prior-proof-abort-operation', {
            acceptanceCriteria: [],
            verificationCommands: [],
          })
        ),
      })
    ).status,
    'aborted'
  );
  backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  const next = await prepare(
    'revision',
    'prior-proof-next',
    'prior-proof-next-operation',
    replace('Supported model hooks', 1, 'Further supported hooks', '1')
  );
  const result = await applyRevision({ context, deps: backend, request: authorize(next) });
  assert.equal(result.status, 'applied', JSON.stringify(result));
  const retained = parseEvidenceAcs(backend.observation.body.bytes).find(
    (ac) => ac.label === original.label
  );
  assert.deepEqual(retained.evidenceMarker, original.evidenceMarker);
  assert.deepEqual(
    originalProposal,
    f.backend.createdEvents.find((e) => e.type === 'prepared').proposal
  );
  await t.test(
    'old absent archive keeps exact original conservative retirement derivation',
    async () => {
      // Explicit old-shape compatibility data, not authenticated historical execution.
      // The old latest-abort manifest retired all of these otherwise preserved rows.
      const old = structuredClone(next.proposal);
      delete old.archive.nativeIndividualProofs;
      assert.equal(Object.hasOwn(old.archive, 'nativeIndividualProofs'), false);
      const bodyWrite = old.writeSet.find((w) => w.resource === 'issue-body');
      for (const item of old.invalidation.filter((x) => x.disposition === 'preserved-individual')) {
        const before = old.archive.definitions.find((d) => d.identity === item.criterionIdentity);
        const after = old.after.definitions.find((d) => d.identity === item.criterionIdentity);
        assert.ok(before.proof && after);
        const stripped = before.originalBytes
          .replace(before.proof.bytes, before.declarationBytes)
          .replace('- [x]', '- [ ]');
        assert.ok(bodyWrite.afterBytes.includes(before.originalBytes));
        bodyWrite.afterBytes = bodyWrite.afterBytes.replace(before.originalBytes, stripped);
        after.checked = false;
        after.proof = null;
        item.disposition = 'retired';
        item.dependencyHash = null;
      }
      bodyWrite.afterHash = hashBytes(bodyWrite.afterBytes);
      const { hashRevisionValue, validateRevisionRequest } =
        await import('../../../../task-tracker/lib/criteria-revision/schema.mjs');
      const { canonicalRecordJson } =
        await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
      const { renderApprovalStatement } =
        await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
      delete old.proposalDigest;
      old.proposalDigest = hashRevisionValue(old);
      const oldBytes = canonicalRecordJson(old);
      const request = {
        schema: 'aitm.criteria-revision/v1',
        action: 'apply',
        proposal: old,
        authorizationSource: {
          schema: 'aitm.authorization-source/v1',
          adapter: context.executor.adapter,
          sessionId: context.executor.sessionId,
          messageId: 'explicit-old-shape-data',
          statementHash: hashBytes(renderApprovalStatement(old)),
        },
      };
      assert.doesNotThrow(() => validateRevisionRequest(request));
      assert.equal(canonicalRecordJson(old), oldBytes);
      assert.deepEqual(backend.snapshot.nativePlanRecords, f.backend.snapshot.nativePlanRecords);
    }
  );
});
