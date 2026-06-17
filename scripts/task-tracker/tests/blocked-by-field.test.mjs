// @story #309
// Tests for scripts/task-tracker/lib/blocked-by-field.mjs (#287).
//
// Covers the pure formatter and the writer's branches (no-config no-op,
// happy path, deps-injected mutation arg-shape).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeBlockedByField, formatBlockedByValue } from '../lib/blocked-by-field.mjs';

const BASE_CFG = {
  repo: 'owner/name',
  projectId: 'P_kw1',
  fieldBlockedBy: 'PVTF_blockedBy',
};

// ── formatBlockedByValue ─────────────────────────────────────────────────────

test('formatBlockedByValue: empty list → empty string', () => {
  assert.equal(formatBlockedByValue([]), '');
  assert.equal(formatBlockedByValue(null), '');
  assert.equal(formatBlockedByValue(undefined), '');
});

test('formatBlockedByValue: single ref', () => {
  assert.equal(formatBlockedByValue([5]), '#5');
});

test('formatBlockedByValue: multi-ref sorted and deduped', () => {
  assert.equal(formatBlockedByValue([11, 3, 7, 3]), '#3, #7, #11');
});

test('formatBlockedByValue: drops non-positive / non-integer entries', () => {
  assert.equal(formatBlockedByValue([5, 0, -1, 3.5, '7', null]), '#5');
});

// ── writeBlockedByField: no-op branches ──────────────────────────────────────

test('writeBlockedByField: no fieldBlockedBy → skipped no-field-id', async () => {
  const cfg = { ...BASE_CFG, fieldBlockedBy: '' };
  let called = 0;
  const r = await writeBlockedByField({
    issueNumber: 100,
    refs: [5],
    cfg,
    deps: {
      writeFieldValue: async () => {
        called++;
        return true;
      },
    },
  });
  assert.deepEqual(r, { skipped: 'no-field-id' });
  assert.equal(called, 0, 'writer must not run when field id absent');
});

test('writeBlockedByField: missing cfg → skipped no-field-id', async () => {
  const r = await writeBlockedByField({ issueNumber: 100, refs: [5] });
  assert.deepEqual(r, { skipped: 'no-field-id' });
});

test('writeBlockedByField: bad issueNumber throws', async () => {
  await assert.rejects(
    () =>
      writeBlockedByField({
        issueNumber: 0,
        refs: [5],
        cfg: BASE_CFG,
        deps: { writeFieldValue: async () => true },
      }),
    /positive integer/
  );
});

// ── writeBlockedByField: happy path ──────────────────────────────────────────

test('writeBlockedByField: writes single ref via injected deps', async () => {
  const calls = [];
  const r = await writeBlockedByField({
    issueNumber: 100,
    refs: [5],
    cfg: BASE_CFG,
    deps: {
      writeFieldValue: async (args) => {
        calls.push(args);
        return true;
      },
    },
  });
  assert.deepEqual(r, { ok: true, value: '#5' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].issueNumber, 100);
  assert.equal(calls[0].value, '#5');
  assert.equal(calls[0].cfg.fieldBlockedBy, 'PVTF_blockedBy');
});

test('writeBlockedByField: multi-ref renders sorted comma-joined', async () => {
  let captured;
  const r = await writeBlockedByField({
    issueNumber: 100,
    refs: [11, 3, 7],
    cfg: BASE_CFG,
    deps: {
      writeFieldValue: async (args) => {
        captured = args.value;
        return true;
      },
    },
  });
  assert.deepEqual(r, { ok: true, value: '#3, #7, #11' });
  assert.equal(captured, '#3, #7, #11');
});

test('writeBlockedByField: empty ref list writes empty string', async () => {
  let captured;
  const r = await writeBlockedByField({
    issueNumber: 100,
    refs: [],
    cfg: BASE_CFG,
    deps: {
      writeFieldValue: async (args) => {
        captured = args.value;
        return true;
      },
    },
  });
  assert.deepEqual(r, { ok: true, value: '' });
  assert.equal(captured, '');
});

test('writeBlockedByField: writer returning false → skipped no-item', async () => {
  const r = await writeBlockedByField({
    issueNumber: 100,
    refs: [5],
    cfg: BASE_CFG,
    deps: { writeFieldValue: async () => false },
  });
  assert.deepEqual(r, { skipped: 'no-item' });
});

test('writeBlockedByField: deps writer receives (cfg, issueNumber, value) shape', async () => {
  let shape;
  await writeBlockedByField({
    issueNumber: 42,
    refs: [9],
    cfg: BASE_CFG,
    deps: {
      writeFieldValue: async (args) => {
        shape = Object.keys(args).sort();
        return true;
      },
    },
  });
  assert.deepEqual(shape, ['cfg', 'issueNumber', 'value']);
});
