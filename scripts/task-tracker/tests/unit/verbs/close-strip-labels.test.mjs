#!/usr/bin/env node
// @story #705
// When a task is closed it is no longer tracked by the board or blocking
// anything, so the `ToDo` and `BLOCKED` labels are stale once closed. Drives
// the real `verbClose` (SKIP_NETWORK:false) and asserts a
// `gh issue edit <n> --remove-label ToDo --remove-label BLOCKED` call fires
// alongside `gh issue close`, on both the convergence close-issue path and
// the main close path. A label-strip failure must not fail the close.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { verbClose } from '../../../verbs/close.mjs';
import { closeLabelRemoveArgs } from '../../../lib/close-labels.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const APPROVED_BODY =
  '## Done\n\n<!-- aitm-review-approved ts="2026-06-28T00:00:00Z" full-auto="yes" -->\n<!-- aitm-fields: {"engagedTime":3600,"size":"M","estimate":3} -->\n';

const baseState = (active = '#5') => ({
  active,
  lastActive: active,
  entryStartTs: new Date(Date.now() - 60_000).toISOString(),
  wordsAtEntryStart: 0,
  lastWordMarker: 0,
});

function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-705-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  return { statePath, dir };
}

function makeCtx(statePath, dir, over = {}) {
  return {
    cfg: { repo: 'o/r', lifecycleCheckboxesRequired: false },
    statePath,
    projectDir: dir,
    rest: ['#5'],
    SKIP_NETWORK: true,
    closeBody: '',
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {},
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    safePostTiming: async () => {},
    runMoveState: async () => ({ ok: true, benign: false }),
    runMoveStateDone: async () => ({ ok: true, benign: false }),
    writeTerminalDisposition: async () => ({ disposition: 'Delivered' }),
    runLogIssueTime: async () => {},
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => 'review',
    getIssueClosedState: async () => false,
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => new Date().toISOString(),
    reconcileReviewApprovedTiming: async () => ({ status: 'present' }),
    ...over,
  };
}

async function run({ state = baseState(), over = {} } = {}) {
  const prevSkip = process.env.TT_SKIP_DIRTY_CHECK;
  const prevCI = process.env.CI;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  const { statePath, dir } = tmpState(state);
  const ctx = makeCtx(statePath, dir, over);
  const real = { exit: process.exit, log: console.log, err: console.error, warn: console.warn };
  let exitCode = null;
  const stdout = [];
  const stderr = [];
  process.exit = (code) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}__`);
  };
  console.log = (...a) => stdout.push(a.join(' '));
  console.error = console.warn = (...a) => stderr.push(a.join(' '));
  let thrown = null;
  try {
    await verbClose(ctx);
  } catch (err) {
    if (!/__exit_\d+__/.test(err.message)) thrown = err;
  } finally {
    process.exit = real.exit;
    console.log = real.log;
    console.error = real.err;
    console.warn = real.warn;
    rmSync(dir, { recursive: true, force: true });
    if (prevSkip === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = prevSkip;
    if (prevCI === undefined) delete process.env.CI;
    else process.env.CI = prevCI;
  }
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n'), thrown };
}

test('closeLabelRemoveArgs builds the expected gh args', () => {
  assert.deepEqual(closeLabelRemoveArgs(705), [
    'issue',
    'edit',
    '705',
    '--remove-label',
    'ToDo',
    '--remove-label',
    'BLOCKED',
  ]);
});

test('convergence close-issue path strips ToDo/BLOCKED labels after gh close', async () => {
  const calls = [];
  await run({
    over: {
      SKIP_NETWORK: false,
      getIssueBoardState: async () => 'done',
      pexec: async (cmd, args) => (
        calls.push(`${cmd} ${args.join(' ')}`),
        { stdout: '', stderr: '' }
      ),
    },
  });
  assert.ok(
    calls.some((c) => c.includes('issue close')),
    'expected an issue close call'
  );
  assert.ok(
    calls.some((c) => c.includes('issue edit 5 --remove-label ToDo --remove-label BLOCKED')),
    `expected a label-strip call; got ${JSON.stringify(calls)}`
  );
});

test('main close path strips ToDo/BLOCKED labels after gh close', async () => {
  const ghCalls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      rest: ['#5', '--force'],
      getIssueBoardState: async () => 'review',
      fetchSubIssues: async () => [],
      pexec: async (cmd, args) => {
        const a = args.join(' ');
        ghCalls.push(`${cmd} ${a}`);
        if (cmd === 'gh' && a.includes('issue view') && a.includes('--jq'))
          return { stdout: APPROVED_BODY, stderr: '' };
        if (cmd === 'gh' && a.includes('issue view'))
          return { stdout: JSON.stringify({ body: APPROVED_BODY }), stderr: '' };
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.match(r.stdout, /Closed #5/);
  assert.ok(
    ghCalls.some((c) => c.includes('issue close')),
    'expected an issue close call'
  );
  assert.ok(
    ghCalls.some((c) => c.includes('issue edit 5 --remove-label ToDo --remove-label BLOCKED')),
    `expected a label-strip call; got ${JSON.stringify(ghCalls)}`
  );
});

test('label-strip failure is best-effort and does not fail the close', async () => {
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      rest: ['#5', '--force'],
      getIssueBoardState: async () => 'review',
      fetchSubIssues: async () => [],
      pexec: async (cmd, args) => {
        const a = args.join(' ');
        if (cmd === 'gh' && a.includes('issue view') && a.includes('--jq'))
          return { stdout: APPROVED_BODY, stderr: '' };
        if (cmd === 'gh' && a.includes('issue view'))
          return { stdout: JSON.stringify({ body: APPROVED_BODY }), stderr: '' };
        if (cmd === 'gh' && a.includes('--remove-label')) throw new Error('label strip boom');
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.match(r.stdout, /Closed #5/);
  assert.match(r.stderr, /failed to strip ToDo\/BLOCKED labels/);
});

console.log('close-strip-labels.test.mjs: ok');
