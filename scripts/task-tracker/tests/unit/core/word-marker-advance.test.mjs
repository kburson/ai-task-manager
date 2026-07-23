#!/usr/bin/env node
// @story #483
// Regression for the frozen Word Marker / Δ Words=0 defect (#481 symptom).
//
// Root cause: `flushActiveToGH` (runtime.mjs) loaded the per-sid word-count
// cursor but never advanced/persisted it, and computed the cumulative marker
// off the frozen `wordsAtEntryStart` snapshot rather than the durable
// `lastWordMarker`. Two faces of the same defect: the cumulative never grew
// past the bind snapshot, and per-row `Δ Words` re-counted from the bind
// offset (double-count) instead of reporting just the segment's new words.
//
// This test exercises the real word-count primitives (`countWords`,
// `saveMarker`, `loadMarker`, `advanceWordMarker`) over a transcript that
// grows between flushes and asserts:
//   - POST-FIX (advance + persist cursor, base = lastWordMarker): the marker
//     is monotonic and strictly increases when words are added; `Δ Words` is a
//     true per-segment delta; the cumulative equals initial + Σ segment deltas
//     (no double-count).
//   - PRE-FIX (frozen cursor): per-row `Δ Words` double-counts earlier
//     segments — the defect this fix removes.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { countWords, saveMarker, loadMarker } from '../../../word-counter.mjs';
import { advanceWordMarker } from '../../../state.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

// Build a JSONL line carrying `n` reader-visible words (a real assistant turn,
// so `countWords` includes it: type assistant, non-meta, text content block).
function turn(n) {
  const text = Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
  return (
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } }) + '\n'
  );
}

function withFixtures(fn) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'wm-advance-'));
  const jsonl = path.join(dir, 'session.jsonl');
  const marker = path.join(dir, 'session.json');
  try {
    return fn({ jsonl, marker });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('POST-FIX: cursor advances → monotonic cumulative marker, per-segment Δ, no double-count', () => {
  withFixtures(({ jsonl, marker }) => {
    // Bind: 3 turns × 10 words = 30 words present at entry.
    writeFileSync(jsonl, turn(10) + turn(10) + turn(10), 'utf8');
    const bind = countWords(jsonl, 0);
    assert.equal(bind.count, 30);
    saveMarker(marker, bind.totalLines, bind.count); // cursor pinned to end-at-bind

    const state = { lastWordMarker: advanceWordMarker(0, bind.count) }; // 30
    assert.equal(state.lastWordMarker, 30);

    const segments = [20, 25, 15]; // words appended before each flush
    const markers = [];
    const deltas = [];

    for (const segWords of segments) {
      // Transcript grows by one turn of `segWords` words.
      appendFileSync(jsonl, turn(segWords), 'utf8');

      // --- mirror of the patched flushActiveToGH word-accounting path ---
      const cur = loadMarker(marker);
      const counted = countWords(jsonl, cur.line); // words since persisted cursor
      const deltaWords = counted.count;
      const wordMarker = advanceWordMarker(state.lastWordMarker, state.lastWordMarker + deltaWords);
      state.lastWordMarker = wordMarker;
      saveMarker(marker, counted.totalLines, wordMarker); // advance + persist cursor
      // -----------------------------------------------------------------

      deltas.push(deltaWords);
      markers.push(wordMarker);
    }

    // Δ Words is a true per-segment delta — exactly the words added each time.
    assert.deepEqual(deltas, segments, 'Δ Words must be per-segment, not re-counted from bind');

    // Word Marker grows monotonically and strictly increases on every segment
    // that added words.
    assert.deepEqual(markers, [50, 75, 90]);
    for (let i = 1; i < markers.length; i++) {
      assert.ok(
        markers[i] > markers[i - 1],
        `marker must strictly increase: ${markers[i - 1]} → ${markers[i]}`
      );
    }

    // Cumulative == initial + Σ deltas (no double-count, no frozen base).
    assert.equal(markers.at(-1), 30 + segments.reduce((a, b) => a + b, 0));
  });
});

test('POST-FIX: a no-growth flush yields Δ Words=0 and a flat (non-regressing) marker', () => {
  withFixtures(({ jsonl, marker }) => {
    writeFileSync(jsonl, turn(10) + turn(10), 'utf8');
    const bind = countWords(jsonl, 0);
    saveMarker(marker, bind.totalLines, bind.count);
    const state = { lastWordMarker: advanceWordMarker(0, bind.count) }; // 20

    // Flush with no new turns appended.
    const cur = loadMarker(marker);
    const counted = countWords(jsonl, cur.line);
    const deltaWords = counted.count;
    const wordMarker = advanceWordMarker(state.lastWordMarker, state.lastWordMarker + deltaWords);
    saveMarker(marker, counted.totalLines, wordMarker);

    assert.equal(deltaWords, 0, 'no growth → Δ Words 0');
    assert.equal(wordMarker, 20, 'marker holds flat (monotonic floor), does not regress');
  });
});

test('PRE-FIX reproduction: a frozen cursor double-counts earlier segments in Δ Words', () => {
  withFixtures(({ jsonl, marker }) => {
    writeFileSync(jsonl, turn(10) + turn(10) + turn(10), 'utf8');
    const bind = countWords(jsonl, 0);
    saveMarker(marker, bind.totalLines, bind.count);
    const frozenLine = bind.totalLines; // never advanced — the defect

    const segments = [20, 25, 15];
    const preFixDeltas = [];
    for (const segWords of segments) {
      appendFileSync(jsonl, turn(segWords), 'utf8');
      // Buggy path: always counts from the bind-time offset, cursor never moves.
      preFixDeltas.push(countWords(jsonl, frozenLine).count);
    }

    // Each row re-counts every prior segment → cumulative-since-bind, not the
    // per-row delta. This is the symptom #483 removes.
    assert.deepEqual(preFixDeltas, [20, 45, 60]);
    assert.notDeepEqual(preFixDeltas, segments, 'pre-fix deltas are NOT per-segment');
  });
});
