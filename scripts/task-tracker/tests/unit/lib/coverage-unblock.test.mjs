#!/usr/bin/env node
// @story #624
// Coverage for verbs/unblock.mjs. Drives the pure `parseArgs` (which reuses
// block.mjs's parseByList/resolveTargetIssue), the dependency-injected core
// `runUnblock` across every branch (target/cfg guards, no-marker / no-match
// idempotency, partial-drop vs full-clear label drop, best-effort field-mirror
// catch, per-ref vs all-cleared audit comments), and the `verbUnblock` CLI
// wrapper via its optional ctx.deps seam and a process.exit trap.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { parseArgs, runUnblock, verbUnblock } from '../../../verbs/unblock.mjs';

const CFG = { repo: 'o/r' };

// A state file for the wrapper's loadState(statePath).
function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'unblock-state-'));
  const p = join(dir, 'state.json');
  writeFileSync(p, JSON.stringify(state));
  return p;
}

// Build a deps surface whose mutate returns a body carrying `marker` refs.
// `mutateRes` overrides the write result status (e.g. 'no-op').
function deps({ markerRefs = [7, 9], mutateRes, onComment, writeFieldValue, onLabel } = {}) {
  const body = markerRefs.length
    ? `## Body\n<!-- aitm-blocked-by: ${markerRefs.map((n) => `#${n}`).join(', ')} -->\n`
    : '## Body\n';
  const d = {
    mutateIssueBody: async ({ mutate }) => {
      const next = mutate(body);
      return mutateRes || (next === body ? { status: 'no-op' } : { status: 'updated' });
    },
    runLabel: async ({ args }) => {
      if (onLabel) onLabel(args);
    },
    postComment: async ({ body: b }) => {
      if (onComment) onComment(b);
    },
  };
  if (writeFieldValue) d.writeFieldValue = writeFieldValue;
  return d;
}

// ── pure parseArgs ───────────────────────────────────────────────────────────

test('parseArgs: --by → refs list + byProvided; no --by → refs null', () => {
  assert.deepEqual(parseArgs(['#5', '--by', '7,9'], null), {
    target: 5,
    refs: [7, 9],
    byProvided: true,
  });
  assert.deepEqual(parseArgs(['#5'], null), { target: 5, refs: null, byProvided: false });
  assert.deepEqual(parseArgs(['--by', ''], '#3'), { target: 3, refs: [], byProvided: true });
});

// ── runUnblock guards ────────────────────────────────────────────────────────

test('runUnblock: invalid target → throws', async () => {
  await assert.rejects(() => runUnblock({ target: 0, refs: null, cfg: CFG }), /no target issue/);
});

test('runUnblock: missing cfg.repo → throws', async () => {
  await assert.rejects(
    () => runUnblock({ target: 5, refs: null, cfg: {} }),
    /cfg\.repo is required/
  );
});

// ── idempotent paths ─────────────────────────────────────────────────────────

test('runUnblock: no marker present → idempotent', async () => {
  const r = await runUnblock({ target: 5, refs: null, cfg: CFG, deps: deps({ markerRefs: [] }) });
  assert.equal(r.status, 'idempotent');
  assert.deepEqual(r.removed, []);
  assert.equal(r.cleared, false);
});

test('runUnblock: --by ref not in marker → idempotent (no match)', async () => {
  const r = await runUnblock({ target: 5, refs: [42], cfg: CFG, deps: deps({ markerRefs: [7] }) });
  assert.equal(r.status, 'idempotent');
});

test('runUnblock: write no-op → idempotent', async () => {
  const r = await runUnblock({
    target: 5,
    refs: null,
    cfg: CFG,
    deps: deps({ markerRefs: [7], mutateRes: { status: 'no-op' } }),
  });
  assert.equal(r.status, 'idempotent');
});

// ── removal paths ────────────────────────────────────────────────────────────

test('runUnblock: --by partial drop → remaining keeps label, per-ref comment', async () => {
  const comments = [];
  const labels = [];
  const r = await runUnblock({
    target: 5,
    refs: [7],
    cfg: CFG,
    deps: deps({
      markerRefs: [7, 9],
      onComment: (b) => comments.push(b),
      onLabel: (a) => labels.push(a),
    }),
  });
  assert.equal(r.status, 'removed');
  assert.deepEqual(r.removed, [7]);
  assert.equal(r.cleared, false);
  assert.equal(labels.length, 0); // not fully cleared → label stays
  assert.equal(comments.length, 1);
  assert.match(comments[0], /Blocked by #7 cleared/);
});

test('runUnblock: drop ALL (refs null) → cleared, label dropped, summary comment', async () => {
  const comments = [];
  const labels = [];
  const r = await runUnblock({
    target: 5,
    refs: null,
    cfg: CFG,
    deps: deps({
      markerRefs: [7, 9],
      onComment: (b) => comments.push(b),
      onLabel: (a) => labels.push(a),
    }),
  });
  assert.equal(r.status, 'removed');
  assert.deepEqual(r.removed, [7, 9]);
  assert.equal(r.cleared, true);
  assert.equal(labels.length, 1); // fully cleared → label removed
  assert.equal(comments.length, 1);
  assert.match(comments[0], /All blockers cleared/);
});

test('runUnblock: --by drops the only ref → cleared + per-ref comment', async () => {
  const comments = [];
  const r = await runUnblock({
    target: 5,
    refs: [7],
    cfg: CFG,
    deps: deps({ markerRefs: [7], onComment: (b) => comments.push(b) }),
  });
  assert.equal(r.cleared, true);
  assert.match(comments[0], /Blocked by #7 cleared/);
});

test('runUnblock: field-mirror failure does not roll back body/label, but is reported (#847)', async () => {
  const comments = [];
  const r = await runUnblock({
    target: 5,
    refs: null,
    cfg: { repo: 'o/r', projectId: 'P', fieldBlockedBy: 'F' },
    deps: deps({
      markerRefs: [7],
      onComment: (b) => comments.push(b),
      writeFieldValue: async () => {
        throw new Error('graphql boom');
      },
    }),
  });
  assert.equal(r.status, 'removed');
  assert.equal(r.fieldMirrorOk, false);
  assert.equal(comments.length, 1);
});

// ── partial-failure + repair lanes (#847) ────────────────────────────────────
// `writeBlockedByField` used to be unreachable on the no-op/idempotent branch,
// so a field left unset by a prior failure could never be repaired by simply
// re-running the verb. These lanes drive that scenario directly.

test('runUnblock: partial-failure lane — marker/label write succeeds, field mirror throws → no ✓ line, status marks field unwritten', async () => {
  const logs = [];
  const errs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (msg) => logs.push(msg);
  console.error = (msg) => errs.push(msg);
  let r;
  try {
    r = await runUnblock({
      target: 5,
      refs: null,
      cfg: { repo: 'o/r', projectId: 'P', fieldBlockedBy: 'F' },
      deps: deps({
        markerRefs: [7, 9],
        writeFieldValue: async () => {
          throw new Error('graphql boom');
        },
      }),
    });
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  assert.equal(r.status, 'removed');
  assert.equal(r.cleared, true);
  assert.equal(r.fieldMirrorOk, false);
  assert.ok(!logs.some((l) => /^\[task-tracker\] ✓/.test(l)));
  assert.ok(errs.some((l) => /Blocked By field mirror failed/.test(l)));
});

test('runUnblock: repair lane — marker already correct (no-op), field write invoked and succeeds', async () => {
  let fieldCalls = 0;
  let capturedRefs = null;
  const r = await runUnblock({
    target: 5,
    refs: [42], // not present in marker → no-op body write (idempotent)
    cfg: { repo: 'o/r', projectId: 'P', fieldBlockedBy: 'F' },
    deps: deps({
      markerRefs: [7],
      writeFieldValue: async ({ value }) => {
        fieldCalls += 1;
        capturedRefs = value;
        return true;
      },
    }),
  });
  assert.equal(r.status, 'idempotent');
  assert.equal(r.fieldMirrorOk, true);
  assert.equal(fieldCalls, 1);
  assert.equal(capturedRefs, '#7');
});

// ── verbUnblock wrapper (ctx.deps seam + process.exit trap) ───────────────────

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
    await verbUnblock(ctx);
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

test('verbUnblock: no target → exit 2', async () => {
  const statePath = tmpState({ active: null });
  const code = await runVerb({ cfg: CFG, statePath, rest: ['--by', '7'] });
  assert.equal(code, 2);
});

test('verbUnblock: --by with empty list → exit 2', async () => {
  const statePath = tmpState({ active: '#5' });
  const code = await runVerb({ cfg: CFG, statePath, rest: ['#5', '--by', ''] });
  assert.equal(code, 2);
});

test('verbUnblock: success (drop all) → no exit', async () => {
  const statePath = tmpState({ active: '#5' });
  const code = await runVerb({
    cfg: CFG,
    statePath,
    rest: ['#5'],
    deps: deps({ markerRefs: [7] }),
  });
  assert.equal(code, null);
});

test('verbUnblock: runUnblock throws → exit 1', async () => {
  const statePath = tmpState({ active: '#5' });
  const code = await runVerb({
    cfg: {}, // missing repo → runUnblock throws
    statePath,
    rest: ['#5'],
    deps: deps({ markerRefs: [7] }),
  });
  assert.equal(code, 1);
});

console.log('coverage-unblock.test.mjs: defined');
