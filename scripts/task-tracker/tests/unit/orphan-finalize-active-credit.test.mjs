#!/usr/bin/env node
// @story #802 — in-review (non-transitioning) active work must be credited.
//
// Active-duration rows are otherwise emitted only on state transitions. Work
// done inside a state without transitioning — PR push / CI wait / merge during
// `review` — produced no active row, so pause-finalize logged the whole
// stop→prompt gap as pure idle. finalizeOrphanPause now splits that turn: an
// `active-work` row credits `[lastRowTs → stoppedAt]`, then the idle row covers
// only `[stoppedAt → now]`.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { pendingPausePath } from '../../hooks/on-stop.mjs';
import { fmtTs } from '../../gh-timing-comment.mjs';
import { finalizeOrphanPause } from '../../orphan-finalize.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-orphan-active-'));

function writeMarker(sid, payload) {
  const p = pendingPausePath(sid, tmp);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(payload) + '\n', 'utf8');
  return p;
}

// Parse the canonical `<!-- row-sec: a=N i=N -->` marker (buildRow's numeric
// source of truth) out of a rendered row.
function rowSec(row) {
  const m = row.match(/row-sec: a=(\d+) i=(\d+)/);
  assert.ok(m, `row carries a row-sec marker: ${row}`);
  return { a: Number(m[1]), i: Number(m[2]) };
}

// A timing-comment body whose most-recent row lands at `atMs`, so
// lastRowTsFromBody anchors the active window there.
function bodyWithLastRow(atMs) {
  return [
    '## ⏱ Timing Log',
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${fmtTs(new Date(atMs))} | review | | | 0 | 0 | bound |`,
  ].join('\n');
}

// AC1 + AC3 — in-review active work produces a credited active row, and this
// test asserts active work in a non-transitioning state is credited (not
// dropped, not mislabeled idle). AC2 — the idle row reflects only the
// stop→prompt gap, no longer swallowing the active wall-clock.
{
  const now = Date.now();
  const stoppedMs = now - 6 * 60_000; // 6-min idle gap → above pause threshold
  const lastRowMs = stoppedMs - 20 * 60_000; // 20-min in-review work turn
  const sid = 'active-credit';
  writeMarker(sid, {
    stoppedAt: new Date(stoppedMs).toISOString(),
    issue: '#802',
    state: 'review',
    sessionId: sid,
  });

  // Dense turns every 60s (< 5-min idle threshold) → the whole work window
  // resolves as active.
  const events = [];
  for (let t = lastRowMs; t <= stoppedMs; t += 60_000) events.push(t);

  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: {
      postTimingEvent: async (a) => calls.push(a),
      readTimingCommentBody: async () => ({ status: 'found', body: bodyWithLastRow(lastRowMs) }),
      collectEventTimestamps: (_p, s, e) => events.filter((t) => t >= s && t <= e),
    },
  });

  assert.ok(r && r.finalized, 'finalized');
  assert.equal(calls.length, 2, 'emits active-work row then idle row');

  const active = calls[0].row;
  const idle = calls[1].row;
  assert.equal(calls[0].issueNumber, '#802', 'active row posts to marker.issue');
  assert.match(active, /\| active-work \|/, 'AC1/AC3: active-work row emitted');
  assert.match(active, /sess: active-credit reason: natural-active/);
  assert.match(idle, /\| idle \|/, 'idle row still emitted');

  const a = rowSec(active);
  const i = rowSec(idle);
  // AC1: ~20 min of in-review work is credited as active seconds.
  assert.ok(a.a >= 19 * 60, `active credited (~1200s), got ${a.a}`);
  assert.equal(a.i, 0, 'active row carries no idle');
  // AC2: idle row covers only [stoppedAt → now] (~360s), NOT the full span.
  assert.ok(i.i >= 6 * 60 - 5 && i.i <= 6 * 60 + 5, `idle ~360s, got ${i.i}`);
  assert.ok(i.i < 20 * 60, 'AC2: active wall-clock not swallowed as idle');
  assert.equal(i.a, 0, 'idle row carries no active');
}

// Skip — no prior timing row means no anchor; credit nothing (never fabricate).
{
  const now = Date.now();
  const stoppedMs = now - 6 * 60_000;
  const sid = 'no-anchor';
  writeMarker(sid, {
    stoppedAt: new Date(stoppedMs).toISOString(),
    issue: '#802',
    state: 'review',
    sessionId: sid,
  });
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: {
      postTimingEvent: async (a) => calls.push(a),
      readTimingCommentBody: async () => ({ status: 'absent', body: '' }),
      collectEventTimestamps: () => [Date.now()],
    },
  });
  assert.ok(r && r.finalized);
  assert.equal(calls.length, 1, 'only the idle row — no anchor to credit against');
  assert.match(calls[0].row, /\| idle \|/);
}

// Skip — window shows no active seconds (no in-window turns) → no active row.
{
  const now = Date.now();
  const stoppedMs = now - 6 * 60_000;
  const lastRowMs = stoppedMs - 20 * 60_000;
  const sid = 'no-active';
  writeMarker(sid, {
    stoppedAt: new Date(stoppedMs).toISOString(),
    issue: '#802',
    state: 'review',
    sessionId: sid,
  });
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: {
      postTimingEvent: async (a) => calls.push(a),
      readTimingCommentBody: async () => ({ status: 'found', body: bodyWithLastRow(lastRowMs) }),
      collectEventTimestamps: () => [], // no turns in the window
    },
  });
  assert.ok(r && r.finalized);
  assert.equal(calls.length, 1, 'no active seconds → idle row only');
  assert.match(calls[0].row, /\| idle \|/);
}

// Skip — inverted window (last row after the stop) is never credited.
{
  const now = Date.now();
  const stoppedMs = now - 6 * 60_000;
  const lastRowMs = stoppedMs + 2 * 60_000; // after the stop → inverted
  const sid = 'inverted';
  writeMarker(sid, {
    stoppedAt: new Date(stoppedMs).toISOString(),
    issue: '#802',
    state: 'review',
    sessionId: sid,
  });
  const calls = [];
  const r = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir: tmp,
    deps: {
      postTimingEvent: async (a) => calls.push(a),
      readTimingCommentBody: async () => ({ status: 'found', body: bodyWithLastRow(lastRowMs) }),
      collectEventTimestamps: (_p, s, e) => [s, e],
    },
  });
  assert.ok(r && r.finalized);
  assert.equal(calls.length, 1, 'inverted window → idle row only');
}

rmSync(tmp, { recursive: true });
console.log('orphan-finalize-active-credit.test.mjs: all passed');
