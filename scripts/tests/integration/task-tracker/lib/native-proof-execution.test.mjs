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
      writeFileSync(
        path.join(s.context.sourceRoot, 'supported-hook.test.mjs'),
        `import assert from 'node:assert/strict'; assert.equal(${failure}, false);`
      );
      const { backend, context } = await approvedFixture({
        worktree: s.context.sourceRoot,
        branch: 'trunk',
      });
      const ac = parseEvidenceAcs(backend.observation.body.bytes)[0];
      const commands = ac.evidenceCommands,
        nativeProofIntent = { kind: 'ac', target: ac.label };
      let executed = 0;
      const pexec = (bin, args, options) => {
        if (bin === 'node') executed++;
        return exec(bin, args, { ...options, env: s.env });
      };
      let result;
      await withRevisionConsumer({ ...context, backend, activity: 'ac-stamp' }, async () => {
        result = await runner.runVerifiers({
          commands,
          cwd: s.context.sourceRoot,
          pexec,
          nativeProofIntent,
        });
        assert.equal(executed, 1);
        assert.equal(result.allPassed, !failure);
        if (failure) {
          assert.equal(result.nativeExecutionToken, undefined);
          return;
        }
        assert.ok(
          result.nativeExecutionToken,
          'actual successful runner must produce opaque current execution authority'
        );
        const record = runner.readNativeVerifierExecution(result.nativeExecutionToken);
        assert.deepEqual(record.commands, commands);
        assert.deepEqual(record.intent, nativeProofIntent);
        assert.equal(record.binding.issue, context.issue);
        assert.equal(record.provenance.branch, 'trunk');
        assert.equal(record.fingerprint.environment.sandbox.identity, s.context.sourceRoot);
        assert.equal(record.results[0].exit, 0);
        assert.throws(
          () => runner.readNativeVerifierExecution(structuredClone(result.nativeExecutionToken)),
          /native-proof-token/
        );
        assert.throws(
          () => runner.readNativeVerifierExecution({ ...record, success: true }),
          /native-proof-token/
        );
      });
      if (!failure)
        assert.throws(
          () => runner.readNativeVerifierExecution(result.nativeExecutionToken),
          /native-proof-token/
        );
    } finally {
      s.dispose();
    }
  });
}
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
import { before, after } from 'node:test';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-proof-execution';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-proof-execution');
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
      (x) => {
        x.nativeProofRecords[0].execution.results[0].exit = 1;
      },
      (x) => {
        x.nativeProofRecords[0].execution.receipt.commands[0].args.push('--wrong');
      },
      (x) => {
        x.nativeProofRecords[0].execution.scope.definitions[0].text += ' changed';
      },
      (x) => {
        x.nativeProofRecords[0].execution.binding.issue++;
      },
      (x) => {
        x.nativeProofRecords[0].after.body.bytes += 'unrelated';
      },
      (x) => {
        x.observation.stage = 'test';
      },
      (x) => {
        delete x.nativeProofRecords;
      },
    ]) {
      const changed = structuredClone(snapshot);
      alter(changed);
      let admitted = false;
      try {
        admitted =
          (await observeRevision({ context, deps: createRevisionMemory(changed) })).status ===
          'applied';
      } catch {
        /* Closed constructor validation may refuse before collection. */
      }
      assert.equal(admitted, false, alter.toString());
    }
  } finally {
    s.dispose();
  }
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
      assert.equal(effects.filter((x) => x === 'push').length, pushes);
      assert.equal(backend.admission.state, 'deny');
      const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
      assert.equal((await observeRevision({ context, deps: restored })).status, expected);
      if (expected === 'pending-native-proof') {
        let invoked = false;
        await assert.rejects(
          withRevisionConsumer({ ...context, backend: restored, activity: 'ac-stamp' }, () => {
            invoked = true;
          }),
          /revision-pending/
        );
        assert.equal(invoked, false);
      }
    } finally {
      s.dispose();
    }
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
      assert.equal(
        (await observeRevision({ context: run.context, deps: run.backend })).status,
        'applied'
      );
      await run.retry();
      assert.deepEqual(run.effects, ['verifier', 'push']);
      assert.equal(run.backend.snapshot.nativeProofRecords.length, 1);
    } finally {
      s.dispose();
    }
  });
}

for (const kind of ['ac', 'dod']) {
  for (const [name, change] of [
    ['wrong intent', { target: 'different criterion' }],
    [
      'original fingerprint',
      {
        alter: (x) => {
          x.nativeProofRecords[0].execution.fingerprint.commitSha = 'b'.repeat(40);
        },
      },
    ],
    [
      'receipt',
      {
        alter: (x) => {
          x.nativeProofRecords[0].execution.receipt.commands[0].args.push('--foreign');
        },
      },
    ],
    [
      'result',
      {
        alter: (x) => {
          x.nativeProofRecords[0].execution.results[0].exit = 7;
        },
      },
    ],
    [
      'stage',
      {
        alter: (x) => {
          x.observation.stage = 'test';
        },
      },
    ],
    [
      'source',
      {
        alter: (x) => {
          x.observation.protectedSourceBindings[0].digest = 'sha256:' + 'b'.repeat(64);
        },
      },
    ],
    [
      'event',
      {
        alter: (x) => {
          x.comments.pop();
        },
      },
    ],
    ['current dirty worktree', { dirty: true }],
    ['current HEAD', { head: true }],
  ]) {
    test(`actual ${kind} proof retry refuses ${name} before verifier or body effects`, async () => {
      const s = createSandbox();
      try {
        const run = await realNativeStamp(s, { after: 'native-proof-journal-readback' }, kind);
        assert.ok(run.error);
        if (change.dirty) writeFileSync(path.join(s.context.sourceRoot, 'source.txt'), 'changed');
        if (change.head)
          execFileSync('git', ['commit', '--allow-empty', '-qm', 'Changed fixture HEAD'], {
            cwd: s.context.sourceRoot,
            env: s.env,
          });
        await assert.rejects(run.retry(change));
        assert.deepEqual(run.effects, ['verifier']);
      } finally {
        s.dispose();
      }
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
    const oldBytes = backend.observation.body.bytes
      .split('\n')
      .find((line) => /^- \[[ x]\] Supported model hooks/.test(line));
    assert.ok(oldBytes);
    const prepared = await prepareRevision({
      context,
      deps: backend,
      input: {
        mode: 'revision',
        transactionId: 'proof-successor-tx',
        operationId: 'proof-successor-operation',
        reason: 'Revise after actual native verifier evidence',
        edits: {
          acceptanceCriteria: [
            {
              operation: 'replace',
              occurrence: 1,
              oldBytes,
              oldHash: hashBytes(oldBytes),
              replacements: [
                {
                  text: 'Next supported model hooks',
                  declaration: { kind: 'vc-list', vcIds: ['1'] },
                },
              ],
            },
          ],
          verificationCommands: [],
        },
      },
    });
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    const messageId = 'proof-successor-human-approval';
    backend.addHostMessage({
      ...original.hostMessages[0],
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
    backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
    const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const pending = await observeRevision({ context, deps: restored });
    assert.equal(pending.status, 'pending-before', JSON.stringify(pending));
    assert.deepEqual(restored.snapshot.nativeProofRecords, original.nativeProofRecords);
    let effects = 0;
    await assert.rejects(
      withRevisionConsumer({ ...context, backend: restored, activity: 'ac-stamp' }, () => {
        effects++;
      }),
      /revision-pending/
    );
    assert.equal(effects, 0);
    assert.equal((await applyRevision({ context, request, deps: restored })).status, 'applied');
  } finally {
    s.dispose();
  }
});
