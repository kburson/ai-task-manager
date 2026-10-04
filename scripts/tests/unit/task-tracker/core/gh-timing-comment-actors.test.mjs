// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRow, buildFlushRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import {
  appendRow,
  buildInitialComment,
} from '../../../../task-tracker/gh-timing-comment.internals.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { postTimingEvent } from '../../../../task-tracker/gh-timing-comment.mjs';
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

test('attributed publication reconciles ambiguous success against canonical exact-row replay', async () => {
  let body = buildInitialComment();
  let writes = 0;
  let reads = 0;
  const deps = {
    findTimingComment: async () => ({ id: 'IC_real', body }),
    readCanonicalTimingSource: async () => {
      reads++;
      return {
        status: 'found',
        source: { repository: 'owner/repo', issue: 1857, commentNodeId: 'IC_real', body },
      };
    },
    updateTimingComment: async (id, repo, updated) => {
      assert.equal(id, 'IC_real');
      assert.equal(repo, 'owner/repo');
      body = updated;
      writes++;
      if (writes === 1) throw new Error('response lost after remote acceptance');
    },
  };
  const args = { issueNumber: 1857, repo: 'owner/repo', row: make(), lock: false, deps };
  await assert.rejects(postTimingEvent(args), /response lost/);
  await postTimingEvent(args);
  assert.equal(writes, 1, 'exact accepted replay needs no second mutation');
  assert.equal(
    body
      .split('\n')
      .map(parseTimingRow)
      .filter((row) => row?.actorKey).length,
    1
  );
  assert.ok(reads >= 3, 'successful return includes fresh canonical readback');
});

test('attributed publication refuses ambiguous census and unobserved writes', async () => {
  let writes = 0;
  const source = {
    repository: 'owner/repo',
    issue: 1857,
    commentNodeId: 'IC_real',
    body: buildInitialComment(),
  };
  const args = { issueNumber: 1857, repo: 'owner/repo', row: make(), lock: false };
  await assert.rejects(
    postTimingEvent({
      ...args,
      deps: {
        findTimingComment: async () => ({ id: 'IC_real', body: source.body }),
        readCanonicalTimingSource: async () => ({
          status: 'error',
          error: new Error('ambiguous corpus'),
        }),
        updateTimingComment: async () => {
          writes++;
        },
      },
    }),
    /ambiguous corpus/
  );
  assert.equal(writes, 0);
  await assert.rejects(
    postTimingEvent({
      ...args,
      deps: {
        findTimingComment: async () => ({ id: 'IC_real', body: source.body }),
        readCanonicalTimingSource: async () => ({ status: 'found', source }),
        updateTimingComment: async () => {
          writes++;
        },
      },
    }),
    /timing-publication:readback/
  );
  assert.equal(writes, 1);
});

test('attributed creation requires fresh unique canonical identity and matching issue', async () => {
  let body = null;
  let reads = 0;
  await postTimingEvent({
    issueNumber: '#1857',
    repo: 'owner/repo',
    row: make(),
    lock: false,
    deps: {
      findTimingComment: async () => null,
      readCanonicalTimingSource: async () => {
        reads++;
        return body === null
          ? { status: 'absent', source: null }
          : {
              status: 'found',
              source: { repository: 'owner/repo', issue: 1857, commentNodeId: 'IC_created', body },
            };
      },
      createTimingComment: async (_issue, _repo, value) => {
        body = value;
      },
    },
  });
  assert.equal(reads, 2);
  await assert.rejects(
    postTimingEvent({
      issueNumber: 1857,
      repo: 'owner/repo',
      row: make(),
      lock: false,
      deps: {
        findTimingComment: async () => ({ id: 'IC_other', body }),
        updateTimingComment: async () => {},
        readCanonicalTimingSource: async () => ({
          status: 'found',
          source: { repository: 'owner/repo', issue: 1858, commentNodeId: 'IC_other', body },
        }),
      },
    }),
    /timing-publication:source/
  );
});

// @story #1876
test('runtime opener replay ignores only its publisher-derived delta', () => {
  const start = buildRow({
    ts: now - 3000,
    event: 'start',
    actorKey: key,
    deltaWords: 0,
    wordMarker: 100,
    fullWordMarker: 1000,
  });
  const started = appendRow(buildInitialComment(), start);
  assert.equal(parseTimingRow(start).cells[5], '');
  assert.equal(appendRow(started, start), started);
  const pause = buildRow({
    ts: now - 2000,
    event: 'pause:blocked',
    actorKey: key,
    deltaWords: 0,
    wordMarker: 110,
    fullWordMarker: 1010,
  });
  const resumed = buildRow({
    ts: now - 1000,
    event: 'resumed',
    actorKey: key,
    deltaWords: 0,
    wordMarker: 117,
    fullWordMarker: 1020,
  });
  const body = appendRow(appendRow(started, pause), resumed);
  assert.equal(
    body
      .split('\n')
      .map(parseTimingRow)
      .filter((row) => row?.event === 'resumed')[0].cells[5],
    '7'
  );
  assert.equal(appendRow(body, resumed), body);
});

test('queued original opener drains after an accepted write loses its response', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { default: path } = await import('node:path');
  const { projectScratchDir } = await import('../../../../task-tracker/lib/scratch-dir.mjs');
  const { enqueue, peek, drainMatching } = await import('../../../../task-tracker/queue.mjs');
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'actor-replay-'));
  const queuePath = path.join(dir, 'queue.json');
  let body = buildInitialComment();
  let writes = 0;
  const row = buildRow({
    ts: now,
    event: 'start',
    actorKey: key,
    deltaWords: 0,
    wordMarker: 10,
    fullWordMarker: 100,
  });
  const deps = {
    findTimingComment: async () => ({ id: 'IC_replay', body }),
    readCanonicalTimingSource: async () => ({
      status: 'found',
      source: {
        repository: 'owner/repo',
        issue: 1876,
        commentNodeId: 'IC_replay',
        body,
      },
    }),
    updateTimingComment: async (_id, _repo, value) => {
      body = value;
      writes++;
      if (writes === 1) throw new Error('response lost after acceptance');
    },
  };
  try {
    const result = await postTimingSafely(
      { issue: 1876, repo: 'owner/repo', row, queuePath },
      {
        postTimingEvent: (args) => postTimingEvent({ ...args, lock: false, deps }),
        enqueue,
        warn: () => {},
      }
    );
    assert.equal(result.queued, true);
    assert.equal(peek(queuePath)[0].row, row);
    const drained = await drainMatching(
      (event) =>
        postTimingEvent({
          issueNumber: event.issue,
          repo: 'owner/repo',
          row: event.row,
          lock: false,
          deps,
        }),
      queuePath,
      (event) => event.issue === 1876
    );
    assert.deepEqual(drained, { delivered: 1, pending: 0 });
    assert.deepEqual(peek(queuePath), []);
    assert.equal(writes, 1, 'the accepted original is acknowledged without another update');
    assert.equal(
      body
        .split('\n')
        .map(parseTimingRow)
        .filter((value) => value?.actorKey).length,
      1
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// @story #1876
test('actor replay preserves every non-derived cell and marker in its identity', () => {
  const start = buildRow({
    ts: now - 3000,
    event: 'start',
    actorKey: key,
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 100,
    fullWordMarker: 1000,
    description: 'original opener',
  });
  const body = appendRow(buildInitialComment(), start);
  for (const extra of [
    { ts: now - 2000 },
    { wordMarker: 101 },
    { fullWordMarker: 1001 },
    { activeSec: 1 },
    { idleSec: 1 },
    { description: 'changed opener' },
  ]) {
    const changed = buildRow({
      ts: now - 3000,
      event: 'start',
      actorKey: key,
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      wordMarker: 100,
      fullWordMarker: 1000,
      description: 'original opener',
      ...extra,
    });
    assert.throws(() => appendRow(body, changed), /duplicate actor start/);
  }
  assert.throws(() => appendRow(body, start.replace('a=0', 'a=1')), /duplicate actor start/);
  const independent = start.replace(key.slice(3), other.slice(3));
  assert.notEqual(appendRow(body, independent), body);
});

test('an additional interval row cell is conflicting evidence, never an accepted replay', () => {
  const original = make();
  const body = appendRow(buildInitialComment(), original);
  const changed = original.replace(' | <!-- aitm-actor:', ' | | new evidence | <!-- aitm-actor:');
  assert.throws(() => appendRow(body, changed), /conflicting-interval/);
});
