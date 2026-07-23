#!/usr/bin/env node
// @story #568
// #568 keystone — the appendRow structural duplicate-`start` guard. A second
// `start` over a log that already has rows is structurally impossible:
//   - over an OPEN interruption (switch-out / pause / idle) it is rewritten to
//     the canonical closer `resumed` (corrective, AC4);
//   - over rows with NO open interruption it throws DuplicateStartError (AC3);
//   - a non-`start` row is never touched by the guard.
import { strict as assert } from 'node:assert';
import { buildRow, DuplicateStartError } from '../../../gh-timing-comment.mjs';
import { appendRow, buildInitialComment } from '../../../gh-timing-comment.internals.mjs';
import { lastOpenInterruption } from '../../../lib/bind-event.mjs';

function countStartRows(body) {
  return body.split('\n').filter((l) => /^\|[^|]*\|\s*start\s*\|/.test(l)).length;
}

// Helper — a freshly-built row (buildRow enforces the ±60s window).
const nowRow = (event) =>
  buildRow({
    ts: new Date().toISOString(),
    event,
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 1,
    description: event,
  });

// Test 19 (AC3): a 2nd `start` over a log with rows and NO open interruption is
// structurally refused — surfaced as an error, not a silent drop.
{
  const base = appendRow(buildInitialComment(), nowRow('start'));
  assert.equal(countStartRows(base), 1, 'precondition: one start row');
  let threw = null;
  try {
    appendRow(base, nowRow('start'));
  } catch (e) {
    threw = e;
  }
  assert.ok(threw, 'second start over a non-empty log must throw');
  assert.ok(threw instanceof DuplicateStartError, 'throws DuplicateStartError');
  assert.equal(countStartRows(base), 1, 'base body untouched — row not silently appended');
}

// Test 20 (AC4): a 2nd `start` over an OPEN switch-out:#N is rewritten to the
// canonical closer `resumed` (corrective, not silent-drop) and clears the open
// interruption.
{
  let body = appendRow(buildInitialComment(), nowRow('start'));
  body = appendRow(body, nowRow('switch-out:#7'));
  assert.equal(lastOpenInterruption(body).kind, 'switch-out', 'precondition: open switch-out');
  const out = appendRow(body, nowRow('start'));
  assert.equal(countStartRows(out), 1, 'no duplicate start materialized');
  assert.match(out, /\|\s*resumed\s*\|/, 'the second start was rewritten to resumed');
  assert.equal(lastOpenInterruption(out), null, 'resumed closed the switch-out');
}

// Test 21 (AC4): the same rewrite applies over an OPEN pause.
{
  let body = appendRow(buildInitialComment(), nowRow('start'));
  body = appendRow(body, nowRow('pause:meeting'));
  assert.equal(lastOpenInterruption(body).kind, 'pause', 'precondition: open pause');
  const out = appendRow(body, nowRow('start'));
  assert.equal(countStartRows(out), 1, 'no duplicate start materialized');
  assert.match(out, /\|\s*resumed\s*\|/, 'the second start was rewritten to resumed');
  assert.equal(lastOpenInterruption(out), null, 'resumed closed the pause');
}

// Test 22: a NON-start row over a non-empty log is unaffected by the guard.
{
  const base = appendRow(buildInitialComment(), nowRow('start'));
  const out = appendRow(base, nowRow('pre-compact-flush'));
  assert.ok(out.includes('pre-compact-flush'), 'non-start rows append normally');
}

console.log('gh-timing-comment-duplicate-start.test.mjs: all passed');
