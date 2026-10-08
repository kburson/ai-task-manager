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

for (const drift of [
  'missing',
  'corrupt',
  'symlink',
  'escaping-symlink',
  'escaping-directory',
  'escaping-reference',
  'selector',
  'malformed-entry',
  'null',
  'v1',
  'foreign-root',
]) {
  test(`local linked-plan admission refuses ${drift} without a remote query`, async () => {
    const f = await setup({ nativeDomain: true, tasks: true });
    try {
      const entryPath = await publishNativeAdmission(f);
      const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      let ports = f.ports;
      if (drift === 'missing') fs.unlinkSync(planPath);
      if (drift === 'corrupt') fs.writeFileSync(planPath, 'not a valid linked intent');
      if (drift === 'symlink' || drift === 'escaping-symlink') {
        const target =
          drift === 'symlink'
            ? path.join(f.s.context.sourceRoot, 'docs', 'original.md')
            : path.join(f.s.root, 'foreign-plan.md');
        fs.renameSync(planPath, target);
        fs.symlinkSync(target, planPath);
      }
      if (drift === 'escaping-directory') {
        const foreign = path.join(f.s.root, 'foreign-docs');
        fs.renameSync(path.join(f.s.context.sourceRoot, 'docs'), foreign);
        fs.symlinkSync(foreign, path.join(f.s.context.sourceRoot, 'docs'));
      }
      if (drift === 'escaping-reference') {
        entry.localPlan.body = entry.localPlan.body.replace('docs/plan-a.md', '../foreign-plan.md');
        entry.localPlan.path = '../foreign-plan.md';
      }
      if (drift === 'selector')
        entry.localPlan.body = entry.localPlan.body.replace(
          '- **Source-plan**: docs/plan-a.md',
          '- **Source-plan**: docs/plan-a.md\n- **Source-plan-section**: ### Task 1: Publish'
        );
      if (drift === 'malformed-entry') entry.localPlan.reader = 'caller';
      if (drift === 'null') entry.localPlan = null;
      if (drift === 'v1') {
        entry.schema = 'aitm.revision-admission/v1';
        delete entry.localPlan;
      }
      if (drift === 'foreign-root') {
        const foreign = path.join(f.s.root, 'foreign');
        fs.mkdirSync(foreign);
        execFileSync('git', ['init', '-q', foreign], { env: f.s.env });
        execFileSync(
          'git',
          ['remote', 'add', 'origin', 'https://github.com/example/criteria.git'],
          { cwd: foreign, env: f.s.env }
        );
        ports = { ...ports, worktree: foreign };
      }
      fs.writeFileSync(entryPath, JSON.stringify(entry));
      assert.equal(readAdmission(f.context, ports).state, 'deny');
    } finally {
      f.s.dispose();
    }
  });
}

test('baseline linked native source capture also rejects a stripped null projection', async () => {
  const f = await setup({ nativeDomain: true });
  try {
    const entryPath = await publishNativeAdmission(f, true);
    const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
    assert.equal(entry.revision, 0);
    assert.equal(entry.planApproval, null);
    entry.localPlan = null;
    fs.writeFileSync(entryPath, JSON.stringify(entry));
    assert.equal(readAdmission(f.context, f.ports).state, 'deny');
  } finally {
    f.s.dispose();
  }
});

test('same-domain linked worktree admission checks the invoking checkout actual plan bytes', async () => {
  const f = await setup({ nativeDomain: true });
  try {
    await publishNativeAdmission(f);
    execFileSync('git', ['add', 'docs/plan-a.md'], { cwd: f.s.context.sourceRoot, env: f.s.env });
    execFileSync('git', ['commit', '-qm', 'Synthetic linked plan'], {
      cwd: f.s.context.sourceRoot,
      env: f.s.env,
    });
    const second = path.join(f.s.root, 'second');
    execFileSync('git', ['worktree', 'add', '--detach', second], {
      cwd: f.s.context.sourceRoot,
      env: f.s.env,
      stdio: 'pipe',
    });
    const ports = { ...f.ports, worktree: second };
    assert.equal(readAdmission(f.context, ports).state, 'allow');
    fs.writeFileSync(
      path.join(second, 'docs', 'plan-a.md'),
      plan.replace('registry checks can fail', 'a different checkout has drifted')
    );
    assert.equal(readAdmission(f.context, ports).state, 'deny');
    assert.equal(
      readAdmission(f.context, f.ports).state,
      'allow',
      'per-call freshness alone does not claim shared pre-source-effect deny'
    );
  } finally {
    f.s.dispose();
  }
});

for (const hookName of ['activity-guard', 'source-edit-gate']) {
  test(`actual ${hookName} quarantines default linked editor and publishes shared deny before effects`, async () => {
    const f = await setup({ nativeDomain: true });
    try {
      await publishNativeAdmission(f);
      execFileSync('git', ['add', 'docs/plan-a.md'], { cwd: f.s.context.sourceRoot, env: f.s.env });
      execFileSync('git', ['commit', '-qm', 'Synthetic source mutation baseline'], {
        cwd: f.s.context.sourceRoot,
        env: f.s.env,
      });
      const second = path.join(f.s.root, 'second');
      execFileSync('git', ['worktree', 'add', '-b', 'fixture-second', second], {
        cwd: f.s.context.sourceRoot,
        env: f.s.env,
        stdio: 'pipe',
      });
      fs.mkdirSync(path.join(second, '.ai-task-manager'), { recursive: true });
      for (const root of [f.s.context.sourceRoot, second])
        fs.writeFileSync(configPath(root), JSON.stringify({ repo: f.context.repository }));
      setActiveTask(
        currentSessionId(),
        {
          issue: `#${f.context.issue}`,
          entryStartTs: new Date().toISOString(),
          worktreePath: second,
          worktreeBranch: 'fixture-second',
          kanbanState: 'develop',
        },
        second
      );
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      const script = fileURLToPath(
        new URL(`../../../../task-tracker/${hookName}.mjs`, import.meta.url)
      );
      const output = spawnSync(process.execPath, [script], {
        cwd: f.s.context.sourceRoot,
        env: { ...process.env, ...f.s.env },
        input: JSON.stringify({
          session_id: currentSessionId(),
          cwd: f.s.context.sourceRoot,
          tool_name: 'Edit',
          tool_input: {
            file_path: planPath,
            old_string: 'registry checks can fail',
            new_string: 'source correction needs fresh approval',
          },
        }),
        encoding: 'utf8',
      });
      assert.equal(output.status, 0, output.stderr);
      assert.equal(
        output.stdout.trim() ? JSON.parse(output.stdout).decision : 'allow',
        'block',
        'default hook has no trusted native source collector'
      );
      assert.match(JSON.parse(output.stdout).reason, /revision-authority-unavailable/);
      assert.equal(
        fs.readFileSync(planPath, 'utf8'),
        plan,
        'pre-tool hook runs before any actual file effect'
      );
      assert.deepEqual(
        [
          readAdmission(f.context, f.ports).state,
          readAdmission(f.context, { ...f.ports, worktree: second }).state,
        ],
        ['deny', 'deny'],
        'both same-domain checkouts are denied before the default source editor is refused'
      );
    } finally {
      f.s.dispose();
    }
  });
}

test('baseline linked publication refuses incomplete native source collection', async () => {
  const f = await setup({ nativeDomain: true });
  try {
    await publishNativeAdmission(f, true);
    const observation = structuredClone(f.initialObservation);
    observation.protectedSourceBindings = observation.protectedSourceBindings.filter(
      (binding) => binding.identity === 'scope'
    );
    const entry = await refreshAdmission(
      {
        context: { ...f.context, domain: f.nativeDomain, issues: [f.context.issue] },
        observe: () => ({
          observation,
          authority: {
            complete: true,
            pending: false,
            chain: 'empty',
            head: null,
            baselineAllowed: true,
            contractDigest: hashBytes('verified baseline fixture'),
            planApproval: null,
          },
        }),
      },
      f.ports
    );
    assert.equal(entry.state, 'deny');
    assert.equal(readAdmission(f.context, f.ports).state, 'deny');
  } finally {
    f.s.dispose();
  }
});
