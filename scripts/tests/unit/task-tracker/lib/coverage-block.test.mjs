#!/usr/bin/env node
// @story #1557
import { strict as assert } from 'node:assert';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  parseArgs,
  parseByList,
  resolveTargetIssue,
  runBlock,
  verbBlock,
} from '../../../../task-tracker/verbs/block.mjs';

const CFG = { repo: 'o/r' };

const FAKE_GH_DIR = mkdtempSync(join(projectScratchDir('test'), 'block-gh-'));
writeFileSync(
  join(FAKE_GH_DIR, 'gh'),
  [
    '#!/usr/bin/env node',
    'const args = process.argv.slice(2);',
    "const number = args.find((value) => /^\\d+$/.test(value)) || '0';",
    "process.stdout.write(JSON.stringify({ number: Number(number), state: 'CLOSED' }));",
  ].join('\n'),
  { mode: 0o755 }
);
chmodSync(join(FAKE_GH_DIR, 'gh'), 0o755);
process.env.PATH = `${FAKE_GH_DIR}:${process.env.PATH}`;
process.env.AITM_GH_TEST_DOUBLE_BIN = FAKE_GH_DIR;

function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'block-state-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  return statePath;
}

function nativeDeps({ existing = [], validateIssue, onComment } = {}) {
  return {
    ...(validateIssue ? { validateIssue } : {}),
    readNativeDependencies: async () => ({ blockedBy: existing, blocking: [] }),
    convergeBlockedBySet: async ({ operation, refs = [] }) => {
      const desired =
        operation === 'union'
          ? [...new Set([...existing, ...refs])].sort((left, right) => left - right)
          : [...existing];
      return {
        status: JSON.stringify(desired) === JSON.stringify(existing) ? 'idempotent' : 'updated',
        existing,
        desired,
        added: desired.filter((ref) => !existing.includes(ref)),
        removed: existing.filter((ref) => !desired.includes(ref)),
      };
    },
    reconcileDependencyDisposition: async () => ({ status: 'projected' }),
    postComment: async ({ body }) => onComment?.(body),
  };
}

test('block helpers parse, sort, deduplicate, and resolve the active fallback', () => {
  assert.deepEqual(parseByList('#7, #5, 5'), [5, 7]);
  assert.throws(() => parseByList('#7, nope'), /invalid issue number/);
  assert.equal(resolveTargetIssue({ rest: ['x', '#42'], activeIssue: '#9' }), 42);
  assert.equal(resolveTargetIssue({ rest: [], activeIssue: '#9' }), 9);
  assert.deepEqual(parseArgs(['#5', '--by', '7,9'], null), {
    target: 5,
    refs: [7, 9],
    byProvided: true,
  });
});

test('runBlock validates target, refs, config, self-reference, and existence', async () => {
  await assert.rejects(runBlock({ target: 0, refs: [7], cfg: CFG }), /no target issue/);
  await assert.rejects(runBlock({ target: 5, refs: [], cfg: CFG }), /--by is required/);
  await assert.rejects(runBlock({ target: 5, refs: [7], cfg: {} }), /cfg\.repo/);
  await assert.rejects(runBlock({ target: 5, refs: [5], cfg: CFG }), /itself/);
  await assert.rejects(
    runBlock({
      target: 5,
      refs: [7],
      cfg: CFG,
      deps: nativeDeps({ validateIssue: async () => ({ exists: false }) }),
    }),
    /does not exist/
  );
});

test('runBlock uses the default validator and accepts a closed issue', async () => {
  const comments = [];
  const result = await runBlock({
    target: 5,
    refs: [7],
    cfg: CFG,
    deps: nativeDeps({ onComment: (body) => comments.push(body) }),
  });
  assert.equal(result.status, 'added');
  assert.deepEqual(result.remaining, [7]);
  assert.equal(comments.length, 1);
});

test('runBlock returns an idempotent exact-set result', async () => {
  const result = await runBlock({
    target: 5,
    refs: [7],
    cfg: CFG,
    deps: nativeDeps({ existing: [7], validateIssue: async () => ({ exists: true }) }),
  });
  assert.equal(result.status, 'idempotent');
  assert.deepEqual(result.added, []);
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
    await verbBlock(ctx);
  } catch (error) {
    if (!/__exit_\d+__/.test(error.message)) throw error;
  } finally {
    process.exit = realExit;
    console.error = realError;
    console.log = realLog;
  }
  return code;
}

test('verbBlock covers usage, success, and core failure exits', async () => {
  assert.equal(
    await runVerb({ cfg: CFG, statePath: tmpState({ active: null }), rest: ['--by', '7'] }),
    2
  );
  assert.equal(await runVerb({ cfg: CFG, statePath: tmpState({ active: '#5' }), rest: ['#5'] }), 2);
  assert.equal(
    await runVerb({
      cfg: CFG,
      statePath: tmpState({ active: '#5' }),
      rest: ['#5', '--by', '7'],
      deps: nativeDeps({ validateIssue: async () => ({ exists: true }) }),
    }),
    null
  );
  assert.equal(
    await runVerb({
      cfg: {},
      statePath: tmpState({ active: '#5' }),
      rest: ['#5', '--by', '7'],
      deps: nativeDeps(),
    }),
    1
  );
});

console.log('coverage-block.test.mjs: defined');
