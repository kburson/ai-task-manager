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
} from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';

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

test('private native proof collection never accepts caller supplied prepare witnesses', async () => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
    const { backend, context } = run;
    const observed = await observeRevision({ context, deps: backend });
    assert.equal(observed.status, 'applied', JSON.stringify(observed));
    assert.equal(observed.nativeIndividualProofs.length, 1);
    const before = backend.snapshot,
      effects = backend.effects.length;
    const result = await prepareRevision({
      context,
      deps: backend,
      input: {
        mode: 'revision',
        transactionId: 'caller-witness',
        operationId: 'caller-witness-prepare',
        reason: 'Caller witness cannot become native authority',
        edits: { acceptanceCriteria: [], verificationCommands: [] },
        nativeIndividualProofs: structuredClone(observed.nativeIndividualProofs),
      },
    });
    assert.equal(result.status, 'refused');
    assert.match(result.code, /prepare-input/);
    assert.deepEqual(backend.snapshot, before);
    assert.equal(backend.effects.length, effects);
  } finally {
    s.dispose();
  }
});

test('new private admission rejects missing empty and coherent substituted native archive witnesses before effects', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
    const { backend, context } = run;
    const observed = await observeRevision({ context, deps: backend });
    assert.equal(observed.nativeIndividualProofs.length, 1);
    const { deriveProposal, renderApprovalStatement } =
      await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
    const oldBytes = observed.observation.body.bytes
      .split('\n')
      .find((line) => line.includes('Independent requirement'));
    const edits = {
      acceptanceCriteria: [
        {
          operation: 'replace',
          occurrence: 3,
          oldBytes,
          oldHash: hashBytes(oldBytes),
          replacements: [
            {
              text: 'Unrelated criterion amendment',
              declaration: { kind: 'vc-list', vcIds: ['2'] },
            },
          ],
        },
      ],
      verificationCommands: [],
    };
    for (const variant of ['absent', 'empty', 'coherent-receipt'])
      await t.test(variant, async () => {
        const witnesses = structuredClone(observed.nativeIndividualProofs);
        if (variant === 'coherent-receipt') {
          // A different well-formed receipt ID leaves all execution/result/effect
          // data coherent. Only the actual retained native record can distinguish it.
          const id = witnesses[0].execution.receipt.receiptId;
          witnesses[0].execution.receipt.receiptId =
            id.slice(0, -1) + (id.endsWith('0') ? '1' : '0');
        }
        const proposal = deriveProposal({
          observation: observed.observation,
          edits,
          executor: context.executor,
          mode: 'revision',
          reason: 'Exact private native archive authority',
          priorTransaction: null,
          transactionId: 'private-witness-' + variant,
          operationId: 'private-witness-' + variant,
          ...(variant === 'absent'
            ? {}
            : { nativeIndividualProofs: variant === 'empty' ? [] : witnesses }),
        });
        const statement = renderApprovalStatement(proposal),
          messageId = 'witness-human-' + variant;
        backend.addHostMessage({
          ...backend.snapshot.hostMessages[0],
          id: messageId,
          content: [{ type: 'input_text', text: statement }],
        });
        const before = backend.snapshot,
          effects = backend.effects.length;
        const result = await applyRevision({
          context,
          deps: backend,
          request: {
            schema: 'aitm.criteria-revision/v1',
            action: 'apply',
            proposal,
            authorizationSource: {
              schema: 'aitm.authorization-source/v1',
              adapter: context.executor.adapter,
              sessionId: context.executor.sessionId,
              messageId,
              statementHash: hashBytes(statement),
            },
          },
        });
        assert.equal(result.status, 'refused', JSON.stringify(result));
        assert.match(result.code, /native-individual-authority/);
        assert.deepEqual(backend.snapshot, before);
        const reads = backend.effects.slice(effects);
        assert.deepEqual(reads, [
          'authority-read',
          'page-read',
          'native-history-readback',
          'native-proof-record-readback',
        ]);
      });
  } finally {
    s.dispose();
  }
});

test('original native proof provenance survives a fresh same-worktree executor observation', async () => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
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
    assert.deepEqual(
      observed.nativeIndividualProofs[0].before.executor,
      original.observation.executor
    );
    assert.deepEqual(backend.snapshot.nativeProofRecords, original.nativeProofRecords);
    assert.deepEqual(backend.snapshot.nativePlanRecords, original.nativePlanRecords);
  } finally {
    s.dispose();
  }
});

test('native proof execution closes original provenance and receipt context fields', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
    const { validateNativeProofExecution } =
      await import('../../../../task-tracker/lib/criteria-revision/proof-execution.mjs');
    const original = run.backend.snapshot.nativeProofRecords[0].execution;
    for (const key of ['note', 'authorization'])
      await t.test(key, () => {
        const execution = structuredClone(original);
        execution.provenance[key] = 'unrecognized native provenance';
        execution.receipt.executionContext[key] = 'unrecognized native provenance';
        assert.throws(
          () => validateNativeProofExecution(execution),
          /native-proof-provenance-keys/
        );
        const receiptOnly = structuredClone(original);
        receiptOnly.receipt.executionContext[key] = 'unrecognized receipt context';
        assert.throws(
          () => validateNativeProofExecution(receiptOnly),
          /native-proof-receipt-context/
        );
      });
  } finally {
    s.dispose();
  }
});

test('native witness semantic worktree key never exempts credential values from event scanning', async () => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
    const observed = await observeRevision({ context: run.context, deps: run.backend });
    const {
      deriveNativeProofJournal,
      projectNativeIndividualProofs,
      validateNativeProofExecution,
    } = await import('../../../../task-tracker/lib/criteria-revision/proof-execution.mjs');
    const { deriveProposal, renderApprovalStatement } =
      await import('../../../../task-tracker/lib/criteria-revision/proposal.mjs');
    const { createRevisionEvent, renderRevisionEvent } =
      await import('../../../../task-tracker/lib/criteria-revision/records.mjs');
    const { canonicalRecordJson } =
      await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const original = run.backend.snapshot.nativeProofRecords[0];
    const { assertNoSecretRecordData } =
      await import('../../../../task-tracker/lib/github-records/record-secret-policy.mjs');
    for (const value of [
      { provenance: { worktreePath: 'Authorization: Bearer fixture-value' } },
      { receipt: { executionContext: { worktreePath: 'Authorization: Bearer fixture-value' } } },
    ])
      assert.throws(
        () => assertNoSecretRecordData(value, { safeKeyNames: ['worktreePath'] }),
        /record-envelope:secret/
      );
    for (const where of ['provenance', 'receipt']) {
      const e = structuredClone(original.execution);
      const target = where === 'provenance' ? e.provenance : e.receipt.executionContext;
      target.worktreePath = path.join(target.worktreePath, 'Authorization: Bearer fixture-value');
      assert.throws(
        () => validateNativeProofExecution(e),
        /native-proof-receipt|native-proof-provenance/
      );
    }
    // Coherent pure fixture data reaches the actual event scanner. It is never
    // supplied as authenticated retained execution or admitted to private apply.
    const e = structuredClone(original.execution);
    const worktree = path.join(e.scope.executor.worktree, 'Authorization: Bearer fixture-value');
    e.scope.executor.worktree = worktree;
    e.scope.observation.executor.worktree = worktree;
    e.provenance.worktreePath = worktree;
    e.receipt.executionContext.worktreePath = worktree;
    e.fingerprint.environment.sandbox.identity = worktree;
    e.receipt.environment = structuredClone(e.fingerprint.environment);
    e.cacheNamespace = hashBytes(
      canonicalRecordJson({ binding: e.binding, fingerprint: e.fingerprint })
    );
    const journal = deriveNativeProofJournal(e, original.revisionEventHead);
    const observation = {
      ...structuredClone(observed.observation),
      body: journal.after.body,
      executor: e.scope.executor,
    };
    const witnesses = projectNativeIndividualProofs({
      observation,
      chain: observed.chain,
      completedProofRecords: [journal],
    });
    assert.equal(witnesses.length, 1);
    const oldBytes = observation.body.bytes
      .split('\n')
      .find((line) => line.includes('Independent requirement'));
    const proposal = deriveProposal({
      observation,
      nativeIndividualProofs: witnesses,
      mode: 'revision',
      reason: 'Credential-bearing original data cannot publish',
      priorTransaction: null,
      executor: observation.executor,
      transactionId: 'credential-witness',
      operationId: 'credential-witness',
      edits: {
        acceptanceCriteria: [
          {
            operation: 'replace',
            occurrence: 3,
            oldBytes,
            oldHash: hashBytes(oldBytes),
            replacements: [
              { text: 'Unrelated requirement', declaration: { kind: 'vc-list', vcIds: ['2'] } },
            ],
          },
        ],
        verificationCommands: [],
      },
    });
    const event = createRevisionEvent({
      request: {
        schema: 'aitm.criteria-revision/v1',
        action: 'apply',
        proposal,
        authorizationSource: {
          schema: 'aitm.authorization-source/v1',
          adapter: observation.executor.adapter,
          sessionId: observation.executor.sessionId,
          messageId: 'credential-fixture-data',
          statementHash: hashBytes(renderApprovalStatement(proposal)),
        },
      },
      predecessorEventId: observed.chain.head,
    });
    assert.throws(() => renderRevisionEvent(event), /record-envelope:secret/);
    assert.equal(
      proposal.archive.nativeIndividualProofs[0].execution.provenance.worktreePath,
      worktree
    );
    assert.equal(
      proposal.archive.nativeIndividualProofs[0].execution.receipt.executionContext.worktreePath,
      worktree
    );
  } finally {
    s.dispose();
  }
});
