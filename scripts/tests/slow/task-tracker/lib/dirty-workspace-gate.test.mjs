#!/usr/bin/env node
// @story #46
// E2E tests for the dirty-workspace gate on /task close and the move-state.mjs review warning.
// Uses PATH-based git shim to control porcelain output; SKIP_NETWORK skips gh.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const TT = path.resolve(__dir, '../../../task-tracker/task-tracker.mjs');
// #764 — move-state.mjs is import-only; spawn the test-only CLI harness instead.
const MOVE = path.resolve(__dir, '../../helpers/move-state-cli.mjs');

function setupSandbox() {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-dirty-gate-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify(
      {
        repo: 'test-owner/test-repo',
        projectId: 'PVT_x',
        kanbanFieldId: 'PVTF_x',
        kanbanOptionBacklog: 'OPT_b',
        kanbanOptionRefine: 'OPT_g',
        kanbanOptionPlan: 'OPT_a',
        kanbanOptionDevelop: 'OPT_d',
        kanbanOptionTest: 'OPT_v',
        kanbanOptionReview: 'OPT_r',
        kanbanOptionDone: 'OPT_done',
        assignee: '@me',
      },
      null,
      2
    )
  );
  return sandbox;
}

// Write a git shim that emits the configured porcelain output for `git status --porcelain=v1`.
// Other git args produce empty output so any incidental git invocation succeeds.
function makeGitShim(sandbox, porcelain) {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const shim = path.join(binDir, 'git');
  writeFileSync(
    shim,
    `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const i = args.indexOf('status');
if (i >= 0 && args.slice(i).some(a => a.startsWith('--porcelain'))) {
  fs.writeSync(1, ${JSON.stringify(porcelain)});
}
process.exit(0);
`
  );
  chmodSync(shim, 0o755);
  return binDir;
}

async function runNode(script, args, { sandbox, binDir, env = {}, expectExit = 0 } = {}) {
  const result = await pexec(process.execPath, [script, ...args], {
    cwd: sandbox,
    env: {
      ...process.env,
      AITM_INTERNAL: '1',
      PATH: `${binDir}:${process.env.PATH}`,
      AI_TASK_MANAGER_PROJECT_DIR: sandbox,
      TT_SKIP_NETWORK: '1',
      ...env,
    },
    timeout: 15000,
  }).catch((e) => e);
  const code = result.code ?? 0;
  assert.equal(
    code,
    expectExit,
    `expected exit ${expectExit}, got ${code}. stderr:\n${result.stderr || ''}\nstdout:\n${result.stdout || ''}`
  );
  return { stdout: result.stdout || '', stderr: result.stderr || '', code };
}

async function setActive(sandbox, issue) {
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  const statePath = path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify({
      active: `#${issue}`,
      lastActive: `#${issue}`,
      entryStartTs: new Date().toISOString(),
      wordsAtEntryStart: 0,
    })
  );
}

const cleanups = [];
const cleanup = (s) => cleanups.push(s);

try {
  // ─── Gate 1: move-state.mjs review ──────────────────────────────────────────

  // 1. Clean passthrough on review — no warning
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const binDir = makeGitShim(sandbox, '');
    const r = await runNode(MOVE, ['100', 'review'], { sandbox, binDir });
    assert.doesNotMatch(r.stderr, /Workspace is dirty/);
  }

  // 2. Dirty warns on review — move still proceeds (exit 0)
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const binDir = makeGitShim(sandbox, ' M scripts/a.mjs\n?? tmp/x.md\n');
    const r = await runNode(MOVE, ['100', 'review'], { sandbox, binDir });
    assert.match(r.stderr, /Workspace is dirty \(2 path/);
    assert.match(r.stderr, /scripts\/a\.mjs/);
    assert.match(r.stderr, /tmp\/x\.md/);
  }

  // ─── Gate 2: /task close ────────────────────────────────────────────────────

  // 3. Dirty close, --answer yes → refuse close, exit 6, no board change
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const binDir = makeGitShim(sandbox, ' M src/x.ts\n');
    await setActive(sandbox, 200);
    const r = await runNode(TT, ['close', '#200', '--answer', 'yes'], {
      sandbox,
      binDir,
      expectExit: 6,
    });
    assert.match(r.stderr, /Refusing to close #200/);
    assert.match(r.stderr, /Cleanup flow/);
  }

  // 4. Dirty close, --answer no → close proceeds (exit 0), warning logged
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const binDir = makeGitShim(sandbox, ' M src/x.ts\n M src/y.ts\n');
    await setActive(sandbox, 201);
    const r = await runNode(TT, ['close', '#201', '--answer', 'no'], { sandbox, binDir });
    assert.match(r.stderr, /Closing #201 with dirty workspace \(2 path/);
  }

  // 5. Dirty close, --answer cancel → abort (exit 0), no close
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const binDir = makeGitShim(sandbox, ' M src/x.ts\n');
    await setActive(sandbox, 202);
    const r = await runNode(TT, ['close', '#202', '--answer', 'cancel'], { sandbox, binDir });
    assert.match(r.stdout, /Cancelled close of #202/);
    assert.doesNotMatch(r.stdout, /Closed #202/);
  }

  // 6. Headless dirty close (CI=1, no --answer) → exit 5
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const binDir = makeGitShim(sandbox, ' M src/x.ts\n');
    await setActive(sandbox, 203);
    const r = await runNode(TT, ['close', '#203'], {
      sandbox,
      binDir,
      env: { CI: '1' },
      expectExit: 5,
    });
    assert.match(r.stderr, /running headless/);
    assert.match(r.stderr, /--answer yes\|no\|cancel/);
  }

  // 7. Non-CI dirty close (no --answer) → emits PROMPT_REQUIRED marker, exits 5.
  // #710 — the exit was 0 before; it now exits non-zero so `promote` can tell a
  // blocked prompt apart from a completed close. The PROMPT_REQUIRED stdout line
  // is still emitted (before exit) so the interactive skill loop re-prompts.
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const binDir = makeGitShim(sandbox, ' M src/x.ts\n');
    await setActive(sandbox, 204);
    const r = await runNode(TT, ['close', '#204'], {
      sandbox,
      binDir,
      env: { CI: '' },
      expectExit: 5,
    });
    assert.match(r.stdout, /PROMPT_REQUIRED: dirty-close-confirm #204/);
    assert.match(r.stderr, /Workspace is dirty \(1 path/);
  }

  // 8. Truncation — 15 dirty entries → warning shows 10 + "+5 more"
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const porcelain = Array.from({ length: 15 }, (_, i) => ` M file${i}.ts`).join('\n') + '\n';
    const binDir = makeGitShim(sandbox, porcelain);
    const r = await runNode(MOVE, ['205', 'review'], { sandbox, binDir });
    assert.match(r.stderr, /Workspace is dirty \(15 path/);
    assert.match(r.stderr, /\+5 more.*total 15/);
  }

  // 9. Worktree-aware — fleet entry pins a different workspace path
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    // alt worktree has dirty git; sandbox cwd has a clean git shim
    const altWorktree = realpathSync(
      mkdtempSync(path.join(projectScratchDir('test'), 'aitm-alt-'))
    );
    cleanup(altWorktree);
    // Sandbox git shim returns clean
    const binDir = makeGitShim(sandbox, '');
    // Alt-worktree git shim returns dirty — same binary, but checkDirty runs git in cwd=altWorktree.
    // To distinguish: put a marker file in the alt worktree that the shim reads.
    // Simpler: override the shim to read its cwd and emit dirty only when cwd matches altWorktree.
    const shim = path.join(binDir, 'git');
    writeFileSync(
      shim,
      `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const i = args.indexOf('status');
if (i >= 0 && args.slice(i).some(a => a.startsWith('--porcelain'))) {
  if (process.cwd() === ${JSON.stringify(altWorktree)}) {
    fs.writeSync(1, ' M alt-only.ts\\n');
  }
}
process.exit(0);
`
    );
    chmodSync(shim, 0o755);
    // Write fleet registry pointing #206 to altWorktree. #573: the fleet
    // registry is main-anchored under `.tmp/aitm/fleet/`.
    mkdirSync(path.join(sandbox, '.tmp', 'aitm', 'fleet'), { recursive: true });
    writeFileSync(
      path.join(sandbox, '.tmp', 'aitm', 'fleet', 'task-fleet.json'),
      JSON.stringify({
        '#206': {
          worktreePath: altWorktree,
          branch: 'x',
          startedAt: new Date().toISOString(),
          status: 'active',
        },
      })
    );
    const r = await runNode(MOVE, ['206', 'review'], { sandbox, binDir });
    assert.match(r.stderr, /Workspace is dirty \(1 path/);
    assert.match(r.stderr, /alt-only\.ts/);
  }

  // 10. TT_SKIP_DIRTY_CHECK=1 disables the gate even with dirty workspace
  {
    const sandbox = setupSandbox();
    cleanup(sandbox);
    const binDir = makeGitShim(sandbox, ' M src/x.ts\n');
    const r = await runNode(MOVE, ['207', 'review'], {
      sandbox,
      binDir,
      env: { TT_SKIP_DIRTY_CHECK: '1' },
    });
    assert.doesNotMatch(r.stderr, /Workspace is dirty/);
  }

  console.log('dirty-workspace-gate: ok');
} finally {
  for (const s of cleanups) {
    try {
      rmSync(s, { recursive: true, force: true });
    } catch {}
  }
}
