// @story #1855
// cspell:words reconstructable
import { execFileSync } from 'node:child_process';
import {
  registerRevisionDomain,
  revisionRuntime,
} from '../../../../task-tracker/lib/criteria-revision/domain.mjs';
import test, { before, after } from 'node:test';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import {
  approvedFixture,
  fixture as revisionFixture,
} from '../../../helpers/criteria-revision-consumers.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import {
  readCurrentMemoryPlanApproval,
  planSourceBindings,
} from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import { validateGovernedLinkedPlan } from '../../../../task-tracker/lib/governed-plan-policy.mjs';
import { resolveStoryIntentSource } from '../../../../task-tracker/lib/story-intent-source.mjs';
import {
  observeRevision,
  prepareRevision,
  applyRevision,
  recoverRevision,
} from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
import { runHook as runSourceEditHook } from '../../../../task-tracker/source-edit-gate.mjs';
import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';

// Node --test isolates each file in its own worker process. Keep every native
// default-root read in that process deterministic even when the user's host has
// unrelated enabled domains; no runtime/port root override is passed to a hook.
const originalProcessHome = process.env.HOME;

let isolatedProcessHome;

before(() => {
  isolatedProcessHome = mkdtempProjectIsolated('aitm-linked-source-host-');
  process.env.HOME = isolatedProcessHome;
  assert.equal(
    revisionRuntime().configRoot,
    path.join(isolatedProcessHome, '.ai-task-manager', 'criteria-revision-domains')
  );
});

after(() => {
  if (originalProcessHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalProcessHome;
  fs.rmSync(isolatedProcessHome, { recursive: true, force: true });
});

const plan = `## Story Intent
- **Beneficiary:** release operator
- **Capability:** stop partial publication
- **Need:** registry checks can fail
- **Value or failure prevented:** consumers receive complete releases
`;

async function setup({ tasks = false, nativeDomain = false } = {}) {
  const s = createSandbox();
  fs.mkdirSync(path.join(s.context.sourceRoot, 'docs'));
  fs.writeFileSync(
    path.join(s.context.sourceRoot, 'docs', 'plan-a.md'),
    plan +
      (tasks
        ? '\n## Tasks\n### Task 1: Publish\n' + plan.replace('## Story Intent', '#### Story Intent')
        : '')
  );
  fs.writeFileSync(
    path.join(s.context.sourceRoot, 'docs', 'plan-b.md'),
    plan.replace(
      'consumers receive complete releases',
      'operators avoid incomplete release artifacts'
    )
  );
  try {
    let ports, writerDomain;
    if (nativeDomain) {
      execFileSync(
        'git',
        ['remote', 'set-url', 'origin', 'https://github.com/example/criteria.git'],
        { cwd: s.context.sourceRoot, env: s.env }
      );
      ports = {
        configRoot: path.join(s.env.HOME, '.ai-task-manager', 'criteria-revision-domains'),
        worktree: s.context.sourceRoot,
      };
      const actual = revisionRuntime(ports).inspect(s.context.sourceRoot);
      writerDomain = { hostId: actual.hostId, commonDirectory: actual.commonDirectory };
    }
    const f = await approvedFixture({
      worktree: s.context.sourceRoot,
      branch: 'trunk',
      sessionId: currentSessionId(),
      linkedPlan: 'docs/plan-a.md',
      writerDomain,
    });
    if (ports)
      f.nativeDomain = registerRevisionDomain(
        {
          repository: f.context.repository,
          commonDir: writerDomain.commonDirectory,
          host: writerDomain.hostId,
          quiescenceConfirmed: true,
        },
        ports
      );
    setActiveTask(
      currentSessionId(),
      {
        issue: `#${f.context.issue}`,
        entryStartTs: new Date().toISOString(),
        worktreePath: s.context.sourceRoot,
        worktreeBranch: 'trunk',
        kanbanState: 'develop',
      },
      s.context.sourceRoot
    );
    return { ...f, s, ports };
  } catch (error) {
    s.dispose();
    throw error;
  }
}

async function linkedExecutionFixture(tool = 'Edit') {
  const f = await setup(),
    file = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
  const afterText = plan.replace(
    'registry checks can fail',
    'source changes require current approval'
  );
  const payload = {
    session_id: currentSessionId(),
    cwd: f.s.context.sourceRoot,
    tool_name: tool,
    tool_input:
      tool === 'Edit'
        ? {
            file_path: file,
            old_string: 'registry checks can fail',
            new_string: 'source changes require current approval',
          }
        : { file_path: file, content: afterText },
  };
  let pushes = 0,
    transportFault = null;
  f.payload = payload;
  f.writeDeps = {
    fetchBody: async () => f.backend.observation.body.bytes,
    pushBody: async (_repo, _issue, body) => {
      if (transportFault === 'before') throw new Error('uncertain linked body transport');
      pushes++;
      const next = f.backend.observation;
      next.body = { bytes: body, version: parseBodyVersion(body) };
      const governedPlan = validateGovernedLinkedPlan({ body, projectDir: f.s.context.sourceRoot });
      const resolved = resolveStoryIntentSource({
        body,
        projectDir: f.s.context.sourceRoot,
        governedPlan,
      });
      const bindings = planSourceBindings(resolved, governedPlan);
      next.protectedSourceBindings = [
        ...next.protectedSourceBindings.filter(
          (b) => !bindings.some((x) => x.identity === b.identity)
        ),
        ...bindings,
      ];
      f.backend.replaceAuthority(next);
      f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(body) });
      if (transportFault === 'after') throw new Error('uncertain linked body transport');
    },
  };
  f.invoke = () =>
    runSourceEditHook(payload, {
      cfg: { repo: f.context.repository },
      revisionBackend: f.backend,
      writeDeps: f.writeDeps,
    });
  f.restore = (snapshot = f.backend.snapshot) => {
    f.backend = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
  };
  f.edit = () => fs.writeFileSync(file, afterText);
  f.transport = (value) => {
    transportFault = value;
  };
  f.pushes = () => pushes;
  return f;
}

async function pointerFixture() {
  const f = await linkedExecutionFixture();
  const operationFile = path.join(f.s.context.sourceRoot, 'pointer-operation.json');
  fs.writeFileSync(
    operationFile,
    JSON.stringify({
      schema: 'aitm.issue-body-operation/v1',
      kind: 'replace-exact',
      expectedVersion: f.backend.observation.body.version,
      expected: '- **Source-plan**: docs/plan-a.md',
      replacement: '- **Source-plan**: docs/plan-b.md',
    })
  );
  f.correct = () =>
    runIssueBodyVerb(
      {
        cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot,
        statePath: path.join(f.s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
        rest: [String(f.context.issue), '--operation-file', operationFile],
      },
      { revisionBackend: f.backend, writeDeps: f.writeDeps }
    );
  return f;
}

async function successorFixture() {
  const f = await pointerFixture();
  await f.correct();
  assert.equal(
    (
      await runPlanApprove({
        issueNumber: f.context.issue,
        cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot,
        deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
      })
    ).status,
    'approved'
  );
  f.restore();
  const oldBytes = f.backend.observation.body.bytes
    .split('\n')
    .find((line) => line.startsWith('- [ ] Supported model hooks'));
  assert.ok(oldBytes);
  const prepared = await prepareRevision({
    context: f.context,
    deps: f.backend,
    input: {
      mode: 'revision',
      transactionId: 'native-successor-tx',
      operationId: 'native-successor-operation',
      reason: 'Revise the supported hook requirement after governed source correction',
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
  const messageId = 'native-successor-human-approval';
  f.backend.addHostMessage({
    ...f.backend.snapshot.hostMessages[0],
    id: messageId,
    content: [{ type: 'input_text', text: prepared.approvalStatement }],
  });
  f.request = {
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
  };
  return f;
}

test('successor criteria PREPARED retains readable native source history and exact pending prefix', async () => {
  const f = await successorFixture();
  try {
    const original = f.backend.snapshot;
    f.backend.failAfter = 'event-write:prepared';
    await assert.rejects(
      applyRevision({ context: f.context, request: f.request, deps: f.backend }),
      /interrupted/
    );
    f.restore();
    const pending = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(pending.status, 'pending-before', JSON.stringify(pending));
    assert.deepEqual(f.backend.snapshot.nativeOrder, original.nativeOrder);
    assert.deepEqual(f.backend.snapshot.nativePlanRecords, original.nativePlanRecords);
    assert.deepEqual(f.backend.snapshot.nativeSourceRecords, original.nativeSourceRecords);
    assert.equal(
      await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
      null
    );
    const result = await applyRevision({ context: f.context, request: f.request, deps: f.backend });
    assert.equal(result.status, 'applied', JSON.stringify(result));
  } finally {
    f.s.dispose();
  }
});

test('successor criteria apply and fresh Plan retain earlier native source history after restart', async () => {
  const f = await successorFixture();
  try {
    const original = f.backend.snapshot,
      events = f.backend.createdEvents;
    const result = await applyRevision({ context: f.context, request: f.request, deps: f.backend });
    assert.equal(result.status, 'applied', JSON.stringify(result));
    f.restore();
    const current = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(current.status, 'applied', JSON.stringify(current));
    assert.equal(current.observation.revision, 2);
    assert.deepEqual(f.backend.snapshot.nativeOrder, original.nativeOrder);
    assert.deepEqual(f.backend.snapshot.nativePlanRecords, original.nativePlanRecords);
    assert.deepEqual(f.backend.snapshot.nativeSourceRecords, original.nativeSourceRecords);
    assert.deepEqual(f.backend.createdEvents.slice(0, events.length), events);
    assert.equal(
      await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
      null
    );
    f.backend.replacePlanning({
      ...f.backend.snapshot.planning,
      bodyHash: hashBytes(f.backend.observation.body.bytes),
    });
    assert.equal(
      (
        await runPlanApprove({
          issueNumber: f.context.issue,
          cfg: { repo: f.context.repository },
          projectDir: f.s.context.sourceRoot,
          deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
        })
      ).status,
      'approved'
    );
    f.restore();
    const restarted = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(restarted.status, 'applied', JSON.stringify(restarted));
    assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    assert.equal(restarted.observation.revision, 2);
  } finally {
    f.s.dispose();
  }
});

test('aborted successor cannot lift the stale approval fence on an earlier applied revision', async () => {
  const sandbox = createSandbox();
  try {
    const { backend, context } = await revisionFixture('stale', {
      worktree: sandbox.context.sourceRoot,
    });
    const oldBytes = backend.observation.body.bytes
      .split('\n')
      .find((line) => line.startsWith('- [ ] Supported model hooks'));
    const prepare = (mode, edits, operationId) =>
      prepareRevision({
        context,
        deps: backend,
        input: {
          mode,
          transactionId: 'aborted-successor',
          operationId,
          reason: 'Keep previous requirement after explicit abort',
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
    const request = authorize(
      await prepare(
        'revision',
        {
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
        'abortable-successor'
      )
    );
    backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
    backend.failAfter = null;
    const aborted = await recoverRevision({
      context,
      deps: backend,
      request: authorize(
        await prepare(
          'abort',
          { acceptanceCriteria: [], verificationCommands: [] },
          'abort-successor'
        )
      ),
    });
    assert.equal(aborted.status, 'aborted', JSON.stringify(aborted));
    const { mutateIssueBody } = await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
    let callbacks = 0,
      pushes = 0;
    await assert.rejects(
      mutateIssueBody({
        repo: context.repository,
        issueNumber: context.issue,
        expectedVersion: backend.observation.body.version,
        mutate: (body) => {
          callbacks++;
          return body + '\nOrdinary metadata';
        },
        deps: {
          revisionBackend: backend,
          fetchBody: async () => backend.observation.body.bytes,
          pushBody: async () => {
            pushes++;
          },
        },
      }),
      /revision-approval-stale/
    );
    assert.equal(callbacks, 0);
    assert.equal(pushes, 0);
  } finally {
    sandbox.dispose();
  }
});

test('three criteria epochs retain globally ordered native source and Plan history without rewriting earlier records', async () => {
  const f = await successorFixture();
  try {
    const original = f.backend.snapshot;
    assert.equal(
      (await applyRevision({ context: f.context, request: f.request, deps: f.backend })).status,
      'applied'
    );
    const approve = async () => {
      f.backend.replacePlanning({
        ...f.backend.snapshot.planning,
        bodyHash: hashBytes(f.backend.observation.body.bytes),
      });
      const result = await runPlanApprove({
        issueNumber: f.context.issue,
        cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot,
        deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
      });
      assert.equal(result.status, 'approved', JSON.stringify(result));
    };
    await approve();
    f.restore();
    fs.writeFileSync(
      path.join(f.s.context.sourceRoot, 'pointer-operation.json'),
      JSON.stringify({
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expectedVersion: f.backend.observation.body.version,
        expected: '- **Source-plan**: docs/plan-b.md',
        replacement: '- **Source-plan**: docs/plan-a.md',
      })
    );
    await f.correct();
    f.restore();
    assert.equal(
      await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
      null
    );
    await approve();
    f.restore();
    const oldBytes = f.backend.observation.body.bytes
      .split('\n')
      .find((line) => line.startsWith('- [ ] Next supported model hooks'));
    const prepared = await prepareRevision({
      context: f.context,
      deps: f.backend,
      input: {
        mode: 'revision',
        transactionId: 'third-criteria-tx',
        operationId: 'third-criteria-operation',
        reason: 'Third reviewed requirement',
        edits: {
          acceptanceCriteria: [
            {
              operation: 'replace',
              occurrence: 1,
              oldBytes,
              oldHash: hashBytes(oldBytes),
              replacements: [
                {
                  text: 'Third supported model hooks',
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
    const messageId = 'third-criteria-human';
    f.backend.addHostMessage({
      ...f.backend.snapshot.hostMessages[0],
      id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }],
    });
    const request = {
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
    };
    const result = await applyRevision({ context: f.context, request, deps: f.backend });
    assert.equal(result.status, 'applied', JSON.stringify(result));
    await approve();
    f.restore();
    const current = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(current.status, 'applied', JSON.stringify(current));
    assert.equal(current.observation.revision, 3);
    assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    assert.deepEqual(
      f.backend.snapshot.nativeOrder.slice(0, original.nativeOrder.length),
      original.nativeOrder
    );
    assert.deepEqual(
      f.backend.snapshot.nativePlanRecords.slice(0, original.nativePlanRecords.length),
      original.nativePlanRecords
    );
    assert.deepEqual(
      f.backend.snapshot.nativeSourceRecords.slice(0, original.nativeSourceRecords.length),
      original.nativeSourceRecords
    );
    assert.equal(
      new Set(f.backend.snapshot.nativeOrder.map((ref) => ref.revisionEventHead)).size,
      3
    );
  } finally {
    f.s.dispose();
  }
});
