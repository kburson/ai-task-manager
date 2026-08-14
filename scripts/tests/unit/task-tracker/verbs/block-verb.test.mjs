// @story #309
// Tests for scripts/task-tracker/verbs/block.mjs and verbs/unblock.mjs —
// the user-facing block / unblock verbs (#285).
//
// Every gh side effect is mocked via injected `deps`. The runner core
// (`runBlock`, `runUnblock`) is exercised directly; the verb-wrapper exit
// codes are not — see the dispatcher tests for that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runBlock,
  parseArgs as parseBlockArgs,
  parseByList,
} from '../../../../task-tracker/verbs/block.mjs';
import {
  runUnblock,
  parseArgs as parseUnblockArgs,
} from '../../../../task-tracker/verbs/unblock.mjs';
import { parseBlockedBy } from '../../../../task-tracker/lib/blocked-marker.mjs';

const CFG = { repo: 'kburson/ai-task-manager' };

// Simple in-memory issue store backed by a body string and a label set.
function makeFakeIssue({ body = '', labels = [] } = {}) {
  return {
    body,
    labels: new Set(labels),
    comments: [],
    labelCalls: 0,
  };
}

function makeDeps({
  store,
  openBlockers = new Set(),
  closedBlockers = new Set(),
  writeFieldValue,
} = {}) {
  const d = {
    validateBlocker: async ({ blockerNumber }) => {
      if (openBlockers.has(blockerNumber)) return { exists: true, state: 'OPEN' };
      if (closedBlockers.has(blockerNumber)) return { exists: true, state: 'CLOSED' };
      return { exists: false, state: null };
    },
    // #295 — verbs write through `mutateIssueBody({mutate})`; closure runs
    // on FRESH base. The fake feeds the live store body in and stamps the
    // result back so the audit-comment + label logic sees what landed.
    mutateIssueBody: async ({ mutate }) => {
      const before = store.body;
      const next = mutate(before);
      if (next === before) return { status: 'no-op' };
      store.body = next;
      return { status: 'ok' };
    },
    runLabel: async ({ args }) => {
      store.labelCalls += 1;
      // args = ['issue','edit',<n>,'--add-label'|'--remove-label','BLOCKED']
      const op = args[3];
      const label = args[4];
      if (op === '--add-label') store.labels.add(label);
      if (op === '--remove-label') store.labels.delete(label);
    },
    postComment: async ({ body }) => {
      store.comments.push(body);
    },
  };
  if (writeFieldValue) d.writeFieldValue = writeFieldValue;
  return d;
}

// ── parseByList ──────────────────────────────────────────────────────────────

test('parseByList: parses single int', () => {
  assert.deepEqual(parseByList('5'), [5]);
  assert.deepEqual(parseByList('#5'), [5]);
});

test('parseByList: parses comma-list, dedupes, sorts', () => {
  assert.deepEqual(parseByList('7, 5, #5'), [5, 7]);
});

test('parseByList: drops non-positive / non-int / empty', () => {
  assert.deepEqual(parseByList('5, -3, 0, abc, , 7'), [5, 7]);
  assert.deepEqual(parseByList(''), []);
  assert.deepEqual(parseByList(null), []);
});

// ── parseArgs (block) ────────────────────────────────────────────────────────

test('block parseArgs: --by flag with positional target', () => {
  const { target, refs } = parseBlockArgs(['#100', '--by', '5,7'], null);
  assert.equal(target, 100);
  assert.deepEqual(refs, [5, 7]);
});

test('block parseArgs: falls back to active issue when no positional', () => {
  const { target, refs } = parseBlockArgs(['--by', '5'], '#200');
  assert.equal(target, 200);
  assert.deepEqual(refs, [5]);
});

test('block parseArgs: missing --by → empty refs', () => {
  const { target, refs, byProvided } = parseBlockArgs(['#100'], null);
  assert.equal(target, 100);
  assert.deepEqual(refs, []);
  assert.equal(byProvided, false);
});

// ── runBlock ─────────────────────────────────────────────────────────────────

test('runBlock: adds single ref to issue with no marker', async () => {
  const store = makeFakeIssue({ body: '## Scope\n\nbody.\n' });
  const deps = makeDeps({ store, openBlockers: new Set([5]) });
  const r = await runBlock({ target: 100, refs: [5], cfg: CFG, deps });
  assert.equal(r.status, 'added');
  assert.deepEqual(parseBlockedBy(store.body), [5]);
  assert.equal(store.labels.has('BLOCKED'), true);
  assert.equal(store.labelCalls, 1);
  assert.deepEqual(store.comments, ['### 🔒 Blocked by #5 added']);
});

test('runBlock: multi-ref add → sorted+deduped marker, one comment per ref', async () => {
  const store = makeFakeIssue({ body: 'x\n' });
  const deps = makeDeps({ store, openBlockers: new Set([5, 7]) });
  const r = await runBlock({ target: 100, refs: [7, 5, 5], cfg: CFG, deps });
  assert.equal(r.status, 'added');
  assert.deepEqual(parseBlockedBy(store.body), [5, 7]);
  assert.deepEqual(store.comments, ['### 🔒 Blocked by #5 added', '### 🔒 Blocked by #7 added']);
});

test('runBlock: idempotent when refs already present', async () => {
  const store = makeFakeIssue({
    body: 'x\n\n<!-- aitm-blocked-by: #5 -->\n',
    labels: ['BLOCKED'],
  });
  const deps = makeDeps({ store, openBlockers: new Set([5]) });
  const r = await runBlock({ target: 100, refs: [5], cfg: CFG, deps });
  assert.equal(r.status, 'idempotent');
  assert.equal(store.labelCalls, 0);
  assert.deepEqual(store.comments, []);
});

// ── partial-failure + repair lanes (#847) ────────────────────────────────────
// Before this fix, `writeBlockedByField` was unreachable on the idempotent
// no-op branch, so a field left unset by a prior failure could never be
// repaired by re-running `aitm block <N> --by <M>`, and a field-mirror
// failure on the added path was swallowed and still reported as a `✓`.

test('runBlock: partial-failure lane — marker/label write succeeds, field mirror throws → no ✓ line, status marks field unwritten', async () => {
  const store = makeFakeIssue({ body: '## Scope\n\nbody.\n' });
  const cfgWithField = { repo: CFG.repo, projectId: 'P', fieldBlockedBy: 'F' };
  const deps = makeDeps({
    store,
    openBlockers: new Set([5]),
    writeFieldValue: async () => {
      throw new Error('graphql boom');
    },
  });
  const logs = [];
  const errs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (msg) => logs.push(msg);
  console.error = (msg) => errs.push(msg);
  let r;
  try {
    r = await runBlock({ target: 100, refs: [5], cfg: cfgWithField, deps });
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  assert.equal(r.status, 'added');
  assert.equal(r.fieldMirrorOk, false);
  // marker + label + audit comment still land — field mirror is best-effort.
  assert.deepEqual(parseBlockedBy(store.body), [5]);
  assert.equal(store.labels.has('BLOCKED'), true);
  assert.deepEqual(store.comments, ['### 🔒 Blocked by #5 added']);
  // the unconditional ✓ success line must NOT print over a partial failure.
  assert.ok(!logs.some((l) => /^\[task-tracker\] ✓/.test(l)));
  assert.ok(errs.some((l) => /Blocked By field mirror failed/.test(l)));
});

test('runBlock: repair lane — marker already correct (idempotent), field write is invoked and repairs the field', async () => {
  const store = makeFakeIssue({
    body: 'x\n\n<!-- aitm-blocked-by: #5 -->\n',
    labels: ['BLOCKED'],
  });
  const cfgWithField = { repo: CFG.repo, projectId: 'P', fieldBlockedBy: 'F' };
  let fieldCalls = 0;
  let capturedRefs = null;
  const deps = makeDeps({
    store,
    openBlockers: new Set([5]),
    writeFieldValue: async ({ value }) => {
      fieldCalls += 1;
      capturedRefs = value;
      return true;
    },
  });
  const r = await runBlock({ target: 100, refs: [5], cfg: cfgWithField, deps });
  assert.equal(r.status, 'idempotent');
  assert.equal(r.fieldMirrorOk, true);
  // the previously-unreachable line: writeBlockedByField IS invoked on the
  // no-op branch, repairing a field a prior partial failure left unset.
  assert.equal(fieldCalls, 1);
  assert.equal(capturedRefs, '#5');
  // idempotent contract preserved — no redundant label/comment churn.
  assert.equal(store.labelCalls, 0);
  assert.deepEqual(store.comments, []);
});

test('runBlock: refuses non-existent blocker; no body write', async () => {
  const store = makeFakeIssue({ body: 'x\n' });
  const deps = makeDeps({ store, openBlockers: new Set() });
  await assert.rejects(
    runBlock({ target: 100, refs: [999], cfg: CFG, deps }),
    /blocker #999 does not exist/
  );
  assert.equal(store.body, 'x\n');
  assert.equal(store.labelCalls, 0);
});

test('runBlock: refuses closed blocker; no body write', async () => {
  const store = makeFakeIssue({ body: 'x\n' });
  const deps = makeDeps({ store, closedBlockers: new Set([5]) });
  await assert.rejects(
    runBlock({ target: 100, refs: [5], cfg: CFG, deps }),
    /blocker #5 is closed/
  );
  assert.equal(store.body, 'x\n');
  assert.equal(store.labelCalls, 0);
});

test('runBlock: refuses self-block', async () => {
  const store = makeFakeIssue({ body: 'x\n' });
  const deps = makeDeps({ store, openBlockers: new Set([100]) });
  await assert.rejects(
    runBlock({ target: 100, refs: [100], cfg: CFG, deps }),
    /cannot block #100 on itself/
  );
});

test('runBlock: requires target', async () => {
  await assert.rejects(runBlock({ target: 0, refs: [5], cfg: CFG }), /no target issue/);
});

test('runBlock: requires refs', async () => {
  await assert.rejects(runBlock({ target: 100, refs: [], cfg: CFG }), /--by is required/);
});

// ── runUnblock ───────────────────────────────────────────────────────────────

test('unblock parseArgs: --by drops one ref', () => {
  const { target, refs, byProvided } = parseUnblockArgs(['#100', '--by', '5'], null);
  assert.equal(target, 100);
  assert.deepEqual(refs, [5]);
  assert.equal(byProvided, true);
});

test('unblock parseArgs: no --by → refs is null (drop all)', () => {
  const { target, refs, byProvided } = parseUnblockArgs(['#100'], null);
  assert.equal(target, 100);
  assert.equal(refs, null);
  assert.equal(byProvided, false);
});

test('runUnblock --by: removes single ref, label stays when others remain', async () => {
  const store = makeFakeIssue({
    body: 'x\n\n<!-- aitm-blocked-by: #5, #7 -->\n',
    labels: ['BLOCKED'],
  });
  const deps = makeDeps({ store });
  const r = await runUnblock({ target: 100, refs: [5], cfg: CFG, deps });
  assert.equal(r.status, 'removed');
  assert.equal(r.cleared, false);
  assert.deepEqual(parseBlockedBy(store.body), [7]);
  assert.equal(store.labels.has('BLOCKED'), true);
  assert.equal(store.labelCalls, 0);
  assert.deepEqual(store.comments, ['### 🔓 Blocked by #5 cleared']);
});

test('runUnblock all-refs: drops everything, removes label', async () => {
  const store = makeFakeIssue({
    body: 'x\n\n<!-- aitm-blocked-by: #5, #7 -->\n',
    labels: ['BLOCKED'],
  });
  const deps = makeDeps({ store });
  const r = await runUnblock({ target: 100, refs: null, cfg: CFG, deps });
  assert.equal(r.status, 'removed');
  assert.equal(r.cleared, true);
  assert.deepEqual(parseBlockedBy(store.body), []);
  assert.equal(store.labels.has('BLOCKED'), false);
  assert.equal(store.labelCalls, 1);
  assert.deepEqual(store.comments, ['### 🔓 All blockers cleared']);
});

test('runUnblock: idempotent when no marker present', async () => {
  const store = makeFakeIssue({ body: 'x\n' });
  const deps = makeDeps({ store });
  const r = await runUnblock({ target: 100, refs: null, cfg: CFG, deps });
  assert.equal(r.status, 'idempotent');
  assert.deepEqual(store.comments, []);
  assert.equal(store.labelCalls, 0);
});

test('runUnblock --by: idempotent when requested ref absent', async () => {
  const store = makeFakeIssue({
    body: 'x\n\n<!-- aitm-blocked-by: #5 -->\n',
    labels: ['BLOCKED'],
  });
  const deps = makeDeps({ store });
  const r = await runUnblock({ target: 100, refs: [99], cfg: CFG, deps });
  assert.equal(r.status, 'idempotent');
  assert.deepEqual(parseBlockedBy(store.body), [5]);
  assert.equal(store.labels.has('BLOCKED'), true);
});

test('runUnblock --by: clears last ref → drops label', async () => {
  const store = makeFakeIssue({
    body: 'x\n\n<!-- aitm-blocked-by: #5 -->\n',
    labels: ['BLOCKED'],
  });
  const deps = makeDeps({ store });
  const r = await runUnblock({ target: 100, refs: [5], cfg: CFG, deps });
  assert.equal(r.cleared, true);
  assert.equal(store.labels.has('BLOCKED'), false);
});
