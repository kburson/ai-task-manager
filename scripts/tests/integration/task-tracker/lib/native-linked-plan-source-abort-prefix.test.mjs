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
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
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

test('untouched successor abort preserves genuine current Plan authority and ordinary native body continuation after restart', async () => {
  const f = await successorFixture();
  try {
    assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    const original = f.backend.snapshot;
    f.backend.failAfter = 'event-write:prepared';
    await assert.rejects(
      applyRevision({ context: f.context, request: f.request, deps: f.backend }),
      /interrupted/
    );
    f.restore();
    const prepared = await prepareRevision({
      context: f.context,
      deps: f.backend,
      input: {
        mode: 'abort',
        transactionId: f.request.proposal.transactionId,
        operationId: 'native-current-abort',
        reason: 'Retain the actually approved earlier requirement without effects',
        edits: { acceptanceCriteria: [], verificationCommands: [] },
      },
    });
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    const messageId = 'native-current-abort-human';
    f.backend.addHostMessage({
      ...f.backend.snapshot.hostMessages[0],
      id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }],
    });
    const request = {
      schema: 'aitm.criteria-revision/v1',
      action: 'recover',
      proposal: prepared.proposal,
      authorizationSource: {
        schema: 'aitm.authorization-source/v1',
        adapter: f.context.executor.adapter,
        sessionId: f.context.executor.sessionId,
        messageId,
        statementHash: hashBytes(prepared.approvalStatement),
      },
    };
    const result = await recoverRevision({ context: f.context, request, deps: f.backend });
    assert.equal(result.status, 'aborted', JSON.stringify(result));
    f.restore();
    assert.equal(f.backend.observation.body.bytes, original.observation.body.bytes);
    assert.deepEqual(f.backend.snapshot.nativeOrder, original.nativeOrder);
    const approval = await readCurrentMemoryPlanApproval({
      backend: f.backend,
      context: f.context,
    });
    const { mutateIssueBody } = await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
    let callbacks = 0,
      failure;
    try {
      await mutateIssueBody({
        repo: f.context.repository,
        issueNumber: f.context.issue,
        expectedVersion: f.backend.observation.body.version,
        mutate: (body) => {
          callbacks++;
          return body + '\n## Notes\nOrdinary metadata after untouched abort\n';
        },
        deps: { revisionBackend: f.backend, ...f.writeDeps },
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(
      failure,
      undefined,
      'genuine retained current Plan must admit the ordinary body adapter: ' + failure
    );
    assert.ok(approval);
    assert.equal(callbacks, 1);
    assert.equal(f.pushes(), 2, 'one original source write plus one ordinary metadata write');
  } finally {
    f.s.dispose();
  }
});

for (const tamper of [
  'current-stage',
  'current-source',
  'current-body',
  'native-plan-stage',
  'nonterminal-head',
  'backward-head',
  'global-predecessor',
  'missing-old-plan',
]) {
  test(`successor epoch replay rejects ${tamper} while retaining original history`, async () => {
    const f = await successorFixture();
    try {
      assert.equal(
        (await applyRevision({ context: f.context, request: f.request, deps: f.backend })).status,
        'applied'
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
      assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
      const snapshot = f.backend.snapshot;
      if (tamper === 'current-stage') snapshot.observation.stage = 'test';
      if (tamper === 'current-source')
        snapshot.observation.protectedSourceBindings[0].hash = hashBytes('foreign scope');
      if (tamper === 'current-body') snapshot.observation.body.bytes += '\n<!-- forged-control -->';
      if (tamper === 'global-predecessor') snapshot.nativeOrder.at(-1).predecessor = null;
      if (tamper === 'missing-old-plan') snapshot.nativePlanRecords.shift();
      if (['native-plan-stage', 'nonterminal-head', 'backward-head'].includes(tamper)) {
        const journal = snapshot.nativePlanRecords.at(-1),
          ref = snapshot.nativeOrder.at(-1);
        if (tamper === 'native-plan-stage') {
          journal.before.stage = 'test';
          journal.after.stage = 'test';
        }
        if (tamper === 'nonterminal-head')
          journal.revisionEventHead = f.backend.createdEvents.findLast(
            (e) => e.type === 'prepared'
          ).eventId;
        if (tamper === 'backward-head')
          journal.revisionEventHead = snapshot.nativeOrder[0].revisionEventHead;
        ref.revisionEventHead = journal.revisionEventHead;
        const { canonicalRecordJson } =
          await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
        ref.id = hashBytes(canonicalRecordJson(journal));
      }
      let accepted = false;
      try {
        f.restore(snapshot);
        accepted =
          (await observeRevision({ context: f.context, deps: f.backend })).status === 'applied';
      } catch {
        /* Native constructor rejects incoherent membership before observation. */
      }
      assert.equal(accepted, false);
    } finally {
      f.s.dispose();
    }
  });
}

for (const phase of ['failBefore', 'failAfter'])
  for (const step of [
    'plan-body-write',
    'native-plan-record-write',
    'native-plan-record-readback',
    'plan-journal-clear',
  ]) {
    test(`successor native Plan ${phase} ${step} retains deny and retries exact ordered completion`, async () => {
      const f = await successorFixture();
      try {
        assert.equal(
          (await applyRevision({ context: f.context, request: f.request, deps: f.backend })).status,
          'applied'
        );
        f.backend.replacePlanning({
          ...f.backend.snapshot.planning,
          bodyHash: hashBytes(f.backend.observation.body.bytes),
        });
        const prior = f.backend.snapshot.nativePlanRecords.length;
        const approve = () =>
          runPlanApprove({
            issueNumber: f.context.issue,
            cfg: { repo: f.context.repository },
            projectDir: f.s.context.sourceRoot,
            deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
          });
        f.backend[phase] = step;
        await assert.rejects(approve(), /interrupted/);
        f.restore();
        if (f.backend.snapshot.planJournal) {
          assert.equal(
            await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
            null
          );
          const { mutateIssueBody } =
            await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
          let callbacks = 0;
          await assert.rejects(
            mutateIssueBody({
              repo: f.context.repository,
              issueNumber: f.context.issue,
              mutate: (body) => {
                callbacks++;
                return body;
              },
              deps: { revisionBackend: f.backend, ...f.writeDeps },
            }),
            /revision-pending/
          );
          assert.equal(callbacks, 0);
        }
        const result = await approve();
        assert.equal(
          result.status,
          phase === 'failAfter' && step === 'plan-journal-clear' ? 'already-approved' : 'approved',
          JSON.stringify(result)
        );
        f.restore();
        assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
        assert.equal(f.backend.snapshot.nativePlanRecords.length, prior + 1);
      } finally {
        f.s.dispose();
      }
    });
  }
