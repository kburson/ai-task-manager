// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRow, buildFlushRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import {
  appendRow,
  buildInitialComment,
} from '../../../../task-tracker/gh-timing-comment.internals.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { timingActorKey } from '../../../../task-tracker/lib/timing-actor.mjs';
import { postTimingSafely } from '../../../../task-tracker/lib/timing-post-outcome.mjs';
const key = timingActorKey({ provider: 'codex', sid: 'original-author' });
const other = timingActorKey({ provider: 'claude', sid: 'another-author' });
const now = Date.now();
const evidence = {
  startMs: now - 60000,
  endMs: now,
  activeEstimateSec: null,
  wordStart: 100,
  wordEnd: 112,
  fullWordStart: 1000,
  fullWordEnd: 1020,
};
const make = (extra = {}) =>
  buildRow({
    ts: now,
    event: 'pause:blocked',
    activeSec: null,
    idleSec: null,
    actorKey: key,
    engagement: evidence,
    wordMarker: 112,
    fullWordMarker: 1020,
    ...extra,
  });
test('row builders preserve unavailable estimates and explicit current actor interval', () => {
  const row = make();
  assert.equal(parseTimingRow(row).actorKey, key);
  assert.deepEqual(parseTimingRow(row).engagement, evidence);
  assert.ok(row.includes('Unknown'));
  assert.ok(!row.includes('row-sec: a=0'));
  const flush = buildFlushRow({
    ts: now,
    event: 'pause:blocked',
    activeMin: null,
    idleMin: null,
    actorKey: key,
    engagement: evidence,
    wordMarker: 112,
    fullWordMarker: 1020,
  });
  assert.deepEqual(parseTimingRow(flush).engagement, evidence);
});
test('first attributed flush keeps own word delta after larger unrelated legacy cursor', () => {
  const old = buildRow({ ts: now - 1000, event: 'start', wordMarker: 9000, fullWordMarker: 19000 });
  const body = appendRow(appendRow(buildInitialComment(), old), make());
  const row = body
    .split('\n')
    .map(parseTimingRow)
    .filter((r) => r?.actorKey === key)
    .at(-1);
  assert.equal(row.cells[5], '12');
  assert.equal(row.wordMarker, '112');
  assert.equal(row.fullWordMarker, '1,020');
});
test('different actors may start independently and immutable replay appends only once', () => {
  const start = (actorKey) =>
    buildRow({ ts: now, event: 'start', actorKey, wordMarker: 0, fullWordMarker: 0 });
  let body = appendRow(buildInitialComment(), start(key));
  body = appendRow(body, start(other));
  assert.equal(
    body
      .split('\n')
      .map(parseTimingRow)
      .filter((r) => r?.actorKey).length,
    2
  );
  assert.equal(appendRow(body, start(other)), body);
});
test('queue freezes original evidence before failed publication and never reattributes it', async () => {
  const row = make();
  const queue = [];
  const result = await postTimingSafely(
    { issue: 1857, row, repo: 'owner/repo', queuePath: 'unused' },
    {
      postTimingEvent: async () => {
        throw new Error('unavailable');
      },
      enqueue: (entry) => queue.push(entry),
      warn: () => {},
    }
  );
  assert.equal(result.queued, true);
  assert.equal(parseTimingRow(queue[0].row).actorKey, key);
  assert.deepEqual(parseTimingRow(queue[0].row).engagement, evidence);
});

test('builder second-resolution timestamp retains exact millisecond interval for accounting', async () => {
  const { deriveActorEngagement } =
    await import('../../../../task-tracker/lib/timing-engagement.mjs');
  const parsed = parseTimingRow(make());
  const result = deriveActorEngagement([parsed], now + 1000);
  assert.equal(result.engagedMs, 60000);
  assert.deepEqual(result.failures, []);
});
test('whole-issue terminal suppression remains unconditional for attributed rows', () => {
  const closed = buildRow({ ts: now, event: 'issue:closed', wordMarker: 0, fullWordMarker: 0 });
  const body = appendRow(buildInitialComment(), closed);
  assert.equal(appendRow(body, make()), body);
});

test('same interval with a different lifecycle event is a conflict, not a dropped replay', () => {
  const body = appendRow(buildInitialComment(), make());
  assert.throws(
    () => appendRow(body, make({ event: 'issue:wrap' })),
    new RegExp('conflicting-interval')
  );
  assert.equal(appendRow(body, make()), body);
});

test('canonical timing source requires a complete unambiguous issue comment census', async () => {
  const { readCanonicalTimingSource } =
    await import('../../../../task-tracker/gh-timing-comment.mjs');
  const page = (nodes, hasNextPage = false, endCursor = null, totalCount = nodes.length) => ({
    data: {
      repository: {
        nameWithOwner: 'owner/repo',
        issue: {
          number: 1857,
          comments: { nodes, totalCount, pageInfo: { hasNextPage, endCursor } },
        },
      },
    },
  });
  const timing = { id: 'IC_timing', body: '⏱ Timing Log\ncanonical rows\n' };
  const response = await readCanonicalTimingSource({
    issueNumber: 1857,
    repo: 'owner/repo',
    deps: { graphql: async () => page([timing]) },
  });
  assert.equal(response.status, 'found');
  assert.equal(response.source.commentNodeId, 'IC_timing');
  assert.equal(response.source.body, timing.body);
  for (const broken of [
    page([timing, { ...timing, id: 'IC_other' }]),
    page([timing], false, null, 2),
    page([timing], true, null, 2),
    {
      data: {
        repository: {
          nameWithOwner: 'other/repo',
          issue: {
            number: 1857,
            comments: {
              nodes: [timing],
              totalCount: 1,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    },
  ]) {
    const result = await readCanonicalTimingSource({
      issueNumber: 1857,
      repo: 'owner/repo',
      deps: { graphql: async () => broken },
    });
    assert.equal(result.status, 'error');
  }
  let calls = 0;
  const paged = await readCanonicalTimingSource({
    issueNumber: 1857,
    repo: 'owner/repo',
    deps: {
      graphql: async ({ after }) => {
        calls++;
        return after === null
          ? page([{ id: 'IC_unrelated', body: 'ordinary' }], true, 'cursor', 2)
          : page([timing], false, null, 2);
      },
    },
  });
  assert.equal(paged.status, 'found');
  assert.equal(calls, 2);
});

test('canonical timing source ignores quoted heading mentions in unrelated records', async () => {
  const { readCanonicalTimingSource } =
    await import('../../../../task-tracker/gh-timing-comment.mjs');
  const result = await readCanonicalTimingSource({
    issueNumber: 1857,
    repo: 'owner/repo',
    deps: {
      graphql: async () => ({
        data: {
          repository: {
            nameWithOwner: 'owner/repo',
            issue: {
              number: 1857,
              comments: {
                totalCount: 2,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  { id: 'IC_real', body: '⏱ Timing Log\nrows\n' },
                  {
                    id: 'IC_outcome',
                    body: 'Outcome source mentions ⏱ Timing Log but is not the timing comment.',
                  },
                ],
              },
            },
          },
        },
      }),
    },
  });
  assert.equal(result.status, 'found');
  assert.equal(result.source.commentNodeId, 'IC_real');
});
