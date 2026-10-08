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
import { planSourceBindings } from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import { validateGovernedLinkedPlan } from '../../../../task-tracker/lib/governed-plan-policy.mjs';
import { resolveStoryIntentSource } from '../../../../task-tracker/lib/story-intent-source.mjs';
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

async function assertNativePending(f) {
  const { verbAcStamp } = await import('../../../../task-tracker/verbs/ac-stamp.mjs');
  const { verbDodStamp } = await import('../../../../task-tracker/verbs/dod-stamp.mjs');
  const { parseEvidenceAcs } = await import('../../../../task-tracker/lib/ac-evidence.mjs');
  const { moveState } = await import('../../../../task-tracker/lib/move-state/move-state-core.mjs');
  const body = f.backend.observation.body.bytes;
  let effects = 0;
  const pexec = async () => {
    effects++;
    throw new Error('pending native transport ran');
  };
  const ctx = {
    cfg: { repo: f.context.repository },
    projectDir: f.s.context.sourceRoot,
    statePath: path.join(f.s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
    pexec,
    deps: {
      revisionBackend: f.backend,
      getLiveState: async () => {
        effects++;
        return 'develop';
      },
    },
  };
  for (const [adapter, rest] of [
    [verbAcStamp, [parseEvidenceAcs(body)[0].label]],
    [verbDodStamp, ['lint']],
  ]) {
    await assert.rejects(adapter({ ...ctx, rest }), (error) => error.code === 'revision-pending');
  }
  await assert.rejects(
    moveState({
      issueArg: String(f.context.issue),
      stateArg: 'test',
      cfg: ctx.cfg,
      projectDir: f.s.context.sourceRoot,
      revisionBackend: f.backend,
      _runGuardExecution: async () => {
        effects++;
        return { exit: 4 };
      },
      _probeCompletion: async () => {
        effects++;
        return {};
      },
    }),
    (error) => error.code === 'revision-pending'
  );
  const operationFile = path.join(f.s.context.sourceRoot, 'pending-scope-operation.json');
  fs.writeFileSync(
    operationFile,
    JSON.stringify({
      schema: 'aitm.issue-body-operation/v1',
      kind: 'replace-exact',
      expectedVersion: f.backend.observation.body.version,
      expected: 'Synthetic scope',
      replacement: 'Other scope',
    })
  );
  await assert.rejects(
    runIssueBodyVerb(
      { ...ctx, rest: [String(f.context.issue), '--operation-file', operationFile] },
      {
        revisionBackend: f.backend,
        writeDeps: {
          fetchBody: async () => {
            effects++;
            return body;
          },
          pushBody: async () => {
            effects++;
          },
        },
      }
    ),
    (error) => error.code === 'revision-pending'
  );
  assert.equal(
    effects,
    0,
    'pending source denies actual proof/source/stage adapters before callbacks'
  );
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

for (const fault of [
  ...['failBefore', 'failAfter'].flatMap((phase) =>
    [
      'native-source-journal-write',
      'native-source-journal-readback',
      'native-source-pending-readback',
    ].map((step) => ({ phase, step }))
  ),
  { transport: 'before' },
  { transport: 'after' },
]) {
  test(`native linked source exact ${JSON.stringify(fault)} prefix resumes without duplicate editor or body effect`, async () => {
    const f = await linkedExecutionFixture();
    try {
      const events = f.backend.createdEvents;
      if (fault.phase) {
        f.backend[fault.phase] = fault.step;
        assert.equal((await f.invoke()).decision, 'block');
        f.restore();
        if (!(fault.phase === 'failBefore' && fault.step === 'native-source-journal-write'))
          await assertNativePending(f);
      }
      assert.equal((await f.invoke()).decision, 'allow');
      assert.equal(f.backend.snapshot.nativeSourceRecords.length, 1);
      const pending = f.backend.admission.pendingSource;
      f.edit();
      if (fault.transport) {
        f.transport(fault.transport);
        assert.equal((await f.invoke()).decision, 'block');
        f.restore();
        f.transport(null);
        await assertNativePending(f);
      }
      assert.equal((await f.invoke()).code, 'revision-approval-stale');
      assert.equal(f.pushes(), 1);
      assert.deepEqual(f.backend.admission.pendingSource, pending);
      f.restore();
      assert.equal((await f.invoke()).decision, 'block');
      assert.equal(f.pushes(), 1);
      assert.deepEqual(f.backend.createdEvents, events);
      assert.equal(f.backend.snapshot.nativeSourceRecords.length, 1);
      const approved = await runPlanApprove({
        issueNumber: f.context.issue,
        cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot,
        deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
      });
      assert.equal(approved.status, 'approved');
      assert.equal(f.backend.admission.state, 'allow');
    } finally {
      f.s.dispose();
    }
  });
}

for (const drift of [
  'file',
  'body',
  'stage',
  'source-binding',
  'source-read',
  'operation',
  'order',
  'pending-hash',
  'foreign-session',
  'changed-intent',
  'missing-source-record',
  'missing-plan-history',
]) {
  test(`pending native linked source refuses ${drift} drift without a new effect`, async () => {
    const f = await linkedExecutionFixture();
    try {
      assert.equal((await f.invoke()).decision, 'allow');
      const snapshot = f.backend.snapshot;
      if (drift === 'file')
        fs.writeFileSync(
          path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'),
          plan.replace('registry checks can fail', 'unrecognized changed source')
        );
      if (drift === 'body') snapshot.observation.body.bytes += '\nUnrelated body drift';
      if (drift === 'stage') snapshot.observation.stage = 'test';
      if (drift === 'source-binding')
        snapshot.observation.protectedSourceBindings[0].hash = 'sha256:' + '0'.repeat(64);
      if (drift === 'source-read')
        snapshot.nativeSourceRecords[0].sourceRead.text += '\nInjected history';
      if (drift === 'operation')
        snapshot.nativeSourceRecords[0].operation.input.new_string = 'unsealed effect';
      if (drift === 'order') snapshot.nativeOrder.reverse();
      if (drift === 'pending-hash') snapshot.pendingSource.afterContentSha256 = '0'.repeat(64);
      if (drift === 'foreign-session') f.payload.session_id = 'foreign-session';
      if (drift === 'changed-intent') f.payload.tool_input.new_string = 'different source effect';
      if (drift === 'missing-source-record') delete snapshot.nativeSourceRecords;
      if (drift === 'missing-plan-history') delete snapshot.nativePlanRecords;
      let refused = false;
      try {
        f.restore(snapshot);
        refused = (await f.invoke()).decision === 'block';
      } catch (error) {
        assert.match(error.message, /criteria-revision/);
        refused = true;
      }
      assert.equal(refused, true);
      assert.equal(f.pushes(), 0);
      assert.equal(f.backend.snapshot.nativeSourceRecords?.length ?? 0, 1);
    } finally {
      f.s.dispose();
    }
  });
}
