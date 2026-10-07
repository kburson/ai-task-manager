import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
import { writeFileSync } from 'node:fs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { logicalRecordFixture } from '../../../helpers/evidence-v2/logical-records.mjs';
import { approvedFixture, fixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import { projectRequirements } from '../../../../task-tracker/lib/evidence-v2/subject-inputs.mjs';
import { buildEvidenceSubject } from '../../../../task-tracker/lib/evidence-v2/subject.mjs';

test('actual filesystem subject capture carries revision authority through identity hashing', async () => {
  const s = createSandbox();
  try {
    const { backend, context } = await approvedFixture({ unstampedIndependent: true });
    const f = logicalRecordFixture();
    const args = { ...f.input, repositoryId: { ...f.repositoryId, nameWithOwner: context.repository }, sourceRoot: s.context.sourceRoot, ports: { env: s.env } };
    const ordinary = projectRequirements({ body: backend.observation.body.bytes, target: f.target, policy: f.input.requirements.policy });
    const baseline = buildEvidenceSubject({ ...args, requirements: ordinary });
    await withRevisionConsumer({ ...context, backend, activity: 'body-write' }, () => {
      const requirements = projectRequirements({ body: backend.observation.body.bytes, target: f.target, policy: f.input.requirements.policy });
      const current = buildEvidenceSubject({ ...args, requirements });
      assert.deepEqual(current.subject.revisionBinding, requirements.revisionBinding);
      assert.notEqual(current.subject.requirementsDigest, baseline.subject.requirementsDigest);
      assert.notEqual(current.subject.subjectId, baseline.subject.subjectId);
      assert.throws(() => buildEvidenceSubject({ ...args, repositoryId: f.repositoryId, requirements }), /revision.*identity/);
      const stripped = structuredClone(requirements); delete stripped.revisionBinding;
      assert.throws(() => buildEvidenceSubject({ ...args, requirements: stripped }), /revision/);
    });
  } finally { s.dispose(); }
});

import path from 'node:path';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { parseEvidenceAcs } from '../../../../task-tracker/lib/ac-evidence.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`actual AC stamp ${state} refuses before verifier execution and transport writes`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await fixture(state);
      if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
      setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, s.context.sourceRoot);
      let body = backend.observation.body.bytes;
      const effects = [];
      const pexec = async (bin, args, opts = {}) => {
        if (bin === 'gh' && args[1] === 'view') return { stdout: body };
        if (bin === 'git' && args[0] === 'rev-parse') return { stdout: 'a'.repeat(40) };
        if (bin === 'git' && args[0] === 'status') return { stdout: '' };
        if (bin === 'node') { effects.push(['verifier', args]); return { stdout: '' }; }
        if (bin === 'gh' && args[1] === 'edit') { effects.push(['push']); body = opts.input; return { stdout: '' }; }
        throw new Error(`unexpected transport ${bin} ${args.join(' ')}`);
      };
      let refusal;
      try { await verbAcStamp({ cfg: { repo: context.repository }, projectDir: s.context.sourceRoot,
        statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
        rest: [parseEvidenceAcs(body)[0].label], pexec,
        deps: { revisionBackend: backend, getLiveState: async () => 'develop' },
      }); } catch (error) { refusal = error; }
      assert.deepEqual(effects, []);
      assert.equal(refusal?.code, state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable');
    } finally { s.dispose(); }
  });
}

import { verbDodStamp } from '../../../../task-tracker/verbs/dod-stamp.mjs';
for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`actual DoD stamp ${state} refuses before verifier execution and transport writes`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await fixture(state, { functionalKeys: true });
      if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
      setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, s.context.sourceRoot);
      let body = backend.observation.body.bytes;
      const effects = [];
      const pexec = async (bin, args, opts = {}) => {
        if (bin === 'gh' && args[1] === 'view') return { stdout: body };
        if (bin === 'git' && args[0] === 'rev-parse') return { stdout: 'a'.repeat(40) };
        if (bin === 'git' && args[0] === 'status') return { stdout: '' };
        if (bin === 'node') { effects.push(['verifier', args]); return { stdout: '' }; }
        if (bin === 'gh' && args[1] === 'edit') { effects.push(['push']); body = opts.input; return { stdout: '' }; }
        throw new Error(`unexpected transport ${bin} ${args.join(' ')}`);
      };
      let refusal;
      try { await verbDodStamp({ cfg: { repo: context.repository }, projectDir: s.context.sourceRoot,
        statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
        rest: ['tests'], pexec,
        deps: { revisionBackend: backend, getLiveState: async () => 'develop' },
      }); } catch (error) { refusal = error; }
      assert.deepEqual(effects, []);
      assert.equal(refusal?.code, state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable');
    } finally { s.dispose(); }
  });
}

import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';

for (const [name, adapter] of [['AC', verbAcStamp], ['DoD', verbDodStamp]]) {
  for (const state of (name === 'DoD' ? ['baseline', 'approved', 'approved-citation', 'approved-orphan'] : ['baseline', 'approved'])) {
    test(`actual ${name} stamp ${state} ${state === 'approved-orphan' ? 'refuses an ungoverned VC amendment before push' : 'executes its verifier and leaves usable durable authority'}`, async () => {
      const s = createSandbox();
      try {
        writeFileSync(path.join(s.context.sourceRoot, 'package-lock.json'), '{}');
        const isApproved = state !== 'baseline';
        const { backend, context } = isApproved ? await approvedFixture({ worktree: s.context.sourceRoot, branch: 'trunk', sharedDodCitation: state === 'approved-citation' }) : await fixture('baseline', { functionalKeys: true });
        setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, s.context.sourceRoot);
        let body = backend.observation.body.bytes;
        const effects = [];
        const pexec = async (bin, args, opts = {}) => {
          if (bin === 'gh' && args[1] === 'view') return { stdout: body };
          if (bin === 'git' && args[0] === 'rev-parse') return { stdout: 'a'.repeat(40) };
          if (bin === 'git' && args[0] === 'status') return { stdout: '' };
          if (bin === 'node') { effects.push(['verifier', args]); return { stdout: '' }; }
          if (bin === 'gh' && args[1] === 'edit') {
            effects.push(['push']); body = opts.input;
            const next = backend.observation; next.body = { bytes: body, version: parseBodyVersion(body) }; backend.replaceAuthority(next);
            if (isApproved) backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
            return { stdout: '' };
          }
          throw new Error(`unexpected transport ${bin} ${args.join(' ')}`);
        };
        const invoke = () => adapter({ cfg: { repo: context.repository }, projectDir: s.context.sourceRoot,
          statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
          rest: name === 'AC' ? [parseEvidenceAcs(body)[0].label] : [state === 'approved' ? 'lint' : 'tests'], pexec,
          deps: { revisionBackend: backend, getLiveState: async () => 'develop' },
        });
        if (state === 'approved-orphan') {
          await assert.rejects(invoke(), error => error.code === 'criteria-revision-required');
          assert.deepEqual(effects.map(x => x[0]), ['verifier']);
          assert.equal((await observeRevision({ context, deps: backend })).status, 'applied');
          return;
        }
        await invoke();
        assert.deepEqual(effects.map(x => x[0]), ['verifier', 'push']);
        const current = await observeRevision({ context, deps: backend });
        assert.equal(current.status, isApproved ? 'applied' : 'empty', JSON.stringify(current));
        if (isApproved) {
          const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
          assert.equal((await observeRevision({ context, deps: restored })).status, 'applied');
          assert.equal(restored.snapshot.nativeProofRecords.length, 1);
          assert.ok(backend.effects.indexOf('native-proof-journal-readback') >= 0);
        }
      } finally { s.dispose(); }
    });
  }
}

import * as fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { configPath } from '../../../../task-tracker/paths.mjs';
import { registerRevisionDomain, revisionRuntime } from '../../../../task-tracker/lib/criteria-revision/domain.mjs';
import { withRevisionInterlock } from '../../../../task-tracker/lib/criteria-revision/interlock.mjs';
import { refreshAdmission, publishAdmission } from '../../../../task-tracker/lib/criteria-revision/admission.mjs';
import { authorityResult } from '../../../fixtures/criteria-revision-runtime.mjs';

test('actual B activity hook rereads shared admission for code writes and mixed commits after A publishes deny', async t => {
  // This is the genuine shared-filesystem admission/hook prefix. Full A apply
  // requires Task6's trusted production backend and is not claimed here.
  const root = mkdtempProjectIsolated('revision-activity-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = path.join(root, 'first'), second = path.join(root, 'second'), home = path.join(root, 'home');
  for (const dir of [first, home]) fs.mkdirSync(dir);
  const env = { ...process.env, HOME: home, AI_TASK_MANAGER_PROJECT_DIR: second };
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  git(first, 'init', '-qb', 'first');
  git(first, 'config', 'user.name', 'Fixture');
  git(first, 'config', 'user.email', 'fixture@example.invalid');
  git(first, 'remote', 'add', 'origin', 'https://github.com/owner/repo.git');
  git(first, 'commit', '--allow-empty', '-qm', 'fixture');
  git(first, 'worktree', 'add', '-qb', 'second', second);
  const ports = { configRoot: path.join(home, '.ai-task-manager', 'criteria-revision-domains'), worktree: first };
  const context = { repository: 'owner/repo', issues: [1855], issue: 1855,
    executor: { adapter: 'codex-session/v1', sessionId: 'fixture-a', worktree: first, branch: 'first' } };
  context.domain = registerRevisionDomain({ repository: context.repository, commonDir: fs.realpathSync(path.join(first, '.git')),
    host: revisionRuntime(ports).inspect(first).hostId, quiescenceConfirmed: true }, ports);
  fs.mkdirSync(path.dirname(configPath(second)), { recursive: true });
  fs.writeFileSync(configPath(second), JSON.stringify({ repo: context.repository }));
  setActiveTask('fixture-b', { issue: '#1855', kanbanState: 'develop', worktreePath: second, worktreeBranch: 'second' }, second);
  fs.mkdirSync(path.join(second, 'src'));
  fs.writeFileSync(path.join(second, 'src', 'app.mjs'), 'export const value = 1;');
  fs.writeFileSync(path.join(second, 'README.md'), 'fixture');
  git(second, 'add', 'src/app.mjs', 'README.md');
  const entry = fileURLToPath(new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url));
  const hook = payload => {
    const result = spawnSync(process.execPath, [entry], { cwd: second, env, encoding: 'utf8',
      input: JSON.stringify({ session_id: 'fixture-b', cwd: second, ...payload }) });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout) : { decision: 'allow' };
  };
  const edit = { tool_name: 'Edit', tool_input: { file_path: path.join(second, 'src', 'app.mjs') } };
  const commit = { tool_name: 'Bash', tool_input: { command: 'git commit -m "[#1855] fixture"' } };
  await refreshAdmission({ context, observe: () => authorityResult(context, context.domain) }, ports);
  assert.equal(hook(edit).decision, 'allow');
  assert.equal(hook(commit).decision, 'allow');
  await withRevisionInterlock(context, capability => publishAdmission({ capability, observation: { issue: context.issue }, state: 'deny' }, ports), ports);
  assert.equal(hook(edit).decision, 'block');
  assert.equal(hook(commit).decision, 'block');
  assert.ok(hook(commit).reason.includes('revision-approval-stale'));
  fs.writeFileSync(configPath(second), JSON.stringify({ repo: 'foreign/unregistered' }));
  assert.equal(hook(edit).decision, 'block', 'configured foreign repository cannot hide actual enabled Git domain');
  const writerUrl = new URL('../../../../task-tracker/lib/versioned-issue-write.mjs', import.meta.url).href;
  const writerProbe = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { versionedWriteBody } = await import(${JSON.stringify(writerUrl)});
    let effects = 0, body = '## Notes\\noriginal\\n';
    let result;
    try { result = await versionedWriteBody({ repo: 'foreign/unregistered', issueNumber: 1855,
      mutate: value => { effects++; return value + 'note\\n'; },
      deps: { fetchBody: async () => body, pushBody: async (_repo, _issue, value) => { effects++; body = value; } } }); }
    catch (error) { result = { status: error.status, code: error.code }; }
    console.log(JSON.stringify({ effects, result }));
  `], { cwd: second, env, encoding: 'utf8' });
  assert.equal(writerProbe.status, 0, writerProbe.stderr);
  assert.equal(JSON.parse(writerProbe.stdout).effects, 0, 'ordinary body adapter cannot select an unregistered foreign repository to avoid the real domain');
  fs.unlinkSync(configPath(second));
  assert.ok(hook(commit).reason.includes('revision-approval-stale'), 'missing project config must recover actual registered Git identity');
  git(second, 'remote', 'remove', 'origin');
  assert.equal(hook(edit).decision, 'block', 'unknown identity plus any registration cannot fall back');
  const registrationRoot = ports.configRoot;
  fs.renameSync(registrationRoot, registrationRoot + '.retained');
  fs.mkdirSync(registrationRoot);
  fs.writeFileSync(path.join(registrationRoot, 'foreign.tmp'), 'unknown');
  assert.equal(hook(edit).decision, 'block', 'every entry counts, including foreign/temp records');
  fs.chmodSync(registrationRoot, 0);
  try { assert.equal(hook(edit).decision, 'block', 'unreadable registration root refuses'); }
  finally { fs.chmodSync(registrationRoot, 0o700); }
  fs.rmSync(registrationRoot, { recursive: true });
  fs.writeFileSync(registrationRoot, 'malformed root');
  assert.equal(hook(edit).decision, 'block', 'non-directory root refuses');
  fs.unlinkSync(registrationRoot);
  fs.symlinkSync('missing-root', registrationRoot);
  assert.equal(hook(edit).decision, 'block', 'dangling registration root is malformed, not verified absent');
});


import { withIssueLock, withAuthenticatedRevisionIssueLock, issueLockPath, ISSUE_LOCK_HELD_ENV } from '../../../../task-tracker/issue-mutator-lock.mjs';
for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'approved']) {
  test(`actual issue lock ${state} obtains revision admission before lock or callback effects`, async () => {
    const s = createSandbox();
    const prior = process.env[ISSUE_LOCK_HELD_ENV];
    try {
      const { backend, context } = state === 'approved' ? await approvedFixture({ worktree: s.context.sourceRoot }) : await fixture(state, { worktree: s.context.sourceRoot });
      if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
      const before = backend.effects.length;
      let calls = 0, pushes = 0;
      const options = { issue: context.issue, projDir: s.context.sourceRoot, repository: context.repository, revisionBackend: backend };
      const invoke = () => withIssueLock(options, async () => {
        calls++;
        assert.ok(fs.existsSync(issueLockPath(context.issue, s.context.sourceRoot)));
        assert.ok(backend.effects.slice(before).includes('admission-deny'));
        await withIssueLock(options, async () => { calls++; });
        await versionedWriteBody({ repo: context.repository, issueNumber: context.issue,
          mutate: body => body + '\nordinary note\n', deps: {
            fetchBody: async () => backend.observation.body.bytes,
            pushBody: async (_repo, _issue, body) => {
              pushes++;
              const next = backend.observation;
              next.body = { bytes: body, version: parseBodyVersion(body) };
              backend.replaceAuthority(next);
              if (state === 'approved') backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
            },
          } });
      });
      if (['baseline', 'approved'].includes(state)) {
        await invoke();
        assert.equal(calls, 2);
        assert.equal(pushes, 1);
        assert.equal((await observeRevision({ context, deps: backend })).status, state === 'approved' ? 'applied' : 'empty');
      } else {
        await assert.rejects(invoke(), error => error.code === (state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable'));
        assert.equal(calls, 0);
      }
      assert.equal(fs.existsSync(issueLockPath(context.issue, s.context.sourceRoot)), false);
    } finally {
      if (prior === undefined) delete process.env[ISSUE_LOCK_HELD_ENV]; else process.env[ISSUE_LOCK_HELD_ENV] = prior;
      s.dispose();
    }
  });
}


import { withMemoryInterlock } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { versionedWriteBody } from '../../../../task-tracker/lib/versioned-issue-write.mjs';
for (const state of ['pending', 'stale', 'unavailable']) {
  test(`actual explicit issue lock ${state} cannot turn a holder capability into mutation readiness`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await fixture(state, { worktree: s.context.sourceRoot });
      let effects = 0;
      await withMemoryInterlock(backend, context, async capability => {
        await assert.rejects(withIssueLock({ issue: context.issue, projDir: s.context.sourceRoot,
          repository: context.repository, revisionBackend: backend,
          revisionContext: context, revisionCapability: capability }, async () => {
            effects++;
            await versionedWriteBody({ repo: context.repository, issueNumber: context.issue,
              mutate: body => body + '\nnote\n', deps: { revisionBackend: backend,
                fetchBody: async () => backend.observation.body.bytes, pushBody: async () => { effects++; } } });
          }),
          error => error.code === (state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable'));
      });
      assert.equal(effects, 0);
      assert.equal(fs.existsSync(issueLockPath(context.issue, s.context.sourceRoot)), false);
    } finally { s.dispose(); }
  });
}


test('internal deep-import lock ownership does not admit a pending semantic writer', async () => {
  const s = createSandbox();
  try {
    const { backend, context } = await fixture('pending', { worktree: s.context.sourceRoot });
    let effects = 0;
    await withMemoryInterlock(backend, context, capability => withAuthenticatedRevisionIssueLock({
      issue: context.issue, projDir: s.context.sourceRoot, revisionContext: context, revisionCapability: capability,
    }, async () => {
      await assert.rejects(versionedWriteBody({ repo: context.repository, issueNumber: context.issue,
        mutate: body => { effects++; return body + '\nnote\n'; },
        deps: { revisionBackend: backend, fetchBody: async () => backend.observation.body.bytes, pushBody: async () => { effects++; } },
      }), error => error.message.includes('revision-lock-order'));
    }));
    assert.equal(effects, 0);
  } finally { s.dispose(); }
});

test('bare inherited issue-lock flag cannot admit enabled mutation or first acquire strict lock below issue lock', async () => {
  const s = createSandbox(), prior = process.env[ISSUE_LOCK_HELD_ENV];
  try {
    const { backend, context } = await fixture('baseline', { worktree: s.context.sourceRoot });
    process.env[ISSUE_LOCK_HELD_ENV] = String(context.issue);
    let effects = 0;
    await assert.rejects(withIssueLock({ issue: context.issue, projDir: s.context.sourceRoot,
      repository: context.repository, revisionBackend: backend }, () => { effects++; }),
      error => error.message.includes('revision-lock-order'));
    assert.equal(effects, 0);
    assert.equal(fs.existsSync(issueLockPath(context.issue, s.context.sourceRoot)), false);
  } finally {
    if (prior === undefined) delete process.env[ISSUE_LOCK_HELD_ENV]; else process.env[ISSUE_LOCK_HELD_ENV] = prior;
    s.dispose();
  }
});


import { runMoveStateHost } from '../../../../gh/move-state.mjs';
import { moveState } from '../../../../task-tracker/lib/move-state/move-state-core.mjs';
for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  for (const adapter of ['host', 'core']) {
    test(`actual move-state ${adapter} ${state} refuses before native lifecycle phases despite inherited flag`, async () => {
      const s = createSandbox();
      try {
        const { backend, context } = await fixture(state, { worktree: s.context.sourceRoot });
        if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
        fs.writeFileSync(configPath(s.context.sourceRoot), JSON.stringify({ repo: context.repository }));
        let effects = 0;
        const invoke = adapter === 'host' ? () => runMoveStateHost({
          argv: ['node', 'move-state', String(context.issue), 'refine', '--from', 'backlog'],
          env: { ...s.env, AITM_VERB_CONTEXT: 'promote', TT_SKIP_NETWORK: '1', AITM_ISSUE_LOCK_HELD: String(context.issue) },
          projectDir: s.context.sourceRoot, revisionBackend: backend,
          _observeGuardPhasePolicy: () => { effects++; },
        }) : () => moveState({ issueArg: String(context.issue), stateArg: 'test', cfg: { repo: context.repository },
          projectDir: s.context.sourceRoot, revisionBackend: backend,
          _runGuardExecution: async () => { effects++; return { exit: 4 }; },
          _probeCompletion: async () => ({ sentinelState: '', statusState: '', entryMarkerPresent: false, exitRowPresent: false, entryRowPresent: false }),
        });
        await assert.rejects(invoke(), error => error.code === (state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable'));
        assert.equal(effects, 0);
      } finally { s.dispose(); }
    });
  }
}


import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { readCurrentMemoryPlanApproval } from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
test('actual governed Scope correction preserves criterion identities and original transaction while making normal Plan approval stale', async () => {
  const s = createSandbox();
  try {
    const sid = currentSessionId();
    const { backend, context } = await approvedFixture({ worktree: s.context.sourceRoot, branch: 'trunk', sessionId: sid });
    setActiveTask(sid, { issue: `#${context.issue}`, entryStartTs: new Date().toISOString(),
      worktreePath: s.context.sourceRoot, worktreeBranch: 'trunk', kanbanState: 'develop' }, s.context.sourceRoot);
    const original = await observeRevision({ context, deps: backend });
    const immutableEvents = backend.createdEvents;
    const operationFile = path.join(s.context.sourceRoot, 'scope-operation.json');
    fs.writeFileSync(operationFile, JSON.stringify({ schema: 'aitm.issue-body-operation/v1', kind: 'replace-exact',
      expectedVersion: backend.observation.body.version, expected: 'Synthetic scope', replacement: 'Corrected scope' }));
    let pushes = 0;
    const result = await runIssueBodyVerb({ cfg: { repo: context.repository }, projectDir: s.context.sourceRoot,
      statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
      rest: [String(context.issue), '--operation-file', operationFile] }, {
      revisionBackend: backend, writeDeps: { revisionBackend: backend,
        fetchBody: async () => backend.observation.body.bytes,
        pushBody: async (_repo, _issue, body) => {
          pushes++;
          const next = backend.observation;
          next.body = { bytes: body, version: parseBodyVersion(body) };
          const scope = body.split('## Scope\n')[1].split('\n## ')[0].trim();
          next.protectedSourceBindings = next.protectedSourceBindings.map(binding => binding.identity === 'scope' ? { ...binding, hash: hashBytes(scope) } : binding);
          backend.replaceAuthority(next);
          backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
        },
      },
    });
    assert.equal(pushes, 1);
    assert.ok(result.body.includes('Corrected scope'));
    const current = await observeRevision({ context, deps: backend });
    assert.equal(current.status, 'applied');
    assert.deepEqual(backend.createdEvents, immutableEvents);
    assert.deepEqual(current.effectiveProposal, original.effectiveProposal, 'original transaction stays immutable');
    assert.equal(await readCurrentMemoryPlanApproval({ backend, context }), null);
    await assert.rejects(withRevisionConsumer({ ...context, backend, activity: 'body-write' }, () => {}), error => error.code === 'revision-approval-stale');
    assert.deepEqual(current.currentContract.definitions.map(d => d.identity), original.effectiveProposal.after.definitions.map(d => d.identity));
    assert.notEqual(current.currentContract.semanticContractDigest, original.effectiveProposal.after.semanticContractDigest);
    assert.ok(current.currentContract.definitions.every(d => !d.checked && !d.proof), 'source dependency change retires individual and aggregate claims');
    assert.equal(current.currentContract.revisionId, original.effectiveProposal.after.revisionId);
    const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const restarted = await observeRevision({ context, deps: restored });
    assert.equal(restarted.status, 'applied');
    assert.deepEqual(restarted.currentContract, current.currentContract);
    assert.equal(await readCurrentMemoryPlanApproval({ backend: restored, context }), null);
    const approved = await runPlanApprove({ issueNumber: context.issue, cfg: { repo: context.repository },
      projectDir: s.context.sourceRoot, deps: { revisionBackend: restored, env: { TT_FULL_AUTO: '1' } } });
    assert.equal(approved.status, 'approved', JSON.stringify(approved));
    const approval = await readCurrentMemoryPlanApproval({ backend: restored, context });
    assert.equal(approval.payload.semanticContractDigest, current.currentContract.semanticContractDigest);
    assert.deepEqual(restored.snapshot.nativeOrder.map(ref => ref.kind), ['plan', 'source', 'plan']);
    const again = createRevisionMemory(JSON.parse(JSON.stringify(restored.snapshot)));
    assert.equal((await observeRevision({ context, deps: again })).status, 'applied');
    assert.deepEqual(again.createdEvents, immutableEvents);
    let admitted = 0;
    await withRevisionConsumer({ ...context, backend: again, activity: 'body-write' }, () => { admitted++; });
    assert.equal(admitted, 1, 'fresh normal source-bound Plan approval restores ordinary admission after restart');
  } finally { s.dispose(); }
});


import { postNewAutomatedTestsComment } from '../../../../task-tracker/lib/new-automated-tests-comment.mjs';
// @story #1855
for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'current']) {
  test(`actual new-tests comment ${state} gates all public reader and effect callbacks`, async () => {
    const { backend, context } = state === 'current' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    const calls = [];
    const deps = { revisionBackend: backend,
      listComments: async () => { calls.push('comments'); return [{ id: 'IC_trail', body: '### 🔗 Commits\n<!-- aitm-commits shas="' + 'a'.repeat(40) + '" -->' }]; },
      attributingCommits: async () => { calls.push('attribution'); return []; },
      showShaTestDiff: async () => { calls.push('diff'); return "+++ b/scripts/example.test.mjs\n+test('rejects changed source before publication', () => {});\n"; },
      createComment: async ({ body }) => { calls.push('create'); assert.match(body, /rejects changed source before publication/); },
    };
    let error, result;
    try { result = await postNewAutomatedTestsComment({ cfg: { repo: context.repository }, issueNumber: context.issue,
      cwd: context.executor.worktree, deps }); } catch (caught) { error = caught; }
    if (['baseline', 'current'].includes(state)) {
      assert.equal(error, undefined);
      assert.equal(result.status, 'posted');
      assert.deepEqual(calls, ['comments', 'attribution', 'diff', 'create']);
    } else {
      assert.deepEqual(calls, [], 'no supplied reader or writer may precede complete revision admission');
      assert.equal(error?.code, state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable');
    }
  });
}


import { ensureRecordComment } from '../../../../task-tracker/lib/reviewed-scope/comments.mjs';
import { makeRecord, requestDigest, lineageDigest, encodeRecord } from '../../../../task-tracker/lib/reviewed-scope/model.mjs';
for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'current']) {
  test(`actual reviewed-scope comment ${state} gates supplied readers and publication`, async () => {
    const { backend, context } = state === 'current' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    const manifest = { schema: 'aitm.reviewed-scope-evidence/v1', repository: context.repository,
      issue: context.issue, worktree: context.executor.worktree, branch: context.executor.branch,
      head: 'a'.repeat(40), label: 'Inspect output', provenance: { kind: 'operator-inspection' },
      rationale: 'Inspected sandbox output.', artifacts: [{ path: 'evidence.txt', sha256: 'b'.repeat(64) }] };
    const targetDigest = 'c'.repeat(64);
    const record = makeRecord({ manifest, targetDigest, requestDigest: requestDigest({ manifest, targetDigest }),
      lineage: lineageDigest({ repository: context.repository, issue: context.issue, targetDigest }),
      predecessor: null, actor: { id: '42', login: 'fixture' }, recordedAt: '2026-10-01T00:00:00.000Z' });
    const encoded = encodeRecord(record), calls = [];
    let stored, result, error;
    const deps = { revisionBackend: backend,
      listComments: async () => { calls.push('list'); return []; },
      createComment: async ({ repository, issue, body }) => {
        calls.push('create'); assert.equal(repository, context.repository); assert.equal(issue, context.issue);
        assert.equal(body, encoded.commentBody);
        stored = { id: '99', body, issue_url: `https://api.github.com/repos/${repository}/issues/${issue}`, user: { id: '42' } };
        return stored;
      },
      readComment: async () => { calls.push('readback'); return stored; },
    };
    try { result = await ensureRecordComment({ repository: context.repository, issue: context.issue,
      projectDir: context.executor.worktree, record, expectedPredecessor: null, deps }); } catch (caught) { error = caught; }
    if (['baseline', 'current'].includes(state)) {
      assert.equal(error, undefined); assert.equal(result.reused, false);
      assert.deepEqual(calls, ['list', 'create', 'readback']);
      assert.equal(stored.body, encoded.commentBody);
    } else {
      assert.deepEqual(calls, []);
      assert.equal(error?.code, state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable');
    }
  });
}


import { recordReviewedScope } from '../../../../task-tracker/lib/reviewed-scope/record.mjs';
for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`actual reviewed-scope coordinator ${state} refuses before supplied authority or filesystem reads`, async () => {
    const { backend, context } = await fixture(state);
    if (state === 'malformed') backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    const calls = [];
    let error;
    try { await recordReviewedScope({ ctx: { cfg: { repo: context.repository }, issueNumber: context.issue,
      projectDir: context.executor.worktree, deps: { revisionBackend: backend, reviewedScope: {
        readRecordingAuthority: async () => { calls.push('authority'); throw new Error('unadmitted'); },
        readBoundManifest: async () => { calls.push('manifest'); throw new Error('unadmitted'); },
      } } }, label: 'Inspect output', manifestPath: 'evidence.json' }); } catch (caught) { error = caught; }
    assert.deepEqual(calls, []);
    assert.equal(error?.code, state === 'pending' ? 'revision-pending' : state === 'stale' ? 'revision-approval-stale' : 'revision-authority-unavailable');
  });
}


test('reviewed-scope default publication preserves typed memory quarantine before any OS transport', async () => {
  const s = createSandbox(), previousPath = process.env.PATH;
  try {
    const { backend, context } = await approvedFixture({ worktree: s.context.sourceRoot });
    const manifest = { schema: 'aitm.reviewed-scope-evidence/v1', repository: context.repository,
      issue: context.issue, worktree: context.executor.worktree, branch: context.executor.branch,
      head: 'a'.repeat(40), label: 'Inspect output', provenance: { kind: 'operator-inspection' },
      rationale: 'Inspected sandbox output.', artifacts: [{ path: 'evidence.txt', sha256: 'b'.repeat(64) }] };
    const targetDigest = 'c'.repeat(64);
    const record = makeRecord({ manifest, targetDigest, requestDigest: requestDigest({ manifest, targetDigest }),
      lineage: lineageDigest({ repository: context.repository, issue: context.issue, targetDigest }),
      predecessor: null, actor: { id: '42', login: 'fixture' }, recordedAt: '2026-10-01T00:00:00.000Z' });
    const bin = path.join(s.context.root, 'transport-bin'), marker = path.join(s.context.root, 'transport-effect');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), '#!' + process.execPath + '\n' +
      'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"unexpected transport"); process.exit(97);\n');
    fs.chmodSync(path.join(bin, 'gh'), 0o755);
    process.env.PATH = bin + path.delimiter + previousPath;
    let error;
    try { await ensureRecordComment({ repository: context.repository, issue: context.issue,
      projectDir: context.executor.worktree, record, expectedPredecessor: null,
      deps: { revisionBackend: backend, listComments: async () => [] } }); } catch (caught) { error = caught; }
    assert.equal(fs.existsSync(marker), false);
    assert.equal(error?.code, 'revision-authority-unavailable');
    assert.equal(error?.blocker?.guardId, 'revision-mutation');
  } finally { process.env.PATH = previousPath; s.dispose(); }
});
