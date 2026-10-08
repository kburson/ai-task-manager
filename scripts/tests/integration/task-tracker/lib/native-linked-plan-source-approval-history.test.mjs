// @story #1855
// cspell:words reconstructable
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configPath } from '../../../../task-tracker/paths.mjs';
import { memoryRuntime } from '../../../fixtures/criteria-revision-runtime.mjs';
import {
  registerRevisionDomain,
  revisionRuntime,
} from '../../../../task-tracker/lib/criteria-revision/domain.mjs';
import { refreshAdmission } from '../../../../task-tracker/lib/criteria-revision/admission.mjs';
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
  reconstructNativePlanRecord,
} from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';

// Node --test isolates each file in its own worker process. Keep every native
// default-root read in that process deterministic even when the user's host has
// unrelated enabled domains; no runtime/port root override is passed to a hook.
const originalProcessHome = process.env.HOME;
const originalProcessSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalProcessApp = process.env.AI_TASK_MANAGER_APP_NAME;

let isolatedProcessHome;

before(() => {
  isolatedProcessHome = mkdtempProjectIsolated('aitm-linked-source-host-');
  process.env.HOME = isolatedProcessHome;
  const fixtureSid = `fixture-${path.basename(isolatedProcessHome)}`;
  process.env.AI_TASK_MANAGER_SESSION_ID = fixtureSid;
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), fixtureSid);
  assert.equal(
    revisionRuntime().configRoot,
    path.join(isolatedProcessHome, '.ai-task-manager', 'criteria-revision-domains')
  );
});

after(() => {
  if (originalProcessHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalProcessHome;
  if (originalProcessSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalProcessSid;
  if (originalProcessApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalProcessApp;
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

test('actual native linked-plan approval publishes admission from its full independently collected protected sources', async () => {
  const f = await setup();
  try {
    const state = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(state.status, 'applied');
    const approval = await readCurrentMemoryPlanApproval({
      backend: f.backend,
      context: f.context,
    });
    assert.ok(approval);
    const runtime = memoryRuntime();
    Object.assign(runtime.identity, {
      repository: f.context.repository,
      ...state.observation.writerDomain,
    });
    runtime.ports.fs.mkdirSync(state.observation.writerDomain.commonDirectory, { recursive: true });
    const context = { ...f.context, issues: [f.context.issue] };
    context.domain = registerRevisionDomain(
      {
        repository: context.repository,
        commonDir: state.observation.writerDomain.commonDirectory,
        host: state.observation.writerDomain.hostId,
        quiescenceConfirmed: true,
      },
      runtime.ports
    );
    const before = f.backend.snapshot;
    const entry = await refreshAdmission(
      {
        context,
        observe: () => ({
          observation: state.observation,
          authority: {
            complete: state.status === 'applied',
            pending: state.chain.status === 'pending',
            chain: 'verified',
            head: state.chain.head,
            baselineAllowed: false,
            contractDigest: state.effectiveProposal.after.semanticContractDigest,
            planApproval: approval.payload,
          },
        }),
      },
      runtime.ports
    );
    assert.equal(
      entry.state,
      'allow',
      'native Plan approval and actual full source observation must agree without deleting Scope or copying payload into source collection'
    );
    assert.deepEqual(f.backend.snapshot, before);
  } finally {
    f.s.dispose();
  }
});

test('actual native hooks deny code edit and commit after an in-place linked-plan document correction', async () => {
  const f = await setup({ nativeDomain: true });
  try {
    const { context, backend, s, ports } = f;
    const state = await observeRevision({ context, deps: backend });
    const approval = await readCurrentMemoryPlanApproval({ backend, context });
    assert.ok(approval);
    assert.equal(state.status, 'applied');
    const entry = await refreshAdmission(
      {
        context: { ...context, domain: f.nativeDomain, issues: [context.issue] },
        observe: () => ({
          observation: state.observation,
          authority: {
            complete: true,
            pending: false,
            chain: 'verified',
            head: state.chain.head,
            baselineAllowed: false,
            contractDigest: state.effectiveProposal.after.semanticContractDigest,
            planApproval: approval.payload,
          },
        }),
      },
      ports
    );
    assert.equal(
      entry.state,
      'allow',
      'prerequisite genuine native approval admission, never a synthesized allow file'
    );
    fs.writeFileSync(
      configPath(s.context.sourceRoot),
      JSON.stringify({ repo: context.repository })
    );
    fs.mkdirSync(path.join(s.context.sourceRoot, 'src'));
    fs.writeFileSync(path.join(s.context.sourceRoot, 'src', 'app.mjs'), 'export const value = 1;');
    execFileSync('git', ['add', 'src/app.mjs'], { cwd: s.context.sourceRoot, env: s.env });
    const script = fileURLToPath(
      new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url)
    );
    const hook = (payload) => {
      const result = spawnSync(process.execPath, [script], {
        cwd: s.context.sourceRoot,
        env: { ...process.env, ...s.env },
        encoding: 'utf8',
        input: JSON.stringify({
          session_id: currentSessionId(),
          cwd: s.context.sourceRoot,
          ...payload,
        }),
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim() ? JSON.parse(result.stdout) : { decision: 'allow' };
    };
    const edit = {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(s.context.sourceRoot, 'src', 'app.mjs') },
    };
    const commit = { tool_name: 'Bash', tool_input: { command: 'git commit -m "[#124] fixture"' } };
    assert.equal(hook(edit).decision, 'allow');
    assert.equal(hook(commit).decision, 'allow');
    const planPath = path.join(s.context.sourceRoot, 'docs', 'plan-a.md');
    // External file drift exercises read-side freshness separately from governed pre-edit quarantine.
    fs.writeFileSync(
      planPath,
      plan.replace(
        'consumers receive complete releases',
        'operators avoid incomplete release artifacts'
      )
    );
    assert.deepEqual([hook(edit).decision, hook(commit).decision], ['block', 'block']);
  } finally {
    f.s.dispose();
  }
});

test('genuine original native Plan history reconstructs after the linked file changes without restoring current approval', async () => {
  const f = await setup();
  try {
    const original = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(original.status, 'applied');
    const journal = structuredClone(f.backend.snapshot.nativePlanRecords[0]);
    assert.deepEqual(
      reconstructNativePlanRecord({
        journal,
        expected: journal.before,
        currentContract: original.effectiveProposal.after,
        chain: original.chain,
        backend: f.backend,
      }),
      journal.after
    );
    const compatibleOld = structuredClone(journal);
    delete compatibleOld.sourceRead;
    assert.deepEqual(
      reconstructNativePlanRecord({
        journal: compatibleOld,
        expected: journal.before,
        currentContract: original.effectiveProposal.after,
        chain: original.chain,
        backend: f.backend,
      }),
      journal.after
    );
    fs.writeFileSync(
      path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'),
      plan.replace(
        'consumers receive complete releases',
        'operators avoid incomplete release artifacts'
      )
    );
    assert.equal(
      await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
      null
    );
    assert.deepEqual(
      reconstructNativePlanRecord({
        journal,
        expected: journal.before,
        currentContract: original.effectiveProposal.after,
        chain: original.chain,
        backend: f.backend,
      }),
      journal.after,
      'original native execution history remains reconstructable from genuinely retained original source evidence'
    );
    assert.equal(
      await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
      null
    );
    assert.deepEqual(f.backend.snapshot.nativePlanRecords[0], journal);
    const restored = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
    assert.deepEqual(
      reconstructNativePlanRecord({
        journal: restored.snapshot.nativePlanRecords[0],
        expected: journal.before,
        currentContract: original.effectiveProposal.after,
        chain: original.chain,
        backend: restored,
      }),
      journal.after
    );
    assert.equal(
      await readCurrentMemoryPlanApproval({ backend: restored, context: f.context }),
      null
    );
    const oldJournal = structuredClone(journal);
    delete oldJournal.sourceRead;
    assert.throws(
      () =>
        reconstructNativePlanRecord({
          journal: oldJournal,
          expected: journal.before,
          currentContract: original.effectiveProposal.after,
          chain: original.chain,
          backend: restored,
        }),
      /plan-approval-binding/,
      'old linked records without actual capture remain current-file dependent; no backfill'
    );
  } finally {
    f.s.dispose();
  }
});

for (const drift of [
  'content',
  'content-and-hash',
  'hash',
  'reference',
  'root',
  'body',
  'payload',
  'extra-field',
  'order',
]) {
  test(`retained native linked-source history refuses ${drift} corruption`, async () => {
    const f = await setup();
    try {
      const original = await observeRevision({ context: f.context, deps: f.backend });
      const snapshot = JSON.parse(JSON.stringify(f.backend.snapshot));
      const journal = snapshot.nativePlanRecords[0];
      assert.equal(journal.sourceRead.schema, 'aitm.native-plan-source-read/v1');
      assert.equal(journal.sourceRead.text, plan);
      if (drift === 'content' || drift === 'content-and-hash')
        journal.sourceRead.text += '\nchanged historical file\n';
      if (drift === 'content-and-hash')
        journal.sourceRead.contentSha256 = hashBytes(journal.sourceRead.text).slice(7);
      if (drift === 'hash') journal.sourceRead.contentSha256 = '0'.repeat(64);
      if (drift === 'reference') journal.sourceRead.path = 'docs/plan-b.md';
      if (drift === 'root')
        journal.sourceRead.projectDir = path.join(f.s.context.sourceRoot, 'foreign');
      if (drift === 'body') journal.sourceRead.bodyHash = hashBytes('foreign');
      if (drift === 'payload') journal.record.payload.sourceBindings[1].hash = hashBytes('foreign');
      if (drift === 'extra-field') journal.sourceRead.ready = true;
      if (drift === 'order') snapshot.nativeOrder[0].predecessor = hashBytes('foreign');
      let refused = false;
      try {
        const restored = createRevisionMemory(snapshot);
        const current = await observeRevision({ context: f.context, deps: restored });
        refused = current.status !== 'applied';
      } catch {
        refused = true;
      }
      assert.equal(refused, true);
      if (drift !== 'order')
        assert.throws(() =>
          reconstructNativePlanRecord({
            journal,
            expected:
              original.effectiveProposal.authority.kind === 'legacy-body'
                ? f.backend.snapshot.nativePlanRecords[0].before
                : journal.before,
            currentContract: original.effectiveProposal.after,
            chain: original.chain,
            backend: f.backend,
          })
        );
      assert.deepEqual(f.backend.snapshot.nativePlanRecords[0].sourceRead.text, plan);
    } finally {
      f.s.dispose();
    }
  });
}
