// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import * as activity from '../../../../task-tracker/active-time.mjs';
const base = Date.parse('2026-10-01T00:00:00Z');
const iso = (seconds) => new Date(base + seconds * 1000).toISOString();
const native = [
  { type: 'session_meta', timestamp: iso(0), payload: { id: 'source-session' } },
  {
    type: 'event_msg',
    timestamp: iso(0),
    payload: { type: 'task_started', turn_id: 'turn', started_at: base / 1000 },
  },
  ...[10, 20, 40].map((seconds) => ({
    type: 'response_item',
    timestamp: iso(seconds),
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'native fixture work' }],
    },
  })),
  {
    type: 'event_msg',
    timestamp: iso(60),
    payload: {
      type: 'task_complete',
      turn_id: 'turn',
      started_at: base / 1000,
      completed_at: base / 1000 + 60,
      duration_ms: 60000,
    },
  },
];
const bytesOf = (records) =>
  records
    .map((record) => (typeof record === 'string' ? record : JSON.stringify(record)))
    .join('\n') + '\n';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(fn) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'native-activity-source-'));
  try {
    return fn(path.join(dir, 'source.jsonl'), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('native activity capture retains exact consumed source and original immutable output data', () =>
  fixture((file) => {
    assert.equal(typeof activity.readActivitySourceData, 'function');
    const bytes = bytesOf(native);
    writeFileSync(file, bytes);
    const result = activity.readActivityEvidence(file, base + 1000, base + 59000, {
      provider: 'codex',
      sid: 'source-session',
      idleThresholdMs: 5000,
    });
    const expected = {
      status: 'observed',
      reason: null,
      events: [base + 10000, base + 20000, base + 40000],
      activeEstimateSec: 20,
      idleEstimateSec: 38,
      knownEngagementMs: 58000,
    };
    assert.deepEqual(result, expected);
    const capture = activity.readActivitySourceData(result);
    assert.deepEqual(capture, {
      path: file,
      provider: 'codex',
      sid: 'source-session',
      startMs: base + 1000,
      endMs: base + 59000,
      idleThresholdMs: 5000,
      byteLength: Buffer.byteLength(bytes),
      sha256: digest(bytes),
      ...expected,
    });
    assert.ok(Object.isFrozen(capture) && Object.isFrozen(capture.events));
    assert.equal(activity.readActivitySourceData({ ...result }), null);
    assert.equal(activity.readActivitySourceData(null), null);
    result.events.push(base + 50000);
    result.status = 'caller-changed';
    assert.equal(result.status, 'caller-changed', 'ordinary result remains mutable');
    appendFileSync(
      file,
      bytesOf([{ type: 'user', timestamp: iso(50), message: { content: 'later append' } }])
    );
    assert.deepEqual(activity.readActivitySourceData(result).events, expected.events);
    assert.equal(activity.readActivitySourceData(result).sha256, digest(bytes));
  }));

test('completed unavailable activity scans preserve diagnostics without converting unknown to observed zero', () =>
  fixture((file) => {
    assert.equal(typeof activity.readActivitySourceData, 'function');
    for (const [records, sid, reason] of [
      [native.slice(0, -1), 'source-session', 'window-unconfirmed'],
      [native, 'foreign-session', 'window-identity-unconfirmed'],
      [[{ type: 'unknown' }], 'source-session', 'transcript-unsupported'],
      [[...native, '{ malformed'], 'source-session', 'transcript-malformed'],
    ]) {
      const bytes = bytesOf(records);
      writeFileSync(file, bytes);
      const result = activity.readActivityEvidence(file, base + 1000, base + 59000, {
        provider: 'codex',
        sid,
      });
      assert.equal(result.status, 'unavailable');
      assert.equal(result.reason, reason);
      assert.equal(result.activeEstimateSec, null);
      assert.equal(result.idleEstimateSec, null);
      const captured = activity.readActivitySourceData(result);
      assert.equal(captured.status, 'unavailable');
      assert.equal(captured.reason, reason);
      assert.equal(captured.activeEstimateSec, null);
      assert.equal(captured.knownEngagementMs, null);
      assert.equal(captured.sha256, digest(bytes));
    }
  }));

test('missing invalid-window and throwing activity scans expose no completed source capture', () =>
  fixture((file, dir) => {
    assert.equal(typeof activity.readActivitySourceData, 'function');
    for (const result of [
      activity.readActivityEvidence(file, base, base + 1),
      activity.readActivityEvidence(file, base + 1, base),
      activity.readActivityEvidence(dir, base, base + 1),
    ]) {
      assert.equal(result.status, 'unavailable');
      assert.equal(activity.readActivitySourceData(result), null);
    }
  }));
