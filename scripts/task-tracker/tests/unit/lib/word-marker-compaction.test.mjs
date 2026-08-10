// @story #1142
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import * as wordCounter from '../../../word-counter.mjs';

const { countWords, loadMarker, saveMarker } = wordCounter;

test('compaction advances only the line cursor and preserves both markers', () => {
  const dir = path.join(projectScratchDir('test'), `word-marker-compaction-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const markerPath = path.join(dir, 'marker.json');
  saveMarker(markerPath, 4, 1_234, '1142', 2_468);
  assert.equal(typeof wordCounter.advanceMarkerCursor, 'function');
  wordCounter.advanceMarkerCursor(markerPath, 9, '1142');
  const marker = loadMarker(markerPath);
  assert.deepEqual(
    { line: marker.line, words: marker.words, wordsFull: marker.wordsFull, task: marker.task },
    { line: 9, words: 1_234, wordsFull: 2_468, task: '1142' }
  );
});

test('Codex compacted replacement-history metadata is not counted twice', () => {
  const dir = path.join(projectScratchDir('test'), `word-marker-compaction-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const transcript = path.join(dir, 'rollout.jsonl');
  const records = [
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'one two three' }],
      },
    },
    {
      type: 'compacted',
      payload: { replacement_history: [{ role: 'assistant', content: 'one two three' }] },
    },
  ];
  writeFileSync(transcript, `${records.map(JSON.stringify).join('\n')}\n`, 'utf8');
  assert.equal(readFileSync(transcript, 'utf8').split('\n').filter(Boolean).length, 2);
  const counted = countWords(transcript, 0, { provider: 'codex', sid: 'compaction-fixture' });
  assert.equal(counted.status, 'ok');
  assert.equal(counted.count, 3);
  assert.equal(counted.fullExpansion, 3);
  assert.equal(counted.totalLines, 2);
});
