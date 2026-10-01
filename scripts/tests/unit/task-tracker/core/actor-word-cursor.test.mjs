// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createUnitRootFixture } from '../../../helpers/unit-runtime-root.mjs';
import {
  loadMarker,
  saveMarker,
  advanceMarkerCursor,
} from '../../../../task-tracker/word-counter.mjs';
const a = { provider: 'codex', sid: 'fixture-cursor-a' };
const b = { provider: 'codex', sid: 'fixture-cursor-b' };
test('versioned cursor binds exact actor and refuses corrupt or foreign evidence without rewriting it', () => {
  const root = createUnitRootFixture('actor-cursor-');
  const file = path.join(root, 'cursor.json');
  try {
    saveMarker(file, 5, 20, '#1857', 30, { identity: a });
    const original = readFileSync(file, 'utf8');
    assert.throws(() => loadMarker(file, { identity: b }), { code: 'WORD_CURSOR_INVALID' });
    assert.throws(() => saveMarker(file, 6, 21, '#1857', 31, { identity: b }), {
      code: 'WORD_CURSOR_INVALID',
    });
    assert.equal(readFileSync(file, 'utf8'), original);
    advanceMarkerCursor(file, 7, undefined, { identity: a });
    assert.equal(loadMarker(file, { identity: a }).words, 20);
    assert.equal(loadMarker(file, { identity: a }).wordsFull, 30);
    for (const bytes of ['{broken', JSON.stringify({ schema: 'future', wordCount: {} })]) {
      writeFileSync(file, bytes);
      assert.throws(() => loadMarker(file, { identity: a }), { code: 'WORD_CURSOR_INVALID' });
      assert.throws(() => saveMarker(file, 0, 0, null, 0, { identity: a }), {
        code: 'WORD_CURSOR_INVALID',
      });
      assert.equal(readFileSync(file, 'utf8'), bytes);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('legacy cursor remains readable without inventing actor attribution and unknown fields survive conversion', () => {
  const root = createUnitRootFixture('actor-cursor-legacy-');
  const file = path.join(root, 'cursor.json');
  try {
    writeFileSync(
      file,
      JSON.stringify({ legacyNote: 'preserve', wordCount: { line: 2, words: 10 } })
    );
    assert.equal(loadMarker(file).wordsFull, 10);
    saveMarker(file, 3, 12, '#1857', 13, { identity: a });
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).legacyNote, 'preserve');
    assert.equal(loadMarker(file, { identity: a }).words, 12);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
