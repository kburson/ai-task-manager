// @story #65
// Tests for scripts/task-tracker/activity-guard.mjs
//
// Spawns the hook as a subprocess, feeds stdin JSON, asserts exit/stdout.
//
// State coupling: the guard reads `.ai-task-manager/task-tracker-state.json`
// from the project root resolved via `git rev-parse --show-toplevel`. Each
// test sets up a temp git repo so the guard sees a known state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { realRepositoryFixture, runCli } from '../../../fixtures/co-review-fixture.mjs';
import path from 'node:path';
import url from 'node:url';

const GUARD = path.resolve(
  url.fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'task-tracker',
  'activity-guard.mjs'
);
const REVIEWER_ENV = {
  ...process.env,
  AI_TASK_MANAGER_SESSION_ID: 'activity-claim-invariance-1406',
  GROK_AGENT: '1',
  GROK_SESSION_ID: 'activity-claim-invariance-1406',
};

function successfulCoReview(args, root) {
  const result = runCli(args, { cwd: root, env: REVIEWER_ENV });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function prepareReviewerTurn(root, artifact, commit) {
  const dir = '.tmp/co-review/activity-claim-invariance';
  successfulCoReview(
    [
      'init',
      '--dir',
      dir,
      '--artifact',
      artifact,
      '--owner',
      'owner-agent',
      '--reviewer',
      'reviewer-agent',
      '--max-turns',
      '3',
    ],
    root
  );
  successfulCoReview(['claim', '--dir', dir, '--actor', 'owner-agent'], root);
  const response = `${dir}/round-1-owner-response.md`;
  writeFileSync(path.join(root, response), '# Owner response\n\nReady for review.\n');
  successfulCoReview(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'owner-agent',
      '--response',
      response,
      '--artifact',
      artifact,
      '--commit',
      commit,
      '--message',
      'owner handoff complete',
    ],
    root
  );
  return () => successfulCoReview(['claim', '--dir', dir, '--actor', 'reviewer-agent'], root);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo({ state } = {}) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-activity-guard-'));
  // Init bare git repo so `git rev-parse --show-toplevel` works.
  spawnSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  mkdirSync(path.join(dir, '.tmp', 'aitm', 'state'), { recursive: true });
  const stateObj = { active: '#65', lastActive: '#65' };
  if (state !== undefined) stateObj.state = state;
  writeFileSync(
    path.join(dir, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    JSON.stringify(stateObj)
  );
  return dir;
}

function makeRepoNoState() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-activity-guard-'));
  spawnSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  // No state file at all.
  return dir;
}

function runGuard({ cwd, payload, stdinRaw, env = process.env }) {
  const stdin = stdinRaw !== undefined ? stdinRaw : JSON.stringify(payload);
  const result = spawnSync('node', [GUARD], {
    cwd,
    env,
    input: stdin,
    encoding: 'utf8',
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    decision: parseDecision(result.stdout),
  };
}

function parseDecision(stdout) {
  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Pass cases
// ---------------------------------------------------------------------------

test('Edit src/foo.ts in develop → pass', () => {
  const dir = makeRepo({ state: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Edit docs/notes.md in plan → pass', () => {
  // STATE_MATRIX: analyze allows WRITE_DOCS; groom does NOT (matrix shipped in W1.2).
  // The "Groom + docs" AC item in the issue body was aspirational; the matrix
  // ultimately frozen at #63 only admits WRITE_ISSUE + READ_* in refine.
  const dir = makeRepo({ state: 'plan' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Edit docs/notes.md in refine → block per STATE_MATRIX', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_DOCS/);
    // #281 — refusal advice migrated from legacy `/task move <id> <state>`
    // to `/task promote → <state>` (forward) / `/task demote → <state>` (back).
    assert.match(r.decision.reason, /\/task promote/);
    assert.match(r.decision.reason, /plan/);
  } finally {
    cleanup(dir);
  }
});

test('Edit .github/ISSUE_TEMPLATE/bug.md in refine → pass', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Edit',
        tool_input: { file_path: '.github/ISSUE_TEMPLATE/bug.md' },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Bash npm test in test → pass', () => {
  const dir = makeRepo({ state: 'test' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'npm test' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Bash READ command (cat README.md) in done → pass', () => {
  const dir = makeRepo({ state: 'done' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'cat README.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Write .tmp/gh/foo.txt in develop → pass (scratch carve-out)', () => {
  const dir = makeRepo({ state: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Write', tool_input: { file_path: '.tmp/gh/foo.txt' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Write .tmp/plan/draft.md in refine → pass (scratch carve-out)', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Write', tool_input: { file_path: '.tmp/plan/draft.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Write absolute .tmp/ path → pass (scratch carve-out)', () => {
  const dir = makeRepo({ state: 'done' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Write',
        tool_input: { file_path: path.join(dir, '.tmp/gh/issue-body.md') },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Block cases
// ---------------------------------------------------------------------------

test('Edit src/foo.ts in refine → block; suggests develop', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
    assert.match(r.decision.reason, /refine/);
    // #281 — forward suggestion: `/task promote → develop`.
    assert.match(r.decision.reason, /\/task promote/);
    assert.match(r.decision.reason, /develop/);
    assert.match(r.decision.reason, /Active task: #65/);
  } finally {
    cleanup(dir);
  }
});

test('Edit src/foo.ts in test → block; suggests develop', () => {
  const dir = makeRepo({ state: 'test' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
    // #281 — backward suggestion from `test`: `/task demote → develop`.
    assert.match(r.decision.reason, /\/task demote/);
    assert.match(r.decision.reason, /develop/);
  } finally {
    cleanup(dir);
  }
});

test('Bash heredoc to src/ in refine → block', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Bash',
        tool_input: { command: 'cat > src/foo.ts <<EOF\nx\nEOF' },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
  } finally {
    cleanup(dir);
  }
});

test('Bash npm run build in refine → block', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'npm run build' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /RUN_BUILD/);
  } finally {
    cleanup(dir);
  }
});

test('Bash git commit in refine → block (COMMIT_CODE)', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'git commit -m x' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /COMMIT_CODE/);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// No-active-task policy
// ---------------------------------------------------------------------------

test('Edit src/foo.ts with active issue but no state field → block; suggest reconcile', () => {
  const dir = makeRepo({/* no state */});
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
    assert.match(r.decision.reason, /Active task: #65/);
    assert.match(r.decision.reason, /\/task reconcile accept-live 65/);
  } finally {
    cleanup(dir);
  }
});

test('Edit src/foo.ts with no state file at all → block (no-active-task)', () => {
  const dir = makeRepoNoState();
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no active task/i);
  } finally {
    cleanup(dir);
  }
});

test('Edit docs/notes.md with active issue but no state → block; suggest reconcile', () => {
  const dir = makeRepo({/* no state */});
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
    assert.match(r.decision.reason, /\/task reconcile accept-live 65/);
  } finally {
    cleanup(dir);
  }
});

test('Read with no active task is universally allowed; no state file → pass', () => {
  // Sanity check that READ_* still bypasses the no-state branch.
  const dir = makeRepoNoState();
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'cat package.json' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Protocol / malformed input
// ---------------------------------------------------------------------------

test("malformed stdin JSON → pass (don't deadlock)", () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({ cwd: dir, stdinRaw: 'not-json{' });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('unknown tool_name → pass-through', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'WeirdTool', tool_input: { command: 'whatever' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('a live reviewer claim does not change ordinary activity guard decisions', () => {
  const fixture = realRepositoryFixture();
  mkdirSync(path.join(fixture.root, '.tmp', 'aitm', 'state'), { recursive: true });
  writeFileSync(
    path.join(fixture.root, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    JSON.stringify({ active: '#1406', lastActive: '#1406', state: 'plan' })
  );
  const establishClaim = prepareReviewerTurn(fixture.root, fixture.artifact, fixture.initialCommit);
  const cases = [
    {
      name: 'read-only Bash pipeline',
      payload: {
        tool_name: 'Bash',
        tool_input: { command: 'git status --short | sed -n "1,5p"' },
      },
      expectedDecision: null,
    },
    {
      name: 'documentation edit',
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
      expectedDecision: null,
    },
    {
      name: 'temporary review-file write',
      payload: {
        tool_name: 'Write',
        tool_input: { file_path: '.tmp/reviewer-work/round-2-review.md' },
      },
      expectedDecision: null,
    },
    {
      name: 'installed-guard self-edit refusal',
      payload: {
        tool_name: 'Edit',
        tool_input: {
          file_path: 'node_modules/ai-task-manager/scripts/task-tracker/activity-guard.mjs',
        },
      },
      expectedDecision: 'block',
    },
    {
      name: 'malformed apply_patch refusal',
      payload: { tool_name: 'apply_patch', tool_input: { patch: 'not a patch' } },
      expectedDecision: 'block',
    },
  ];
  const runCases = () =>
    cases.map(({ name, payload }) => {
      const result = runGuard({ cwd: fixture.root, payload, env: REVIEWER_ENV });
      assert.equal(result.code, 0, `${name}: ${result.stderr}`);
      return result;
    });

  try {
    const withoutClaim = runCases();
    for (const [index, result] of withoutClaim.entries()) {
      assert.equal(
        result.decision?.decision ?? null,
        cases[index].expectedDecision,
        cases[index].name
      );
    }
    establishClaim();
    const withClaim = runCases();
    assert.deepEqual(withClaim, withoutClaim);
  } finally {
    cleanup(fixture.root);
  }
});

test('Edit with missing file_path → pass (avoid false-positive)', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: {} },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('Edit with absolute path inside project root → normalized + blocked in refine', () => {
  const dir = makeRepo({ state: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/foo.ts') },
      },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// Per-session kanbanState derived cache (#218 follow-up)
// ---------------------------------------------------------------------------

function writeSessionCache(dir, sid, record) {
  // #573: per-session caches live under `.tmp/aitm/sessions/`.
  const sessDir = path.join(dir, '.tmp', 'aitm', 'sessions', sid);
  mkdirSync(sessDir, { recursive: true });
  writeFileSync(path.join(sessDir, 'active-task.json'), JSON.stringify(record));
}

test('session kanbanState cache supplies state when global state field is absent', () => {
  const dir = makeRepo({/* no legacy state */});
  writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('session kanbanState overrides legacy global state when both present', () => {
  // Legacy says develop (would allow), session cache says refine (would block).
  // Session cache wins (it mirrors the body-marker source of truth).
  const dir = makeRepo({ state: 'develop' });
  writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'refine' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /refine/);
  } finally {
    cleanup(dir);
  }
});

test('session cache for a different issue is ignored', () => {
  const dir = makeRepo({/* no legacy state */});
  writeSessionCache(dir, 'sess-a', { issue: '#999', kanbanState: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
  } finally {
    cleanup(dir);
  }
});

test('session cache with invalid kanbanState is ignored; falls back', () => {
  const dir = makeRepo({/* no legacy state */});
  writeSessionCache(dir, 'sess-a', { issue: '#65', kanbanState: 'bogus' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
  } finally {
    cleanup(dir);
  }
});

test('most-recently-modified session cache wins when multiple match', () => {
  const dir = makeRepo({/* no legacy state */});
  // Older cache says refine
  writeSessionCache(dir, 'sess-old', { issue: '#65', kanbanState: 'refine' });
  // Force a measurable mtime gap, then write newer cache saying develop.
  spawnSync('sleep', ['0.05']);
  writeSessionCache(dir, 'sess-new', { issue: '#65', kanbanState: 'develop' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally {
    cleanup(dir);
  }
});

test('invalid state value in state file with active issue → block; suggest reconcile', () => {
  const dir = makeRepo({ state: 'bogus-state' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
    assert.match(r.decision.reason, /\/task reconcile accept-live 65/);
  } finally {
    cleanup(dir);
  }
});
