#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { rmSync, readFileSync, mkdirSync } from 'node:fs';
import {
  createActivatedUnitRuntimeRoot,
  withUnitRuntimeRoot,
} from '../../../helpers/unit-runtime-root.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import path from 'node:path';
import { enqueue, drain, peek, drainAndDiscard } from '../../../../task-tracker/queue.mjs';

const row = (description) =>
  `| 2026-10-02 12:00:00 -05:00 | pause:other |  |  |  | 0 | ${description} |`;
await withUnitRuntimeRoot(async () => {
  const tmp = createActivatedUnitRuntimeRoot('tt-q-');
  const qPath = path.join(tmp, '.ai-task-manager/runtime/store/state/task-tracker-queue.json');

  // Test 1: empty queue
  assert.deepEqual(peek(qPath), []);

  // Test 2: enqueue two events
  enqueue({ issue: '#107', kind: 'timing', row: row('A') }, qPath);
  enqueue({ issue: '#107', kind: 'timing', row: row('B') }, qPath);
  assert.equal(peek(qPath).length, 2);

  // Test 3: drain invokes handler for each, clears on success
  const delivered = [];
  const ok = await drain(async (evt) => {
    delivered.push(parseTimingRow(evt.row).description);
  }, qPath);
  assert.equal(ok, true);
  assert.deepEqual(delivered, ['A', 'B']);
  assert.deepEqual(peek(qPath), []);

  // Test 4: drain continues past handler failures, keeps only failed events
  enqueue({ issue: '#107', kind: 'timing', row: row('C') }, qPath);
  enqueue({ issue: '#107', kind: 'timing', row: row('D') }, qPath);
  enqueue({ issue: '#107', kind: 'timing', row: row('E') }, qPath);
  const deliveredAfterFailure = [];
  const ok2 = await drain(async (evt) => {
    if (parseTimingRow(evt.row).description === 'D') throw new Error('net down');
    deliveredAfterFailure.push(parseTimingRow(evt.row).description);
  }, qPath);
  assert.equal(ok2, false);
  const remaining = peek(qPath);
  assert.equal(remaining.length, 1);
  assert.equal(parseTimingRow(remaining[0].row).description, 'D');
  assert.deepEqual(deliveredAfterFailure, ['C', 'E']);

  rmSync(tmp, { recursive: true });

  // Test 5: if write to tmp throws, the original queue file is preserved.
  // Force writeFileSync(queue.json.tmp, …) to fail by pre-creating queue.json.tmp
  // as a directory — EISDIR. Without atomic write, the original queue would be
  // clobbered; with atomic write, the rename never runs and the original survives.
  const atomicTmp = createActivatedUnitRuntimeRoot('tt-q-atomic-');
  const aPath = path.join(
    atomicTmp,
    '.ai-task-manager/runtime/store/state/task-tracker-queue.json'
  );
  enqueue({ kind: 'timing', issue: '#107', row: row('PRESERVE_ME') }, aPath);
  const originalBytes = readFileSync(aPath, 'utf8');
  mkdirSync(aPath + '.tmp'); // blocks writeFileSync to the tmp path

  let threw = false;
  try {
    enqueue({ kind: 'timing', issue: '#107', row: row('SHOULD_NOT_LAND') }, aPath);
  } catch {
    threw = true;
  }
  assert.equal(threw, true, 'enqueue must propagate write failure');
  assert.equal(
    readFileSync(aPath, 'utf8'),
    originalBytes,
    'original queue bytes survive failed publication'
  );
  rmSync(atomicTmp, { recursive: true });

  // drainAndDiscard: all matches succeed → delivered counts, queue untouched non-matches
  {
    const t = createActivatedUnitRuntimeRoot('tt-q-dad-a-');
    const p = path.join(t, '.ai-task-manager/runtime/store/state/task-tracker-queue.json');
    enqueue({ issue: '#197', kind: 'timing', row: row('A') }, p);
    enqueue({ issue: '#198', kind: 'timing', row: row('B') }, p);
    enqueue({ issue: '#197', kind: 'timing', row: row('C') }, p);
    const delivered = [];
    const r = await drainAndDiscard(
      async (evt) => {
        delivered.push(parseTimingRow(evt.row).description);
      },
      p,
      (evt) => String(evt.issue).replace(/^#/, '') === '197'
    );
    assert.deepEqual(r, { delivered: 2, discarded: 0, retained: 0 });
    assert.deepEqual(delivered.sort(), ['A', 'C']);
    const left = peek(p);
    assert.equal(left.length, 1);
    assert.equal(parseTimingRow(left[0].row).description, 'B');
    rmSync(t, { recursive: true });
  }

  // drainAndDiscard: all matches fail → discarded counts, items still removed
  {
    const t = createActivatedUnitRuntimeRoot('tt-q-dad-b-');
    const p = path.join(t, '.ai-task-manager/runtime/store/state/task-tracker-queue.json');
    enqueue({ issue: '#197', kind: 'timing', row: row('A') }, p);
    enqueue({ issue: '#197', kind: 'timing', row: row('B') }, p);
    enqueue({ issue: '#198', kind: 'timing', row: row('C') }, p);
    const r = await drainAndDiscard(
      async () => {
        throw new Error('net down');
      },
      p,
      (evt) => String(evt.issue).replace(/^#/, '') === '197'
    );
    assert.deepEqual(r, { delivered: 0, discarded: 2, retained: 0 });
    const left = peek(p);
    assert.equal(left.length, 1);
    assert.equal(parseTimingRow(left[0].row).description, 'C');
    rmSync(t, { recursive: true });
  }

  // drainAndDiscard: mixed success/failure, mixed predicate match
  {
    const t = createActivatedUnitRuntimeRoot('tt-q-dad-c-');
    const p = path.join(t, '.ai-task-manager/runtime/store/state/task-tracker-queue.json');
    enqueue({ issue: 197, kind: 'timing', row: row('A') }, p);
    enqueue({ issue: '#197', kind: 'timing', row: row('B') }, p);
    enqueue({ issue: '#198', kind: 'timing', row: row('C') }, p);
    enqueue({ issue: '#197', kind: 'timing', row: row('D') }, p);
    const r = await drainAndDiscard(
      async (evt) => {
        if (parseTimingRow(evt.row).description === 'B') throw new Error('boom');
      },
      p,
      (evt) => String(evt.issue).replace(/^#/, '') === '197'
    );
    assert.deepEqual(r, { delivered: 2, discarded: 1, retained: 0 });
    const left = peek(p);
    assert.equal(left.length, 1);
    assert.equal(parseTimingRow(left[0].row).description, 'C');
    rmSync(t, { recursive: true });
  }

  console.log('queue.test.mjs: all passed');
});
