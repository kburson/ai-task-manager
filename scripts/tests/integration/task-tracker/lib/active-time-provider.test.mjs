// @story #1857
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import * as activity from '../../../../task-tracker/active-time.mjs';
const parent = path.resolve('.scratch/1857-activity-fixtures');
mkdirSync(parent, { recursive: true });
const directory = mkdtempSync(path.join(parent, 'evidence-'));
test.after(() => rmSync(directory, { recursive: true, force: true }));
const base = Date.parse('2026-10-01T00:00:00Z');
const iso = (n) => new Date(base + n * 1000).toISOString();
function file(name, records) {
  const target = path.join(directory, name + '.jsonl');
  writeFileSync(
    target,
    records
      .map((record) => (typeof record === 'string' ? record : JSON.stringify(record)))
      .join('\n') + '\n'
  );
  return target;
}
const message = (sec) => ({
  type: 'response_item',
  timestamp: iso(sec),
  payload: {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'working' }],
  },
});
const native = [
  { type: 'session_meta', timestamp: iso(0), payload: { id: 'own-session' } },
  {
    type: 'event_msg',
    timestamp: iso(0),
    payload: { type: 'task_started', turn_id: 'turn-one', started_at: base / 1000 },
  },
  message(10),
  {
    type: 'response_item',
    timestamp: iso(20),
    payload: { type: 'function_call', name: 'verify', arguments: '{}' },
  },
  {
    type: 'response_item',
    timestamp: iso(40),
    payload: { type: 'function_call_output', output: 'passed' },
  },
  {
    type: 'event_msg',
    timestamp: iso(60),
    payload: {
      type: 'task_complete',
      turn_id: 'turn-one',
      started_at: base / 1000,
      completed_at: base / 1000 + 60,
      duration_ms: 60000,
    },
  },
];
test('existing collector recognizes native Codex response and tool events', () => {
  assert.deepEqual(activity.collectEventTimestamps(file('native', native), base, base + 60000), [
    base + 10000,
    base + 20000,
    base + 40000,
  ]);
});
test('native completed own-session boundaries establish conservative covered-window evidence', () => {
  const evidence = activity.readActivityEvidence(
    file('covered', native),
    base + 1000,
    base + 59000,
    { provider: 'codex', sid: 'own-session' }
  );
  assert.equal(evidence.status, 'observed');
  assert.equal(evidence.knownEngagementMs, 58000);
  assert.equal(evidence.events.length, 3);
});
test('unsupported, missing, corrupt, wrong-owner and incomplete observations never become observed zero', () => {
  const scenarios = [
    [path.join(directory, 'missing.jsonl'), {}],
    [file('unsupported', [{ type: 'mystery', timestamp: iso(10) }]), {}],
    [
      file('system', [
        {
          type: 'response_item',
          timestamp: iso(0),
          payload: { type: 'message', role: 'system', content: [] },
        },
      ]),
      {},
    ],
    [
      file('truncated', [...native.slice(0, -1), '{broken']),
      { provider: 'codex', sid: 'own-session' },
    ],
    [file('open', native.slice(0, -1)), { provider: 'codex', sid: 'own-session' }],
    [file('foreign', native), { provider: 'codex', sid: 'different' }],
    [
      file('claude', [{ type: 'assistant', timestamp: iso(10), message: { content: 'work' } }]),
      { provider: 'claude', sid: 'claude-session' },
    ],
  ];
  for (const [target, options] of scenarios) {
    const evidence = activity.readActivityEvidence(target, base + 1000, base + 59000, options);
    assert.equal(evidence.status, 'unavailable');
    assert.equal(evidence.activeEstimateSec, null);
    assert.equal(evidence.knownEngagementMs, null);
  }
});
test('zero-length supported observation is explicit observed zero', () => {
  const evidence = activity.readActivityEvidence(file('zero', native), base + 10000, base + 10000, {
    provider: 'codex',
    sid: 'own-session',
  });
  assert.equal(evidence.status, 'observed');
  assert.equal(evidence.knownEngagementMs, 0);
  assert.equal(evidence.activeEstimateSec, 0);
});
