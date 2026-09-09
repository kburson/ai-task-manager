#!/usr/bin/env node
// @story #1557
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseArgs, runUnblock, verbUnblock } from '../../../../task-tracker/verbs/unblock.mjs';

const CFG = { repo: 'o/r' };

function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'unblock-state-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  return statePath;
}

function nativeDeps(existing = [], onComment) {
  return {
    readNativeDependencies: async () => ({ blockedBy: existing, blocking: [] }),
    convergeBlockedBySet: async ({ operation, refs = [] }) => {
      const requested = new Set(refs);
      const desired =
        operation === 'subtract'
          ? existing.filter((ref) => !requested.has(ref))
          : operation === 'clear'
            ? []
            : [...existing];
      return {
        status: JSON.stringify(desired) === JSON.stringify(existing) ? 'idempotent' : 'updated',
        existing,
        desired,
        added: desired.filter((ref) => !existing.includes(ref)),
        removed: existing.filter((ref) => !desired.includes(ref)),
      };
    },
    reconcileDependencyDisposition: async () => ({
      status: existing.length ? 'projected' : 'cleared',
    }),
    postComment: async ({ body }) => onComment?.(body),
  };
}

test('unblock parser distinguishes selective and clear-all requests', () => {
  assert.deepEqual(parseArgs(['#5', '--by', '7,9'], null), {
    target: 5,
    refs: [7, 9],
    byProvided: true,
  });
  assert.deepEqual(parseArgs(['#5'], null), { target: 5, refs: null, byProvided: false });
});

test('runUnblock validates target, config, and direct invalid refs', async () => {
  await assert.rejects(runUnblock({ target: 0, refs: null, cfg: CFG }), /no target issue/);
  await assert.rejects(runUnblock({ target: 5, refs: null, cfg: {} }), /cfg\.repo/);
  await assert.rejects(runUnblock({ target: 5, refs: [0], cfg: CFG }), /invalid issue/);
});

test('runUnblock selectively removes, clears all, and reports idempotence', async () => {
  const comments = [];
  const selective = await runUnblock({
    target: 5,
    refs: [7, 42],
    cfg: CFG,
    deps: nativeDeps([7, 9], (body) => comments.push(body)),
  });
  assert.deepEqual(selective.removed, [7]);
  assert.deepEqual(selective.remaining, [9]);
  assert.equal(comments.length, 1);

  const cleared = await runUnblock({ target: 5, refs: null, cfg: CFG, deps: nativeDeps([7, 9]) });
  assert.deepEqual(cleared.removed, [7, 9]);
  assert.equal(cleared.cleared, true);

  const unchanged = await runUnblock({ target: 5, refs: [42], cfg: CFG, deps: nativeDeps([7]) });
  assert.equal(unchanged.status, 'idempotent');
  assert.deepEqual(unchanged.remaining, [7]);
});

async function runVerb(ctx) {
  const realExit = process.exit;
  const realError = console.error;
  const realLog = console.log;
  let code = null;
  process.exit = (value) => {
    code = value ?? 0;
    throw new Error(`__exit_${code}__`);
  };
  console.error = () => {};
  console.log = () => {};
  try {
    await verbUnblock(ctx);
  } catch (error) {
    if (!/__exit_\d+__/.test(error.message)) throw error;
  } finally {
    process.exit = realExit;
    console.error = realError;
    console.log = realLog;
  }
  return code;
}

test('verbUnblock covers usage, success, and core failure exits', async () => {
  assert.equal(
    await runVerb({ cfg: CFG, statePath: tmpState({ active: null }), rest: ['--by', '7'] }),
    2
  );
  assert.equal(
    await runVerb({
      cfg: CFG,
      statePath: tmpState({ active: '#5' }),
      rest: ['#5', '--by', ''],
    }),
    2
  );
  assert.equal(
    await runVerb({
      cfg: CFG,
      statePath: tmpState({ active: '#5' }),
      rest: ['#5'],
      deps: nativeDeps([7]),
    }),
    null
  );
  assert.equal(
    await runVerb({
      cfg: {},
      statePath: tmpState({ active: '#5' }),
      rest: ['#5'],
      deps: nativeDeps([7]),
    }),
    1
  );
});

console.log('coverage-unblock.test.mjs: defined');
