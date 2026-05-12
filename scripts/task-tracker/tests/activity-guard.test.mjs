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
import { tmpdir } from 'node:os';
import path from 'node:path';
import url from 'node:url';

const GUARD = path.resolve(
  url.fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'activity-guard.mjs',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo({ state } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aitm-activity-guard-'));
  // Init bare git repo so `git rev-parse --show-toplevel` works.
  spawnSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  const stateObj = { active: '#65', lastActive: '#65' };
  if (state !== undefined) stateObj.state = state;
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'task-tracker-state.json'),
    JSON.stringify(stateObj),
  );
  return dir;
}

function makeRepoNoState() {
  const dir = mkdtempSync(path.join(tmpdir(), 'aitm-activity-guard-'));
  spawnSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  // No state file at all.
  return dir;
}

function runGuard({ cwd, payload, stdinRaw }) {
  const stdin = stdinRaw !== undefined ? stdinRaw : JSON.stringify(payload);
  const result = spawnSync('node', [GUARD], {
    cwd,
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
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Pass cases
// ---------------------------------------------------------------------------

test('Edit src/foo.ts in development → pass', () => {
  const dir = makeRepo({ state: 'development' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally { cleanup(dir); }
});

test('Edit docs/notes.md in analyze → pass', () => {
  // STATE_MATRIX: analyze allows WRITE_DOCS; groom does NOT (matrix shipped in W1.2).
  // The "Groom + docs" AC item in the issue body was aspirational; the matrix
  // ultimately frozen at #63 only admits WRITE_ISSUE + READ_* in groom.
  const dir = makeRepo({ state: 'analyze' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally { cleanup(dir); }
});

test('Edit docs/notes.md in groom → block per STATE_MATRIX', () => {
  const dir = makeRepo({ state: 'groom' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_DOCS/);
    assert.match(r.decision.reason, /\/task move 65 analyze/);
  } finally { cleanup(dir); }
});

test('Edit .github/ISSUE_TEMPLATE/bug.md in groom → pass', () => {
  const dir = makeRepo({ state: 'groom' });
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
  } finally { cleanup(dir); }
});

test('Bash npm test in validate → pass', () => {
  const dir = makeRepo({ state: 'validate' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'npm test' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally { cleanup(dir); }
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
  } finally { cleanup(dir); }
});

// ---------------------------------------------------------------------------
// Block cases
// ---------------------------------------------------------------------------

test('Edit src/foo.ts in groom → block; suggests development', () => {
  const dir = makeRepo({ state: 'groom' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
    assert.match(r.decision.reason, /groom/);
    assert.match(r.decision.reason, /\/task move 65 development/);
    assert.match(r.decision.reason, /Active task: #65/);
  } finally { cleanup(dir); }
});

test('Edit src/foo.ts in validate → block; suggests development', () => {
  const dir = makeRepo({ state: 'validate' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /WRITE_CODE/);
    assert.match(r.decision.reason, /\/task move 65 development/);
  } finally { cleanup(dir); }
});

test('Bash heredoc to src/ in groom → block', () => {
  const dir = makeRepo({ state: 'groom' });
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
  } finally { cleanup(dir); }
});

test('Bash npm run build in groom → block', () => {
  const dir = makeRepo({ state: 'groom' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'npm run build' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /RUN_BUILD/);
  } finally { cleanup(dir); }
});

test('Bash git commit in groom → block (COMMIT_CODE)', () => {
  const dir = makeRepo({ state: 'groom' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Bash', tool_input: { command: 'git commit -m x' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /COMMIT_CODE/);
  } finally { cleanup(dir); }
});

// ---------------------------------------------------------------------------
// No-active-task policy
// ---------------------------------------------------------------------------

test('Edit src/foo.ts with active issue but no state field → block; suggest reconcile', () => {
  const dir = makeRepo({ /* no state */ });
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
  } finally { cleanup(dir); }
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
  } finally { cleanup(dir); }
});

test('Edit docs/notes.md with active issue but no state → block; suggest reconcile', () => {
  const dir = makeRepo({ /* no state */ });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.decision?.decision, 'block');
    assert.match(r.decision.reason, /no recorded kanban state/);
    assert.match(r.decision.reason, /\/task reconcile accept-live 65/);
  } finally { cleanup(dir); }
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
  } finally { cleanup(dir); }
});

// ---------------------------------------------------------------------------
// Protocol / malformed input
// ---------------------------------------------------------------------------

test('malformed stdin JSON → pass (don\'t deadlock)', () => {
  const dir = makeRepo({ state: 'groom' });
  try {
    const r = runGuard({ cwd: dir, stdinRaw: 'not-json{' });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally { cleanup(dir); }
});

test('unknown tool_name → pass-through', () => {
  const dir = makeRepo({ state: 'groom' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'WeirdTool', tool_input: { command: 'whatever' } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally { cleanup(dir); }
});

test('Edit with missing file_path → pass (avoid false-positive)', () => {
  const dir = makeRepo({ state: 'groom' });
  try {
    const r = runGuard({
      cwd: dir,
      payload: { tool_name: 'Edit', tool_input: {} },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  } finally { cleanup(dir); }
});

test('Edit with absolute path inside project root → normalized + blocked in groom', () => {
  const dir = makeRepo({ state: 'groom' });
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
  } finally { cleanup(dir); }
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
  } finally { cleanup(dir); }
});
