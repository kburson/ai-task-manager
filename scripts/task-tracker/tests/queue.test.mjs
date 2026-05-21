#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { enqueue, drain, peek, drainAndDiscard } from '../queue.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-q-'));
const qPath = path.join(tmp, 'queue.json');

// Test 1: empty queue
assert.deepEqual(peek(qPath), []);

// Test 2: enqueue two events
enqueue({ issue: '#107', row: 'A' }, qPath);
enqueue({ issue: '#107', row: 'B' }, qPath);
assert.equal(peek(qPath).length, 2);

// Test 3: drain invokes handler for each, clears on success
const delivered = [];
const ok = await drain(async (evt) => {
  delivered.push(evt.row);
}, qPath);
assert.equal(ok, true);
assert.deepEqual(delivered, ['A', 'B']);
assert.deepEqual(peek(qPath), []);

// Test 4: drain continues past handler failures, keeps only failed events
enqueue({ row: 'C' }, qPath);
enqueue({ row: 'D' }, qPath);
enqueue({ row: 'E' }, qPath);
const deliveredAfterFailure = [];
const ok2 = await drain(async (evt) => {
  if (evt.row === 'D') throw new Error('net down');
  deliveredAfterFailure.push(evt.row);
}, qPath);
assert.equal(ok2, false);
const remaining = peek(qPath);
assert.equal(remaining.length, 1);
assert.equal(remaining[0].row, 'D');
assert.deepEqual(deliveredAfterFailure, ['C', 'E']);

rmSync(tmp, { recursive: true });

// Test 5: if write to tmp throws, the original queue file is preserved.
// Force writeFileSync(queue.json.tmp, …) to fail by pre-creating queue.json.tmp
// as a directory — EISDIR. Without atomic write, the original queue would be
// clobbered; with atomic write, the rename never runs and the original survives.
const atomicTmp = mkdtempSync(path.join(tmpdir(), 'tt-q-atomic-'));
const aPath = path.join(atomicTmp, 'queue.json');
writeFileSync(aPath, JSON.stringify([{ row: 'PRESERVE_ME' }], null, 2) + '\n', 'utf8');
mkdirSync(aPath + '.tmp'); // blocks writeFileSync to the tmp path

let threw = false;
try {
  enqueue({ row: 'SHOULD_NOT_LAND' }, aPath);
} catch {
  threw = true;
}
assert.equal(threw, true, 'enqueue must propagate write failure');
const survivors = JSON.parse(readFileSync(aPath, 'utf8'));
assert.equal(survivors.length, 1, 'original queue must survive failed write');
assert.equal(survivors[0].row, 'PRESERVE_ME');

rmSync(atomicTmp, { recursive: true });

// drainAndDiscard: all matches succeed → delivered counts, queue untouched non-matches
{
  const t = mkdtempSync(path.join(tmpdir(), 'tt-q-dad-a-'));
  const p = path.join(t, 'queue.json');
  enqueue({ issue: '#197', row: 'A' }, p);
  enqueue({ issue: '#198', row: 'B' }, p);
  enqueue({ issue: '#197', row: 'C' }, p);
  const delivered = [];
  const r = await drainAndDiscard(
    async (evt) => {
      delivered.push(evt.row);
    },
    p,
    (evt) => String(evt.issue).replace(/^#/, '') === '197'
  );
  assert.deepEqual(r, { delivered: 2, discarded: 0 });
  assert.deepEqual(delivered.sort(), ['A', 'C']);
  const left = peek(p);
  assert.equal(left.length, 1);
  assert.equal(left[0].row, 'B');
  rmSync(t, { recursive: true });
}

// drainAndDiscard: all matches fail → discarded counts, items still removed
{
  const t = mkdtempSync(path.join(tmpdir(), 'tt-q-dad-b-'));
  const p = path.join(t, 'queue.json');
  enqueue({ issue: '#197', row: 'A' }, p);
  enqueue({ issue: '#197', row: 'B' }, p);
  enqueue({ issue: '#198', row: 'C' }, p);
  const r = await drainAndDiscard(
    async () => {
      throw new Error('net down');
    },
    p,
    (evt) => String(evt.issue).replace(/^#/, '') === '197'
  );
  assert.deepEqual(r, { delivered: 0, discarded: 2 });
  const left = peek(p);
  assert.equal(left.length, 1);
  assert.equal(left[0].row, 'C');
  rmSync(t, { recursive: true });
}

// drainAndDiscard: mixed success/failure, mixed predicate match
{
  const t = mkdtempSync(path.join(tmpdir(), 'tt-q-dad-c-'));
  const p = path.join(t, 'queue.json');
  enqueue({ issue: 197, row: 'A' }, p);
  enqueue({ issue: '#197', row: 'B' }, p);
  enqueue({ issue: '#198', row: 'C' }, p);
  enqueue({ issue: '#197', row: 'D' }, p);
  const r = await drainAndDiscard(
    async (evt) => {
      if (evt.row === 'B') throw new Error('boom');
    },
    p,
    (evt) => String(evt.issue).replace(/^#/, '') === '197'
  );
  assert.deepEqual(r, { delivered: 2, discarded: 1 });
  const left = peek(p);
  assert.equal(left.length, 1);
  assert.equal(left[0].row, 'C');
  rmSync(t, { recursive: true });
}

console.log('queue.test.mjs: all passed');
