#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { enqueue, drain, peek } from '../queue.mjs';

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
console.log('queue.test.mjs: all passed');
