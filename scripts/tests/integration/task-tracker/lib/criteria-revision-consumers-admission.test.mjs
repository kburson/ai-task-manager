// @story #1855
// cspell:words unadmitted
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture, fixture } from '../../../helpers/criteria-revision-consumers.mjs';
import path from 'node:path';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import * as fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { configPath } from '../../../../task-tracker/paths.mjs';
import {
  registerRevisionDomain,
  revisionRuntime,
} from '../../../../task-tracker/lib/criteria-revision/domain.mjs';
import { withRevisionInterlock } from '../../../../task-tracker/lib/criteria-revision/interlock.mjs';
import {
  refreshAdmission,
  publishAdmission,
} from '../../../../task-tracker/lib/criteria-revision/admission.mjs';
import { authorityResult } from '../../../fixtures/criteria-revision-runtime.mjs';

test('actual B activity hook rereads shared admission for code writes and mixed commits after A publishes deny', async (t) => {
  // This is the genuine shared-filesystem admission/hook prefix. Full A apply
  // requires Task6's trusted production backend and is not claimed here.
  const root = mkdtempProjectIsolated('revision-activity-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = path.join(root, 'first'),
    second = path.join(root, 'second'),
    home = path.join(root, 'home');
  for (const dir of [first, home]) fs.mkdirSync(dir);
  const env = { ...process.env, HOME: home, AI_TASK_MANAGER_PROJECT_DIR: second };
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  git(first, 'init', '-qb', 'first');
  git(first, 'config', 'user.name', 'Fixture');
  git(first, 'config', 'user.email', 'fixture@example.invalid');
  git(first, 'remote', 'add', 'origin', 'https://github.com/owner/repo.git');
  git(first, 'commit', '--allow-empty', '-qm', 'fixture');
  git(first, 'worktree', 'add', '-qb', 'second', second);
  const ports = {
    configRoot: path.join(home, '.ai-task-manager', 'criteria-revision-domains'),
    worktree: first,
  };
  const context = {
    repository: 'owner/repo',
    issues: [1855],
    issue: 1855,
    executor: {
      adapter: 'codex-session/v1',
      sessionId: 'fixture-a',
      worktree: first,
      branch: 'first',
    },
  };
  context.domain = registerRevisionDomain(
    {
      repository: context.repository,
      commonDir: fs.realpathSync(path.join(first, '.git')),
      host: revisionRuntime(ports).inspect(first).hostId,
      quiescenceConfirmed: true,
    },
    ports
  );
  fs.mkdirSync(path.dirname(configPath(second)), { recursive: true });
  fs.writeFileSync(configPath(second), JSON.stringify({ repo: context.repository }));
  setActiveTask(
    'fixture-b',
    { issue: '#1855', kanbanState: 'develop', worktreePath: second, worktreeBranch: 'second' },
    second
  );
  fs.mkdirSync(path.join(second, 'src'));
  fs.writeFileSync(path.join(second, 'src', 'app.mjs'), 'export const value = 1;');
  fs.writeFileSync(path.join(second, 'README.md'), 'fixture');
  git(second, 'add', 'src/app.mjs', 'README.md');
  const entry = fileURLToPath(
    new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url)
  );
  const hook = (payload) => {
    const result = spawnSync(process.execPath, [entry], {
      cwd: second,
      env,
      encoding: 'utf8',
      input: JSON.stringify({ session_id: 'fixture-b', cwd: second, ...payload }),
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout) : { decision: 'allow' };
  };
  const edit = {
    tool_name: 'Edit',
    tool_input: { file_path: path.join(second, 'src', 'app.mjs') },
  };
  const commit = { tool_name: 'Bash', tool_input: { command: 'git commit -m "[#1855] fixture"' } };
  await refreshAdmission(
    { context, observe: () => authorityResult(context, context.domain) },
    ports
  );
  assert.equal(hook(edit).decision, 'allow');
  assert.equal(hook(commit).decision, 'allow');
  await withRevisionInterlock(
    context,
    (capability) =>
      publishAdmission({ capability, observation: { issue: context.issue }, state: 'deny' }, ports),
    ports
  );
  assert.equal(hook(edit).decision, 'block');
  assert.equal(hook(commit).decision, 'block');
  assert.ok(hook(commit).reason.includes('revision-approval-stale'));
  fs.writeFileSync(configPath(second), JSON.stringify({ repo: 'foreign/unregistered' }));
  assert.equal(
    hook(edit).decision,
    'block',
    'configured foreign repository cannot hide actual enabled Git domain'
  );
  const writerUrl = new URL(
    '../../../../task-tracker/lib/versioned-issue-write.mjs',
    import.meta.url
  ).href;
  const writerProbe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    const { versionedWriteBody } = await import(${JSON.stringify(writerUrl)});
    let effects = 0, body = '## Notes\\noriginal\\n';
    let result;
    try { result = await versionedWriteBody({ repo: 'foreign/unregistered', issueNumber: 1855,
      mutate: value => { effects++; return value + 'note\\n'; },
      deps: { fetchBody: async () => body, pushBody: async (_repo, _issue, value) => { effects++; body = value; } } }); }
    catch (error) { result = { status: error.status, code: error.code }; }
    console.log(JSON.stringify({ effects, result }));
  `,
    ],
    { cwd: second, env, encoding: 'utf8' }
  );
  assert.equal(writerProbe.status, 0, writerProbe.stderr);
  assert.equal(
    JSON.parse(writerProbe.stdout).effects,
    0,
    'ordinary body adapter cannot select an unregistered foreign repository to avoid the real domain'
  );
  fs.unlinkSync(configPath(second));
  assert.ok(
    hook(commit).reason.includes('revision-approval-stale'),
    'missing project config must recover actual registered Git identity'
  );
  git(second, 'remote', 'remove', 'origin');
  assert.equal(
    hook(edit).decision,
    'block',
    'unknown identity plus any registration cannot fall back'
  );
  const registrationRoot = ports.configRoot;
  fs.renameSync(registrationRoot, registrationRoot + '.retained');
  fs.mkdirSync(registrationRoot);
  fs.writeFileSync(path.join(registrationRoot, 'foreign.tmp'), 'unknown');
  assert.equal(hook(edit).decision, 'block', 'every entry counts, including foreign/temp records');
  fs.chmodSync(registrationRoot, 0);
  try {
    assert.equal(hook(edit).decision, 'block', 'unreadable registration root refuses');
  } finally {
    fs.chmodSync(registrationRoot, 0o700);
  }
  fs.rmSync(registrationRoot, { recursive: true });
  fs.writeFileSync(registrationRoot, 'malformed root');
  assert.equal(hook(edit).decision, 'block', 'non-directory root refuses');
  fs.unlinkSync(registrationRoot);
  fs.symlinkSync('missing-root', registrationRoot);
  assert.equal(
    hook(edit).decision,
    'block',
    'dangling registration root is malformed, not verified absent'
  );
});
import {
  withIssueLock,
  withAuthenticatedRevisionIssueLock,
  issueLockPath,
  ISSUE_LOCK_HELD_ENV,
} from '../../../../task-tracker/issue-mutator-lock.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'approved']) {
  test(`actual issue lock ${state} obtains revision admission before lock or callback effects`, async () => {
    const s = createSandbox();
    const prior = process.env[ISSUE_LOCK_HELD_ENV];
    try {
      const { backend, context } =
        state === 'approved'
          ? await approvedFixture({ worktree: s.context.sourceRoot })
          : await fixture(state, { worktree: s.context.sourceRoot });
      if (state === 'malformed')
        backend.addComment({
          id: 'bad',
          body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
        });
      const before = backend.effects.length;
      let calls = 0,
        pushes = 0;
      const options = {
        issue: context.issue,
        projDir: s.context.sourceRoot,
        repository: context.repository,
        revisionBackend: backend,
      };
      const invoke = () =>
        withIssueLock(options, async () => {
          calls++;
          assert.ok(fs.existsSync(issueLockPath(context.issue, s.context.sourceRoot)));
          assert.ok(backend.effects.slice(before).includes('admission-deny'));
          await withIssueLock(options, async () => {
            calls++;
          });
          await versionedWriteBody({
            repo: context.repository,
            issueNumber: context.issue,
            mutate: (body) => body + '\nordinary note\n',
            deps: {
              fetchBody: async () => backend.observation.body.bytes,
              pushBody: async (_repo, _issue, body) => {
                pushes++;
                const next = backend.observation;
                next.body = { bytes: body, version: parseBodyVersion(body) };
                backend.replaceAuthority(next);
                if (state === 'approved')
                  backend.replacePlanning({
                    ...backend.snapshot.planning,
                    bodyHash: hashBytes(body),
                  });
              },
            },
          });
        });
      if (['baseline', 'approved'].includes(state)) {
        await invoke();
        assert.equal(calls, 2);
        assert.equal(pushes, 1);
        assert.equal(
          (await observeRevision({ context, deps: backend })).status,
          state === 'approved' ? 'applied' : 'empty'
        );
      } else {
        await assert.rejects(
          invoke(),
          (error) =>
            error.code ===
            (state === 'pending'
              ? 'revision-pending'
              : state === 'stale'
                ? 'revision-approval-stale'
                : 'revision-authority-unavailable')
        );
        assert.equal(calls, 0);
      }
      assert.equal(fs.existsSync(issueLockPath(context.issue, s.context.sourceRoot)), false);
    } finally {
      if (prior === undefined) delete process.env[ISSUE_LOCK_HELD_ENV];
      else process.env[ISSUE_LOCK_HELD_ENV] = prior;
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
      await withMemoryInterlock(backend, context, async (capability) => {
        await assert.rejects(
          withIssueLock(
            {
              issue: context.issue,
              projDir: s.context.sourceRoot,
              repository: context.repository,
              revisionBackend: backend,
              revisionContext: context,
              revisionCapability: capability,
            },
            async () => {
              effects++;
              await versionedWriteBody({
                repo: context.repository,
                issueNumber: context.issue,
                mutate: (body) => body + '\nnote\n',
                deps: {
                  revisionBackend: backend,
                  fetchBody: async () => backend.observation.body.bytes,
                  pushBody: async () => {
                    effects++;
                  },
                },
              });
            }
          ),
          (error) =>
            error.code ===
            (state === 'pending'
              ? 'revision-pending'
              : state === 'stale'
                ? 'revision-approval-stale'
                : 'revision-authority-unavailable')
        );
      });
      assert.equal(effects, 0);
      assert.equal(fs.existsSync(issueLockPath(context.issue, s.context.sourceRoot)), false);
    } finally {
      s.dispose();
    }
  });
}

test('internal deep-import lock ownership does not admit a pending semantic writer', async () => {
  const s = createSandbox();
  try {
    const { backend, context } = await fixture('pending', { worktree: s.context.sourceRoot });
    let effects = 0;
    await withMemoryInterlock(backend, context, (capability) =>
      withAuthenticatedRevisionIssueLock(
        {
          issue: context.issue,
          projDir: s.context.sourceRoot,
          revisionContext: context,
          revisionCapability: capability,
        },
        async () => {
          await assert.rejects(
            versionedWriteBody({
              repo: context.repository,
              issueNumber: context.issue,
              mutate: (body) => {
                effects++;
                return body + '\nnote\n';
              },
              deps: {
                revisionBackend: backend,
                fetchBody: async () => backend.observation.body.bytes,
                pushBody: async () => {
                  effects++;
                },
              },
            }),
            (error) => error.message.includes('revision-lock-order')
          );
        }
      )
    );
    assert.equal(effects, 0);
  } finally {
    s.dispose();
  }
});

test('bare inherited issue-lock flag cannot admit enabled mutation or first acquire strict lock below issue lock', async () => {
  const s = createSandbox(),
    prior = process.env[ISSUE_LOCK_HELD_ENV];
  try {
    const { backend, context } = await fixture('baseline', { worktree: s.context.sourceRoot });
    process.env[ISSUE_LOCK_HELD_ENV] = String(context.issue);
    let effects = 0;
    await assert.rejects(
      withIssueLock(
        {
          issue: context.issue,
          projDir: s.context.sourceRoot,
          repository: context.repository,
          revisionBackend: backend,
        },
        () => {
          effects++;
        }
      ),
      (error) => error.message.includes('revision-lock-order')
    );
    assert.equal(effects, 0);
    assert.equal(fs.existsSync(issueLockPath(context.issue, s.context.sourceRoot)), false);
  } finally {
    if (prior === undefined) delete process.env[ISSUE_LOCK_HELD_ENV];
    else process.env[ISSUE_LOCK_HELD_ENV] = prior;
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
        if (state === 'malformed')
          backend.addComment({
            id: 'bad',
            body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
          });
        fs.writeFileSync(
          configPath(s.context.sourceRoot),
          JSON.stringify({ repo: context.repository })
        );
        let effects = 0;
        const invoke =
          adapter === 'host'
            ? () =>
                runMoveStateHost({
                  argv: [
                    'node',
                    'move-state',
                    String(context.issue),
                    'refine',
                    '--from',
                    'backlog',
                  ],
                  env: {
                    ...s.env,
                    AITM_VERB_CONTEXT: 'promote',
                    TT_SKIP_NETWORK: '1',
                    AITM_ISSUE_LOCK_HELD: String(context.issue),
                  },
                  projectDir: s.context.sourceRoot,
                  revisionBackend: backend,
                  _observeGuardPhasePolicy: () => {
                    effects++;
                  },
                })
            : () =>
                moveState({
                  issueArg: String(context.issue),
                  stateArg: 'test',
                  cfg: { repo: context.repository },
                  projectDir: s.context.sourceRoot,
                  revisionBackend: backend,
                  _runGuardExecution: async () => {
                    effects++;
                    return { exit: 4 };
                  },
                  _probeCompletion: async () => ({
                    sentinelState: '',
                    statusState: '',
                    entryMarkerPresent: false,
                    exitRowPresent: false,
                    entryRowPresent: false,
                  }),
                });
        await assert.rejects(
          invoke(),
          (error) =>
            error.code ===
            (state === 'pending'
              ? 'revision-pending'
              : state === 'stale'
                ? 'revision-approval-stale'
                : 'revision-authority-unavailable')
        );
        assert.equal(effects, 0);
      } finally {
        s.dispose();
      }
    });
  }
}
