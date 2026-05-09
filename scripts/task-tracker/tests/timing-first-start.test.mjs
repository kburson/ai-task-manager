import assert from 'node:assert/strict';
import { firstStartTimestamp, fmtTs } from '../gh-timing-comment.mjs';

// Absent / empty
assert.equal(firstStartTimestamp(''), null);
assert.equal(firstStartTimestamp(null), null);
assert.equal(firstStartTimestamp('no table here'), null);

// Single start row
{
  const body = [
    '⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-05-08 21:37 -05:00 | start | 0 | 0 | 0 | 100 | first |',
  ].join('\n');
  assert.equal(firstStartTimestamp(body), '2026-05-08 21:37 -05:00');
}

// Multiple rows — must return first start (skips end events)
{
  const body = [
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| 2026-05-08 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
    '| 2026-05-08 10:00 -05:00 | end   | 60 | 0 | 50 | 150 | done |',
    '| 2026-05-08 11:00 -05:00 | start | 0 | 0 | 0 | 200 | resume |',
  ].join('\n');
  assert.equal(firstStartTimestamp(body), '2026-05-08 09:00 -05:00');
}

// Header-only table — null
{
  const body = [
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
  ].join('\n');
  assert.equal(firstStartTimestamp(body), null);
}

// Malformed timestamp — skipped
{
  const body = [
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '|---|---|---|---|---|---|---|',
    '| not-a-ts | start | 0 | 0 | 0 | 100 | bad |',
    '| 2026-05-08 12:00 +00:00 | start | 0 | 0 | 0 | 200 | good |',
  ].join('\n');
  assert.equal(firstStartTimestamp(body), '2026-05-08 12:00 +00:00');
}

// fmtTs format check (smoke)
{
  const out = fmtTs('2026-05-08T14:30:00Z');
  assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} [+-]\d{2}:\d{2}$/);
}

console.log('timing-first-start.test.mjs: all passed');
