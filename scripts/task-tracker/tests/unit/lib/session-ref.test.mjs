// @story #476
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  serializeSessionRefMarker,
  parseSessionRefs,
  mostRecentSessionRef,
  appendSessionRef,
  recordSessionRefOnChange,
} from '../../../lib/session-ref.mjs';
import { findLostMarkers } from '../../../lib/body-invariants.mjs';

const E1 = { sid: 'sess-aaa', jsonlPath: '/t/sess-aaa.jsonl', ts: '2026-06-21T00:00:00Z' };
const E2 = { sid: 'sess-bbb', jsonlPath: '/t/sess-bbb.jsonl', ts: '2026-06-21T01:00:00Z' };

test('serialize → parse round-trips sid/jsonlPath/ts', () => {
  const line = serializeSessionRefMarker(E1);
  assert.match(
    line,
    /^<!-- aitm-session-ref sid="sess-aaa" jsonl="\/t\/sess-aaa\.jsonl" ts="2026-06-21T00:00:00Z" -->$/
  );
  const parsed = parseSessionRefs(line);
  assert.deepEqual(parsed, [E1]);
});

test('serialize requires sid and ts', () => {
  assert.throws(() => serializeSessionRefMarker({ jsonlPath: '/x', ts: 't' }), /sid is required/);
  assert.throws(() => serializeSessionRefMarker({ sid: 's', jsonlPath: '/x' }), /ts is required/);
});

test('recordSessionRefOnChange appends the initial entry (AC1)', () => {
  const { body, appended } = recordSessionRefOnChange('## Body\n', E1);
  assert.equal(appended, true);
  assert.deepEqual(parseSessionRefs(body), [E1]);
});

test('recordSessionRefOnChange is a no-op when sid+jsonlPath unchanged (AC2)', () => {
  const seeded = appendSessionRef('## Body\n', E1);
  const { body, appended } = recordSessionRefOnChange(seeded, E1);
  assert.equal(appended, false);
  assert.equal(body, seeded);
});

test('a governed suboperation is persisted and read back even when sid and path are unchanged', () => {
  const initial = recordSessionRefOnChange('', E1).body;
  const governed = recordSessionRefOnChange(initial, {
    ...E1,
    ts: '2026-06-21T00:05:00Z',
    operationId: 'switchLease:tx:github:source-session-ref',
  });
  assert.equal(governed.appended, true);
  assert.deepEqual(mostRecentSessionRef(governed.body), {
    sid: E1.sid,
    jsonlPath: E1.jsonlPath,
    ts: '2026-06-21T00:05:00Z',
    operationId: 'switchLease:tx:github:source-session-ref',
  });
});

test('a governed suboperation reconciles from history without displacing a newer owner', () => {
  const operationId = 'switchLease:tx:github:source-session-ref';
  const governed = recordSessionRefOnChange('', { ...E1, operationId }).body;
  const interposed = appendSessionRef(governed, E2);

  const replay = recordSessionRefOnChange(interposed, { ...E1, operationId });

  assert.equal(replay.appended, false);
  assert.equal(replay.body, interposed);
  assert.deepEqual(mostRecentSessionRef(replay.body), E2);
});

test('a governed suboperation fails closed on a mismatched historical receipt', () => {
  const operationId = 'switchLease:tx:github:source-session-ref';
  const mismatch = appendSessionRef('', {
    ...E1,
    jsonlPath: '/t/attacker.jsonl',
    operationId,
  });

  assert.throws(
    () => recordSessionRefOnChange(mismatch, { ...E1, operationId }),
    /session reference operation receipt does not match/
  );
});

test('a governed suboperation fails closed on duplicate receipts', () => {
  const operationId = 'switchLease:tx:github:source-session-ref';
  const first = appendSessionRef('', { ...E1, operationId });
  const duplicate = appendSessionRef(first, { ...E1, operationId });

  assert.throws(
    () => recordSessionRefOnChange(duplicate, { ...E1, operationId }),
    /session reference operation receipt is duplicated/
  );
});

test('recordSessionRefOnChange appends on sid change, preserving prior (AC3)', () => {
  const seeded = appendSessionRef('## Body\n', E1);
  const { body, appended } = recordSessionRefOnChange(seeded, E2);
  assert.equal(appended, true);
  assert.deepEqual(parseSessionRefs(body), [E1, E2]);
});

test('recordSessionRefOnChange appends on jsonlPath change with same sid (AC3)', () => {
  const seeded = appendSessionRef('## Body\n', E1);
  const moved = { sid: E1.sid, jsonlPath: '/t/moved.jsonl', ts: '2026-06-21T02:00:00Z' };
  const { body, appended } = recordSessionRefOnChange(seeded, moved);
  assert.equal(appended, true);
  assert.deepEqual(parseSessionRefs(body), [E1, moved]);
});

test('mostRecentSessionRef returns the last entry (or null)', () => {
  assert.equal(mostRecentSessionRef('## Body\n'), null);
  const body = appendSessionRef(appendSessionRef('## Body\n', E1), E2);
  assert.deepEqual(mostRecentSessionRef(body), E2);
});

test('falsy sid is a clean skip — no placeholder written (AC5)', () => {
  const before = '## Body\n';
  const { body, appended } = recordSessionRefOnChange(before, {
    sid: '',
    jsonlPath: '/x',
    ts: 't',
  });
  assert.equal(appended, false);
  assert.equal(body, before);
  assert.deepEqual(parseSessionRefs(body), []);
});

test('appendSessionRef inserts before the aitm-fields trailer', () => {
  const body = '## Body\n\n<!-- aitm-fields: {"schema":1} -->\n';
  const next = appendSessionRef(body, E1);
  const idxRef = next.indexOf('aitm-session-ref');
  const idxFields = next.indexOf('aitm-fields');
  assert.ok(idxRef > -1 && idxRef < idxFields, 'session-ref precedes aitm-fields');
});

test('findLostMarkers flags a dropped prior entry but passes when entries grow (AC6)', () => {
  const one = appendSessionRef('## Body\n', E1);
  const two = appendSessionRef(one, E2);
  // Append-only growth: no loss.
  assert.deepEqual(findLostMarkers(one, two), []);
  // Dropping an entry: flagged.
  assert.deepEqual(findLostMarkers(two, one), ['aitm-session-ref']);
  // Dropping all entries: flagged.
  assert.deepEqual(findLostMarkers(one, '## Body\n'), ['aitm-session-ref']);
});
