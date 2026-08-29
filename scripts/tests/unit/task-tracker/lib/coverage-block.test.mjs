#!/usr/bin/env node
// @story #623
// Coverage for verbs/block.mjs. Drives the pure helpers (parseByList /
// resolveTargetIssue / parseArgs), the dependency-injected core `runBlock`
// across every branch (arg/cfg guards, self-block, missing/closed blocker,
// idempotent no-op, added + audit-comment path, best-effort field-mirror
// catch), and the `verbBlock` CLI wrapper via its optional ctx.deps seam and a
// process.exit trap. One test runs the real `defaultValidateBlocker` through a
// fake `gh` on PATH so the default validator is exercised offline.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  parseByList,
  resolveTargetIssue,
  parseArgs,
  runBlock,
  verbBlock,
} from '../../../../task-tracker/verbs/block.mjs';

const CFG = { repo: 'o/r' };

// A fake `gh` on PATH so the default validator (`gh issue view <n> --json
// number,state`) runs offline. It answers every issue as OPEN.
const FAKE_GH_DIR = mkdtempSync(join(projectScratchDir('test'), 'block-gh-'));
writeFileSync(
  join(FAKE_GH_DIR, 'gh'),
  [
    '#!/usr/bin/env node',
    'const a = process.argv.slice(2);',
    "const n = a.find((x) => /^\\d+$/.test(x)) || '0';",
    "process.stdout.write(JSON.stringify({ number: Number(n), state: 'OPEN' }));",
  ].join('\n'),
  { mode: 0o755 }
);
chmodSync(join(FAKE_GH_DIR, 'gh'), 0o755);
process.env.PATH = `${FAKE_GH_DIR}:${process.env.PATH}`;
process.env.AITM_GH_TEST_DOUBLE_BIN = FAKE_GH_DIR;

// A state file for the wrapper's loadState(statePath).
function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'block-state-'));
  const p = join(dir, 'state.json');
  writeFileSync(p, JSON.stringify(state));
  return p;
}

// Inject a clean, no-op-friendly side-effect surface for runBlock.
function deps({ validate, mutateRes = { status: 'updated' }, onComment, writeFieldValue } = {}) {
  const d = {
    validateBlocker: validate || (async () => ({ exists: true, state: 'OPEN' })),
    mutateIssueBody: async ({ mutate }) => {
      mutate('## Body\n');
      return mutateRes;
    },
    runLabel: async () => {},
    postComment: async ({ body }) => {
      if (onComment) onComment(body);
    },
  };
  if (writeFieldValue) d.writeFieldValue = writeFieldValue;
  return d;
}

// ── pure helpers ─────────────────────────────────────────────────────────────

test('parseByList: null/garbage → [], dedup + sort', () => {
  assert.deepEqual(parseByList(null), []);
  assert.deepEqual(parseByList('nope'), []);
  assert.deepEqual(parseByList('#7, #5, 5'), [5, 7]);
  assert.deepEqual(parseByList('3,-1,0,2'), [2, 3]);
});

test('resolveTargetIssue: positional wins, active fallback, null', () => {
  assert.equal(resolveTargetIssue({ rest: ['x', '#42'], activeIssue: '#9' }), 42);
  assert.equal(resolveTargetIssue({ rest: ['x'], activeIssue: '#9' }), 9);
  assert.equal(resolveTargetIssue({ rest: [], activeIssue: null }), null);
});

test('parseArgs: --by parsing and byProvided flag', () => {
  assert.deepEqual(parseArgs(['#5', '--by', '7,9'], null), {
    target: 5,
    refs: [7, 9],
    byProvided: true,
  });
  assert.deepEqual(parseArgs(['--by', ''], '#3'), { target: 3, refs: [], byProvided: true });
  assert.equal(parseArgs(['#5'], null).byProvided, false);
});

// ── runBlock guards ──────────────────────────────────────────────────────────

test('runBlock: invalid target → throws', async () => {
  await assert.rejects(() => runBlock({ target: 0, refs: [5], cfg: CFG }), /no target issue/);
});

test('runBlock: empty refs → throws', async () => {
  await assert.rejects(() => runBlock({ target: 5, refs: [], cfg: CFG }), /--by is required/);
});

test('runBlock: missing cfg.repo → throws', async () => {
  await assert.rejects(() => runBlock({ target: 5, refs: [7], cfg: {} }), /cfg\.repo is required/);
});

test('runBlock: self-block → throws', async () => {
  await assert.rejects(
    () => runBlock({ target: 5, refs: [5], cfg: CFG, deps: deps() }),
    /cannot block #5 on itself/
  );
});

test('runBlock: non-existent blocker → throws', async () => {
  await assert.rejects(
    () =>
      runBlock({
        target: 5,
        refs: [7],
        cfg: CFG,
        deps: deps({ validate: async () => ({ exists: false, state: null }) }),
      }),
    /blocker #7 does not exist/
  );
});

test('runBlock: closed blocker → throws', async () => {
  await assert.rejects(
    () =>
      runBlock({
        target: 5,
        refs: [7],
        cfg: CFG,
        deps: deps({ validate: async () => ({ exists: true, state: 'CLOSED' }) }),
      }),
    /is closed \(state=CLOSED\)/
  );
});

// ── runBlock outcomes ────────────────────────────────────────────────────────

test('runBlock: write no-op → idempotent', async () => {
  const r = await runBlock({
    target: 5,
    refs: [7],
    cfg: CFG,
    deps: deps({ mutateRes: { status: 'no-op' } }),
  });
  assert.equal(r.status, 'idempotent');
  assert.deepEqual(r.refs, [7]);
});

test('runBlock: added → label + audit comment per new ref', async () => {
  const comments = [];
  const r = await runBlock({
    target: 5,
    refs: [9, 7, 7],
    cfg: CFG,
    deps: deps({ onComment: (b) => comments.push(b) }),
  });
  assert.equal(r.status, 'added');
  assert.deepEqual(r.refs, [7, 9]);
  assert.equal(comments.length, 2);
  assert.match(comments[0], /Blocked by #7 added/);
});

test('runBlock: field-mirror failure does not roll back body/label, but is reported (#847)', async () => {
  const comments = [];
  const r = await runBlock({
    target: 5,
    refs: [7],
    cfg: { repo: 'o/r', projectId: 'P', fieldBlockedBy: 'F' },
    deps: deps({
      onComment: (b) => comments.push(b),
      writeFieldValue: async () => {
        throw new Error('graphql boom');
      },
    }),
  });
  assert.equal(r.status, 'added');
  assert.equal(r.fieldMirrorOk, false);
  assert.equal(comments.length, 1);
});

test('runBlock: default validator via fake gh → added', async () => {
  // No validateBlocker injected → defaultValidateBlocker runs through fake gh.
  const r = await runBlock({
    target: 5,
    refs: [7],
    cfg: CFG,
    deps: {
      mutateIssueBody: async ({ mutate }) => {
        mutate('## Body\n');
        return { status: 'updated' };
      },
      runLabel: async () => {},
      postComment: async () => {},
    },
  });
  assert.equal(r.status, 'added');
});

// ── verbBlock wrapper (ctx.deps seam + process.exit trap) ─────────────────────

async function runVerb(ctx) {
  const realExit = process.exit;
  const realErr = process.stderr.write.bind(process.stderr);
  const ol = console.log;
  const oe = console.error;
  let code = null;
  process.exit = (c) => {
    code = c ?? 0;
    throw new Error(`__exit_${code}__`);
  };
  process.stderr.write = () => true;
  console.log = () => {};
  console.error = () => {};
  try {
    await verbBlock(ctx);
  } catch (e) {
    if (!/__exit_\d+__/.test(e.message)) throw e;
  } finally {
    process.exit = realExit;
    process.stderr.write = realErr;
    console.log = ol;
    console.error = oe;
  }
  return code;
}

test('verbBlock: no target → exit 2', async () => {
  const statePath = tmpState({ active: null });
  const code = await runVerb({ cfg: CFG, statePath, rest: ['--by', '7'] });
  assert.equal(code, 2);
});

test('verbBlock: no refs → exit 2', async () => {
  const statePath = tmpState({ active: '#5' });
  const code = await runVerb({ cfg: CFG, statePath, rest: ['#5'] });
  assert.equal(code, 2);
});

test('verbBlock: success path → no exit', async () => {
  const statePath = tmpState({ active: '#5' });
  const code = await runVerb({ cfg: CFG, statePath, rest: ['#5', '--by', '7'], deps: deps() });
  assert.equal(code, null);
});

test('verbBlock: runBlock throws → exit 1', async () => {
  const statePath = tmpState({ active: '#5' });
  const code = await runVerb({
    cfg: CFG,
    statePath,
    rest: ['#5', '--by', '7'],
    deps: deps({ validate: async () => ({ exists: false, state: null }) }),
  });
  assert.equal(code, 1);
});

console.log('coverage-block.test.mjs: defined');
