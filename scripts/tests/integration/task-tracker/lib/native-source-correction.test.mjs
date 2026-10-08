// @story #1855
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import {
  validateVerificationReceiptStructure,
  validateVerificationReceipt,
  validateVerificationReceiptCommandAuthority,
  parseValidatedVerificationReceiptClaims,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';

async function setup({ priorFixtureSession = false } = {}) {
  const s = createSandbox(),
    sid = currentSessionId();
  const f = await approvedFixture({
    worktree: s.context.sourceRoot,
    branch: 'trunk',
    sessionId: priorFixtureSession ? 'prior-fixture-session' : sid,
  });
  let backend = f.backend,
    pushes = 0,
    transportFault = null;
  setActiveTask(
    sid,
    {
      issue: `#${f.context.issue}`,
      entryStartTs: new Date().toISOString(),
      worktreePath: s.context.sourceRoot,
      worktreeBranch: 'trunk',
      kanbanState: 'develop',
    },
    s.context.sourceRoot
  );
  const operation = {
    schema: 'aitm.issue-body-operation/v1',
    kind: 'replace-exact',
    expectedVersion: backend.observation.body.version,
    expected: 'Synthetic scope',
    replacement: 'Corrected scope',
  };
  const operationFile = path.join(s.context.sourceRoot, 'scope-operation.json');
  fs.writeFileSync(operationFile, JSON.stringify(operation));
  const correct = () =>
    runIssueBodyVerb(
      {
        cfg: { repo: f.context.repository },
        projectDir: s.context.sourceRoot,
        statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
        rest: [String(f.context.issue), '--operation-file', operationFile],
      },
      {
        revisionBackend: backend,
        writeDeps: {
          revisionBackend: backend,
          fetchBody: async () => backend.observation.body.bytes,
          pushBody: async (_repo, _issue, body) => {
            assert.ok(
              backend.effects.includes('native-source-journal-readback') ||
                backend.effects.includes('native-history-readback')
            );
            if (transportFault === 'before') throw new Error('uncertain source transport');
            pushes++;
            const next = backend.observation;
            next.body = { bytes: body, version: parseBodyVersion(body) };
            const scope = body.split('## Scope\n')[1].split('\n## ')[0].trim();
            next.protectedSourceBindings = next.protectedSourceBindings.map((b) =>
              b.identity === 'scope' ? { ...b, hash: hashBytes(scope) } : b
            );
            // Collection of the actual deterministic transport effect; this is not an approval.
            backend.replaceAuthority(next);
            backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
            if (transportFault === 'after') throw new Error('uncertain source transport');
          },
        },
      }
    );
  const approve = () =>
    runPlanApprove({
      issueNumber: f.context.issue,
      cfg: { repo: f.context.repository },
      projectDir: s.context.sourceRoot,
      deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } },
    });
  const denied = async () => {
    let effects = 0;
    await assert.rejects(
      mutateIssueBody({
        repo: f.context.repository,
        issueNumber: f.context.issue,
        mutate: (body) => {
          effects++;
          return body + '\nforbidden\n';
        },
        deps: {
          revisionBackend: backend,
          fetchBody: async () => {
            effects++;
            return backend.observation.body.bytes;
          },
          pushBody: async () => {
            effects++;
          },
        },
      })
    );
    assert.equal(effects, 0);
  };
  return {
    s,
    context: f.context,
    operation,
    correct,
    approve,
    denied,
    get backend() {
      return backend;
    },
    get pushes() {
      return pushes;
    },
    restore(snapshot = backend.snapshot) {
      backend = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
    },
    transport(value) {
      transportFault = value;
    },
  };
}

for (const fault of [
  { phase: 'failBefore', step: 'native-source-journal-write' },
  { phase: 'failAfter', step: 'native-source-journal-write' },
  { phase: 'failBefore', step: 'native-source-journal-readback' },
  { phase: 'failAfter', step: 'native-source-journal-readback' },
  { transport: 'before' },
  { transport: 'after' },
]) {
  test(`actual Scope adapter completes exact interrupted ${JSON.stringify(fault)} after durable restart without duplicate source effects`, async () => {
    const f = await setup();
    try {
      const events = f.backend.createdEvents;
      if (fault.phase) f.backend[fault.phase] = fault.step;
      if (fault.transport) f.transport(fault.transport);
      await assert.rejects(f.correct(), /interrupted|uncertain/);
      f.restore();
      f.transport(null);
      if (fault.step !== 'native-source-journal-write' || fault.phase !== 'failBefore')
        await f.denied();
      await f.correct();
      assert.equal(f.pushes, 1);
      assert.equal(f.backend.snapshot.nativeSourceRecords.length, 1);
      assert.equal(
        (await observeRevision({ context: f.context, deps: f.backend })).status,
        'applied'
      );
      f.restore();
      await f.correct();
      assert.equal(f.pushes, 1);
      assert.deepEqual(f.backend.createdEvents, events);
      await f.denied();
      assert.equal((await f.approve()).status, 'approved');
    } finally {
      f.s.dispose();
    }
  });
}

for (const phase of ['failBefore', 'failAfter']) {
  for (const step of [
    'plan-journal-write',
    'plan-audit-write',
    'plan-body-write',
    'native-plan-record-write',
    'native-plan-record-readback',
  ]) {
    test(`real corrected-source Plan ${phase} ${step} retains deny and resumes through the original Plan verb`, async () => {
      const f = await setup();
      try {
        await f.correct();
        f.backend[phase] = step;
        await assert.rejects(f.approve(), /interrupted/);
        f.restore();
        await f.denied();
        assert.equal((await f.approve()).status, 'approved');
        assert.deepEqual(
          f.backend.snapshot.nativeOrder.map((r) => r.kind),
          ['plan', 'source', 'plan']
        );
        f.restore();
        assert.equal(
          (await observeRevision({ context: f.context, deps: f.backend })).status,
          'applied'
        );
      } finally {
        f.s.dispose();
      }
    });
  }
}

for (const drift of [
  'stage',
  'body',
  'scope',
  'event',
  'source-record',
  'missing-source',
  'session',
  'intent',
]) {
  test(`interrupted native source ${drift} drift refuses before any resumed body transport`, async () => {
    const f = await setup();
    try {
      f.backend.failAfter = 'native-source-journal-readback';
      await assert.rejects(f.correct(), /interrupted/);
      const snapshot = JSON.parse(JSON.stringify(f.backend.snapshot));
      if (drift === 'stage') snapshot.observation.stage = 'test';
      if (drift === 'body') snapshot.observation.body.bytes += '\nforeign\n';
      if (drift === 'scope')
        snapshot.observation.protectedSourceBindings[0].hash = hashBytes('foreign');
      if (drift === 'event')
        snapshot.comments.find((c) => /criteria-revision-event/.test(c.body)).body += 'foreign';
      if (drift === 'source-record') snapshot.nativeSourceRecords[0].after.body.bytes += 'foreign';
      if (drift === 'missing-source') delete snapshot.nativeSourceRecords;
      if (drift === 'session')
        setActiveTask(currentSessionId(), { worktreeBranch: 'foreign' }, f.s.context.sourceRoot);
      if (drift === 'intent')
        fs.writeFileSync(
          path.join(f.s.context.sourceRoot, 'scope-operation.json'),
          JSON.stringify({ ...f.operation, replacement: 'Foreign scope' })
        );
      let refused = false;
      try {
        f.restore(snapshot);
        await f.correct();
      } catch {
        refused = true;
      }
      assert.equal(refused, true);
      assert.equal(f.pushes, 0);
    } finally {
      f.s.dispose();
    }
  });
}

import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
test('coherently reindexed native Plan/source interleaving cannot replace the actual predecessor sequence', async () => {
  const f = await setup();
  try {
    await f.correct();
    assert.equal((await f.approve()).status, 'approved');
    const snapshot = JSON.parse(JSON.stringify(f.backend.snapshot));
    const first = snapshot.nativePlanRecords[0],
      last = snapshot.nativePlanRecords[1],
      source = snapshot.nativeSourceRecords[0];
    const planId = (j) => hashBytes(canonicalRecordJson(j));
    source.predecessor = planId(last);
    const { id: _id, ...content } = source;
    source.id = hashBytes(canonicalRecordJson(content));
    snapshot.nativeOrder = [
      {
        kind: 'plan',
        id: planId(last),
        revisionEventHead: last.revisionEventHead,
        predecessor: null,
      },
      {
        kind: 'source',
        id: source.id,
        revisionEventHead: source.revisionEventHead,
        predecessor: planId(last),
      },
      {
        kind: 'plan',
        id: planId(first),
        revisionEventHead: first.revisionEventHead,
        predecessor: source.id,
      },
    ];
    f.restore(snapshot);
    assert.equal(
      (await observeRevision({ context: f.context, deps: f.backend })).status,
      'indeterminate'
    );
    await f.denied();
    assert.equal(f.pushes, 1);
  } finally {
    f.s.dispose();
  }
});

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { parseEvidenceAcs } from '../../../../task-tracker/lib/ac-evidence.mjs';
const exec = promisify(execFile);
for (const freshSession of [false, true])
  test(
    'actual runner proof, Scope retirement, normal reapproval and fresh proof reconstruct in their native order after restart' +
      (freshSession ? ' with a fresh same-checkout session' : ''),
    async () => {
      const f = await setup({ priorFixtureSession: freshSession });
      try {
        fs.writeFileSync(path.join(f.s.context.sourceRoot, 'package-lock.json'), '{}');
        fs.writeFileSync(
          path.join(f.s.context.sourceRoot, 'supported-hook.test.mjs'),
          'import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; assert.equal(readFileSync(new URL("./source.txt", import.meta.url), "utf8"), "baseline\\n");'
        );
        execFileSync(
          'git',
          ['add', 'package-lock.json', 'supported-hook.test.mjs', 'scope-operation.json'],
          { cwd: f.s.context.sourceRoot, env: f.s.env }
        );
        execFileSync('git', ['commit', '-qm', 'Native source continuation fixture'], {
          cwd: f.s.context.sourceRoot,
          env: f.s.env,
        });
        let executions = 0,
          proofPushes = 0;
        const pexec = async (bin, args, options = {}) => {
          if (bin === 'gh' && args[1] === 'view')
            return { stdout: f.backend.observation.body.bytes };
          if (bin === 'gh' && args[1] === 'edit') {
            proofPushes++;
            const next = f.backend.observation;
            next.body = { bytes: options.input, version: parseBodyVersion(options.input) };
            f.backend.replaceAuthority(next);
            f.backend.replacePlanning({
              ...f.backend.snapshot.planning,
              bodyHash: hashBytes(options.input),
            });
            return { stdout: '' };
          }
          if (bin === 'node') executions++;
          return exec(bin, args, { ...options, cwd: f.s.context.sourceRoot, env: f.s.env });
        };
        const stamp = () =>
          verbAcStamp({
            cfg: { repo: f.context.repository },
            projectDir: f.s.context.sourceRoot,
            statePath: path.join(
              f.s.context.sourceRoot,
              '.ai-task-manager',
              'task-tracker-state.json'
            ),
            rest: [parseEvidenceAcs(f.backend.observation.body.bytes)[0].label],
            pexec,
            deps: { revisionBackend: f.backend, getLiveState: async () => 'develop' },
          });
        await stamp();
        const priorProof = f.backend.snapshot.nativeProofRecords[0];
        const originalPlan = f.backend.snapshot.nativePlanRecords[0];
        if (freshSession) {
          const snapshot = f.backend.snapshot;
          snapshot.observation.executor.sessionId = currentSessionId();
          f.restore(snapshot);
          f.context.executor = snapshot.observation.executor;
        }
        // The operation precondition follows the actual newly stamped body.
        fs.writeFileSync(
          path.join(f.s.context.sourceRoot, 'scope-operation.json'),
          JSON.stringify({ ...f.operation, expectedVersion: f.backend.observation.body.version })
        );
        await f.correct();
        const source = f.backend.snapshot.nativeSourceRecords[0];
        assert.ok(
          source.invalidation.some(
            (item) => item.kind === 'ac-proof' && item.disposition === 'retired'
          )
        );
        f.restore();
        await f.denied();
        assert.equal((await f.approve()).status, 'approved');
        await withRevisionConsumer(
          { ...f.context, backend: f.backend, activity: 'body-write' },
          () => {
            const retiredIndividual = parseEvidenceAcs(priorProof.before.body.bytes).find(
              (ac) => ac.label === 'Independent requirement'
            );
            assert.equal(
              retiredIndividual.evidenceMarker,
              null,
              'a source-retired preserved legacy individual cannot use its original revision exception'
            );
            const receipt = priorProof.execution.receipt;
            const structure = validateVerificationReceiptStructure({
              receipt,
              expectedIssue: f.context.issue,
              expectedStage: 'native-verifier',
            });
            assert.equal(structure.ok, false);
            assert.ok(structure.reasons.some((r) => r.code === 'receipt-revision-mismatch'));
            assert.equal(
              validateVerificationReceipt({
                receipt,
                expectedIssue: f.context.issue,
                expectedStage: 'native-verifier',
                fingerprint: priorProof.execution.fingerprint,
              }).ok,
              false
            );
            const candidate = upsertVerificationReceipt(f.backend.observation.body.bytes, receipt);
            assert.equal(
              validateVerificationReceiptCommandAuthority({
                body: candidate,
                expectedIssue: f.context.issue,
                expectedStage: 'native-verifier',
                projectDir: f.s.context.sourceRoot,
              }).ok,
              false
            );
            assert.throws(
              () =>
                parseValidatedVerificationReceiptClaims(candidate, {
                  expectedIssue: f.context.issue,
                }),
              /revision-mismatch/
            );
          }
        );
        execFileSync('git', ['add', 'scope-operation.json'], {
          cwd: f.s.context.sourceRoot,
          env: f.s.env,
        });
        execFileSync('git', ['commit', '-qm', 'Current Scope operation precondition'], {
          cwd: f.s.context.sourceRoot,
          env: f.s.env,
        });
        await stamp();
        assert.equal(executions, 2);
        assert.equal(proofPushes, 2);
        assert.deepEqual(
          f.backend.snapshot.nativeProofRecords[0],
          priorProof,
          'retirement preserves original execution bytes'
        );
        assert.deepEqual(
          f.backend.snapshot.nativeOrder.map((r) => r.kind),
          ['plan', 'proof', 'source', 'plan', 'proof']
        );
        f.restore();
        const current = await observeRevision({ context: f.context, deps: f.backend });
        assert.equal(current.status, 'applied', JSON.stringify(current));
        assert.notEqual(
          f.backend.snapshot.nativeProofRecords[1].execution.binding.semanticContractDigest,
          priorProof.execution.binding.semanticContractDigest
        );
        assert.deepEqual(f.backend.snapshot.nativePlanRecords[0], originalPlan);
        if (freshSession) {
          assert.equal(
            f.backend.snapshot.nativePlanRecords[1].before.executor.sessionId,
            currentSessionId()
          );
          assert.equal(
            f.backend.snapshot.nativeProofRecords[1].execution.scope.executor.sessionId,
            currentSessionId()
          );
          const { prepareRevision, applyRevision } =
            await import('../../../../task-tracker/lib/criteria-revision/engine.mjs');
          const oldBytes = f.backend.observation.body.bytes
            .split('\n')
            .find((line) => line.includes('Independent requirement'));
          const prepared = await prepareRevision({
            context: f.context,
            deps: f.backend,
            input: {
              mode: 'revision',
              transactionId: 'fresh-session-successor',
              operationId: 'fresh-session-successor',
              reason: 'Unrelated criterion after fresh observer native continuation',
              edits: {
                acceptanceCriteria: [
                  {
                    operation: 'replace',
                    occurrence: 3,
                    oldBytes,
                    oldHash: hashBytes(oldBytes),
                    replacements: [
                      {
                        text: 'Next independent criterion',
                        declaration: { kind: 'vc-list', vcIds: ['2'] },
                      },
                    ],
                  },
                ],
                verificationCommands: [],
              },
            },
          });
          assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
          const messageId = 'fresh-session-human';
          f.backend.addHostMessage({
            ...f.backend.snapshot.hostMessages[0],
            id: messageId,
            sessionId: f.context.executor.sessionId,
            content: [{ type: 'input_text', text: prepared.approvalStatement }],
          });
          const applied = await applyRevision({
            context: f.context,
            deps: f.backend,
            request: {
              schema: 'aitm.criteria-revision/v1',
              action: 'apply',
              proposal: prepared.proposal,
              authorizationSource: {
                schema: 'aitm.authorization-source/v1',
                adapter: f.context.executor.adapter,
                sessionId: f.context.executor.sessionId,
                messageId,
                statementHash: hashBytes(prepared.approvalStatement),
              },
            },
          });
          assert.equal(applied.status, 'applied', JSON.stringify(applied));
          f.restore();
          assert.equal(
            (await observeRevision({ context: f.context, deps: f.backend })).status,
            'applied'
          );
          assert.deepEqual(f.backend.snapshot.nativePlanRecords[0], originalPlan);
          assert.deepEqual(f.backend.snapshot.nativeProofRecords[0], priorProof);
        }
      } finally {
        f.s.dispose();
      }
    }
  );

import { reconstructNativeHistory } from '../../../../task-tracker/lib/criteria-revision/source-correction.mjs';
import { readMemoryNativeHistory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { before, after } from 'node:test';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-source-correction';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-source-correction');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

for (const changed of ['observation', 'planning', 'comments'])
  test(`awaited native history refuses ${changed} drift before returning current authority`, async () => {
    const f = await setup();
    try {
      await f.correct();
      await f.approve();
      const state = await observeRevision({ context: f.context, deps: f.backend });
      const history = readMemoryNativeHistory(f.backend);
      const input = {
        history,
        chain: state.chain,
        backend: f.backend,
        observation: f.backend.observation,
      };
      assert.equal((await reconstructNativeHistory(input)).status, 'complete');
      const pending = reconstructNativeHistory(input);
      queueMicrotask(() => {
        if (changed === 'observation') {
          const current = f.backend.observation;
          current.stage = 'test';
          f.backend.replaceAuthority(current);
        }
        if (changed === 'planning')
          f.backend.replacePlanning({
            ...f.backend.snapshot.planning,
            bodyHash: hashBytes('changed original planning input'),
          });
        if (changed === 'comments')
          f.backend.addComment({
            id: 'new-authority-comment',
            body: 'changed original comment census',
          });
      });
      await assert.rejects(Promise.resolve(pending), /native-history-await-drift/);
    } finally {
      f.s.dispose();
    }
  });
