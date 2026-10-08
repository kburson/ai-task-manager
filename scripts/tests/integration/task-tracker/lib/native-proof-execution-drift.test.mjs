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
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-proof-execution-drift';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-proof-execution-drift');
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

test('fresh legacy observer cannot relax foreign stale pending or original native authority', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
    const original = run.backend.snapshot;
    const { mutateIssueBody } = await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
    const variants = [
      [
        'branch',
        (snapshot) => {
          snapshot.observation.executor.branch = 'foreign-branch';
        },
      ],
      [
        'worktree',
        (snapshot) => {
          snapshot.observation.executor.worktree = path.join(
            s.context.sourceRoot,
            'other-checkout'
          );
        },
      ],
      [
        'domain',
        (snapshot) => {
          snapshot.observation.writerDomain.hostId = 'foreign-host';
        },
      ],
      [
        'source',
        (snapshot) => {
          snapshot.observation.body.bytes = snapshot.observation.body.bytes.replace(
            'Synthetic scope',
            'Foreign scope'
          );
        },
      ],
      [
        'source-binding',
        (snapshot) => {
          snapshot.observation.protectedSourceBindings[0].hash = hashBytes('different-source');
        },
      ],
      [
        'stale-approval',
        (snapshot) => {
          snapshot.observation.body.bytes = snapshot.observation.body.bytes.replace(
            /<!-- aitm-plan-approved[^]*?-->/,
            ''
          );
        },
      ],
      [
        'missing-plan-history',
        (snapshot) => {
          snapshot.nativePlanRecords = [];
          snapshot.nativeOrder = snapshot.nativeOrder.filter((ref) => ref.kind !== 'plan');
          snapshot.nativeOrder[0].predecessor = null;
        },
      ],
      [
        'pending-native-proof',
        (snapshot) => {
          snapshot.observation.body = structuredClone(snapshot.nativeProofRecords[0].before.body);
          snapshot.planning.bodyHash = hashBytes(snapshot.observation.body.bytes);
        },
      ],
      [
        'original-proof-executor',
        (snapshot) => {
          snapshot.nativeProofRecords[0].execution.scope.executor.sessionId = 'altered-original';
        },
      ],
      [
        'original-plan-executor',
        (snapshot) => {
          snapshot.nativePlanRecords[0].before.executor.sessionId = 'altered-original';
        },
      ],
    ];
    for (const [name, alter] of variants)
      await t.test(name, async () => {
        const snapshot = structuredClone(original);
        snapshot.observation.executor.sessionId = 'fresh-negative-session';
        alter(snapshot);
        if (name === 'original-proof-executor' || name === 'original-plan-executor') {
          assert.throws(
            () => createRevisionMemory(snapshot),
            /native-proof-execution|native-order-reference/
          );
          return; // Constructor boundary refusal, not a semantic adapter invocation.
        }
        const backend = createRevisionMemory(snapshot),
          admittedBefore = backend.snapshot;
        const context = { ...run.context, executor: snapshot.observation.executor };
        const observed = await observeRevision({ context, deps: backend });
        assert.notEqual(observed.status, 'applied', JSON.stringify(observed));
        let effects = 0;
        await assert.rejects(
          mutateIssueBody({
            repo: context.repository,
            issueNumber: context.issue,
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
        assert.deepEqual(backend.snapshot, admittedBefore);
      });
  } finally {
    s.dispose();
  }
});

for (const fault of ['event-write:prepared', 'body-write']) {
  for (const recovery of ['original-retry', 'resume', 'forward-repair']) {
    test(`nonempty native witness ${recovery} retains original proof after ${fault}`, async (t) => {
      const s = createSandbox();
      try {
        const run = await realNativeStamp(s);
        assert.equal(run.error, undefined);
        let backend = run.backend;
        const { context } = run;
        const originalProof = structuredClone(backend.snapshot.nativeProofRecords[0]);
        const prepare = (mode, operationId, text) => {
          const oldBytes = backend.observation.body.bytes
            .split('\n')
            .find(
              (line) =>
                line.includes('Independent requirement') || line.includes('Unrelated successor')
            );
          return prepareRevision({
            context,
            deps: backend,
            input: {
              mode,
              transactionId: 'nonempty-recovery',
              operationId,
              reason: 'Keep genuine unaffected native proof through exact recovery',
              edits: {
                acceptanceCriteria:
                  mode === 'resume'
                    ? []
                    : [
                        {
                          operation: 'replace',
                          occurrence: 3,
                          oldBytes,
                          oldHash: hashBytes(oldBytes),
                          replacements: [{ text, declaration: { kind: 'vc-list', vcIds: ['2'] } }],
                        },
                      ],
                verificationCommands: [],
              },
            },
          });
        };
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
        const prepared = await prepare(
          'revision',
          'nonempty-first',
          'Unrelated successor requirement'
        );
        const request = authorize(prepared);
        assert.equal(request.proposal.archive.nativeIndividualProofs.length, 1);
        backend.failAfter = fault;
        await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
        const interrupted = backend.snapshot;
        backend = createRevisionMemory(JSON.parse(JSON.stringify(interrupted)));
        let result;
        if (recovery === 'original-retry')
          result = await applyRevision({ context, request, deps: backend });
        else {
          const next = await prepare(
            recovery,
            'nonempty-' + recovery,
            'Unrelated successor repaired'
          );
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
        const currentAc = parseEvidenceAcs(backend.observation.body.bytes).find(
          (ac) => ac.label === originalAc.label
        );
        assert.deepEqual(currentAc.evidenceMarker, originalAc.evidenceMarker);
        assert.deepEqual(
          backend.snapshot.comments.slice(0, interrupted.comments.length),
          interrupted.comments
        );
        const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
        assert.equal((await observeRevision({ context, deps: restored })).status, 'applied');
      } finally {
        s.dispose();
      }
    });
  }
}

test('nonempty native witness cannot hide unrelated current authority drift before admission', async (t) => {
  const s = createSandbox();
  try {
    const run = await realNativeStamp(s);
    assert.equal(run.error, undefined);
    const { backend, context } = run;
    const oldBytes = backend.observation.body.bytes
      .split('\n')
      .find((line) => line.includes('Independent requirement'));
    const prepared = await prepareRevision({
      context,
      deps: backend,
      input: {
        mode: 'revision',
        transactionId: 'witness-resource-drift',
        operationId: 'witness-resource-drift',
        reason: 'Unchanged proof cannot authorize unrelated resource drift',
        edits: {
          acceptanceCriteria: [
            {
              operation: 'replace',
              occurrence: 3,
              oldBytes,
              oldHash: hashBytes(oldBytes),
              replacements: [
                {
                  text: 'Unrelated successor requirement',
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
    assert.equal(prepared.proposal.archive.nativeIndividualProofs.length, 1);
    const messageId = 'witness-resource-human';
    backend.addHostMessage({
      ...backend.snapshot.hostMessages[0],
      id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }],
    });
    const request = {
      schema: 'aitm.criteria-revision/v1',
      action: 'apply',
      proposal: prepared.proposal,
      authorizationSource: {
        schema: 'aitm.authorization-source/v1',
        adapter: context.executor.adapter,
        sessionId: context.executor.sessionId,
        messageId,
        statementHash: hashBytes(prepared.approvalStatement),
      },
    };
    for (const [name, alter] of [
      [
        'stage',
        (x) => {
          x.observation.stage = 'test';
        },
      ],
      [
        'issue-state',
        (x) => {
          x.observation.issueState = 'closed';
        },
      ],
      [
        'control',
        (x) => {
          x.observation.body.bytes +=
            '\n<!-- aitm-test-started: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:2026-10-06T00:00:00Z -->';
        },
      ],
      [
        'source',
        (x) => {
          x.observation.protectedSourceBindings[0].hash = hashBytes('changed source');
        },
      ],
      [
        'unrelated-record',
        (x) => {
          x.observation.proofRecords.push({
            kind: 'historical',
            identity: 'unrelated',
            bytes: 'unrelated record',
            criterionIdentity: null,
          });
        },
      ],
      [
        'planning',
        (x) => {
          x.planning.bodyHash = hashBytes('changed planning body');
        },
      ],
    ])
      await t.test(name, async () => {
        const changed = JSON.parse(JSON.stringify(backend.snapshot));
        alter(changed);
        const fresh = createRevisionMemory(changed),
          before = fresh.snapshot;
        const result = await applyRevision({ context, deps: fresh, request });
        assert.equal(result.status, 'refused', JSON.stringify(result));
        assert.deepEqual(fresh.snapshot, before);
        assert.ok(
          fresh.effects.every((effect) =>
            [
              'authority-read',
              'page-read',
              'native-history-readback',
              'native-proof-record-readback',
            ].includes(effect)
          ),
          JSON.stringify(fresh.effects)
        );
      });
  } finally {
    s.dispose();
  }
});
