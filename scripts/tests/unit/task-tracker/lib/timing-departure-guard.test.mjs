#!/usr/bin/env node
// @story #972
// A second departure event (`switch-out:*` / `pause:*`) landing while a prior
// departure is still open (no `resumed` row between them) must no-op rather
// than stack a doubled interruption row — mirrors the existing #568
// duplicate-`start` guard's corrective-not-silent philosophy, applied to the
// opener/departure side. Covers both #922 repro shapes.
import { strict as assert } from 'node:assert';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import {
  appendRow,
  buildInitialComment,
} from '../../../../task-tracker/gh-timing-comment.internals.mjs';
import { lastOpenInterruption } from '../../../../task-tracker/lib/bind-event.mjs';

function countRows(body, event) {
  const re = new RegExp(
    `^\\|[^|]*\\|\\s*${event.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|`,
    'm'
  );
  return body.split('\n').filter((l) => re.test(l)).length;
}

const rowAt = (ts, event) =>
  buildRow({
    ts,
    event,
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 1,
    description: event,
  });

const nowRow = (event) => rowAt(new Date().toISOString(), event);

// Repro 1 (#922): identical-timestamp double departure — `switch-out:#847`
// followed by `pause:other` at the exact same timestamp, no `resumed`
// between. The second departure must no-op, not stack.
{
  const ts = new Date().toISOString();
  let body = appendRow(buildInitialComment(), rowAt(ts, 'start'));
  body = appendRow(body, rowAt(ts, 'switch-out:#847'));
  assert.equal(lastOpenInterruption(body).kind, 'switch-out', 'precondition: open switch-out');

  const out = appendRow(body, rowAt(ts, 'pause:other'));
  assert.equal(out, body, 'redundant departure over an open interruption is a no-op');
  assert.equal(countRows(out, 'pause:other'), 0, 'the second departure row was never written');
  assert.equal(
    lastOpenInterruption(out).kind,
    'switch-out',
    'the original open interruption is unchanged'
  );
}

// Repro 2 (#922): a direct second `pause` call while a prior `pause` is still
// open, no intervening `resume`.
{
  let body = appendRow(buildInitialComment(), nowRow('start'));
  body = appendRow(body, nowRow('pause:question'));
  assert.equal(lastOpenInterruption(body).kind, 'pause', 'precondition: open pause');

  const out = appendRow(body, nowRow('pause:other-question'));
  assert.equal(out, body, 'second pause over an open pause is a no-op');
  assert.equal(
    countRows(out, 'pause:other-question'),
    0,
    'the redundant pause row was never written'
  );
}

// A departure landing when NO interruption is open still appends normally
// (the guard must not suppress legitimate departures).
{
  const base = appendRow(buildInitialComment(), nowRow('start'));
  const out = appendRow(base, nowRow('switch-out:#1'));
  assert.equal(
    countRows(out, 'switch-out:#1'),
    1,
    'a departure with nothing open appends normally'
  );
  assert.equal(lastOpenInterruption(out).kind, 'switch-out', 'the new departure is now open');
}

// A re-engagement (`resumed`) over an open interruption is unaffected by this
// guard — it closes the interruption as usual, not suppressed.
{
  let body = appendRow(buildInitialComment(), nowRow('start'));
  body = appendRow(body, nowRow('pause:meeting'));
  const out = appendRow(body, nowRow('resumed'));
  assert.equal(countRows(out, 'resumed'), 1, 'resumed still appends over an open interruption');
  assert.equal(lastOpenInterruption(out), null, 'resumed closes the open interruption');
}

console.log('timing-departure-guard.test.mjs: all passed');
