// @story #1855
// cspell:words reconstructable
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configPath } from '../../../../task-tracker/paths.mjs';
import {
  registerRevisionDomain,
  revisionRuntime,
  domainStorage,
} from '../../../../task-tracker/lib/criteria-revision/domain.mjs';
import {
  refreshAdmission,
  readAdmission,
  observeAdmission,
} from '../../../../task-tracker/lib/criteria-revision/admission.mjs';
import test, { before, after } from 'node:test';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { readCurrentMemoryPlanApproval } from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { runHook as runSourceEditHook } from '../../../../task-tracker/source-edit-gate.mjs';
import { withRevisionInterlock } from '../../../../task-tracker/lib/criteria-revision/interlock.mjs';
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

async function publishNativeAdmission(f, baseline = false) {
  const state = await observeRevision({ context: f.context, deps: f.backend });
  const approval = await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context });
  const observation = baseline ? f.initialObservation : state.observation;
  const bound = { ...f.context, domain: f.nativeDomain, issues: [f.context.issue] };
  const observe = () => ({
    observation,
    authority: {
      complete: true,
      pending: false,
      chain: baseline ? 'empty' : 'verified',
      head: baseline ? null : state.chain.head,
      baselineAllowed: baseline,
      contractDigest: baseline
        ? hashBytes('verified baseline fixture')
        : state.effectiveProposal.after.semanticContractDigest,
      planApproval: baseline ? null : approval.payload,
    },
  });
  if (baseline)
    await withRevisionInterlock(
      bound,
      (capability) => observeAdmission({ capability, context: bound, observe }, f.ports),
      f.ports
    );
  const entry = await refreshAdmission({ context: bound, observe }, f.ports);
  assert.equal(entry.state, 'allow');
  assert.equal(entry.schema, 'aitm.revision-admission/v2');
  assert.ok(entry.localPlan);
  assert.equal(readAdmission(f.context, f.ports).state, 'allow');
  return path.join(domainStorage(f.nativeDomain), 'admission', `${f.context.issue}.json`);
}

for (const hookName of ['activity-guard', 'source-edit-gate']) {
  for (const scenario of [
    'shared-issues',
    'mixed-targets',
    'unknown-entry',
    'corrupt-entry',
    'escaping-target',
    'malformed-targets',
    'unrelated',
    'disabled',
  ]) {
    test(`default ${hookName} source quarantine handles ${scenario} without editor effects`, async () => {
      const f = await setup({ nativeDomain: scenario !== 'disabled' });
      try {
        let entryPath;
        if (scenario !== 'disabled') entryPath = await publishNativeAdmission(f);
        fs.writeFileSync(
          configPath(f.s.context.sourceRoot),
          JSON.stringify({ repo: f.context.repository })
        );
        if (scenario === 'shared-issues') {
          const observation = structuredClone(f.initialObservation);
          observation.issue = 125;
          const entry = await refreshAdmission(
            {
              context: { ...f.context, issue: 125, issues: [125], domain: f.nativeDomain },
              observe: () => ({
                observation,
                authority: {
                  complete: true,
                  pending: false,
                  chain: 'empty',
                  head: null,
                  baselineAllowed: true,
                  contractDigest: hashBytes('second verified baseline fixture'),
                  planApproval: null,
                },
              }),
            },
            f.ports
          );
          assert.equal(entry.state, 'allow');
        }
        if (scenario === 'unknown-entry')
          fs.writeFileSync(path.join(path.dirname(entryPath), 'unknown.tmp'), 'incomplete');
        if (scenario === 'corrupt-entry') fs.writeFileSync(entryPath, '{corrupt');
        const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
        const script = fileURLToPath(
          new URL(`../../../../task-tracker/${hookName}.mjs`, import.meta.url)
        );
        let payload = {
          tool_name: 'Edit',
          tool_input: {
            file_path:
              scenario === 'unrelated'
                ? path.join(f.s.context.sourceRoot, 'docs', 'unrelated.md')
                : planPath,
            old_string: 'registry checks can fail',
            new_string: 'fresh source correction',
          },
        };
        if (scenario === 'mixed-targets') {
          fs.mkdirSync(path.join(f.s.context.sourceRoot, 'src'));
          fs.writeFileSync(
            path.join(f.s.context.sourceRoot, 'src', 'app.mjs'),
            'export const value = 1;\n'
          );
          payload = {
            tool_name: 'apply_patch',
            tool_input: {
              patch:
                '*** Begin Patch\n*** Update File: docs/plan-a.md\n@@\n-old\n+new\n*** Update File: src/app.mjs\n@@\n-old\n+new\n*** End Patch',
            },
          };
        }
        if (scenario === 'escaping-target')
          payload.tool_input.file_path = path.join(f.s.root, 'foreign.md');
        if (scenario === 'malformed-targets')
          payload = { tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n' } };
        const output = spawnSync(process.execPath, [script], {
          cwd: f.s.context.sourceRoot,
          env: { ...process.env, ...f.s.env },
          input: JSON.stringify({
            session_id: currentSessionId(),
            cwd: f.s.context.sourceRoot,
            ...payload,
          }),
          encoding: 'utf8',
        });
        assert.equal(output.status, 0, output.stderr);
        const decision = output.stdout.trim() ? JSON.parse(output.stdout).decision : 'allow';
        assert.equal(
          decision,
          ['unrelated', 'disabled'].includes(scenario) ? 'allow' : 'block',
          output.stdout
        );
        assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
        if (scenario === 'shared-issues' || scenario === 'mixed-targets') {
          assert.equal(readAdmission(f.context, f.ports).state, 'deny');
          assert.ok(
            readAdmission(f.context, f.ports).localPlan,
            'deny retains validated known source association'
          );
        }
        if (scenario === 'shared-issues')
          assert.equal(readAdmission({ ...f.context, issue: 125 }, f.ports).state, 'deny');
        if (scenario === 'unrelated')
          assert.equal(readAdmission(f.context, f.ports).state, 'allow');
      } finally {
        f.s.dispose();
      }
    });
  }
}

for (const toolName of ['Edit', 'Write']) {
  test(`recognized-memory actual source hook seals ${toolName} intent and pending denial before linked file effect`, async () => {
    const f = await setup();
    try {
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      const after = plan.replace(
        'registry checks can fail',
        'source corrections require fresh source approval'
      );
      const tool_input =
        toolName === 'Edit'
          ? {
              file_path: planPath,
              old_string: 'registry checks can fail',
              new_string: 'source corrections require fresh source approval',
            }
          : { file_path: planPath, content: after };
      const before = f.backend.snapshot,
        events = f.backend.createdEvents;
      const result = await runSourceEditHook(
        {
          session_id: currentSessionId(),
          cwd: f.s.context.sourceRoot,
          tool_name: toolName,
          tool_input,
        },
        { cfg: { repo: f.context.repository }, revisionBackend: f.backend }
      );
      assert.equal(result.decision, 'allow', JSON.stringify(result));
      assert.equal(
        fs.readFileSync(planPath, 'utf8'),
        plan,
        'the native pre-tool adapter must seal before the editor runs'
      );
      assert.equal(
        f.backend.snapshot.nativeSourceRecords?.length,
        1,
        'actual hook must persist its private checks-backed fixed source intent'
      );
      const journal = f.backend.snapshot.nativeSourceRecords[0];
      assert.equal(journal.operation.schema, 'aitm.native-linked-plan-edit/v1');
      assert.equal(journal.operation.beforeContentSha256, hashBytes(plan).slice(7));
      assert.equal(journal.operation.afterContentSha256, hashBytes(after).slice(7));
      assert.equal(f.backend.admission.state, 'deny');
      assert.equal(f.backend.admission.pendingSource.journalId, journal.id);
      assert.deepEqual(f.backend.createdEvents, events);
      assert.deepEqual(
        f.backend.observation,
        before.observation,
        'no body/proof/source projection effect precedes editor execution'
      );
    } finally {
      f.s.dispose();
    }
  });
}
