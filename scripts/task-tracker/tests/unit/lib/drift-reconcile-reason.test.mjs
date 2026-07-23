// @story #168
// #168 — drift-reconcile description records WHY it fired:
//   - "marker-write-failed at <ts>" when a recent state-recording-failed
//     audit comment is present
//   - "external-mutation" otherwise

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findRecordingFailureFromComments } from '../../../lib/state-recording.mjs';

test('findRecordingFailureFromComments returns null on empty list', () => {
  assert.equal(findRecordingFailureFromComments([]), null);
  assert.equal(findRecordingFailureFromComments(null), null);
});

test('returns hit when a state-recording-failed marker comment exists', () => {
  const r = findRecordingFailureFromComments([
    {
      body: '> ⚠ state-recording-failed\n\nMarker write to `plan` failed…\n<!-- aitm-state-recording-failed -->',
      createdAt: '2026-05-18T06:42:00Z',
    },
  ]);
  assert.ok(r);
  assert.equal(r.target, 'plan');
  assert.equal(r.createdAt, '2026-05-18T06:42:00Z');
});

test('ignores comments without the marker', () => {
  const r = findRecordingFailureFromComments([
    { body: 'normal comment', createdAt: '2026-05-18T06:42:00Z' },
  ]);
  assert.equal(r, null);
});

test('returns the most recent matching comment', () => {
  const r = findRecordingFailureFromComments([
    {
      body: 'Marker write to `refine` failed\n<!-- aitm-state-recording-failed -->',
      createdAt: '2026-05-18T05:00:00Z',
    },
    {
      body: 'Marker write to `plan` failed\n<!-- aitm-state-recording-failed -->',
      createdAt: '2026-05-18T06:00:00Z',
    },
  ]);
  assert.equal(r.target, 'plan');
});

test('honors sinceMs filter', () => {
  const r = findRecordingFailureFromComments(
    [
      {
        body: 'Marker write to `plan` failed\n<!-- aitm-state-recording-failed -->',
        createdAt: '2026-05-18T05:00:00Z',
      },
    ],
    Date.parse('2026-05-18T06:00:00Z')
  );
  assert.equal(r, null);
});
