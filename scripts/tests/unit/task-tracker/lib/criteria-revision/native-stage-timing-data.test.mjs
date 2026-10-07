// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import * as timing from '../../../../../task-tracker/gh-timing-comment.mjs';
import { timingActorKey } from '../../../../../task-tracker/lib/timing-actor.mjs';
import { parseTimingRow } from '../../../../../task-tracker/lib/timing-row-reader.mjs';

test('recorded actor publication validates actual native create and idempotent append bytes without returning a row', async () => {
  const now = Date.now();
  const row = timing.buildRow({ ts: now, event: 'update', activeSec: null, idleSec: null,
    actorKey: timingActorKey({ provider: 'codex', sid: 'native-stage-data' }),
    wordMarker: 4, fullWordMarker: 4,
    engagement: { startMs: now - 2000, endMs: now, activeEstimateSec: null,
      wordStart: 0, wordEnd: 4, fullWordStart: 0, fullWordEnd: 4 } });
  let body = null, creates = 0, updates = 0;
  const deps = {
    readCanonicalTimingSource: async () => body === null ? { status: 'absent', source: null } : {
      status: 'found', source: { repository: 'owner/repo', issue: 1855, commentNodeId: 'IC_timing', body } },
    createTimingComment: async (issue, repo, next) => { assert.equal(issue, 1855); assert.equal(repo, 'owner/repo'); creates++; body = next; },
    updateTimingComment: async () => { updates++; },
  };
  await timing.postTimingEvent({ issueNumber: 1855, repo: 'owner/repo', row, lock: false, deps });
  const parsed = body.split('\n').map(parseTimingRow).filter(value => value?.actorKey);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].wordMarker, '4'); assert.equal(parsed[0].event, 'update');
  assert.equal(timing.assertRecordedStageActorTiming({ row, beforeBody: null, afterBody: body }), undefined);
  assert.equal(timing.assertRecordedStageActorTiming({ row, beforeBody: body, afterBody: body }), undefined);
  await timing.postTimingEvent({ issueNumber: 1855, repo: 'owner/repo', row, lock: false, deps });
  assert.equal(creates, 1); assert.equal(updates, 0);
  for (const changed of [
    { row, beforeBody: null, afterBody: body + 'unrelated\n' },
    { row, beforeBody: body, afterBody: body.replace('⏱ Timing Log', 'Changed heading') },
    { row, beforeBody: null, afterBody: body, ready: true },
    { row: 'not a row', beforeBody: null, afterBody: body },
    { row: timing.buildRow({ ts: now, event: 'update', wordMarker: 0, fullWordMarker: 0 }), beforeBody: null, afterBody: body },
  ]) assert.throws(() => timing.assertRecordedStageActorTiming(changed));
});


import { nativeStageTimingPages } from '../../../../../task-tracker/lib/criteria-revision/stage-execution.mjs';
const resourceInput = () => ({ repository: 'owner/repo', issue: 1855, comments: [
  { id: '1', nodeId: 'IC_one', bytes: JSON.stringify({ id: 1, node_id: 'IC_one',
    issue_url: 'https://api.github.com/repos/owner/repo/issues/1855', body: 'original authority bytes', user: { login: 'actor' } }) },
] });
for (const [label, change] of [
  ['unknown input', value => { value.ready = true; }],
  ['foreign subject', value => { value.issue++; }],
  ['duplicate ID', value => { value.comments.push(structuredClone(value.comments[0])); }],
  ['mismatched node', value => { value.comments[0].nodeId = 'IC_other'; }],
  ['unknown resource key', value => { value.comments[0].approved = true; }],
  ['unsafe ID', value => { value.comments[0].id = '9007199254740992'; }],
]) test(`native memory timing page data refuses ${label}`, () => {
  const input = resourceInput(); change(input);
  assert.throws(() => nativeStageTimingPages(input));
});
test('native memory timing pages retain complete census and actual canonical pagination semantics', async () => {
  const input = resourceInput();
  input.comments = Array.from({ length: 101 }, (_, index) => {
    const id = String(index + 1), nodeId = `IC_${id}`;
    return { id, nodeId, bytes: JSON.stringify({ id: index + 1, node_id: nodeId,
      issue_url: 'https://api.github.com/repos/owner/repo/issues/1855', body: `authority member ${id}` }) };
  });
  const before = structuredClone(input), pages = nativeStageTimingPages(input);
  assert.equal(pages.length, 2); assert.equal(pages[0].response.data.repository.issue.comments.nodes.length, 100);
  assert.equal(pages[1].response.data.repository.issue.comments.nodes.length, 1);
  let index = 0;
  const result = await timing.readCanonicalTimingSource({ repo: input.repository, issueNumber: input.issue,
    deps: { graphql: async request => { const pair = pages[index++]; assert.deepEqual(request, pair.request); return pair.response; } } });
  assert.equal(result.status, 'absent'); assert.equal(index, 2);
  assert.deepEqual(input, before);
  assert.deepEqual(nativeStageTimingPages(JSON.parse(JSON.stringify(input))), pages);
});


test('recorded shared phase append validates actual native legacy bytes without returning row authority', async () => {
  const ts = new Date().toISOString(), transitionId = 'move:12345678-1234-4234-8234-123456789abc';
  let body = timing.__internals.buildInitialComment();
  const offsetMin = -new Date(ts).getTimezoneOffset();
  for (const phase of ['develop:complete', 'test:enter']) {
    const [state, boundary] = phase.split(':');
    const row = timing.withTimingTransition(timing.buildRow({ ts, phase: { state, phase: boundary },
      activeSec: 0, idleSec: 0, deltaWords: 0, wordMarker: 0, fullWordMarker: 0 }), transitionId);
    const beforeBody = body; let updates = 0;
    const result = await timing.postTimingEvent({ issueNumber: 1855, repo: 'owner/repo', row, lock: false,
      deps: { findTimingComment: async () => ({ id: 'IC_timing', body }),
        updateTimingComment: async (id, repo, next) => { assert.equal(id, 'IC_timing'); assert.equal(repo, 'owner/repo'); updates++; body = next; } } });
    assert.equal(result, undefined); assert.equal(updates, 1);
    const input = { phase, ts, offsetMin, transitionId, row, beforeBody, afterBody: body };
    assert.equal(timing.assertRecordedStagePhaseTiming(input), undefined);
    for (const delta of [{ phase: 'review:complete' }, { row: row + 'extra' }, { beforeBody: null },
      { afterBody: body + 'unrelated' }, { transitionId: 'move:22345678-1234-4234-8234-123456789abc' },
      { ready: true }, { offsetMin: offsetMin + 60 }, { ts: '2000-01-01T00:00:00.000Z' }])
      assert.throws(() => timing.assertRecordedStagePhaseTiming({ ...input, ...delta }));
  }
});
