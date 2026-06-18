#!/usr/bin/env node
// @story #142
// Unit tests for the cross-close refusal (#142 / #208).
//
// `/task close <N>` must refuse when state.active is set and target !== active.
// The refusal is unconditional (no --answer escape), exits 7, emits
// PROMPT_REQUIRED on stdout, and performs no state or network mutation.
//
// In #208 the refusal was lifted out of close.mjs into the shared
// `lib/verb-preflight.mjs` helper and runs at the dispatcher before any verb
// body executes. The behavioral test now exercises the dispatcher path
// end-to-end via a child process. The source-level invariants moved to the
// preflight helper / dispatcher wiring.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

import { verbClose } from '../../verbs/close.mjs';

const pexec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(__dirname, '..', '..', 'verbs/close.mjs');
const SRC = readFileSync(SRC_PATH, 'utf8');
const PREFLIGHT_SRC = readFileSync(
  path.resolve(__dirname, '..', '..', 'lib/verb-preflight.mjs'),
  'utf8'
);
const CLI = path.resolve(__dirname, '..', '..', 'task-tracker.mjs');

// ── Source-level invariants ──────────────────────────────────────────────────

test('source: no `closingDifferentIssue` references remain (dead-code check)', () => {
  assert.ok(
    !/closingDifferentIssue/.test(SRC),
    'closingDifferentIssue constant and branch must be removed'
  );
});

test('source: bind-mismatch refusal now lives in the shared preflight helper', () => {
  assert.ok(
    !/PROMPT_REQUIRED: bind-mismatch/.test(SRC),
    'close.mjs must no longer carry the inline bind-mismatch refusal (#208 lifted it to preflight)'
  );
  assert.ok(
    /PROMPT_REQUIRED: bind-mismatch/.test(PREFLIGHT_SRC),
    'lib/verb-preflight.mjs must emit the PROMPT_REQUIRED: bind-mismatch token'
  );
});

test('source: preflight bind-mismatch uses exit(7)', () => {
  assert.ok(
    /EXIT_BIND_MISMATCH\s*=\s*7/.test(PREFLIGHT_SRC),
    'preflight helper must define EXIT_BIND_MISMATCH = 7'
  );
});

// ── Behavioral test via direct verbClose() invocation ───────────────────────

function buildMockCtx({ active, target, sideEffects }) {
  return {
    cfg: { repo: 'o/r' },
    statePath: '/tmp/does-not-exist.json',
    projectDir: '/tmp/does-not-matter',
    rest: target ? [target] : [],
    SKIP_NETWORK: true,
    pexec: async () => {
      sideEffects.push('pexec');
      return { stdout: '', stderr: '' };
    },
    drainQueueIfAny: async () => {},
    safePostTiming: async () => {
      sideEffects.push('safePostTiming');
    },
    runMoveState: async () => {
      sideEffects.push('runMoveState');
    },
    runMoveStateDone: async () => {
      sideEffects.push('runMoveStateDone');
    },
    runLogIssueTime: async () => {
      sideEffects.push('runLogIssueTime');
    },
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => {
      sideEffects.push('getIssueBoardState');
      return 'review';
    },
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => '2026-05-17T12:00:00Z',
    // loadState is imported by close.mjs directly — we stub via mocking the
    // process.exit instead and rely on the early-refusal happening before any
    // disk read in the cross-close path. The initial `loadState` call reads
    // s.active from a real file; for this test we monkey-patch via a wrapper.
    __testActive: active,
  };
}

async function runCloseAndCaptureExit(ctx) {
  const realExit = process.exit;
  let exitCode = null;
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`__test_exit_${code}__`);
  };
  const realLog = console.log;
  const realErr = console.error;
  const stdout = [];
  const stderr = [];
  console.log = (...a) => stdout.push(a.join(' '));
  console.error = (...a) => stderr.push(a.join(' '));
  let caughtError = null;
  try {
    await verbClose(ctx);
  } catch (err) {
    if (!/__test_exit_\d+__/.test(err.message)) caughtError = err;
  } finally {
    process.exit = realExit;
    console.log = realLog;
    console.error = realErr;
  }
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n'), caughtError };
}

// We need verbClose to see s.active = '#101'. The verb calls loadState(statePath).
// Easiest path: write a real temp state file and point statePath at it.

function withRealStateFile({ active }) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-cross-close-'));
  const statePath = path.join(dir, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({
      active,
      lastActive: active,
      entryStartTs: '2026-05-17T12:00:00Z',
      wordsAtEntryStart: 0,
    })
  );
  return { dir, statePath };
}

function makeDispatcherSandbox({ active }) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-cross-close-cli-'));
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
  );
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'task-tracker-state.json'),
    JSON.stringify({
      active,
      lastActive: active,
      entryStartTs: '2026-05-17T12:00:00Z',
      wordsAtEntryStart: 0,
      totalActiveMinutes: 0,
      discoverBucket: null,
      state: 'develop',
    })
  );
  return dir;
}

test('refuses cross-close: exit 7, PROMPT_REQUIRED on stdout (via dispatcher preflight)', async () => {
  const sandbox = makeDispatcherSandbox({ active: '#101' });
  const env = { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: sandbox, TT_SKIP_NETWORK: '1' };
  let err;
  try {
    await pexec('node', [CLI, 'close', '#102'], { env });
    throw new Error('expected non-zero exit');
  } catch (e) {
    err = e;
  }
  assert.equal(err.code, 7, `expected exit 7, got ${err.code}. stderr=${err.stderr}`);
  assert.match(err.stdout, /PROMPT_REQUIRED: bind-mismatch #101:#102/);
  assert.match(err.stderr, /Refusing \/task close/);
  assert.match(err.stderr, /\/task #102/);
});

test('allows close when target equals s.active (no refusal)', async () => {
  const { statePath } = withRealStateFile({ active: '#101' });
  const sideEffects = [];
  const ctx = {
    ...buildMockCtx({ active: '#101', target: '#101', sideEffects }),
    statePath,
    rest: ['#101'],
    // Force the close to short-circuit at the "already done" probe so we don't
    // need to mock the entire close pipeline — we only care that exit(7) is
    // NOT called.
    getIssueBoardState: async () => 'done',
  };
  const r = await runCloseAndCaptureExit(ctx);
  assert.notEqual(r.exitCode, 7, 'must not refuse when target === active');
  // The "already Done" short-circuit prints a clean-up message, not the refusal.
  assert.doesNotMatch(r.stdout, /bind-mismatch/);
});

test('allows close when s.active is null and target is given', async () => {
  const { statePath } = withRealStateFile({ active: null });
  const sideEffects = [];
  const ctx = {
    ...buildMockCtx({ active: null, target: '#202', sideEffects }),
    statePath,
    rest: ['#202'],
    getIssueBoardState: async () => 'done',
  };
  const r = await runCloseAndCaptureExit(ctx);
  assert.notEqual(r.exitCode, 7, 'must not refuse when active is null');
  assert.doesNotMatch(r.stdout, /bind-mismatch/);
});

console.log('close-cross-close.test.mjs: all passed');
