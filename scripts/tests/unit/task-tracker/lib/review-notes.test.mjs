// @story #160
// Unit tests for lib/review-notes.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findReviewNotesComment,
  parseDrivers,
  buildReviewNotesComment,
} from '../../../../task-tracker/lib/review-notes.mjs';

test('findReviewNotesComment returns most-recent notes comment', () => {
  const comments = [
    { body: '### 📝 Review Notes\n- old driver', createdAt: '2026-05-01T00:00:00Z' },
    { body: '### 📝 Review Notes\n- new driver', createdAt: '2026-05-02T00:00:00Z' },
    { body: 'unrelated', createdAt: '2026-05-03T00:00:00Z' },
  ];
  const w = findReviewNotesComment(comments);
  assert.equal(w.createdAt, '2026-05-02T00:00:00Z');
});

test('findReviewNotesComment ignores notes older than latest delta comment', () => {
  const comments = [
    { body: '### 📝 Review Notes\n- stale', createdAt: '2026-05-01T00:00:00Z' },
    { body: '### 📊 Review delta\n| ... |', createdAt: '2026-05-02T00:00:00Z' },
  ];
  const w = findReviewNotesComment(comments);
  assert.equal(w, null);
});

test('findReviewNotesComment accepts notes posted after delta comment', () => {
  const comments = [
    { body: '### 📊 Review delta\n| ... |', createdAt: '2026-05-02T00:00:00Z' },
    { body: '### 📝 Review Notes\n- fresh', createdAt: '2026-05-03T00:00:00Z' },
  ];
  const w = findReviewNotesComment(comments);
  assert.equal(w.createdAt, '2026-05-03T00:00:00Z');
});

test('findReviewNotesComment returns null when no notes comment exists', () => {
  assert.equal(findReviewNotesComment([{ body: 'hello', createdAt: 'x' }]), null);
  assert.equal(findReviewNotesComment([]), null);
});

test('parseDrivers extracts bullet lines after header', () => {
  const body = [
    '### 📝 Review Notes',
    '',
    '- first driver',
    '* second driver',
    'ignored prose line',
    '- third driver',
    '',
    '<!-- aitm-review-notes-source: human -->',
  ].join('\n');
  assert.deepEqual(parseDrivers(body), ['first driver', 'second driver', 'third driver']);
});

test('parseDrivers stops at next section heading', () => {
  const body = ['### 📝 Review Notes', '- one', '### Other section', '- not a driver'].join('\n');
  assert.deepEqual(parseDrivers(body), ['one']);
});

test('parseDrivers returns empty when header missing', () => {
  assert.deepEqual(parseDrivers('- nope\n- nope'), []);
});

test('buildReviewNotesComment renders bullets and source footer', () => {
  const body = buildReviewNotesComment(['a', 'b'], { source: 'human' });
  assert.match(body, /^### 📝 Review Notes/);
  assert.match(body, /- a/);
  assert.match(body, /- b/);
  assert.match(body, /<!-- aitm-review-notes-source: human -->/);
});

test('buildReviewNotesComment auto source', () => {
  const body = buildReviewNotesComment(['x'], { source: 'auto' });
  assert.match(body, /<!-- aitm-review-notes-source: auto -->/);
});

test('buildReviewNotesComment round-trips through parseDrivers', () => {
  const drivers = ['significant misestimate (Δ 500%)', 'develop-stage re-entry detected'];
  const body = buildReviewNotesComment(drivers, { source: 'auto' });
  assert.deepEqual(parseDrivers(body), drivers);
});

test('buildReviewNotesComment with empty list emits placeholder', () => {
  const body = buildReviewNotesComment([], { source: 'auto' });
  assert.match(body, /No drivers recorded/);
  assert.deepEqual(parseDrivers(body), []);
});

test('buildReviewNotesComment rejects bad source', () => {
  assert.throws(() => buildReviewNotesComment([], { source: 'bogus' }));
});
