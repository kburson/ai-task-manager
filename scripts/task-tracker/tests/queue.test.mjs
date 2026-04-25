#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
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
const ok = await drain(async (evt) => { delivered.push(evt.row); }, qPath);
assert.equal(ok, true);
assert.deepEqual(delivered, ['A', 'B']);
assert.deepEqual(peek(qPath), []);

// Test 4: drain halts on handler failure, keeps remaining
enqueue({ row: 'C' }, qPath);
enqueue({ row: 'D' }, qPath);
const ok2 = await drain(async (evt) => { if (evt.row === 'D') throw new Error('net down'); }, qPath);
assert.equal(ok2, false);
const remaining = peek(qPath);
assert.equal(remaining.length, 1);
assert.equal(remaining[0].row, 'D');

rmSync(tmp, { recursive: true });
console.log('queue.test.mjs: all passed');
