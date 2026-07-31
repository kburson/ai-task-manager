// @story #792
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GUARD_NAMES,
  guardEntrypointCandidates,
  resolveGuardEntrypoint,
  guardBootstrapCommand,
} from '../../../lib/guard-entrypoint.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import { createWorkLeaseProvider } from '../../../lib/work-lease/provider.mjs';
import { resolveWorktreeIdentity } from '../../../lib/work-lease/worktree-identity.mjs';

const CWD = '/proj';
const NM = resolve(CWD, 'node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs');
const REPO = resolve(CWD, 'scripts/task-tracker/bash-guard.mjs');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

// A fake `exists` that returns true only for the paths in `present`.
const existsFrom = (present) => (p) => present.has(p);

test('candidates: node_modules is tried before repo-relative', () => {
  assert.deepEqual(guardEntrypointCandidates('bash-guard'), [
    'node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs',
    'scripts/task-tracker/bash-guard.mjs',
  ]);
});

test('candidates: rejects a non-string name', () => {
  assert.throws(() => guardEntrypointCandidates(''), TypeError);
  assert.throws(() => guardEntrypointCandidates(null), TypeError);
});

// --- AC4: all three branches for the bash-guard entrypoint ---

test('branch 1 — node_modules present → resolves to node_modules candidate', () => {
  const got = resolveGuardEntrypoint('bash-guard', {
    cwd: CWD,
    exists: existsFrom(new Set([NM, REPO])), // both present → first still wins
  });
  assert.equal(got, NM);
});

test('branch 2 — node_modules absent, repo present → resolves to repo-relative candidate', () => {
  const got = resolveGuardEntrypoint('bash-guard', {
    cwd: CWD,
    exists: existsFrom(new Set([REPO])),
  });
  assert.equal(got, REPO);
});

test('branch 3 — both absent → returns null (fail-closed signal)', () => {
  const got = resolveGuardEntrypoint('bash-guard', {
    cwd: CWD,
    exists: existsFrom(new Set()),
  });
  assert.equal(got, null);
});

// --- AC1/AC2/AC3: the emitted hook command carries the fallback chain ---

test('bootstrap command embeds both candidate paths (node_modules first)', () => {
  const cmd = guardBootstrapCommand('bash-guard');
  const nmIdx = cmd.indexOf('node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs');
  const repoIdx = cmd.indexOf('\\"scripts/task-tracker/bash-guard.mjs\\"');
  assert.ok(nmIdx !== -1, 'node_modules candidate present');
  assert.ok(repoIdx !== -1, 'repo-relative candidate present');
  assert.ok(nmIdx < repoIdx, 'node_modules candidate is ordered first');
});

test('bootstrap command carries the fail-closed branch (exit 2 + stderr diagnostic)', () => {
  const cmd = guardBootstrapCommand('bash-guard');
  assert.match(cmd, /process\.exit\(2\)/);
  assert.match(cmd, /process\.stderr\.write\(/);
  assert.match(cmd, /aitm bash-guard: guard entrypoint unresolved/);
  assert.match(cmd, /failing closed/);
});

test('bootstrap command dynamic-imports the resolved path in-process', () => {
  const cmd = guardBootstrapCommand('bash-guard');
  assert.match(cmd, /import\(pathToFileURL\(p\)\.href\)/);
  assert.match(cmd, /runGuardBootstrap/);
  assert.ok(cmd.startsWith('node -e "'));
});

test('GUARD_NAMES covers the direct-node guards and each yields a bootstrap command', () => {
  assert.ok(GUARD_NAMES.includes('bash-guard'));
  assert.ok(GUARD_NAMES.includes('agent-guard'));
  assert.ok(GUARD_NAMES.includes('activity-guard'));
  for (const name of GUARD_NAMES) {
    assert.match(guardBootstrapCommand(name), new RegExp(`aitm ${name}: guard entrypoint`));
  }
});

function installedGuardSandbox({ active, state } = {}) {
  const dir = mkdtempProjectIsolated('aitm-guard-bootstrap-');
  mkdirSync(resolve(dir, 'node_modules'), { recursive: true });
  symlinkSync(ROOT, resolve(dir, 'node_modules', 'ai-task-manager'), 'dir');
  mkdirSync(resolve(dir, '.ai-task-manager'), { recursive: true });
  if (active) {
    const stateDir = resolve(dir, '.tmp', 'aitm', 'state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      resolve(stateDir, 'task-tracker-state.json'),
      JSON.stringify({ active, lastActive: active, state })
    );
  }
  return dir;
}

function runBootstrap(name, cwd, input, env = process.env) {
  return spawnSync(guardBootstrapCommand(name), {
    cwd,
    input,
    env: { ...env, AI_TASK_MANAGER_PROJECT_DIR: cwd },
    encoding: 'utf8',
    shell: true,
  });
}

function installStaleLease(dir, { sessionId = 'codex-apply-patch-stale' } = {}) {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const hostId = os.hostname();
  const worktree = resolveWorktreeIdentity(dir, { hostId });
  const config = {
    projectId: 'PVT_GITHUB_PROJECT',
    ledgerProjectId: projectId,
    workLease: { authority: 'local' },
  };
  writeFileSync(
    resolve(dir, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(config, null, 2)
  );
  const store = createWorkLeaseProvider({ config, projectDir: dir });
  const requestedAt = new Date().toISOString();
  const holder = {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: sessionId,
    sessionId,
    hostId,
    worktreeId: worktree.worktreeId,
    pathHash: worktree.pathHash,
    branch: 'trunk',
    pid: process.pid,
  };
  const binding = {
    sessionId,
    issueId: '1049',
    worktreeId: worktree.worktreeId,
    displayPath: worktree.displayPath,
  };
  const granted = store.acquire({
    projectId,
    issueId: '1049',
    mode: 'write',
    idempotencyKey: `bootstrap-stale:${sessionId}`,
    requestedAt,
    ttlMs: 900_000,
    holder,
    binding,
  });
  store.close();

  const sessionDir = resolve(dir, '.tmp', 'aitm', 'sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(
    resolve(sessionDir, 'active-task.json'),
    JSON.stringify(
      {
        issue: '#1049',
        kanbanState: 'develop',
        lease: {
          projectId,
          leaseId: granted.leaseId,
          fencingToken: String(BigInt(granted.fencingToken) + 1n),
          worktreeId: worktree.worktreeId,
        },
        holder,
        binding,
      },
      null,
      2
    )
  );
  return {
    ...process.env,
    AI_TASK_MANAGER_APP_NAME: 'codex',
    AI_TASK_MANAGER_PROJECT_DIR: dir,
    AI_TASK_MANAGER_SESSION_ID: sessionId,
  };
}

test('#1049: exact installed source bootstrap executes and blocks a governed edit', () => {
  const dir = installedGuardSandbox();
  const ambientDir = installedGuardSandbox({ active: '#1049', state: 'develop' });
  try {
    const result = runBootstrap(
      'source-edit-gate',
      dir,
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/guarded.mjs' } }),
      { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: ambientDir }
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /no bound issue/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(ambientDir, { recursive: true, force: true });
  }
});

test('#1049: exact installed activity bootstrap executes and blocks pure state refusal', () => {
  const dir = installedGuardSandbox({ active: '#1049', state: 'refine' });
  try {
    const result = runBootstrap(
      'activity-guard',
      dir,
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/guarded.mjs' } })
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /WRITE_CODE/);
    assert.match(decision.reason, /refine/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed activity bootstrap classifies pathless apply_patch as WRITE_CODE', () => {
  const dir = installedGuardSandbox({ active: '#1049', state: 'refine' });
  try {
    const result = runBootstrap(
      'activity-guard',
      dir,
      JSON.stringify({ tool_name: 'apply_patch', tool_input: {} })
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /WRITE_CODE/);
    assert.match(decision.reason, /refine/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed activity bootstrap blocks stale apply_patch authority', () => {
  const dir = installedGuardSandbox();
  try {
    const env = installStaleLease(dir);
    const result = runBootstrap(
      'activity-guard',
      dir,
      JSON.stringify({
        tool_name: 'apply_patch',
        tool_input: [
          '*** Begin Patch',
          '*** Update File: src/guarded.mjs',
          '@@',
          '-old',
          '+new',
          '*** End Patch',
        ].join('\n'),
      }),
      env
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /fence-stale/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed Bash bootstrap blocks stale attributed commit authority', () => {
  const dir = installedGuardSandbox();
  try {
    const env = {
      ...installStaleLease(dir, { sessionId: 'codex-bash-commit-stale' }),
      TT_SKIP_NETWORK: '1',
    };
    const result = runBootstrap(
      'bash-guard',
      dir,
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "[#1049] feat: guarded commit"' },
      }),
      env
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /issue-attributed-commit/);
    assert.match(decision.reason, /fence-stale/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed Bash bootstrap blocks an unbound inline Node source effect', () => {
  const dir = installedGuardSandbox();
  const target = resolve(dir, 'src', 'inline-write.mjs');
  try {
    mkdirSync(resolve(dir, 'src'), { recursive: true });
    const result = runBootstrap(
      'bash-guard',
      dir,
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: {
          command: "node -e \"require('node:fs').writeFileSync('src/inline-write.mjs', 'x')\"",
        },
      })
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /no active issue is bound/);
    assert.equal(existsSync(target), false, 'blocked command must not create the target file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed Bash bootstrap blocks descriptor and outside-path effects without binding', () => {
  const dir = installedGuardSandbox();
  try {
    mkdirSync(resolve(dir, 'src'), { recursive: true });
    for (const [command, reason] of [
      ['printf x 2> src/fd-write.mjs', /no active issue is bound/],
      ['printf x 2> "/tmp/quoted-fd-write.mjs"', /outside allowed scope/],
    ]) {
      const result = runBootstrap(
        'bash-guard',
        dir,
        JSON.stringify({ tool_name: 'Bash', tool_input: { command } })
      );
      assert.equal(result.status, 0, result.stderr);
      const decision = JSON.parse(result.stdout);
      assert.equal(decision.decision, 'block', command);
      assert.match(decision.reason, reason, command);
    }
    assert.equal(existsSync(resolve(dir, 'src', 'fd-write.mjs')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed Bash bootstrap blocks a stale process-substitution effect', () => {
  const dir = installedGuardSandbox();
  try {
    mkdirSync(resolve(dir, 'src'), { recursive: true });
    const env = installStaleLease(dir, { sessionId: 'codex-process-substitution-stale' });
    const result = runBootstrap(
      'bash-guard',
      dir,
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'cat <(touch src/process-write.mjs)' },
      }),
      env
    );
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /fence-stale/);
    assert.equal(existsSync(resolve(dir, 'src', 'process-write.mjs')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#1049: exact installed source and activity bootstraps pass malformed payloads', () => {
  const dir = installedGuardSandbox();
  try {
    for (const name of ['source-edit-gate', 'activity-guard']) {
      const result = runBootstrap(name, dir, '{malformed');
      assert.equal(result.status, 0, `${name} exit: ${result.stderr}`);
      assert.equal(result.stdout, '', `${name} stdout`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
