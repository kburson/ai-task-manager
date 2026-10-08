// @story #1855
// cspell:words reconstructable
import { execFileSync, spawnSync } from 'node:child_process';
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
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
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

for (const toolName of ['Edit', 'Write']) {
  test(`native linked ${toolName} resumes exact source prefix after restart and only fresh Plan restores admission`, async () => {
    const f = await setup();
    try {
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      const afterText = plan.replace(
        'registry checks can fail',
        'source corrections require fresh source approval'
      );
      const input =
        toolName === 'Edit'
          ? {
              file_path: planPath,
              old_string: 'registry checks can fail',
              new_string: 'source corrections require fresh source approval',
            }
          : { file_path: planPath, content: afterText };
      const payload = {
        session_id: currentSessionId(),
        cwd: f.s.context.sourceRoot,
        tool_name: toolName,
        tool_input: input,
      };
      let pushes = 0;
      const invoke = () =>
        runSourceEditHook(payload, {
          cfg: { repo: f.context.repository },
          revisionBackend: f.backend,
          writeDeps: {
            fetchBody: async () => f.backend.observation.body.bytes,
            pushBody: async (_repo, _issue, body) => {
              pushes++;
              const next = f.backend.observation;
              next.body = { bytes: body, version: parseBodyVersion(body) };
              const governedPlan = validateGovernedLinkedPlan({
                body,
                projectDir: f.s.context.sourceRoot,
              });
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
              f.backend.replacePlanning({
                ...f.backend.snapshot.planning,
                bodyHash: hashBytes(body),
              });
            },
          },
        });
      const originalProposal = (await observeRevision({ context: f.context, deps: f.backend }))
        .effectiveProposal;
      const events = f.backend.createdEvents;
      assert.equal((await invoke()).decision, 'allow');
      const journal = f.backend.snapshot.nativeSourceRecords[0];
      f.backend = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
      assert.equal(f.backend.admission.state, 'deny');
      assert.equal(f.backend.admission.pendingSource.journalId, journal.id);
      assert.notEqual(
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
      assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
      assert.equal(pushes, 0);
      assert.equal(
        (await invoke()).decision,
        'allow',
        'only the original unchanged before-file intent may retry'
      );
      assert.equal(f.backend.snapshot.nativeSourceRecords.length, 1);
      fs.writeFileSync(planPath, afterText); // The actual sandbox editor effect, outside the hook.
      f.backend = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
      const completed = await invoke();
      assert.equal(
        completed.decision,
        'block',
        'file-after completion cannot grant another editor execution'
      );
      assert.equal(completed.code, 'revision-approval-stale');
      assert.equal(
        pushes,
        1,
        'actual governed body adapter performs the one derived retirement projection'
      );
      assert.deepEqual(f.backend.observation, journal.after);
      assert.equal(
        f.backend.admission.pendingSource.journalId,
        journal.id,
        'source completion never clears pending'
      );
      assert.equal(
        await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
        null
      );
      assert.equal((await invoke()).decision, 'block');
      assert.equal(pushes, 1);
      assert.deepEqual(f.backend.createdEvents, events);
      assert.deepEqual(
        (await observeRevision({ context: f.context, deps: f.backend })).effectiveProposal,
        originalProposal
      );
      const beforePlan = f.backend.snapshot;
      for (const [phase, step] of ['failBefore', 'failAfter'].flatMap((phase) =>
        [
          'plan-body-write',
          'native-plan-record-write',
          'native-plan-record-readback',
          'plan-journal-clear',
          'native-source-completion-write',
          'native-source-completion-readback',
          'native-source-completion-allow',
          'native-source-completion-admission-readback',
        ].map((step) => [phase, step])
      )) {
        f.backend = createRevisionMemory(JSON.parse(JSON.stringify(beforePlan)));
        f.backend[phase] = step;
        await assert.rejects(
          runPlanApprove({
            issueNumber: f.context.issue,
            cfg: { repo: f.context.repository },
            projectDir: f.s.context.sourceRoot,
            deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
          }),
          /interrupted:/
        );
        f.backend = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
        const { refreshMemoryAdmission } =
          await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
        assert.equal(
          (await refreshMemoryAdmission({ backend: f.backend, context: f.context })).state,
          'deny'
        );
        assert.equal(f.backend.admission.pendingSource.journalId, journal.id);
        const { mutateIssueBody } =
          await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
        let effects = 0;
        await assert.rejects(
          mutateIssueBody({
            repo: f.context.repository,
            issueNumber: f.context.issue,
            deps: {
              revisionBackend: f.backend,
              fetchBody: async () => {
                effects++;
                return f.backend.observation.body.bytes;
              },
              pushBody: async () => {
                effects++;
              },
            },
            mutate: (body) => body + '\nOrdinary note',
          }),
          /revision-pending/
        );
        assert.equal(effects, 0, `${phase}:${step} must deny before ordinary writer effects`);
        await assertNativePending(f);
        const retried = await runPlanApprove({
          issueNumber: f.context.issue,
          cfg: { repo: f.context.repository },
          projectDir: f.s.context.sourceRoot,
          deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
        });
        assert.ok(['approved', 'already-approved'].includes(retried.status));
        assert.equal(f.backend.admission.pendingSource, null);
        assert.equal(f.backend.admission.state, 'allow');
        assert.equal(
          f.backend.snapshot.nativePlanRecords.length,
          2,
          'Plan retry retains exactly one new completed history'
        );
      }
      f.backend = createRevisionMemory(JSON.parse(JSON.stringify(beforePlan)));
      const approved = await runPlanApprove({
        issueNumber: f.context.issue,
        cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot,
        deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
      });
      assert.equal(approved.status, 'approved');
      assert.equal(f.backend.admission.pendingSource, null);
      assert.equal(f.backend.admission.state, 'allow');
      assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    } finally {
      f.s.dispose();
    }
  });
}

test('actual memory admission refresh uses closed native authority and never clears a pending linked edit', async () => {
  const { refreshMemoryAdmission } =
    await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
  assert.equal(
    typeof refreshMemoryAdmission,
    'function',
    'recognized native refresh adapter is required without caller ports or results'
  );
  const f = await setup();
  try {
    const initial = createRevisionMemory({
      observation: f.initialObservation,
      comments: [],
      hostMessages: [],
    });
    assert.equal(
      (await refreshMemoryAdmission({ backend: initial, context: f.context })).state,
      'allow'
    );
    assert.equal(
      (await refreshMemoryAdmission({ backend: f.backend, context: f.context })).state,
      'allow'
    );
    for (const extra of ['observe', 'result', 'ports', 'completion', 'approval']) {
      await assert.rejects(
        refreshMemoryAdmission({ backend: f.backend, context: f.context, [extra]: {} })
      );
    }
    await assert.rejects(
      refreshMemoryAdmission({ backend: f.backend, context: { ...f.context, issue: 125 } })
    );
    const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
    const payload = {
      session_id: currentSessionId(),
      cwd: f.s.context.sourceRoot,
      tool_name: 'Edit',
      tool_input: {
        file_path: planPath,
        old_string: 'registry checks can fail',
        new_string: 'source changes require fresh approval',
      },
    };
    assert.equal(
      (
        await runSourceEditHook(payload, {
          cfg: { repo: f.context.repository },
          revisionBackend: f.backend,
        })
      ).decision,
      'allow'
    );
    const pending = f.backend.admission.pendingSource;
    assert.ok(pending);
    assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
    assert.equal(
      (await refreshMemoryAdmission({ backend: f.backend, context: f.context })).state,
      'deny'
    );
    assert.deepEqual(f.backend.admission.pendingSource, pending);
    f.backend = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
    assert.equal(
      (await refreshMemoryAdmission({ backend: f.backend, context: f.context })).state,
      'deny'
    );
    assert.deepEqual(f.backend.admission.pendingSource, pending);
    assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
  } finally {
    f.s.dispose();
  }
});

for (const scenario of ['repeatable-edit', 'injected-target']) {
  test(`recognized source editor refuses unsafe ${scenario} before intent or editor grant`, async () => {
    const f = await setup({ nativeDomain: scenario === 'registered-host' });
    try {
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      const target =
        scenario === 'injected-target'
          ? path.join(f.s.context.sourceRoot, 'docs', 'other.md')
          : planPath;
      const payload = {
        session_id: currentSessionId(),
        cwd: f.s.context.sourceRoot,
        tool_name: 'Edit',
        tool_input: {
          file_path: target,
          old_string: 'registry checks can fail',
          new_string:
            scenario === 'repeatable-edit'
              ? 'registry checks can fail repeatedly'
              : 'source changes need fresh approval',
        },
      };
      const deps = { cfg: { repo: f.context.repository }, revisionBackend: f.backend };
      if (scenario === 'injected-target')
        deps.resolveMutationTarget = () => ({ lexical: planPath, physical: planPath });
      const result = await runSourceEditHook(payload, deps);
      assert.equal(
        result.decision,
        'block',
        'unsafe positive source topology must refuse before a sealed grant'
      );
      assert.equal(f.backend.snapshot.nativeSourceRecords?.length ?? 0, 0);
      assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
    } finally {
      f.s.dispose();
    }
  });
}

for (const scenario of [
  'stale-file',
  'malformed-chain',
  'unavailable-collection',
  'foreign-executor',
  'extra-context',
]) {
  test(`closed native memory refresh ${scenario} cannot publish allow`, async () => {
    const { refreshMemoryAdmission } =
      await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
    const f = await setup();
    try {
      let context = f.context;
      if (scenario === 'stale-file')
        fs.writeFileSync(
          path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'),
          plan.replace('registry checks can fail', 'current source has changed')
        );
      if (scenario === 'malformed-chain')
        f.backend.addComment({
          id: 'bad',
          body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
        });
      if (scenario === 'unavailable-collection') f.backend.pageFault = { nextPage: 2 };
      if (scenario === 'foreign-executor')
        context = { ...context, executor: { ...context.executor, sessionId: 'foreign-session' } };
      if (scenario === 'extra-context') context = { ...context, approved: true };
      if (scenario === 'foreign-executor' || scenario === 'extra-context')
        await assert.rejects(refreshMemoryAdmission({ backend: f.backend, context }));
      else
        assert.equal((await refreshMemoryAdmission({ backend: f.backend, context })).state, 'deny');
      assert.notEqual(f.backend.admission.state, 'allow');
    } finally {
      f.s.dispose();
    }
  });
}

for (const hostTopology of [
  'registered',
  'foreign',
  'unknown',
  'file',
  'dangling',
  'symlink-empty',
  'empty',
]) {
  test(`actual isolated default ${hostTopology} host bounds memory editor authority before file effects`, async () => {
    const s = createSandbox();
    try {
      fs.mkdirSync(path.join(s.context.sourceRoot, 'docs'));
      fs.writeFileSync(path.join(s.context.sourceRoot, 'docs', 'plan-a.md'), plan);
      execFileSync(
        'git',
        ['remote', 'set-url', 'origin', 'https://github.com/example/criteria.git'],
        { cwd: s.context.sourceRoot, env: s.env }
      );
      const moduleUrl = (relative) => new URL(relative, import.meta.url).href;
      const script = `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import fs from 'node:fs';
      import { execFileSync } from 'node:child_process';
      import { approvedFixture, fixture as revisionFixture } from ${JSON.stringify(moduleUrl('../../../helpers/criteria-revision-consumers.mjs'))};
      import { revisionRuntime, registerRevisionDomain } from ${JSON.stringify(moduleUrl('../../../../task-tracker/lib/criteria-revision/domain.mjs'))};
      import { currentSessionId } from ${JSON.stringify(moduleUrl('../../../../task-tracker/word-counter.mjs'))};
      import { setActiveTask } from ${JSON.stringify(moduleUrl('../../../../task-tracker/session-state.mjs'))};
      import { runHook } from ${JSON.stringify(moduleUrl('../../../../task-tracker/source-edit-gate.mjs'))};
      const root = process.cwd(), runtime = revisionRuntime({ worktree: root });
      assert.equal(runtime.configRoot, path.join(process.env.HOME, '.ai-task-manager', 'criteria-revision-domains'));
      assert.equal(process.env.HOME, ${JSON.stringify(s.env.HOME)});
      const actual = runtime.inspect(root), sid = currentSessionId();
      const f = await approvedFixture({ worktree: root, branch: 'trunk', sessionId: sid, linkedPlan: 'docs/plan-a.md',
        writerDomain: { hostId: actual.hostId, commonDirectory: actual.commonDirectory } });
      const topology = ${JSON.stringify(hostTopology)};
      if (topology === 'foreign') execFileSync('git', ['remote', 'set-url', 'origin', 'https://github.com/example/foreign.git']);
      if (topology === 'registered' || topology === 'foreign')
        registerRevisionDomain({ repository: topology === 'foreign' ? 'example/foreign' : f.context.repository,
          commonDir: actual.commonDirectory, host: actual.hostId, quiescenceConfirmed: true });
      else {
        fs.mkdirSync(path.dirname(runtime.configRoot), { recursive: true });
        if (topology === 'file') fs.writeFileSync(runtime.configRoot, 'malformed registry');
        else if (topology === 'dangling' || topology === 'symlink-empty') {
          const target = path.join(process.env.HOME, 'registry-link-target');
          if (topology === 'symlink-empty') fs.mkdirSync(target);
          fs.symlinkSync(target, runtime.configRoot);
        } else {
          fs.mkdirSync(runtime.configRoot);
          if (topology === 'unknown') fs.writeFileSync(path.join(runtime.configRoot, 'pending.lock'), '{}');
        }
      }
      if (topology === 'foreign') execFileSync('git', ['remote', 'set-url', 'origin', 'https://github.com/example/criteria.git']);
      setActiveTask(sid, { issue: '#' + f.context.issue, entryStartTs: new Date().toISOString(), worktreePath: root,
        worktreeBranch: 'trunk', kanbanState: 'develop' }, root);
      const file = path.join(root, 'docs', 'plan-a.md'), before = fs.readFileSync(file, 'utf8');
      const result = await runHook({ session_id: sid, cwd: root, tool_name: 'Edit', tool_input: { file_path: file,
        old_string: 'registry checks can fail', new_string: 'source changes need fresh approval' } },
        { cfg: { repo: f.context.repository }, revisionBackend: f.backend });
      assert.equal(result.decision, topology === 'empty' ? 'allow' : 'block');
      assert.equal(f.backend.snapshot.nativeSourceRecords?.length ?? 0, topology === 'empty' ? 1 : 0);
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      console.log(JSON.stringify({ root: runtime.configRoot, decision: result.decision }));
    `;
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: s.context.sourceRoot,
        env: s.env,
        encoding: 'utf8',
      });
      assert.equal(child.status, 0, child.stderr);
      const result = JSON.parse(child.stdout);
      assert.equal(
        result.root,
        path.join(s.env.HOME, '.ai-task-manager', 'criteria-revision-domains')
      );
      assert.equal(result.decision, hostTopology === 'empty' ? 'allow' : 'block');
    } finally {
      s.dispose();
    }
  });
}

test('pending linked source snapshot cannot strip its durable admission projection', async () => {
  const f = await setup();
  try {
    const payload = {
      session_id: currentSessionId(),
      cwd: f.s.context.sourceRoot,
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'),
        old_string: 'registry checks can fail',
        new_string: 'source changes need fresh approval',
      },
    };
    assert.equal(
      (
        await runSourceEditHook(payload, {
          cfg: { repo: f.context.repository },
          revisionBackend: f.backend,
        })
      ).decision,
      'allow'
    );
    const snapshot = f.backend.snapshot;
    delete snapshot.pendingSource;
    assert.throws(() => createRevisionMemory(snapshot), /native-source-pending/);
  } finally {
    f.s.dispose();
  }
});
