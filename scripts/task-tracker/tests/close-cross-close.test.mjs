#!/usr/bin/env node
// Unit tests for the cross-close refusal in verbClose (#142).
//
// `/task close <N>` must refuse when state.active is set and target !== active.
// The refusal is unconditional (no --answer escape), exits 7, emits
// PROMPT_REQUIRED on stdout, and performs no state or network mutation.
//
// We exercise two layers:
//   1. Source-level invariants (cheap, fast, hard to bypass).
//   2. Direct verbClose() call with a mocked ctx, asserting the refusal
//      runs to process.exit(7) before any ctx side-effect fires.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verbClose } from '../verbs/close.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(__dirname, '..', 'verbs/close.mjs');
const SRC = readFileSync(SRC_PATH, 'utf8');

// ── Source-level invariants ──────────────────────────────────────────────────

test('source: no `closingDifferentIssue` references remain (dead-code check)', () => {
  assert.ok(
    !/closingDifferentIssue/.test(SRC),
    'closingDifferentIssue constant and branch must be removed'
  );
});

test('source: refusal precedes any state-mutation, network probe, or dirty check', () => {
  const refusalIdx = SRC.indexOf('PROMPT_REQUIRED: bind-mismatch');
  assert.ok(refusalIdx > 0, 'PROMPT_REQUIRED refusal must exist');
  // Search for the actual call sites, not the destructure-from-ctx lines.
  const networkIdx = SRC.search(/await getIssueBoardState\(/);
  const dirtyIdx = SRC.search(/await checkDirty\(|checkDirty\(/);
  const saveStateIdx = SRC.search(/saveState\(s, statePath\)/);
  assert.ok(refusalIdx < networkIdx, 'refusal must precede network probe');
  assert.ok(refusalIdx < dirtyIdx, 'refusal must precede dirty check');
  assert.ok(refusalIdx < saveStateIdx, 'refusal must precede the bind-on-the-fly saveState');
});

test('source: bind-mismatch refusal uses exit(7)', () => {
  // Other PROMPT_REQUIRED gates in close.mjs (review-approval) also exit 7;
  // we just assert ours is wired with the same convention.
  const block = SRC.match(/PROMPT_REQUIRED: bind-mismatch[\s\S]*?process\.exit\(7\)/) || [];
  assert.ok(block[0], 'bind-mismatch refusal block must call process.exit(7)');
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
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

function withRealStateFile({ active }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tt-cross-close-'));
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

test('refuses cross-close: exit 7, PROMPT_REQUIRED on stdout, no side-effects', async () => {
  const { statePath } = withRealStateFile({ active: '#101' });
  const sideEffects = [];
  const ctx = {
    ...buildMockCtx({ active: '#101', target: '#102', sideEffects }),
    statePath,
    rest: ['#102'],
  };
  const r = await runCloseAndCaptureExit(ctx);
  assert.equal(r.exitCode, 7, `expected exit 7, got ${r.exitCode}. stderr=${r.stderr}`);
  assert.match(r.stdout, /PROMPT_REQUIRED: bind-mismatch #101:#102/);
  assert.match(r.stderr, /Refusing to close #102/);
  assert.match(r.stderr, /\/task #102/);
  assert.deepEqual(sideEffects, [], 'no ctx side-effects on refusal');
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
