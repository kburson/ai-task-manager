// @story #1049

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { drain, drainAndDiscard, enqueue, peek } from '../../../queue.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

function fixture() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-governed-queue-'));
  return { dir, queuePath: path.join(dir, 'queue.json') };
}

test('authority-refused queue drain retains exact item without rewriting the queue', async () => {
  const { dir, queuePath } = fixture();
  try {
    enqueue({ kind: 'timing', issue: '#1049', row: 'row-a' }, queuePath);
    const before = peek(queuePath);
    const beforeStat = statSync(queuePath);
    const beforeBytes = readFileSync(queuePath);
    assert.equal(
      await drain(async () => {
        const error = new Error('stale queued authority');
        error.code = 'fence-stale';
        throw error;
      }, queuePath),
      false
    );
    assert.deepEqual(peek(queuePath), before);
    assert.deepEqual(readFileSync(queuePath), beforeBytes);
    assert.equal(
      statSync(queuePath).ino,
      beforeStat.ino,
      'refusal must not replace the queue file'
    );
    assert.equal(statSync(queuePath).mtimeMs, beforeStat.mtimeMs, 'refusal must preserve mtime');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drain re-reads under reconciliation so a concurrent enqueue survives', async () => {
  const { dir, queuePath } = fixture();
  try {
    enqueue({ kind: 'timing', issue: '#1049', row: 'row-a' }, queuePath);
    assert.equal(
      await drain(async () => {
        enqueue({ kind: 'timing', issue: '#1050', row: 'row-b' }, queuePath);
      }, queuePath),
      true
    );
    const remaining = peek(queuePath);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].issue, '#1050');
    assert.equal(remaining[0].row, 'row-b');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('close discard retains authority-refused work while consuming ordinary failures', async () => {
  const { dir, queuePath } = fixture();
  try {
    enqueue({ kind: 'timing', issue: '#1049', row: 'stale-authority' }, queuePath);
    enqueue({ kind: 'timing', issue: '#1049', row: 'bad-network' }, queuePath);
    const result = await drainAndDiscard(
      async (item) => {
        const error = new Error(item.row);
        if (item.row === 'stale-authority') error.code = 'fence-stale';
        throw error;
      },
      queuePath,
      () => true
    );
    assert.deepEqual(result, { delivered: 0, discarded: 1, authorityRefused: 1 });
    assert.deepEqual(
      peek(queuePath).map((item) => item.row),
      ['stale-authority']
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
