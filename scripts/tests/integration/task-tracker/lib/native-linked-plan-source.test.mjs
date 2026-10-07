import { promisify } from 'node:util';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configPath } from '../../../../task-tracker/paths.mjs';
import { memoryRuntime } from '../../../fixtures/criteria-revision-runtime.mjs';
import { registerRevisionDomain, revisionRuntime, domainStorage } from '../../../../task-tracker/lib/criteria-revision/domain.mjs';
import { refreshAdmission, readAdmission, observeAdmission } from '../../../../task-tracker/lib/criteria-revision/admission.mjs';
// @story #1855
import test, { before, after } from 'node:test';
import os from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture, fixture as revisionFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { readCurrentMemoryPlanApproval, planSourceBindings, reconstructNativePlanRecord } from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import { validateGovernedLinkedPlan } from '../../../../task-tracker/lib/governed-plan-policy.mjs';
import { resolveStoryIntentSource } from '../../../../task-tracker/lib/story-intent-source.mjs';
import { observeRevision, prepareRevision, applyRevision, recoverRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
import { runHook as runSourceEditHook } from '../../../../task-tracker/source-edit-gate.mjs';
import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { withRevisionInterlock } from '../../../../task-tracker/lib/criteria-revision/interlock.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';

// Node --test isolates each file in its own worker process. Keep every native
// default-root read in that process deterministic even when the user's host has
// unrelated enabled domains; no runtime/port root override is passed to a hook.
const originalProcessHome = process.env.HOME;
let isolatedProcessHome;
before(() => {
  isolatedProcessHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-linked-source-host-'));
  process.env.HOME = isolatedProcessHome;
  assert.equal(revisionRuntime().configRoot, path.join(isolatedProcessHome, '.ai-task-manager', 'criteria-revision-domains'));
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
  fs.writeFileSync(path.join(s.context.sourceRoot, 'docs', 'plan-a.md'), plan + (tasks ? '\n## Tasks\n### Task 1: Publish\n' + plan.replace('## Story Intent', '#### Story Intent') : ''));
  fs.writeFileSync(path.join(s.context.sourceRoot, 'docs', 'plan-b.md'), plan.replace('consumers receive complete releases', 'operators avoid incomplete release artifacts'));
  try {
    let ports, writerDomain;
    if (nativeDomain) {
      execFileSync('git', ['remote', 'set-url', 'origin', 'https://github.com/example/criteria.git'], { cwd: s.context.sourceRoot, env: s.env });
      ports = { configRoot: path.join(s.env.HOME, '.ai-task-manager', 'criteria-revision-domains'), worktree: s.context.sourceRoot };
      const actual = revisionRuntime(ports).inspect(s.context.sourceRoot);
      writerDomain = { hostId: actual.hostId, commonDirectory: actual.commonDirectory };
    }
    const f = await approvedFixture({ worktree: s.context.sourceRoot, branch: 'trunk', sessionId: currentSessionId(), linkedPlan: 'docs/plan-a.md', writerDomain });
    if (ports) f.nativeDomain = registerRevisionDomain({ repository: f.context.repository,
      commonDir: writerDomain.commonDirectory, host: writerDomain.hostId, quiescenceConfirmed: true }, ports);
    setActiveTask(currentSessionId(), { issue: `#${f.context.issue}`, entryStartTs: new Date().toISOString(),
      worktreePath: s.context.sourceRoot, worktreeBranch: 'trunk', kanbanState: 'develop' }, s.context.sourceRoot);
    return { ...f, s, ports };
  } catch (error) { s.dispose(); throw error; }
}

test('genuine native linked-plan approval remains bound after its own sanctioned approval body projection', async () => {
  const f = await setup();
  try {
    const result = await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context });
    assert.ok(result, 'actual native approval has current linked-source authority after its body write');
    assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'applied');
  } finally { f.s.dispose(); }
});

test('actual governed linked-plan reference correction uses native old/new file observations before source effects', async () => {
  const f = await setup();
  try {
    const { backend, context, s } = f;
    const original = backend.createdEvents;
    const operationFile = path.join(s.context.sourceRoot, 'linked-operation.json');
    fs.writeFileSync(operationFile, JSON.stringify({ schema: 'aitm.issue-body-operation/v1', kind: 'replace-exact',
      expectedVersion: backend.observation.body.version, expected: '- **Source-plan**: docs/plan-a.md', replacement: '- **Source-plan**: docs/plan-b.md' }));
    let pushes = 0;
    const result = await runIssueBodyVerb({ cfg: { repo: context.repository }, projectDir: s.context.sourceRoot,
      statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
      rest: [String(context.issue), '--operation-file', operationFile] }, { revisionBackend: backend,
      writeDeps: { fetchBody: async () => backend.observation.body.bytes, pushBody: async (_repo, _issue, body) => {
        pushes++;
        const next = backend.observation; next.body = { bytes: body, version: parseBodyVersion(body) };
        const governed = validateGovernedLinkedPlan({ body, projectDir: s.context.sourceRoot });
        const resolved = resolveStoryIntentSource({ body, projectDir: s.context.sourceRoot, governedPlan: governed });
        assert.ok(governed.ok && resolved.ok);
        const bindings = planSourceBindings(resolved, governed);
        next.protectedSourceBindings = [...next.protectedSourceBindings.filter(b => !bindings.some(x => x.identity === b.identity)), ...bindings];
        backend.replaceAuthority(next); backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
      } } });
    assert.equal(result.status, 'ok'); assert.equal(pushes, 1);
    const current = await observeRevision({ context, deps: backend });
    assert.equal(current.status, 'applied'); assert.equal(current.nativeHistoryApproved, false);
    assert.deepEqual(backend.createdEvents, original);
    assert.equal(await readCurrentMemoryPlanApproval({ backend, context }), null);
    const journal = backend.snapshot.nativeSourceRecords[0];
    assert.equal(journal.sourceReads.before.path, 'docs/plan-a.md');
    assert.equal(journal.sourceReads.after.path, 'docs/plan-b.md');
    assert.deepEqual(journal.contract.definitions.map(d => d.identity), journal.currentContract.definitions.map(d => d.identity));
    assert.equal(journal.contract.revisionId, journal.currentContract.revisionId);
    assert.notEqual(journal.contract.semanticContractDigest, journal.currentContract.semanticContractDigest);
    fs.unlinkSync(path.join(s.context.sourceRoot, 'docs', 'plan-a.md'));
    const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal(await readCurrentMemoryPlanApproval({ backend: restored, context }), null);
    const approved = await runPlanApprove({ issueNumber: context.issue, cfg: { repo: context.repository },
      projectDir: s.context.sourceRoot, deps: { revisionBackend: restored, env: { TT_FULL_AUTO: '1' } } });
    assert.equal(approved.status, 'approved');
    const restarted = createRevisionMemory(JSON.parse(JSON.stringify(restored.snapshot)));
    assert.ok(await readCurrentMemoryPlanApproval({ backend: restarted, context }));
    assert.deepEqual(restarted.snapshot.nativeSourceRecords[0], journal, 'original source record remains byte-exact');
    assert.deepEqual(restarted.createdEvents, original);
  } finally { f.s.dispose(); }
});

for (const drift of ['file', 'selector']) {
  test(`current linked-plan ${drift} drift invalidates actual native approval`, async () => {
    const f = await setup({ tasks: drift === 'selector' });
    try {
      assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
      if (drift === 'file') fs.writeFileSync(path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'), plan.replace('consumers receive complete releases', 'operators avoid incomplete release artifacts'));
      else {
        const next = f.backend.observation;
        const beforePolicy = validateGovernedLinkedPlan({ body: next.body.bytes, projectDir: f.s.context.sourceRoot });
        const beforeSource = resolveStoryIntentSource({ body: next.body.bytes, projectDir: f.s.context.sourceRoot, governedPlan: beforePolicy });
        next.body.bytes = next.body.bytes.replace('- **Source-plan**: docs/plan-a.md', '- **Source-plan**: docs/plan-a.md\n- **Source-plan-section**: ### Task 1: Publish');
        const afterPolicy = validateGovernedLinkedPlan({ body: next.body.bytes, projectDir: f.s.context.sourceRoot });
        const afterSource = resolveStoryIntentSource({ body: next.body.bytes, projectDir: f.s.context.sourceRoot, governedPlan: afterPolicy });
        assert.ok(afterSource.ok); assert.equal(afterSource.source, 'linked-plan-task');
        assert.notDeepEqual(planSourceBindings(beforeSource, beforePolicy), planSourceBindings(afterSource, afterPolicy), 'equal prose in a different native selected source remains a different binding');
        f.backend.replaceAuthority(next);
      }
      assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
      assert.notEqual((await observeRevision({ context: f.context, deps: f.backend })).status, 'applied');
    } finally { f.s.dispose(); }
  });
}

test('linked semantic binding cannot be minted from copied policy or caller-selected source location', async () => {
  const f = await setup();
  try {
    const body = f.backend.observation.body.bytes;
    const policy = validateGovernedLinkedPlan({ body, projectDir: f.s.context.sourceRoot });
    const actual = resolveStoryIntentSource({ body, projectDir: f.s.context.sourceRoot, governedPlan: policy });
    assert.throws(() => planSourceBindings(actual, structuredClone(policy)), /native-read/);
    assert.throws(() => planSourceBindings({ ...actual, location: { ...actual.location, line: 99 } }, policy), /native-resolution/);
  } finally { f.s.dispose(); }
});

test('actual native linked-plan approval publishes admission from its full independently collected protected sources', async () => {
  const f = await setup();
  try {
    const state = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(state.status, 'applied');
    const approval = await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context });
    assert.ok(approval);
    const runtime = memoryRuntime();
    Object.assign(runtime.identity, { repository: f.context.repository, ...state.observation.writerDomain });
    runtime.ports.fs.mkdirSync(state.observation.writerDomain.commonDirectory, { recursive: true });
    const context = { ...f.context, issues: [f.context.issue] };
    context.domain = registerRevisionDomain({ repository: context.repository,
      commonDir: state.observation.writerDomain.commonDirectory, host: state.observation.writerDomain.hostId,
      quiescenceConfirmed: true }, runtime.ports);
    const before = f.backend.snapshot;
    const entry = await refreshAdmission({ context, observe: () => ({ observation: state.observation, authority: {
      complete: state.status === 'applied', pending: state.chain.status === 'pending', chain: 'verified',
      head: state.chain.head, baselineAllowed: false, contractDigest: state.effectiveProposal.after.semanticContractDigest,
      planApproval: approval.payload,
    } }) }, runtime.ports);
    assert.equal(entry.state, 'allow', 'native Plan approval and actual full source observation must agree without deleting Scope or copying payload into source collection');
    assert.deepEqual(f.backend.snapshot, before);
  } finally { f.s.dispose(); }
});

test('actual native hooks deny code edit and commit after an in-place linked-plan document correction', async () => {
  const f = await setup({ nativeDomain: true });
  try {
    const { context, backend, s, ports } = f;
    const state = await observeRevision({ context, deps: backend });
    const approval = await readCurrentMemoryPlanApproval({ backend, context });
    assert.ok(approval); assert.equal(state.status, 'applied');
    const entry = await refreshAdmission({ context: { ...context, domain: f.nativeDomain, issues: [context.issue] }, observe: () => ({ observation: state.observation, authority: {
      complete: true, pending: false, chain: 'verified', head: state.chain.head, baselineAllowed: false,
      contractDigest: state.effectiveProposal.after.semanticContractDigest, planApproval: approval.payload,
    } }) }, ports);
    assert.equal(entry.state, 'allow', 'prerequisite genuine native approval admission, never a synthesized allow file');
    fs.writeFileSync(configPath(s.context.sourceRoot), JSON.stringify({ repo: context.repository }));
    fs.mkdirSync(path.join(s.context.sourceRoot, 'src'));
    fs.writeFileSync(path.join(s.context.sourceRoot, 'src', 'app.mjs'), 'export const value = 1;');
    execFileSync('git', ['add', 'src/app.mjs'], { cwd: s.context.sourceRoot, env: s.env });
    const script = fileURLToPath(new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url));
    const hook = payload => {
      const result = spawnSync(process.execPath, [script], { cwd: s.context.sourceRoot, env: { ...process.env, ...s.env }, encoding: 'utf8',
        input: JSON.stringify({ session_id: currentSessionId(), cwd: s.context.sourceRoot, ...payload }) });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim() ? JSON.parse(result.stdout) : { decision: 'allow' };
    };
    const edit = { tool_name: 'Edit', tool_input: { file_path: path.join(s.context.sourceRoot, 'src', 'app.mjs') } };
    const commit = { tool_name: 'Bash', tool_input: { command: 'git commit -m "[#124] fixture"' } };
    assert.equal(hook(edit).decision, 'allow'); assert.equal(hook(commit).decision, 'allow');
    const planPath = path.join(s.context.sourceRoot, 'docs', 'plan-a.md');
    // External file drift exercises read-side freshness separately from governed pre-edit quarantine.
    fs.writeFileSync(planPath, plan.replace('consumers receive complete releases', 'operators avoid incomplete release artifacts'));
    assert.deepEqual([hook(edit).decision, hook(commit).decision], ['block', 'block']);
  } finally { f.s.dispose(); }
});

test('genuine original native Plan history reconstructs after the linked file changes without restoring current approval', async () => {
  const f = await setup();
  try {
    const original = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(original.status, 'applied');
    const journal = structuredClone(f.backend.snapshot.nativePlanRecords[0]);
    assert.deepEqual(reconstructNativePlanRecord({ journal, expected: journal.before,
      currentContract: original.effectiveProposal.after, chain: original.chain, backend: f.backend }), journal.after);
    const compatibleOld = structuredClone(journal); delete compatibleOld.sourceRead;
    assert.deepEqual(reconstructNativePlanRecord({ journal: compatibleOld, expected: journal.before,
      currentContract: original.effectiveProposal.after, chain: original.chain, backend: f.backend }), journal.after);
    fs.writeFileSync(path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'), plan.replace('consumers receive complete releases', 'operators avoid incomplete release artifacts'));
    assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
    assert.deepEqual(reconstructNativePlanRecord({ journal, expected: journal.before,
      currentContract: original.effectiveProposal.after, chain: original.chain, backend: f.backend }), journal.after,
      'original native execution history remains reconstructable from genuinely retained original source evidence');
    assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
    assert.deepEqual(f.backend.snapshot.nativePlanRecords[0], journal);
    const restored = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
    assert.deepEqual(reconstructNativePlanRecord({ journal: restored.snapshot.nativePlanRecords[0], expected: journal.before,
      currentContract: original.effectiveProposal.after, chain: original.chain, backend: restored }), journal.after);
    assert.equal(await readCurrentMemoryPlanApproval({ backend: restored, context: f.context }), null);
    const oldJournal = structuredClone(journal); delete oldJournal.sourceRead;
    assert.throws(() => reconstructNativePlanRecord({ journal: oldJournal, expected: journal.before,
      currentContract: original.effectiveProposal.after, chain: original.chain, backend: restored }), /plan-approval-binding/,
      'old linked records without actual capture remain current-file dependent; no backfill');
  } finally { f.s.dispose(); }
});

for (const drift of ['content', 'content-and-hash', 'hash', 'reference', 'root', 'body', 'payload', 'extra-field', 'order']) {
  test(`retained native linked-source history refuses ${drift} corruption`, async () => {
    const f = await setup();
    try {
      const original = await observeRevision({ context: f.context, deps: f.backend });
      const snapshot = JSON.parse(JSON.stringify(f.backend.snapshot));
      const journal = snapshot.nativePlanRecords[0];
      assert.equal(journal.sourceRead.schema, 'aitm.native-plan-source-read/v1');
      assert.equal(journal.sourceRead.text, plan);
      if (drift === 'content' || drift === 'content-and-hash') journal.sourceRead.text += '\nchanged historical file\n';
      if (drift === 'content-and-hash') journal.sourceRead.contentSha256 = hashBytes(journal.sourceRead.text).slice(7);
      if (drift === 'hash') journal.sourceRead.contentSha256 = '0'.repeat(64);
      if (drift === 'reference') journal.sourceRead.path = 'docs/plan-b.md';
      if (drift === 'root') journal.sourceRead.projectDir = path.join(f.s.context.sourceRoot, 'foreign');
      if (drift === 'body') journal.sourceRead.bodyHash = hashBytes('foreign');
      if (drift === 'payload') journal.record.payload.sourceBindings[1].hash = hashBytes('foreign');
      if (drift === 'extra-field') journal.sourceRead.ready = true;
      if (drift === 'order') snapshot.nativeOrder[0].predecessor = hashBytes('foreign');
      let refused = false;
      try {
        const restored = createRevisionMemory(snapshot);
        const current = await observeRevision({ context: f.context, deps: restored });
        refused = current.status !== 'applied';
      } catch { refused = true; }
      assert.equal(refused, true);
      if (drift !== 'order') assert.throws(() => reconstructNativePlanRecord({ journal,
        expected: original.effectiveProposal.authority.kind === 'legacy-body' ? f.backend.snapshot.nativePlanRecords[0].before : journal.before,
        currentContract: original.effectiveProposal.after, chain: original.chain, backend: f.backend }));
      assert.deepEqual(f.backend.snapshot.nativePlanRecords[0].sourceRead.text, plan);
    } finally { f.s.dispose(); }
  });
}

async function publishNativeAdmission(f, baseline = false) {
  const state = await observeRevision({ context: f.context, deps: f.backend });
  const approval = await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context });
  const observation = baseline ? f.initialObservation : state.observation;
  const bound = { ...f.context, domain: f.nativeDomain, issues: [f.context.issue] };
  const observe = () => ({ observation, authority: {
      complete: true, pending: false, chain: baseline ? 'empty' : 'verified', head: baseline ? null : state.chain.head,
      baselineAllowed: baseline, contractDigest: baseline ? hashBytes('verified baseline fixture') : state.effectiveProposal.after.semanticContractDigest,
      planApproval: baseline ? null : approval.payload,
    } });
  if (baseline) await withRevisionInterlock(bound, capability => observeAdmission({ capability, context: bound, observe }, f.ports), f.ports);
  const entry = await refreshAdmission({ context: bound, observe }, f.ports);
  assert.equal(entry.state, 'allow'); assert.equal(entry.schema, 'aitm.revision-admission/v2');
  assert.ok(entry.localPlan); assert.equal(readAdmission(f.context, f.ports).state, 'allow');
  return path.join(domainStorage(f.nativeDomain), 'admission', `${f.context.issue}.json`);
}

for (const drift of ['missing', 'corrupt', 'symlink', 'escaping-symlink', 'escaping-directory', 'escaping-reference', 'selector', 'malformed-entry', 'null', 'v1', 'foreign-root']) {
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
        const target = drift === 'symlink' ? path.join(f.s.context.sourceRoot, 'docs', 'original.md') : path.join(f.s.root, 'foreign-plan.md');
        fs.renameSync(planPath, target); fs.symlinkSync(target, planPath);
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
      if (drift === 'selector') entry.localPlan.body = entry.localPlan.body.replace('- **Source-plan**: docs/plan-a.md', '- **Source-plan**: docs/plan-a.md\n- **Source-plan-section**: ### Task 1: Publish');
      if (drift === 'malformed-entry') entry.localPlan.reader = 'caller';
      if (drift === 'null') entry.localPlan = null;
      if (drift === 'v1') { entry.schema = 'aitm.revision-admission/v1'; delete entry.localPlan; }
      if (drift === 'foreign-root') {
        const foreign = path.join(f.s.root, 'foreign'); fs.mkdirSync(foreign);
        execFileSync('git', ['init', '-q', foreign], { env: f.s.env });
        execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/criteria.git'], { cwd: foreign, env: f.s.env });
        ports = { ...ports, worktree: foreign };
      }
      fs.writeFileSync(entryPath, JSON.stringify(entry));
      assert.equal(readAdmission(f.context, ports).state, 'deny');
    } finally { f.s.dispose(); }
  });
}

test('baseline linked native source capture also rejects a stripped null projection', async () => {
  const f = await setup({ nativeDomain: true });
  try {
    const entryPath = await publishNativeAdmission(f, true);
    const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
    assert.equal(entry.revision, 0); assert.equal(entry.planApproval, null);
    entry.localPlan = null; fs.writeFileSync(entryPath, JSON.stringify(entry));
    assert.equal(readAdmission(f.context, f.ports).state, 'deny');
  } finally { f.s.dispose(); }
});

test('same-domain linked worktree admission checks the invoking checkout actual plan bytes', async () => {
  const f = await setup({ nativeDomain: true });
  try {
    await publishNativeAdmission(f);
    execFileSync('git', ['add', 'docs/plan-a.md'], { cwd: f.s.context.sourceRoot, env: f.s.env });
    execFileSync('git', ['commit', '-qm', 'Synthetic linked plan'], { cwd: f.s.context.sourceRoot, env: f.s.env });
    const second = path.join(f.s.root, 'second');
    execFileSync('git', ['worktree', 'add', '--detach', second], { cwd: f.s.context.sourceRoot, env: f.s.env, stdio: 'pipe' });
    const ports = { ...f.ports, worktree: second };
    assert.equal(readAdmission(f.context, ports).state, 'allow');
    fs.writeFileSync(path.join(second, 'docs', 'plan-a.md'), plan.replace('registry checks can fail', 'a different checkout has drifted'));
    assert.equal(readAdmission(f.context, ports).state, 'deny');
    assert.equal(readAdmission(f.context, f.ports).state, 'allow', 'per-call freshness alone does not claim shared pre-source-effect deny');
  } finally { f.s.dispose(); }
});

for (const hookName of ['activity-guard', 'source-edit-gate']) {
  test(`actual ${hookName} quarantines default linked editor and publishes shared deny before effects`, async () => {
    const f = await setup({ nativeDomain: true });
    try {
      await publishNativeAdmission(f);
      execFileSync('git', ['add', 'docs/plan-a.md'], { cwd: f.s.context.sourceRoot, env: f.s.env });
      execFileSync('git', ['commit', '-qm', 'Synthetic source mutation baseline'], { cwd: f.s.context.sourceRoot, env: f.s.env });
      const second = path.join(f.s.root, 'second');
      execFileSync('git', ['worktree', 'add', '-b', 'fixture-second', second], { cwd: f.s.context.sourceRoot, env: f.s.env, stdio: 'pipe' });
      fs.mkdirSync(path.join(second, '.ai-task-manager'), { recursive: true });
      for (const root of [f.s.context.sourceRoot, second]) fs.writeFileSync(configPath(root), JSON.stringify({ repo: f.context.repository }));
      setActiveTask(currentSessionId(), { issue: `#${f.context.issue}`, entryStartTs: new Date().toISOString(),
        worktreePath: second, worktreeBranch: 'fixture-second', kanbanState: 'develop' }, second);
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      const script = fileURLToPath(new URL(`../../../../task-tracker/${hookName}.mjs`, import.meta.url));
      const output = spawnSync(process.execPath, [script], { cwd: f.s.context.sourceRoot, env: { ...process.env, ...f.s.env },
        input: JSON.stringify({ session_id: currentSessionId(), cwd: f.s.context.sourceRoot, tool_name: 'Edit',
          tool_input: { file_path: planPath, old_string: 'registry checks can fail', new_string: 'source correction needs fresh approval' } }), encoding: 'utf8' });
      assert.equal(output.status, 0, output.stderr);
      assert.equal(output.stdout.trim() ? JSON.parse(output.stdout).decision : 'allow', 'block', 'default hook has no trusted native source collector');
      assert.match(JSON.parse(output.stdout).reason, /revision-authority-unavailable/);
      assert.equal(fs.readFileSync(planPath, 'utf8'), plan, 'pre-tool hook runs before any actual file effect');
      assert.deepEqual([readAdmission(f.context, f.ports).state,
        readAdmission(f.context, { ...f.ports, worktree: second }).state], ['deny', 'deny'],
        'both same-domain checkouts are denied before the default source editor is refused');
    } finally { f.s.dispose(); }
  });
}

test('baseline linked publication refuses incomplete native source collection', async () => {
  const f = await setup({ nativeDomain: true });
  try {
    await publishNativeAdmission(f, true);
    const observation = structuredClone(f.initialObservation);
    observation.protectedSourceBindings = observation.protectedSourceBindings.filter(binding => binding.identity === 'scope');
    const entry = await refreshAdmission({ context: { ...f.context, domain: f.nativeDomain, issues: [f.context.issue] },
      observe: () => ({ observation, authority: { complete: true, pending: false, chain: 'empty', head: null,
        baselineAllowed: true, contractDigest: hashBytes('verified baseline fixture'), planApproval: null } }) }, f.ports);
    assert.equal(entry.state, 'deny');
    assert.equal(readAdmission(f.context, f.ports).state, 'deny');
  } finally { f.s.dispose(); }
});

for (const hookName of ['activity-guard', 'source-edit-gate']) {
  for (const scenario of ['shared-issues', 'mixed-targets', 'unknown-entry', 'corrupt-entry', 'escaping-target', 'malformed-targets', 'unrelated', 'disabled']) {
    test(`default ${hookName} source quarantine handles ${scenario} without editor effects`, async () => {
      const f = await setup({ nativeDomain: scenario !== 'disabled' });
      try {
        let entryPath;
        if (scenario !== 'disabled') entryPath = await publishNativeAdmission(f);
        fs.writeFileSync(configPath(f.s.context.sourceRoot), JSON.stringify({ repo: f.context.repository }));
        if (scenario === 'shared-issues') {
          const observation = structuredClone(f.initialObservation); observation.issue = 125;
          const entry = await refreshAdmission({ context: { ...f.context, issue: 125, issues: [125], domain: f.nativeDomain },
            observe: () => ({ observation, authority: { complete: true, pending: false, chain: 'empty', head: null,
              baselineAllowed: true, contractDigest: hashBytes('second verified baseline fixture'), planApproval: null } }) }, f.ports);
          assert.equal(entry.state, 'allow');
        }
        if (scenario === 'unknown-entry') fs.writeFileSync(path.join(path.dirname(entryPath), 'unknown.tmp'), 'incomplete');
        if (scenario === 'corrupt-entry') fs.writeFileSync(entryPath, '{corrupt');
        const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
        const script = fileURLToPath(new URL(`../../../../task-tracker/${hookName}.mjs`, import.meta.url));
        let payload = { tool_name: 'Edit', tool_input: { file_path: scenario === 'unrelated'
          ? path.join(f.s.context.sourceRoot, 'docs', 'unrelated.md') : planPath,
          old_string: 'registry checks can fail', new_string: 'fresh source correction' } };
        if (scenario === 'mixed-targets') {
          fs.mkdirSync(path.join(f.s.context.sourceRoot, 'src'));
          fs.writeFileSync(path.join(f.s.context.sourceRoot, 'src', 'app.mjs'), 'export const value = 1;\n');
          payload = { tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n*** Update File: docs/plan-a.md\n@@\n-old\n+new\n*** Update File: src/app.mjs\n@@\n-old\n+new\n*** End Patch' } };
        }
        if (scenario === 'escaping-target') payload.tool_input.file_path = path.join(f.s.root, 'foreign.md');
        if (scenario === 'malformed-targets') payload = { tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n' } };
        const output = spawnSync(process.execPath, [script], { cwd: f.s.context.sourceRoot, env: { ...process.env, ...f.s.env },
          input: JSON.stringify({ session_id: currentSessionId(), cwd: f.s.context.sourceRoot, ...payload }), encoding: 'utf8' });
        assert.equal(output.status, 0, output.stderr);
        const decision = output.stdout.trim() ? JSON.parse(output.stdout).decision : 'allow';
        assert.equal(decision, ['unrelated', 'disabled'].includes(scenario) ? 'allow' : 'block', output.stdout);
        assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
        if (scenario === 'shared-issues' || scenario === 'mixed-targets') {
          assert.equal(readAdmission(f.context, f.ports).state, 'deny');
          assert.ok(readAdmission(f.context, f.ports).localPlan, 'deny retains validated known source association');
        }
        if (scenario === 'shared-issues') assert.equal(readAdmission({ ...f.context, issue: 125 }, f.ports).state, 'deny');
        if (scenario === 'unrelated') assert.equal(readAdmission(f.context, f.ports).state, 'allow');
      } finally { f.s.dispose(); }
    });
  }
}

for (const toolName of ['Edit', 'Write']) {
  test(`recognized-memory actual source hook seals ${toolName} intent and pending denial before linked file effect`, async () => {
    const f = await setup();
    try {
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      const after = plan.replace('registry checks can fail', 'source corrections require fresh source approval');
      const tool_input = toolName === 'Edit'
        ? { file_path: planPath, old_string: 'registry checks can fail', new_string: 'source corrections require fresh source approval' }
        : { file_path: planPath, content: after };
      const before = f.backend.snapshot, events = f.backend.createdEvents;
      const result = await runSourceEditHook({ session_id: currentSessionId(), cwd: f.s.context.sourceRoot,
        tool_name: toolName, tool_input }, { cfg: { repo: f.context.repository }, revisionBackend: f.backend });
      assert.equal(result.decision, 'allow', JSON.stringify(result));
      assert.equal(fs.readFileSync(planPath, 'utf8'), plan, 'the native pre-tool adapter must seal before the editor runs');
      assert.equal(f.backend.snapshot.nativeSourceRecords?.length, 1, 'actual hook must persist its private checks-backed fixed source intent');
      const journal = f.backend.snapshot.nativeSourceRecords[0];
      assert.equal(journal.operation.schema, 'aitm.native-linked-plan-edit/v1');
      assert.equal(journal.operation.beforeContentSha256, hashBytes(plan).slice(7));
      assert.equal(journal.operation.afterContentSha256, hashBytes(after).slice(7));
      assert.equal(f.backend.admission.state, 'deny');
      assert.equal(f.backend.admission.pendingSource.journalId, journal.id);
      assert.deepEqual(f.backend.createdEvents, events);
      assert.deepEqual(f.backend.observation, before.observation, 'no body/proof/source projection effect precedes editor execution');
    } finally { f.s.dispose(); }
  });
}

async function assertNativePending(f) {
  const { verbAcStamp } = await import('../../../../task-tracker/verbs/ac-stamp.mjs');
  const { verbDodStamp } = await import('../../../../task-tracker/verbs/dod-stamp.mjs');
  const { parseEvidenceAcs } = await import('../../../../task-tracker/lib/ac-evidence.mjs');
  const { moveState } = await import('../../../../task-tracker/lib/move-state/move-state-core.mjs');
  const body = f.backend.observation.body.bytes;
  let effects = 0;
  const pexec = async () => { effects++; throw new Error('pending native transport ran'); };
  const ctx = { cfg: { repo: f.context.repository }, projectDir: f.s.context.sourceRoot,
    statePath: path.join(f.s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'), pexec,
    deps: { revisionBackend: f.backend, getLiveState: async () => { effects++; return 'develop'; } } };
  for (const [adapter, rest] of [[verbAcStamp, [parseEvidenceAcs(body)[0].label]], [verbDodStamp, ['lint']]]) {
    await assert.rejects(adapter({ ...ctx, rest }), error => error.code === 'revision-pending');
  }
  await assert.rejects(moveState({ issueArg: String(f.context.issue), stateArg: 'test', cfg: ctx.cfg,
    projectDir: f.s.context.sourceRoot, revisionBackend: f.backend,
    _runGuardExecution: async () => { effects++; return { exit: 4 }; },
    _probeCompletion: async () => { effects++; return {}; } }), error => error.code === 'revision-pending');
  const operationFile = path.join(f.s.context.sourceRoot, 'pending-scope-operation.json');
  fs.writeFileSync(operationFile, JSON.stringify({ schema: 'aitm.issue-body-operation/v1', kind: 'replace-exact',
    expectedVersion: f.backend.observation.body.version, expected: 'Synthetic scope', replacement: 'Other scope' }));
  await assert.rejects(runIssueBodyVerb({ ...ctx, rest: [String(f.context.issue), '--operation-file', operationFile] },
    { revisionBackend: f.backend, writeDeps: { fetchBody: async () => { effects++; return body; }, pushBody: async () => { effects++; } } }),
    error => error.code === 'revision-pending');
  assert.equal(effects, 0, 'pending source denies actual proof/source/stage adapters before callbacks');
}

for (const toolName of ['Edit', 'Write']) {
  test(`native linked ${toolName} resumes exact source prefix after restart and only fresh Plan restores admission`, async () => {
    const f = await setup();
    try {
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      const afterText = plan.replace('registry checks can fail', 'source corrections require fresh source approval');
      const input = toolName === 'Edit' ? { file_path: planPath, old_string: 'registry checks can fail',
        new_string: 'source corrections require fresh source approval' } : { file_path: planPath, content: afterText };
      const payload = { session_id: currentSessionId(), cwd: f.s.context.sourceRoot, tool_name: toolName, tool_input: input };
      let pushes = 0;
      const invoke = () => runSourceEditHook(payload, { cfg: { repo: f.context.repository }, revisionBackend: f.backend,
        writeDeps: { fetchBody: async () => f.backend.observation.body.bytes,
          pushBody: async (_repo, _issue, body) => {
            pushes++;
            const next = f.backend.observation;
            next.body = { bytes: body, version: parseBodyVersion(body) };
            const governedPlan = validateGovernedLinkedPlan({ body, projectDir: f.s.context.sourceRoot });
            const resolved = resolveStoryIntentSource({ body, projectDir: f.s.context.sourceRoot, governedPlan });
            const bindings = planSourceBindings(resolved, governedPlan);
            next.protectedSourceBindings = [...next.protectedSourceBindings.filter(b => !bindings.some(x => x.identity === b.identity)), ...bindings];
            f.backend.replaceAuthority(next); f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(body) });
          } } });
      const originalProposal = (await observeRevision({ context: f.context, deps: f.backend })).effectiveProposal;
      const events = f.backend.createdEvents;
      assert.equal((await invoke()).decision, 'allow');
      const journal = f.backend.snapshot.nativeSourceRecords[0];
      f.backend = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
      assert.equal(f.backend.admission.state, 'deny'); assert.equal(f.backend.admission.pendingSource.journalId, journal.id);
      assert.notEqual((await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } })).status, 'approved');
      assert.equal(fs.readFileSync(planPath, 'utf8'), plan); assert.equal(pushes, 0);
      assert.equal((await invoke()).decision, 'allow', 'only the original unchanged before-file intent may retry');
      assert.equal(f.backend.snapshot.nativeSourceRecords.length, 1);
      fs.writeFileSync(planPath, afterText); // The actual sandbox editor effect, outside the hook.
      f.backend = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
      const completed = await invoke();
      assert.equal(completed.decision, 'block', 'file-after completion cannot grant another editor execution');
      assert.equal(completed.code, 'revision-approval-stale');
      assert.equal(pushes, 1, 'actual governed body adapter performs the one derived retirement projection');
      assert.deepEqual(f.backend.observation, journal.after);
      assert.equal(f.backend.admission.pendingSource.journalId, journal.id, 'source completion never clears pending');
      assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
      assert.equal((await invoke()).decision, 'block'); assert.equal(pushes, 1);
      assert.deepEqual(f.backend.createdEvents, events);
      assert.deepEqual((await observeRevision({ context: f.context, deps: f.backend })).effectiveProposal, originalProposal);
      const beforePlan = f.backend.snapshot;
      for (const [phase, step] of ['failBefore', 'failAfter'].flatMap(phase =>
        ['plan-body-write', 'native-plan-record-write', 'native-plan-record-readback', 'plan-journal-clear',
          'native-source-completion-write', 'native-source-completion-readback', 'native-source-completion-allow',
          'native-source-completion-admission-readback'].map(step => [phase, step]))) {
        f.backend = createRevisionMemory(JSON.parse(JSON.stringify(beforePlan)));
        f.backend[phase] = step;
        await assert.rejects(runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
          projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } }), /interrupted:/);
        f.backend = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
        const { refreshMemoryAdmission } = await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
        assert.equal((await refreshMemoryAdmission({ backend: f.backend, context: f.context })).state, 'deny');
        assert.equal(f.backend.admission.pendingSource.journalId, journal.id);
        const { mutateIssueBody } = await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
        let effects = 0;
        await assert.rejects(mutateIssueBody({ repo: f.context.repository, issueNumber: f.context.issue,
          deps: { revisionBackend: f.backend, fetchBody: async () => { effects++; return f.backend.observation.body.bytes; },
            pushBody: async () => { effects++; } }, mutate: body => body + '\nOrdinary note' }), /revision-pending/);
        assert.equal(effects, 0, `${phase}:${step} must deny before ordinary writer effects`);
        await assertNativePending(f);
        const retried = await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
          projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } });
        assert.ok(['approved', 'already-approved'].includes(retried.status));
        assert.equal(f.backend.admission.pendingSource, null);
        assert.equal(f.backend.admission.state, 'allow');
        assert.equal(f.backend.snapshot.nativePlanRecords.length, 2, 'Plan retry retains exactly one new completed history');
      }
      f.backend = createRevisionMemory(JSON.parse(JSON.stringify(beforePlan)));
      const approved = await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } });
      assert.equal(approved.status, 'approved');
      assert.equal(f.backend.admission.pendingSource, null);
      assert.equal(f.backend.admission.state, 'allow');
      assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    } finally { f.s.dispose(); }
  });
}

test('actual memory admission refresh uses closed native authority and never clears a pending linked edit', async () => {
  const { refreshMemoryAdmission } = await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
  assert.equal(typeof refreshMemoryAdmission, 'function', 'recognized native refresh adapter is required without caller ports or results');
  const f = await setup();
  try {
    const initial = createRevisionMemory({ observation: f.initialObservation, comments: [], hostMessages: [] });
    assert.equal((await refreshMemoryAdmission({ backend: initial, context: f.context })).state, 'allow');
    assert.equal((await refreshMemoryAdmission({ backend: f.backend, context: f.context })).state, 'allow');
    for (const extra of ['observe', 'result', 'ports', 'completion', 'approval']) {
      await assert.rejects(refreshMemoryAdmission({ backend: f.backend, context: f.context, [extra]: {} }));
    }
    await assert.rejects(refreshMemoryAdmission({ backend: f.backend, context: { ...f.context, issue: 125 } }));
    const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
    const payload = { session_id: currentSessionId(), cwd: f.s.context.sourceRoot, tool_name: 'Edit',
      tool_input: { file_path: planPath, old_string: 'registry checks can fail', new_string: 'source changes require fresh approval' } };
    assert.equal((await runSourceEditHook(payload, { cfg: { repo: f.context.repository }, revisionBackend: f.backend })).decision, 'allow');
    const pending = f.backend.admission.pendingSource;
    assert.ok(pending); assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
    assert.equal((await refreshMemoryAdmission({ backend: f.backend, context: f.context })).state, 'deny');
    assert.deepEqual(f.backend.admission.pendingSource, pending);
    f.backend = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
    assert.equal((await refreshMemoryAdmission({ backend: f.backend, context: f.context })).state, 'deny');
    assert.deepEqual(f.backend.admission.pendingSource, pending);
    assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
  } finally { f.s.dispose(); }
});

for (const scenario of ['repeatable-edit', 'injected-target']) {
  test(`recognized source editor refuses unsafe ${scenario} before intent or editor grant`, async () => {
    const f = await setup({ nativeDomain: scenario === 'registered-host' });
    try {
      const planPath = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
      const target = scenario === 'injected-target' ? path.join(f.s.context.sourceRoot, 'docs', 'other.md') : planPath;
      const payload = { session_id: currentSessionId(), cwd: f.s.context.sourceRoot, tool_name: 'Edit',
        tool_input: { file_path: target, old_string: 'registry checks can fail',
          new_string: scenario === 'repeatable-edit' ? 'registry checks can fail repeatedly' : 'source changes need fresh approval' } };
      const deps = { cfg: { repo: f.context.repository }, revisionBackend: f.backend };
      if (scenario === 'injected-target') deps.resolveMutationTarget = () => ({ lexical: planPath, physical: planPath });
      const result = await runSourceEditHook(payload, deps);
      assert.equal(result.decision, 'block', 'unsafe positive source topology must refuse before a sealed grant');
      assert.equal(f.backend.snapshot.nativeSourceRecords?.length ?? 0, 0);
      assert.equal(fs.readFileSync(planPath, 'utf8'), plan);
    } finally { f.s.dispose(); }
  });
}

for (const scenario of ['stale-file', 'malformed-chain', 'unavailable-collection', 'foreign-executor', 'extra-context']) {
  test(`closed native memory refresh ${scenario} cannot publish allow`, async () => {
    const { refreshMemoryAdmission } = await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
    const f = await setup();
    try {
      let context = f.context;
      if (scenario === 'stale-file') fs.writeFileSync(path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'), plan.replace('registry checks can fail', 'current source has changed'));
      if (scenario === 'malformed-chain') f.backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
      if (scenario === 'unavailable-collection') f.backend.pageFault = { nextPage: 2 };
      if (scenario === 'foreign-executor') context = { ...context, executor: { ...context.executor, sessionId: 'foreign-session' } };
      if (scenario === 'extra-context') context = { ...context, approved: true };
      if (scenario === 'foreign-executor' || scenario === 'extra-context')
        await assert.rejects(refreshMemoryAdmission({ backend: f.backend, context }));
      else assert.equal((await refreshMemoryAdmission({ backend: f.backend, context })).state, 'deny');
      assert.notEqual(f.backend.admission.state, 'allow');
    } finally { f.s.dispose(); }
  });
}

for (const hostTopology of ['registered', 'foreign', 'unknown', 'file', 'dangling', 'symlink-empty', 'empty']) {
test(`actual isolated default ${hostTopology} host bounds memory editor authority before file effects`, async () => {
  const s = createSandbox();
  try {
    fs.mkdirSync(path.join(s.context.sourceRoot, 'docs'));
    fs.writeFileSync(path.join(s.context.sourceRoot, 'docs', 'plan-a.md'), plan);
    execFileSync('git', ['remote', 'set-url', 'origin', 'https://github.com/example/criteria.git'], { cwd: s.context.sourceRoot, env: s.env });
    const moduleUrl = relative => new URL(relative, import.meta.url).href;
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
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: s.context.sourceRoot, env: s.env, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.root, path.join(s.env.HOME, '.ai-task-manager', 'criteria-revision-domains'));
    assert.equal(result.decision, hostTopology === 'empty' ? 'allow' : 'block');
  } finally { s.dispose(); }
});
}

test('pending linked source snapshot cannot strip its durable admission projection', async () => {
  const f = await setup();
  try {
    const payload = { session_id: currentSessionId(), cwd: f.s.context.sourceRoot, tool_name: 'Edit',
      tool_input: { file_path: path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'),
        old_string: 'registry checks can fail', new_string: 'source changes need fresh approval' } };
    assert.equal((await runSourceEditHook(payload, { cfg: { repo: f.context.repository }, revisionBackend: f.backend })).decision, 'allow');
    const snapshot = f.backend.snapshot;
    delete snapshot.pendingSource;
    assert.throws(() => createRevisionMemory(snapshot), /native-source-pending/);
  } finally { f.s.dispose(); }
});

async function linkedExecutionFixture(tool = 'Edit') {
  const f = await setup(), file = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
  const afterText = plan.replace('registry checks can fail', 'source changes require current approval');
  const payload = { session_id: currentSessionId(), cwd: f.s.context.sourceRoot, tool_name: tool,
    tool_input: tool === 'Edit' ? { file_path: file, old_string: 'registry checks can fail', new_string: 'source changes require current approval' }
      : { file_path: file, content: afterText } };
  let pushes = 0, transportFault = null;
  f.payload = payload;
  f.writeDeps = { fetchBody: async () => f.backend.observation.body.bytes, pushBody: async (_repo, _issue, body) => {
      if (transportFault === 'before') throw new Error('uncertain linked body transport');
      pushes++;
      const next = f.backend.observation; next.body = { bytes: body, version: parseBodyVersion(body) };
      const governedPlan = validateGovernedLinkedPlan({ body, projectDir: f.s.context.sourceRoot });
      const resolved = resolveStoryIntentSource({ body, projectDir: f.s.context.sourceRoot, governedPlan });
      const bindings = planSourceBindings(resolved, governedPlan);
      next.protectedSourceBindings = [...next.protectedSourceBindings.filter(b => !bindings.some(x => x.identity === b.identity)), ...bindings];
      f.backend.replaceAuthority(next); f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(body) });
      if (transportFault === 'after') throw new Error('uncertain linked body transport');
    } };
  f.invoke = () => runSourceEditHook(payload, { cfg: { repo: f.context.repository }, revisionBackend: f.backend, writeDeps: f.writeDeps });
  f.restore = (snapshot = f.backend.snapshot) => { f.backend = createRevisionMemory(JSON.parse(JSON.stringify(snapshot))); };
  f.edit = () => fs.writeFileSync(file, afterText);
  f.transport = value => { transportFault = value; };
  f.pushes = () => pushes;
  return f;
}
for (const fault of [
  ...['failBefore', 'failAfter'].flatMap(phase => ['native-source-journal-write', 'native-source-journal-readback',
    'native-source-pending-readback'].map(step => ({ phase, step }))),
  { transport: 'before' }, { transport: 'after' },
]) {
  test(`native linked source exact ${JSON.stringify(fault)} prefix resumes without duplicate editor or body effect`, async () => {
    const f = await linkedExecutionFixture();
    try {
      const events = f.backend.createdEvents;
      if (fault.phase) {
        f.backend[fault.phase] = fault.step;
        assert.equal((await f.invoke()).decision, 'block');
        f.restore();
        if (!(fault.phase === 'failBefore' && fault.step === 'native-source-journal-write')) await assertNativePending(f);
      }
      assert.equal((await f.invoke()).decision, 'allow');
      assert.equal(f.backend.snapshot.nativeSourceRecords.length, 1);
      const pending = f.backend.admission.pendingSource;
      f.edit();
      if (fault.transport) {
        f.transport(fault.transport);
        assert.equal((await f.invoke()).decision, 'block');
        f.restore(); f.transport(null);
        await assertNativePending(f);
      }
      assert.equal((await f.invoke()).code, 'revision-approval-stale');
      assert.equal(f.pushes(), 1);
      assert.deepEqual(f.backend.admission.pendingSource, pending);
      f.restore(); assert.equal((await f.invoke()).decision, 'block'); assert.equal(f.pushes(), 1);
      assert.deepEqual(f.backend.createdEvents, events);
      assert.equal(f.backend.snapshot.nativeSourceRecords.length, 1);
      const approved = await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } });
      assert.equal(approved.status, 'approved'); assert.equal(f.backend.admission.state, 'allow');
    } finally { f.s.dispose(); }
  });
}

for (const drift of ['file', 'body', 'stage', 'source-binding', 'source-read', 'operation', 'order', 'pending-hash',
  'foreign-session', 'changed-intent', 'missing-source-record', 'missing-plan-history']) {
  test(`pending native linked source refuses ${drift} drift without a new effect`, async () => {
    const f = await linkedExecutionFixture();
    try {
      assert.equal((await f.invoke()).decision, 'allow');
      const snapshot = f.backend.snapshot;
      if (drift === 'file') fs.writeFileSync(path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'), plan.replace('registry checks can fail', 'unrecognized changed source'));
      if (drift === 'body') snapshot.observation.body.bytes += '\nUnrelated body drift';
      if (drift === 'stage') snapshot.observation.stage = 'test';
      if (drift === 'source-binding') snapshot.observation.protectedSourceBindings[0].hash = 'sha256:' + '0'.repeat(64);
      if (drift === 'source-read') snapshot.nativeSourceRecords[0].sourceRead.text += '\nInjected history';
      if (drift === 'operation') snapshot.nativeSourceRecords[0].operation.input.new_string = 'unsealed effect';
      if (drift === 'order') snapshot.nativeOrder.reverse();
      if (drift === 'pending-hash') snapshot.pendingSource.afterContentSha256 = '0'.repeat(64);
      if (drift === 'foreign-session') f.payload.session_id = 'foreign-session';
      if (drift === 'changed-intent') f.payload.tool_input.new_string = 'different source effect';
      if (drift === 'missing-source-record') delete snapshot.nativeSourceRecords;
      if (drift === 'missing-plan-history') delete snapshot.nativePlanRecords;
      let refused = false;
      try { f.restore(snapshot); refused = (await f.invoke()).decision === 'block'; }
      catch (error) { assert.match(error.message, /criteria-revision/); refused = true; }
      assert.equal(refused, true);
      assert.equal(f.pushes(), 0);
      assert.equal(f.backend.snapshot.nativeSourceRecords?.length ?? 0, 1);
    } finally { f.s.dispose(); }
  });
}

test('genuine Scope then Plan history survives a later native linked-file correction without current-read branding', async () => {
  const f = await linkedExecutionFixture();
  try {
    const operationFile = path.join(f.s.context.sourceRoot, 'scope-before-linked.json');
    fs.writeFileSync(operationFile, JSON.stringify({ schema: 'aitm.issue-body-operation/v1', kind: 'replace-exact',
      expectedVersion: f.backend.observation.body.version, expected: 'Synthetic scope', replacement: 'Corrected source scope' }));
    const result = await runIssueBodyVerb({ cfg: { repo: f.context.repository }, projectDir: f.s.context.sourceRoot,
      statePath: path.join(f.s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
      rest: [String(f.context.issue), '--operation-file', operationFile] }, { revisionBackend: f.backend,
      writeDeps: { fetchBody: async () => f.backend.observation.body.bytes, pushBody: async (_repo, _issue, body) => {
        const next = f.backend.observation; next.body = { bytes: body, version: parseBodyVersion(body) };
        const scope = body.split('## Scope\n')[1].split('\n## ')[0].trim();
        next.protectedSourceBindings = next.protectedSourceBindings.map(binding => binding.identity === 'scope' ? { ...binding, hash: hashBytes(scope) } : binding);
        f.backend.replaceAuthority(next); f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(body) });
      } } });
    assert.equal(result.status, 'ok');
    assert.equal((await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
      projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } })).status, 'approved');
    assert.equal((await f.invoke()).decision, 'allow');
    const originalSource = f.backend.snapshot.nativeSourceRecords[0];
    // Compatibility-only old-shaped fixture: preserve absent reads and update
    // its reference hash coherently; this is not authenticated historical data.
    const { canonicalRecordJson } = await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const oldShape = f.backend.snapshot, oldSource = oldShape.nativeSourceRecords[0], oldId = oldSource.id;
    delete oldSource.sourceReads;
    const { id: discardedId, ...oldRecord } = oldSource;
    oldSource.id = hashBytes(canonicalRecordJson(oldRecord));
    for (const ref of oldShape.nativeOrder) {
      if (ref.id === oldId) ref.id = oldSource.id;
      if (ref.predecessor === oldId) ref.predecessor = oldSource.id;
    }
    // The later linked journal embeds its original predecessor; use the actual
    // earlier Scope/Plan snapshot for this old-shape compatibility check.
    oldShape.nativeSourceRecords.pop(); oldShape.nativeOrder.pop(); delete oldShape.pendingSource;
    const compatible = createRevisionMemory(JSON.parse(JSON.stringify(oldShape)));
    assert.ok(await readCurrentMemoryPlanApproval({ backend: compatible, context: f.context }));
    assert.equal(Object.hasOwn(compatible.snapshot.nativeSourceRecords[0], 'sourceReads'), false);
    f.edit();
    assert.throws(() => createRevisionMemory(JSON.parse(JSON.stringify(oldShape))), /native-source-journal-coherence/);
    assert.doesNotThrow(() => f.restore(), 'genuine old source evidence must reconstruct from retained original native reads');
    assert.equal((await f.invoke()).code, 'revision-approval-stale');
    assert.deepEqual(f.backend.snapshot.nativeSourceRecords[0], originalSource);
    assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
  } finally { f.s.dispose(); }
});

for (const delta of ['duplicate', 'hidden', 'key', 'selector', 'combined', 'missing', 'escape', 'symlink']) {
  test(`native pointer adapter refuses ${delta} delta before transport or journal publication`, async () => {
    const f = await setup();
    try {
      const before = f.backend.observation, field = '- **Source-plan**: docs/plan-a.md';
      let replacement = '- **Source-plan**: docs/plan-b.md', expected = field;
      if (delta === 'duplicate') replacement += '\n- **Source-plan**: docs/plan-b.md';
      if (delta === 'hidden') replacement = '<!-- ' + replacement + ' -->';
      if (delta === 'key') replacement = '- **Implementation-plan**: docs/plan-b.md';
      if (delta === 'selector') replacement += '\n- **Source-plan-section**: ### Task 1: Publish';
      if (delta === 'combined') { expected = before.body.bytes; replacement = expected.replace(field, replacement).replace('Synthetic scope', 'Unrelated changed scope'); }
      if (delta === 'missing') replacement = '- **Source-plan**: docs/missing.md';
      if (delta === 'escape') replacement = '- **Source-plan**: ../outside.md';
      if (delta === 'symlink') {
        const outside = path.join(f.s.root, 'outside-plan.md'); fs.writeFileSync(outside, plan);
        fs.symlinkSync(outside, path.join(f.s.context.sourceRoot, 'docs', 'foreign.md'));
        replacement = '- **Source-plan**: docs/foreign.md';
      }
      const operationFile = path.join(f.s.context.sourceRoot, 'refused-pointer.json');
      fs.writeFileSync(operationFile, JSON.stringify({ schema: 'aitm.issue-body-operation/v1', kind: 'replace-exact',
        expectedVersion: before.body.version, expected, replacement }));
      let effects = 0;
      await assert.rejects(runIssueBodyVerb({ cfg: { repo: f.context.repository }, projectDir: f.s.context.sourceRoot,
        statePath: path.join(f.s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
        rest: [String(f.context.issue), '--operation-file', operationFile] }, { revisionBackend: f.backend,
        writeDeps: { fetchBody: async () => { effects++; return before.body.bytes; }, pushBody: async () => { effects++; } } }));
      assert.equal(effects, 0);
      assert.equal(f.backend.snapshot.nativeSourceRecords?.length ?? 0, 0);
      assert.deepEqual(f.backend.observation, before);
    } finally { f.s.dispose(); }
  });
}

test('actual linked UserStory history survives later file correction with independent current approval', async () => {
  const { runUserStory } = await import('../../../../task-tracker/verbs/user-story.mjs');
  const f = await linkedExecutionFixture();
  try {
    const story = { asA: 'release operator', iWant: 'stop partial publication because registry checks can fail',
      soThat: 'consumers receive complete validated releases' };
    const result = await runUserStory({ target: f.context.issue, story, cfg: { repo: f.context.repository }, projectDir: f.s.context.sourceRoot,
      deps: { revisionBackend: f.backend, writeDeps: f.writeDeps } });
    assert.equal(result.status, 'written');
    const original = f.backend.snapshot.nativeSourceRecords[0];
    assert.ok(original.sourceReads.before && original.sourceReads.after);
    assert.equal((await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
      projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } })).status, 'approved');
    assert.equal((await f.invoke()).decision, 'allow');
    f.edit(); f.restore();
    assert.equal((await f.invoke()).code, 'revision-approval-stale');
    assert.equal(f.pushes(), 2);
    assert.deepEqual(f.backend.snapshot.nativeSourceRecords[0], original);
    assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
    assert.equal((await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
      projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } })).status, 'approved');
    f.restore(); assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
  } finally { f.s.dispose(); }
});

async function pointerFixture() {
  const f = await linkedExecutionFixture();
  const operationFile = path.join(f.s.context.sourceRoot, 'pointer-operation.json');
  fs.writeFileSync(operationFile, JSON.stringify({ schema: 'aitm.issue-body-operation/v1', kind: 'replace-exact',
    expectedVersion: f.backend.observation.body.version, expected: '- **Source-plan**: docs/plan-a.md', replacement: '- **Source-plan**: docs/plan-b.md' }));
  f.correct = () => runIssueBodyVerb({ cfg: { repo: f.context.repository }, projectDir: f.s.context.sourceRoot,
    statePath: path.join(f.s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
    rest: [String(f.context.issue), '--operation-file', operationFile] }, { revisionBackend: f.backend, writeDeps: f.writeDeps });
  return f;
}
for (const fault of [
  ...['failBefore', 'failAfter'].flatMap(phase => ['native-source-journal-write', 'native-source-journal-readback'].map(step => ({ phase, step }))),
  { transport: 'before' }, { transport: 'after' },
]) {
  test(`native pointer ${JSON.stringify(fault)} resumes original source operation after restart`, async () => {
    const f = await pointerFixture();
    try {
      const events = f.backend.createdEvents;
      if (fault.phase) f.backend[fault.phase] = fault.step;
      if (fault.transport) f.transport(fault.transport);
      await assert.rejects(f.correct(), /interrupted|uncertain/);
      f.restore(); f.transport(null);
      await f.correct();
      assert.equal(f.pushes(), 1); assert.equal(f.backend.snapshot.nativeSourceRecords.length, 1);
      const journal = f.backend.snapshot.nativeSourceRecords[0];
      assert.ok(journal.sourceReads.before && journal.sourceReads.after);
      f.restore(); assert.equal((await f.correct()).status, 'no-op'); assert.equal(f.pushes(), 1);
      assert.deepEqual(f.backend.createdEvents, events);
      assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
      assert.equal((await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } })).status, 'approved');
      f.restore(); assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    } finally { f.s.dispose(); }
  });
}
for (const corruption of ['before-text', 'after-text', 'body-hash', 'root', 'reference', 'swap', 'extra', 'source-inputs']) {
  test(`native source retained reads reject ${corruption} corruption`, async () => {
    const f = await pointerFixture();
    try {
      await f.correct();
      const snapshot = f.backend.snapshot, journal = snapshot.nativeSourceRecords[0], reads = journal.sourceReads;
      if (corruption === 'before-text') reads.before.text += '\nforged historical source';
      if (corruption === 'after-text') reads.after.text += '\nforged current source';
      if (corruption === 'body-hash') reads.after.bodyHash = 'sha256:' + '0'.repeat(64);
      if (corruption === 'root') reads.before.projectDir = path.join(f.s.root, 'foreign');
      if (corruption === 'reference') reads.after.path = 'docs/plan-a.md';
      if (corruption === 'swap') [reads.before, reads.after] = [reads.after, reads.before];
      if (corruption === 'extra') reads.current = true;
      if (corruption === 'source-inputs') journal.sourceInputs.after[0].hash = 'sha256:' + '0'.repeat(64);
      assert.throws(() => f.restore(snapshot), /criteria-revision/);
      assert.equal(f.pushes(), 1);
    } finally { f.s.dispose(); }
  });
}


async function successorFixture() {
  const f = await pointerFixture();
  await f.correct();
  assert.equal((await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
    projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } })).status, 'approved');
  f.restore();
  const oldBytes = f.backend.observation.body.bytes.split('\n').find(line => line.startsWith('- [ ] Supported model hooks'));
  assert.ok(oldBytes);
  const prepared = await prepareRevision({ context: f.context, deps: f.backend, input: {
    mode: 'revision', transactionId: 'native-successor-tx', operationId: 'native-successor-operation',
    reason: 'Revise the supported hook requirement after governed source correction',
    edits: { acceptanceCriteria: [{ operation: 'replace', occurrence: 1, oldBytes, oldHash: hashBytes(oldBytes),
      replacements: [{ text: 'Next supported model hooks', declaration: { kind: 'vc-list', vcIds: ['1'] } }] }], verificationCommands: [] },
  } });
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  const messageId = 'native-successor-human-approval';
  f.backend.addHostMessage({ ...f.backend.snapshot.hostMessages[0], id: messageId,
    content: [{ type: 'input_text', text: prepared.approvalStatement }] });
  f.request = { schema: 'aitm.criteria-revision/v1', action: 'apply', proposal: prepared.proposal,
    authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: f.context.executor.adapter,
      sessionId: f.context.executor.sessionId, messageId, statementHash: hashBytes(prepared.approvalStatement) } };
  return f;
}

test('successor criteria PREPARED retains readable native source history and exact pending prefix', async () => {
  const f = await successorFixture();
  try {
    const original = f.backend.snapshot;
    f.backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context: f.context, request: f.request, deps: f.backend }), /interrupted/);
    f.restore();
    const pending = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(pending.status, 'pending-before', JSON.stringify(pending));
    assert.deepEqual(f.backend.snapshot.nativeOrder, original.nativeOrder);
    assert.deepEqual(f.backend.snapshot.nativePlanRecords, original.nativePlanRecords);
    assert.deepEqual(f.backend.snapshot.nativeSourceRecords, original.nativeSourceRecords);
    assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
    const result = await applyRevision({ context: f.context, request: f.request, deps: f.backend });
    assert.equal(result.status, 'applied', JSON.stringify(result));
  } finally { f.s.dispose(); }
});

test('successor criteria apply and fresh Plan retain earlier native source history after restart', async () => {
  const f = await successorFixture();
  try {
    const original = f.backend.snapshot, events = f.backend.createdEvents;
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
    assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
    f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(f.backend.observation.body.bytes) });
    assert.equal((await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
      projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } })).status, 'approved');
    f.restore();
    const restarted = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(restarted.status, 'applied', JSON.stringify(restarted));
    assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    assert.equal(restarted.observation.revision, 2);
  } finally { f.s.dispose(); }
});


test('aborted successor cannot lift the stale approval fence on an earlier applied revision', async () => {
  const sandbox = createSandbox();
  try {
    const { backend, context } = await revisionFixture('stale', { worktree: sandbox.context.sourceRoot });
    const oldBytes = backend.observation.body.bytes.split('\n').find(line => line.startsWith('- [ ] Supported model hooks'));
    const prepare = (mode, edits, operationId) => prepareRevision({ context, deps: backend, input: {
      mode, transactionId: 'aborted-successor', operationId, reason: 'Keep previous requirement after explicit abort', edits } });
    const authorize = result => {
      assert.equal(result.status, 'prepared', JSON.stringify(result));
      const messageId = result.proposal.operationId + '-human';
      backend.addHostMessage({ ...backend.snapshot.hostMessages[0], id: messageId,
        content: [{ type: 'input_text', text: result.approvalStatement }] });
      return { schema: 'aitm.criteria-revision/v1', action: result.proposal.mode === 'revision' ? 'apply' : 'recover',
        proposal: result.proposal, authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: context.executor.adapter,
          sessionId: context.executor.sessionId, messageId, statementHash: hashBytes(result.approvalStatement) } };
    };
    const request = authorize(await prepare('revision', { acceptanceCriteria: [{ operation: 'replace', occurrence: 1,
      oldBytes, oldHash: hashBytes(oldBytes), replacements: [{ text: 'Next supported model hooks', declaration: { kind: 'vc-list', vcIds: ['1'] } }] }],
      verificationCommands: [] }, 'abortable-successor'));
    backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
    backend.failAfter = null;
    const aborted = await recoverRevision({ context, deps: backend,
      request: authorize(await prepare('abort', { acceptanceCriteria: [], verificationCommands: [] }, 'abort-successor')) });
    assert.equal(aborted.status, 'aborted', JSON.stringify(aborted));
    const { mutateIssueBody } = await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
    let callbacks = 0, pushes = 0;
    await assert.rejects(mutateIssueBody({ repo: context.repository, issueNumber: context.issue,
      expectedVersion: backend.observation.body.version,
      mutate: body => { callbacks++; return body + '\nOrdinary metadata'; },
      deps: { revisionBackend: backend, fetchBody: async () => backend.observation.body.bytes,
        pushBody: async () => { pushes++; } } }), /revision-approval-stale/);
    assert.equal(callbacks, 0); assert.equal(pushes, 0);
  } finally { sandbox.dispose(); }
});


test('three criteria epochs retain globally ordered native source and Plan history without rewriting earlier records', async () => {
  const f = await successorFixture();
  try {
    const original = f.backend.snapshot;
    assert.equal((await applyRevision({ context: f.context, request: f.request, deps: f.backend })).status, 'applied');
    const approve = async () => {
      f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(f.backend.observation.body.bytes) });
      const result = await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } });
      assert.equal(result.status, 'approved', JSON.stringify(result));
    };
    await approve(); f.restore();
    fs.writeFileSync(path.join(f.s.context.sourceRoot, 'pointer-operation.json'), JSON.stringify({
      schema: 'aitm.issue-body-operation/v1', kind: 'replace-exact', expectedVersion: f.backend.observation.body.version,
      expected: '- **Source-plan**: docs/plan-b.md', replacement: '- **Source-plan**: docs/plan-a.md' }));
    await f.correct(); f.restore();
    assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
    await approve(); f.restore();
    const oldBytes = f.backend.observation.body.bytes.split('\n').find(line => line.startsWith('- [ ] Next supported model hooks'));
    const prepared = await prepareRevision({ context: f.context, deps: f.backend, input: {
      mode: 'revision', transactionId: 'third-criteria-tx', operationId: 'third-criteria-operation', reason: 'Third reviewed requirement',
      edits: { acceptanceCriteria: [{ operation: 'replace', occurrence: 1, oldBytes, oldHash: hashBytes(oldBytes),
        replacements: [{ text: 'Third supported model hooks', declaration: { kind: 'vc-list', vcIds: ['1'] } }] }], verificationCommands: [] },
    } });
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    const messageId = 'third-criteria-human';
    f.backend.addHostMessage({ ...f.backend.snapshot.hostMessages[0], id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }] });
    const request = { schema: 'aitm.criteria-revision/v1', action: 'apply', proposal: prepared.proposal,
      authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: f.context.executor.adapter,
        sessionId: f.context.executor.sessionId, messageId, statementHash: hashBytes(prepared.approvalStatement) } };
    const result = await applyRevision({ context: f.context, request, deps: f.backend });
    assert.equal(result.status, 'applied', JSON.stringify(result));
    await approve(); f.restore();
    const current = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(current.status, 'applied', JSON.stringify(current)); assert.equal(current.observation.revision, 3);
    assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    assert.deepEqual(f.backend.snapshot.nativeOrder.slice(0, original.nativeOrder.length), original.nativeOrder);
    assert.deepEqual(f.backend.snapshot.nativePlanRecords.slice(0, original.nativePlanRecords.length), original.nativePlanRecords);
    assert.deepEqual(f.backend.snapshot.nativeSourceRecords.slice(0, original.nativeSourceRecords.length), original.nativeSourceRecords);
    assert.equal(new Set(f.backend.snapshot.nativeOrder.map(ref => ref.revisionEventHead)).size, 3);
  } finally { f.s.dispose(); }
});


test('untouched successor abort preserves genuine current Plan authority and ordinary native body continuation after restart', async () => {
  const f = await successorFixture();
  try {
    assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    const original = f.backend.snapshot;
    f.backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context: f.context, request: f.request, deps: f.backend }), /interrupted/);
    f.restore();
    const prepared = await prepareRevision({ context: f.context, deps: f.backend, input: {
      mode: 'abort', transactionId: f.request.proposal.transactionId, operationId: 'native-current-abort',
      reason: 'Retain the actually approved earlier requirement without effects',
      edits: { acceptanceCriteria: [], verificationCommands: [] },
    } });
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    const messageId = 'native-current-abort-human';
    f.backend.addHostMessage({ ...f.backend.snapshot.hostMessages[0], id: messageId,
      content: [{ type: 'input_text', text: prepared.approvalStatement }] });
    const request = { schema: 'aitm.criteria-revision/v1', action: 'recover', proposal: prepared.proposal,
      authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: f.context.executor.adapter,
        sessionId: f.context.executor.sessionId, messageId, statementHash: hashBytes(prepared.approvalStatement) } };
    const result = await recoverRevision({ context: f.context, request, deps: f.backend });
    assert.equal(result.status, 'aborted', JSON.stringify(result));
    f.restore();
    assert.equal(f.backend.observation.body.bytes, original.observation.body.bytes);
    assert.deepEqual(f.backend.snapshot.nativeOrder, original.nativeOrder);
    const approval = await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context });
    const { mutateIssueBody } = await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
    let callbacks = 0, failure;
    try {
      await mutateIssueBody({ repo: f.context.repository, issueNumber: f.context.issue,
        expectedVersion: f.backend.observation.body.version,
        mutate: body => { callbacks++; return body + '\n## Notes\nOrdinary metadata after untouched abort\n'; },
        deps: { revisionBackend: f.backend, ...f.writeDeps } });
    } catch (error) { failure = error; }
    assert.equal(failure, undefined, 'genuine retained current Plan must admit the ordinary body adapter: ' + failure);
    assert.ok(approval); assert.equal(callbacks, 1);
    assert.equal(f.pushes(), 2, 'one original source write plus one ordinary metadata write');
  } finally { f.s.dispose(); }
});


for (const tamper of ['current-stage', 'current-source', 'current-body', 'native-plan-stage', 'nonterminal-head', 'backward-head', 'global-predecessor', 'missing-old-plan']) {
  test(`successor epoch replay rejects ${tamper} while retaining original history`, async () => {
    const f = await successorFixture();
    try {
      assert.equal((await applyRevision({ context: f.context, request: f.request, deps: f.backend })).status, 'applied');
      f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(f.backend.observation.body.bytes) });
      assert.equal((await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } })).status, 'approved');
      f.restore();
      assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
      const snapshot = f.backend.snapshot;
      if (tamper === 'current-stage') snapshot.observation.stage = 'test';
      if (tamper === 'current-source') snapshot.observation.protectedSourceBindings[0].hash = hashBytes('foreign scope');
      if (tamper === 'current-body') snapshot.observation.body.bytes += '\n<!-- forged-control -->';
      if (tamper === 'global-predecessor') snapshot.nativeOrder.at(-1).predecessor = null;
      if (tamper === 'missing-old-plan') snapshot.nativePlanRecords.shift();
      if (['native-plan-stage', 'nonterminal-head', 'backward-head'].includes(tamper)) {
        const journal = snapshot.nativePlanRecords.at(-1), ref = snapshot.nativeOrder.at(-1);
        if (tamper === 'native-plan-stage') { journal.before.stage = 'test'; journal.after.stage = 'test'; }
        if (tamper === 'nonterminal-head') journal.revisionEventHead = f.backend.createdEvents.findLast(e => e.type === 'prepared').eventId;
        if (tamper === 'backward-head') journal.revisionEventHead = snapshot.nativeOrder[0].revisionEventHead;
        ref.revisionEventHead = journal.revisionEventHead;
        const { canonicalRecordJson } = await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
        ref.id = hashBytes(canonicalRecordJson(journal));
      }
      let accepted = false;
      try { f.restore(snapshot); accepted = (await observeRevision({ context: f.context, deps: f.backend })).status === 'applied'; }
      catch { /* Native constructor rejects incoherent membership before observation. */ }
      assert.equal(accepted, false);
    } finally { f.s.dispose(); }
  });
}


for (const phase of ['failBefore', 'failAfter']) for (const step of ['plan-body-write', 'native-plan-record-write', 'native-plan-record-readback', 'plan-journal-clear']) {
  test(`successor native Plan ${phase} ${step} retains deny and retries exact ordered completion`, async () => {
    const f = await successorFixture();
    try {
      assert.equal((await applyRevision({ context: f.context, request: f.request, deps: f.backend })).status, 'applied');
      f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(f.backend.observation.body.bytes) });
      const prior = f.backend.snapshot.nativePlanRecords.length;
      const approve = () => runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } });
      f.backend[phase] = step;
      await assert.rejects(approve(), /interrupted/);
      f.restore();
      if (f.backend.snapshot.planJournal) {
        assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
        const { mutateIssueBody } = await import('../../../../task-tracker/lib/issue-body-mutate.mjs');
        let callbacks = 0;
        await assert.rejects(mutateIssueBody({ repo: f.context.repository, issueNumber: f.context.issue,
          mutate: body => { callbacks++; return body; }, deps: { revisionBackend: f.backend, ...f.writeDeps } }), /revision-pending/);
        assert.equal(callbacks, 0);
      }
      const result = await approve();
      assert.equal(result.status, phase === 'failAfter' && step === 'plan-journal-clear' ? 'already-approved' : 'approved', JSON.stringify(result));
      f.restore();
      assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
      assert.equal(f.backend.snapshot.nativePlanRecords.length, prior + 1);
    } finally { f.s.dispose(); }
  });
}


async function currentAbortFixture() {
  const f = await successorFixture();
  f.backend.failAfter = 'event-write:prepared';
  await assert.rejects(applyRevision({ context: f.context, request: f.request, deps: f.backend }), /interrupted/);
  f.restore();
  const prepared = await prepareRevision({ context: f.context, deps: f.backend, input: {
    mode: 'abort', transactionId: f.request.proposal.transactionId, operationId: 'continued-native-abort',
    reason: 'Retain current approved criteria for native continuation', edits: { acceptanceCriteria: [], verificationCommands: [] } } });
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  const messageId = 'continued-native-abort-human';
  f.backend.addHostMessage({ ...f.backend.snapshot.hostMessages[0], id: messageId,
    content: [{ type: 'input_text', text: prepared.approvalStatement }] });
  assert.equal((await recoverRevision({ context: f.context, deps: f.backend, request: {
    schema: 'aitm.criteria-revision/v1', action: 'recover', proposal: prepared.proposal,
    authorizationSource: { schema: 'aitm.authorization-source/v1', adapter: f.context.executor.adapter,
      sessionId: f.context.executor.sessionId, messageId, statementHash: hashBytes(prepared.approvalStatement) } } })).status, 'aborted');
  f.restore(); assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
  return f;
}

test('actual native Plan remains available after untouched abort with current criteria authority', async () => {
  const f = await currentAbortFixture();
  try {
    const result = await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
      projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } });
    assert.equal(result.status, 'already-approved', JSON.stringify(result));
    assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'aborted');
  } finally { f.s.dispose(); }
});

test('actual native source correction after abort retains actual aborted journal head and needs fresh Plan', async () => {
  const f = await currentAbortFixture();
  try {
    const original = f.backend.snapshot, head = f.backend.createdEvents.at(-1).eventId;
    fs.writeFileSync(path.join(f.s.context.sourceRoot, 'pointer-operation.json'), JSON.stringify({
      schema: 'aitm.issue-body-operation/v1', kind: 'replace-exact', expectedVersion: f.backend.observation.body.version,
      expected: '- **Source-plan**: docs/plan-b.md', replacement: '- **Source-plan**: docs/plan-a.md' }));
    assert.equal((await f.correct()).status, 'ok'); f.restore();
    assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'aborted');
    assert.equal(f.backend.snapshot.nativeSourceRecords.at(-1).revisionEventHead, head);
    assert.deepEqual(f.backend.snapshot.nativeOrder.slice(0, original.nativeOrder.length), original.nativeOrder);
    assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
    const result = await runPlanApprove({ issueNumber: f.context.issue, cfg: { repo: f.context.repository },
      projectDir: f.s.context.sourceRoot, deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } } });
    assert.equal(result.status, 'approved', JSON.stringify(result)); f.restore();
    assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
    assert.equal(f.backend.snapshot.nativePlanRecords.at(-1).revisionEventHead, head);
  } finally { f.s.dispose(); }
});

test('actual native proof after abort binds current criteria and retains the actual aborted event head', async () => {
  const f = await currentAbortFixture();
  try {
    fs.writeFileSync(path.join(f.s.context.sourceRoot, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(f.s.context.sourceRoot, 'supported-hook.test.mjs'),
      'import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; assert.equal(readFileSync(new URL("./source.txt", import.meta.url), "utf8"), "baseline\\n");');
    execFileSync('git', ['add', 'package-lock.json', 'supported-hook.test.mjs', 'docs', 'pointer-operation.json'], { cwd: f.s.context.sourceRoot, env: f.s.env });
    execFileSync('git', ['commit', '-qm', 'Actual verifier after untouched abort'], { cwd: f.s.context.sourceRoot, env: f.s.env });
    const { verbAcStamp } = await import('../../../../task-tracker/verbs/ac-stamp.mjs');
    const { parseEvidenceAcs } = await import('../../../../task-tracker/lib/ac-evidence.mjs');
    const execute = promisify(execFile); let executions = 0;
    const pexec = async (bin, args, options = {}) => {
      if (bin === 'gh' && args[1] === 'view') return { stdout: f.backend.observation.body.bytes };
      if (bin === 'gh' && args[1] === 'edit') { await f.writeDeps.pushBody(f.context.repository, f.context.issue, options.input); return { stdout: '' }; }
      if (bin === 'node') executions++;
      return execute(bin, args, { ...options, cwd: f.s.context.sourceRoot, env: f.s.env });
    };
    const head = f.backend.createdEvents.at(-1).eventId;
    const stamp = () => verbAcStamp({ cfg: { repo: f.context.repository }, projectDir: f.s.context.sourceRoot,
      statePath: path.join(f.s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
      rest: [parseEvidenceAcs(f.backend.observation.body.bytes)[0].label], pexec,
      deps: { revisionBackend: f.backend, getLiveState: async () => 'develop' } });
    await stamp();
    assert.equal(executions, 1); f.restore();
    const current = await observeRevision({ context: f.context, deps: f.backend });
    assert.equal(current.status, 'aborted', JSON.stringify(current));
    assert.equal(f.backend.snapshot.nativeProofRecords.at(-1).revisionEventHead, head);
    assert.equal(f.backend.snapshot.nativeProofRecords.at(-1).execution.binding.revisionId, 'tx-1');
    const pushes = f.pushes();
    await stamp();
    assert.equal(executions, 1); assert.equal(f.pushes(), pushes);
    assert.equal(f.backend.snapshot.nativeProofRecords.length, 1);
  } finally { f.s.dispose(); }
});


test('repeated untouched aborts preserve actual prior native approval and immutable global history', async () => {
  const f = await currentAbortFixture();
  try {
    const original = f.backend.snapshot;
    const authorize = prepared => {
      assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
      const messageId = prepared.proposal.operationId + '-human';
      f.backend.addHostMessage({ ...f.backend.snapshot.hostMessages[0], id: messageId,
        content: [{ type: 'input_text', text: prepared.approvalStatement }] });
      return { schema: 'aitm.criteria-revision/v1', action: prepared.proposal.mode === 'revision' ? 'apply' : 'recover',
        proposal: prepared.proposal, authorizationSource: { schema: 'aitm.authorization-source/v1',
          adapter: f.context.executor.adapter, sessionId: f.context.executor.sessionId, messageId,
          statementHash: hashBytes(prepared.approvalStatement) } };
    };
    for (let n = 0; n < 2; n++) {
      const oldBytes = f.backend.observation.body.bytes.split('\n').find(line => line.startsWith('- [ ] Supported model hooks'));
      assert.ok(oldBytes);
      const prepare = (mode, operationId, edits) => prepareRevision({ context: f.context, deps: f.backend,
        input: { mode, operationId, transactionId: 'repeated-abort-' + n,
          reason: 'Keep actually approved criteria across another untouched abort', edits } });
      const request = authorize(await prepare('revision', 'repeated-prepare-' + n, {
        acceptanceCriteria: [{ operation: 'replace', occurrence: 1, oldBytes, oldHash: hashBytes(oldBytes),
          replacements: [{ text: 'Abandoned repeated target ' + n, declaration: { kind: 'vc-list', vcIds: ['1'] } }] }], verificationCommands: [] }));
      f.backend.failAfter = 'event-write:prepared';
      await assert.rejects(applyRevision({ context: f.context, deps: f.backend, request }), /interrupted/);
      f.restore();
      assert.equal((await observeRevision({ context: f.context, deps: f.backend })).status, 'pending-before');
      assert.equal(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }), null);
      const result = await recoverRevision({ context: f.context, deps: f.backend,
        request: authorize(await prepare('abort', 'repeated-abort-operation-' + n, { acceptanceCriteria: [], verificationCommands: [] })) });
      assert.equal(result.status, 'aborted', JSON.stringify(result));
      f.restore();
      assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
      assert.deepEqual(f.backend.snapshot.nativeOrder, original.nativeOrder);
      assert.deepEqual(f.backend.snapshot.nativePlanRecords, original.nativePlanRecords);
      assert.deepEqual(f.backend.snapshot.nativeSourceRecords, original.nativeSourceRecords);
      assert.deepEqual(f.backend.observation, original.observation);
    }
  } finally { f.s.dispose(); }
});

// @story #1855
test('native linked correction refuses real file drift during awaited predecessor replay', async t => {
  const { syncBuiltinESMExports } = await import('node:module');
  const f = await linkedExecutionFixture();
  const file = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
  const originalRead = fs.readFileSync;
  let changed = false, scheduled = false, directRead = false;
  try {
    t.mock.method(fs, 'readFileSync', function (...args) {
      const bytes = originalRead.apply(this, args);
      const frames = new Error().stack.split('\n');
      const directCurrentRead = frames.some((line, index) => line.includes('at validateGovernedLinkedPlan') &&
        frames[index + 1]?.includes('at withNativeLinkedSourceCorrection'));
      if (args[0] === file && directCurrentRead) directRead = true;
      const finalReplayRead = directRead && frames.some(line => line.includes('at replayNativeEpoch'));
      if (!scheduled && args[0] === file && finalReplayRead) {
        scheduled = true;
        queueMicrotask(() => {
          fs.writeFileSync(file, plan.replace('registry checks can fail', 'unsealed concurrent source change'));
          changed = true;
        });
      }
      return bytes;
    });
    syncBuiltinESMExports();
    const events = f.backend.createdEvents;
    const result = await f.invoke();
    assert.equal(directRead, true, 'actual adapter captured its pre-replay source');
    assert.equal(scheduled, true, 'race occurs after the replay actual source read and before its awaited return');
    assert.equal(changed, true);
    assert.equal(result.decision, 'block', JSON.stringify(result));
    assert.equal(f.backend.snapshot.nativeSourceRecords?.length ?? 0, 0, 'no journal may seal stale file authority');
    assert.equal(f.pushes(), 0);
    assert.deepEqual(f.backend.createdEvents, events);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports(); f.s.dispose();
  }
});

// @story #1855
test('awaited native history rereads current linked source after its final epoch yield', async t => {
  const { syncBuiltinESMExports } = await import('node:module');
  const { reconstructNativeHistory } = await import('../../../../task-tracker/lib/criteria-revision/source-correction.mjs');
  const { readMemoryNativeHistory } = await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
  const f = await setup(), file = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
  const originalRead = fs.readFileSync;
  let changed = false;
  try {
    const state = await observeRevision({ context: f.context, deps: f.backend });
    const input = { history: readMemoryNativeHistory(f.backend), chain: state.chain,
      backend: f.backend, observation: f.backend.observation };
    assert.equal((await reconstructNativeHistory(input)).status, 'complete');
    let scheduled = false;
    t.mock.method(fs, 'readFileSync', function (...args) {
      const bytes = originalRead.apply(this, args);
      if (!scheduled && args[0] === file && new Error().stack.includes('at replayNativeEpoch')) {
        scheduled = true;
        queueMicrotask(() => {
          fs.writeFileSync(file, plan.replace('registry checks can fail', 'changed after native replay source observation'));
          changed = true;
        });
      }
      return bytes;
    });
    syncBuiltinESMExports();
    await assert.rejects(reconstructNativeHistory(input), /native-history-current-source/);
    assert.equal(changed, true);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.s.dispose(); }
});
