// @story #1872
import { fileRankWaveRuntime } from '../../../fixtures/rank-wave-file-runtime.mjs';
import {
  prepareRankWave,
  executeRankWaveWrite,
} from '../../../../task-tracker/lib/epic-rank-wave-store.mjs';
import { buildEpicOrchestrationPlanMarker } from '../../../../task-tracker/lib/epic-orchestration-plan.mjs';
import { rankWaveDigest } from '../../../../task-tracker/lib/epic-rank-wave-policy.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  admissionLockPath,
  withEpicAdmissionLock,
} from '../../../../task-tracker/lib/epic-admission-lock.mjs';
import { discoverRankWavePhysical } from '../../../../task-tracker/lib/epic-rank-wave-bindings.mjs';
const workerPath = path.resolve('scripts/tests/fixtures/rank-wave-lock-worker.mjs');
function repo() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'rank-wave-lock-'));
  const main = path.join(dir, 'main'),
    a = path.join(dir, 'a'),
    b = path.join(dir, 'b');
  mkdirSync(main);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: main,
      stdio: 'pipe',
      env: { ...process.env, GIT_CONFIG_GLOBAL: path.join(dir, 'empty-config') },
    });
  git(['init']);
  git([
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-m',
    'baseline',
  ]);
  git(['worktree', 'add', '-b', 'child-a', a]);
  git(['worktree', 'add', '-b', 'child-b', b]);
  return { dir, main, a, b };
}
function processRun(mode, data) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, mode], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end(JSON.stringify(data));
    let out = '',
      err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('exit', (status) => (status === 0 ? resolve(out) : reject(new Error(err || out))));
  });
}

test('real linked worktrees resolve the same physical parent lock, including a symlink alias', async () => {
  const r = repo();
  try {
    assert.equal(
      admissionLockPath({ projectDir: r.a, epic: 107 }),
      admissionLockPath({ projectDir: r.b, epic: 107 })
    );
    symlinkSync(r.a, path.join(r.dir, 'alias'));
    assert.equal(discoverRankWavePhysical(path.join(r.dir, 'alias')).worktree, r.a);
    assert.equal(
      admissionLockPath({ projectDir: path.join(r.dir, 'alias'), epic: 107 }),
      admissionLockPath({ projectDir: r.a, epic: 107 })
    );
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

test('competing native processes serialize and re-read revocation at the winning boundary', async () => {
  const r = repo();
  try {
    const authority = path.join(r.dir, 'authority.json'),
      events = path.join(r.dir, 'events.log');
    writeFileSync(authority, JSON.stringify({ revoked: false }));
    writeFileSync(events, '');
    const first = processRun('hold-revoke', { projectDir: r.a, authority, events });
    // Wait for the actual holder to enter, not an assumed process-start delay.
    for (let i = 0; i < 100 && !readFileSync(events, 'utf8').includes('revoke:start'); i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.match(readFileSync(events, 'utf8'), /revoke:start/);
    const second = processRun('observe', { projectDir: r.b, authority, events });
    await Promise.all([first, second]);
    assert.equal(readFileSync(events, 'utf8'), 'revoke:start\nrevoke:end\nadmission:refused\n');
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

test('bounded contention never evicts live or unknown ownership and nested context cannot be forged', async () => {
  const r = repo();
  try {
    await withEpicAdmissionLock({ projectDir: r.a, epic: 107 }, async (context) => {
      assert.equal(
        await withEpicAdmissionLock({ projectDir: r.b, epic: 107, context }, async () => 42),
        42
      );
      await assert.rejects(
        withEpicAdmissionLock(
          { projectDir: r.b, epic: 107, context: { ...context } },
          async () => {}
        ),
        /context/
      );
      assert.match(await processRun('timeout', { projectDir: r.b }), /admission-lock-timeout/);
    });
    const lock = admissionLockPath({ projectDir: r.a, epic: 107 });
    mkdirSync(lock, { recursive: true });
    await assert.rejects(
      withEpicAdmissionLock({ projectDir: r.a, epic: 107, timeoutMs: 50 }, async () => {}),
      /unknown/
    );
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

test('public Plan-to-Develop admission waits for a linked-worktree revoker and revalidates before effects', async () => {
  const r = repo();
  try {
    const authority = path.join(r.dir, 'authority.json'),
      events = path.join(r.dir, 'events.log');
    const children = [140, 144].map((number) => ({
      number,
      rank: 2,
      state: 'plan',
      boardState: 'plan',
      issueState: 'open',
      closeReason: null,
      recoveryPhase: null,
      refinementDigest: 'a'.repeat(64),
      hasCurrentRefinement: true,
      blockedBy: [],
      dependencyReadiness: 'ready',
    }));
    const binding = (issue, worktree, sessionId) => ({
      issue,
      ...discoverRankWavePhysical(worktree),
      provider: 'codex',
      sessionId,
      generation: 'fixture-' + issue,
    });
    const snapshot = {
      children,
      parent: binding(107, r.main, 'fixture-parent'),
      bindings: [binding(140, r.a, 'fixture-140'), binding(144, r.b, 'fixture-144')],
      body: buildEpicOrchestrationPlanMarker({ children, trunkSha: '1'.repeat(40) }),
    };
    writeFileSync(authority, JSON.stringify({ snapshot, comments: [], operations: [] }));
    const runtime = fileRankWaveRuntime({ file: authority, projectDir: r.main });
    const p = await prepareRankWave({
      repository: 'o/r',
      epic: 107,
      rank: 2,
      operationId: 'initial',
      expiresAt: null,
      runtime,
    });
    const source = {
      schema: 'aitm.rank-wave-source/v1',
      sessionId: 'fixture-human',
      messages: [{ messageId: 'fixture-message', statementHash: 'sha256:' + 'a'.repeat(64) }],
    };
    const initial = await executeRankWaveWrite({
      action: 'record',
      repository: 'o/r',
      epic: 107,
      now: '2026-10-04T01:00:00.000Z',
      runtime,
      input: {
        schema: 'aitm.epic-wave-request/v1',
        proposal: p.proposal,
        expectedProposalDigest: p.digest,
        source,
        previousDigest: null,
      },
    });
    assert.equal(initial.status, 'recorded');
    const proposal = { ...p.proposal, operationId: 'revocation' };
    const input = {
      schema: 'aitm.epic-wave-request/v1',
      proposal,
      expectedProposalDigest: rankWaveDigest(proposal),
      source,
      previousDigest: initial.digest,
    };
    writeFileSync(events, '');
    const first = processRun('publish-revoke', { projectDir: r.a, authority, events, input });
    for (let i = 0; i < 100 && !readFileSync(events, 'utf8').includes('revoke:start'); i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(readFileSync(events, 'utf8'), /revoke:start/);
    await Promise.all([first, processRun('promote', { projectDir: r.b, authority, events })]);
    assert.equal(readFileSync(events, 'utf8'), 'revoke:start\nrevoke:end\nadmission:refused\n');
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

test('cross-process fixture transports quoted paths as data without constructing executable source', async () => {
  const r = repo();
  try {
    const authority = path.join(r.dir, "authority-'quoted'.json");
    const events = path.join(r.dir, "events-'quoted'.log");
    writeFileSync(authority, JSON.stringify({ revoked: true }));
    writeFileSync(events, '');
    await processRun('observe', { projectDir: r.a, authority, events });
    assert.equal(readFileSync(events, 'utf8'), 'admission:refused\n');
    assert.deepEqual(JSON.parse(readFileSync(authority, 'utf8')), { revoked: true });
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});
