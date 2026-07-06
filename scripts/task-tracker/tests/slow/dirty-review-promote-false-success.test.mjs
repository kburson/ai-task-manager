#!/usr/bin/env node
// @story #710
// Regression test for the false-success defect on a `review → done` promote when
// the workspace is dirty.
//
// Original defect: `/task close` exited 0 on the interactive (non-CI, no
// `--answer`) dirty-close path — it printed `PROMPT_REQUIRED: dirty-close-confirm`
// and `return`ed without changing the board. Because the delegate exited 0,
// `promote` skipped its non-zero guard and reported `✓ #N promoted: review → done`
// even though the board never left Review.
//
// Two layers of coverage:
//   1. E2E — close.mjs interactive dirty branch exits 5 (not 0) while still
//      emitting the PROMPT_REQUIRED marker. (PATH git shim; TT_SKIP_NETWORK.)
//   2. Unit — runPromote re-reads the live board after the alias close and reports
//      `transition-failed` when an exit-0 close did NOT reach `done`, while a real
//      successful close (board → done) still reports `promoted`.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { runPromote } from '../../verbs/promote.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const TT = path.resolve(__dir, '..', '..', 'task-tracker.mjs');

// ─── Shared sandbox helpers (mirrors dirty-workspace-gate.test.mjs) ──────────

function setupSandbox() {
  const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-710-'));
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

async function setActive(sandbox, issue) {
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

async function runClose(script, args, { sandbox, binDir, env = {} } = {}) {
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
  return { stdout: result.stdout || '', stderr: result.stderr || '', code: result.code ?? 0 };
}

// ─── runPromote stub deps (mirrors promote-verb.test.mjs makeDeps) ───────────

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

const USER_STORY_SECTION =
  '## User Story\n\nAs a developer\nI want the promote verb to reject false successes\nSo that a blocked close never reports done\n';

function reviewBody() {
  return (
    `<!-- aitm-last-known-state: review -->\n` +
    `<!-- aitm-last-known-state-ts: 2026-07-05T00:00:00Z -->\n\n` +
    `${USER_STORY_SECTION}\n## Issue\n\nbody.\n`
  );
}

function makePromoteDeps({ live = 'review', liveAfter, spawnCode = 0 } = {}) {
  let liveCalls = 0;
  const calls = { spawns: [], liveCalls: 0 };
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body: reviewBody() }),
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(reviewBody());
        return next === reviewBody()
          ? { status: 'no-op', attempts: 1 }
          : { status: 'ok', attempts: 1 };
      },
      getLiveState: async () => {
        liveCalls++;
        calls.liveCalls = liveCalls;
        if (liveCalls === 1) return live;
        return liveAfter !== undefined ? liveAfter : live;
      },
      spawnVerb: async ({ verb, issueNumber }) => {
        calls.spawns.push({ verb, issueNumber });
        return spawnCode;
      },
      runMoveState: async () => 0,
      postTimingRow: async () => {},
      epicChildren: { fetchSiblings: async () => [] },
      codeCompleteGate: async () => ({ ok: true, blockers: [], shas: [] }),
      commitTrailHeadGate: async () => ({ ok: true, headSha: 'deadbeef', trailShas: ['deadbeef'] }),
    },
  };
}

// ─── AC1 — interactive dirty close exits non-zero + still prints PROMPT_REQUIRED ─

test('close: interactive dirty close on review→done exits 5 and still prints PROMPT_REQUIRED (#710)', async () => {
  const sandbox = setupSandbox();
  try {
    const binDir = makeGitShim(sandbox, ' M src/x.ts\n');
    await setActive(sandbox, 710);
    const r = await runClose(TT, ['close', '#710'], { sandbox, binDir, env: { CI: '' } });
    assert.equal(r.code, 5, `expected exit 5, got ${r.code}. stderr:\n${r.stderr}`);
    assert.match(r.stdout, /PROMPT_REQUIRED: dirty-close-confirm #710/);
    assert.match(r.stderr, /Workspace is dirty \(1 path/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

// ─── AC2 + AC3 — promote refuses to report false success and re-reads the board ─

test('promote: exit-0 close that leaves board at review yields transition-failed, no promoted line (#710)', async () => {
  const { deps, calls } = makePromoteDeps({ live: 'review', liveAfter: 'review', spawnCode: 0 });
  const r = await runPromote({ issueNumber: 710, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.notEqual(r.status, 'promoted');
  assert.match(r.message, /exited 0 but board is "review"/);
  assert.match(r.message, /refusing to report a false success/);
  // The alias close was still delegated; the guard fires on its result, not before.
  assert.deepEqual(calls.spawns, [{ verb: 'close', issueNumber: 710 }]);
  // AC3 — the live board was actually re-read after the delegate (2 getLiveState calls).
  assert.ok(
    calls.liveCalls >= 2,
    `expected a post-transition live re-read, saw ${calls.liveCalls}`
  );
});

// ─── Corrected happy path — a real successful close still reports promoted ─────

test('promote: exit-0 close that moves board to done still reports promoted (#710)', async () => {
  const { deps, calls } = makePromoteDeps({ live: 'review', liveAfter: 'done', spawnCode: 0 });
  const r = await runPromote({ issueNumber: 711, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'done');
  assert.equal(r.via, 'alias:close');
  assert.deepEqual(calls.spawns, [{ verb: 'close', issueNumber: 711 }]);
});
