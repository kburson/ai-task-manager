// @story #1855
// Recorded body derivation is pure data, never stage admission.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as data from '../../../../../task-tracker/lib/criteria-revision/native-stage-data.mjs';

const entryTs = '2026-10-06T10:00:00.000Z';
const stateTs = '2026-10-06T10:00:00.010Z';
const before = '<!-- aitm-last-known-state state="develop" ts="2026-10-06T09:00:00.000Z" -->\n## Scope\nKeep this text.\n\n<!-- aitm-body-version version="4" -->\n';
const entry = { kind: 'entry-body', entryTs, stateTs, visit: 1 };
const derive = (body, intent) => data.deriveRecordedStageBody({ body, transitionId: 'move-124-test', intent });
const entered = '<!-- aitm-last-known-state state="test" ts="2026-10-06T10:00:00.010Z" -->\n## Scope\nKeep this text.\n\n## AITM Progress Markers\n\n<!-- aitm-entered-test ts="2026-10-06T10:00:00.000Z" move="move-124-test" -->\n\n<!-- aitm-body-version version="5" -->\n';

test('recorded entry derives separate timestamps, first visit and exactly one native version increment', () => {
  assert.equal(derive(before, entry), entered);
  assert.equal(derive(entered, entry), entered, 'the same sealed mutation is a native no-op');
});

test('recorded sentinel is exact native upsert and compensation leaves the target visit intact', () => {
  const sentinel = { kind: 'sentinel-body', ts: '2026-10-06T10:00:01.000Z' };
  const completed = derive(entered, sentinel);
  assert.equal(completed, entered.replace('\n\n<!-- aitm-body-version version="5" -->\n', '') +
    '\n<!-- aitm-move-complete state=test ts=2026-10-06T10:00:01.000Z move=move-124-test -->\n\n<!-- aitm-body-version version="6" -->\n');
  assert.equal(derive(completed, sentinel), completed.replace('version="6"', 'version="7"'),
    'a new ordinary sentinel invocation retains native whitespace/version semantics; journal retry must skip completed leaves');
  const reverted = derive(entered, { kind: 'rollback-state', stateTs: '2026-10-06T10:00:02.000Z', priorState: 'develop' });
  assert.equal(reverted, entered.replace('state="test" ts="2026-10-06T10:00:00.010Z"',
    'state="develop" ts="2026-10-06T10:00:02.000Z"').replace('version="5"', 'version="6"'));
  assert.equal(derive(reverted, { kind: 'rollback-state', stateTs, priorState: 'develop' }), reverted);
});

test('recorded stage body refuses unknown intent, forged visit, arbitrary bytes and invalid clock data', () => {
  for (const intent of [{ ...entry, visit: 2 }, { ...entry, entryTs: 'bad' },
    { ...entry, afterBody: 'forged' }, { kind: 'body', body: 'forged' },
    { kind: 'rollback-state', stateTs, priorState: 'done' },
    { kind: 'sentinel-body', ts: stateTs, ready: true }]) {
    assert.throws(() => derive(before, intent), /native-stage-body/);
  }
  assert.throws(() => data.deriveRecordedStageBody({ body: before, transitionId: 'move-124-test', intent: entry, ready: true }), /native-stage-body/);
});

import { versionedWriteBody } from '../../../../../task-tracker/lib/versioned-issue-write.mjs';
import { writeMoveCompleteMarker } from '../../../../../task-tracker/lib/move-state/sentinel.mjs';

test('recorded sentinel bytes match actual native versioned mutation including a separate repeated invocation', async () => {
  let remote = entered;
  let pushes = 0;
  const intent = { kind: 'sentinel-body', ts: '2026-10-06T10:00:01.000Z' };
  for (const expectedVersion of [6, 7]) {
    const expected = derive(remote, intent);
    const actual = await versionedWriteBody({ issueNumber: 124, repo: 'o/r',
      mutate: base => writeMoveCompleteMarker(base, 'test', intent.ts, 'move-124-test'),
      deps: { fetchBody: async () => remote, pushBody: async (_repo, _issue, body) => { remote = body; pushes++; } } });
    assert.equal(actual.body, expected);
    assert.equal(actual.version, expectedVersion);
  }
  assert.equal(pushes, 2);
});
