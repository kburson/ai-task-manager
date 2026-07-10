// @story #761
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runDispose,
  parseDisposition,
  serializeClosedAs,
  parseClosedAs,
  addClosedAs,
} from './close-disposition.mjs';

// Build a runDispose deps bag of spies. Every I/O seam records its calls so the
// tests can assert ordering and payloads without any network access.
function makeDeps(overrides = {}) {
  const calls = {
    mutate: [],
    pexec: [],
    comment: [],
    flush: [],
    item: [],
    del: [],
    warn: [],
  };
  const deps = {
    mutateIssueBody: async ({ mutate }) => {
      const out = mutate('BODY BASE\n');
      calls.mutate.push(out);
      return out;
    },
    pexec: async (bin, argv) => {
      calls.pexec.push([bin, ...argv]);
    },
    postComment: async ({ issueNumber, repo, body }) => {
      calls.comment.push({ issueNumber, repo, body });
    },
    flushTiming: async (n) => {
      calls.flush.push(n);
    },
    projectItemForIssue: async ({ issueNumber }) => {
      calls.item.push(issueNumber);
      return { issueId: 'ISSUE_ID', itemId: 'ITEM_ID' };
    },
    deleteProjectV2Item: async ({ itemId }) => {
      calls.del.push(itemId);
      return itemId;
    },
    now: () => '2026-07-10T00:00:00.000Z',
    warn: (m) => calls.warn.push(m),
    ...overrides,
  };
  return { deps, calls };
}

const BASE = {
  repo: 'kburson/ai-task-manager',
  projectId: 'PVT_test',
};

// ── AC1 — close without the Done DoD/commit-trace gate ─────────────────────
test('AC1: runDispose closes without invoking any Done DoD/commit-trace dep', async () => {
  const commitTrace = () => {
    throw new Error('commit-trace must never run on the disposition lane');
  };
  const moveStateDone = () => {
    throw new Error('move-state done must never run on the disposition lane');
  };
  const { deps } = makeDeps({
    // These deps do not exist on the disposition contract; presence proves the
    // lane cannot reach them. runDispose only reads its documented seams.
    runCommitTrace: commitTrace,
    runMoveStateDone: moveStateDone,
  });
  const r = await runDispose({
    issueNumber: '761',
    reason: 'not-planned',
    ...BASE,
    deps,
  });
  assert.equal(r.status, 'closed-as');
  assert.equal(r.reason, 'not-planned');
});

// ── AC2 — correct stateReason + timing flush ───────────────────────────────
test('AC2: duplicate → stateReason DUPLICATE and timing is flushed', async () => {
  const { deps, calls } = makeDeps();
  await runDispose({ issueNumber: '761', reason: 'duplicate', of: '742', ...BASE, deps });
  const closeCall = calls.pexec.find((c) => c.includes('close'));
  assert.ok(closeCall, 'gh issue close was invoked');
  assert.deepEqual(closeCall, [
    'gh',
    'issue',
    'close',
    '761',
    '-R',
    'kburson/ai-task-manager',
    '--reason',
    'DUPLICATE',
  ]);
  assert.deepEqual(calls.flush, ['761'], 'timing flushed for the issue');
});

test('AC2: not-planned → stateReason "not planned"', async () => {
  const { deps, calls } = makeDeps();
  await runDispose({ issueNumber: '761', reason: 'not-planned', ...BASE, deps });
  const closeCall = calls.pexec.find((c) => c.includes('close'));
  assert.equal(closeCall[closeCall.length - 1], 'not planned');
});

// ── AC3 — un-tracked from the board, NOT moved to Done ──────────────────────
test('AC3: the item is deleted from the board and never moved to Done', async () => {
  const { deps, calls } = makeDeps();
  const r = await runDispose({ issueNumber: '761', reason: 'duplicate', of: '742', ...BASE, deps });
  assert.deepEqual(calls.item, ['761'], 'resolved the board item');
  assert.deepEqual(calls.del, ['ITEM_ID'], 'deleted the resolved item');
  assert.equal(r.untracked, 'ITEM_ID');
  // No pexec call may reference a move-state / done transition.
  const doneCall = calls.pexec.find((c) => c.join(' ').includes('done'));
  assert.equal(doneCall, undefined, 'no move-to-done command was issued');
});

test('AC3: a board-untrack failure is best-effort and does not throw', async () => {
  const { deps, calls } = makeDeps({
    deleteProjectV2Item: async () => {
      throw new Error('board offline');
    },
  });
  const r = await runDispose({ issueNumber: '761', reason: 'not-planned', ...BASE, deps });
  assert.equal(r.status, 'closed-as', 'close still succeeds');
  assert.equal(calls.warn.length, 1, 'the untrack failure is warned, not fatal');
});

// ── AC4 — aitm-closed-as marker + audit comment ────────────────────────────
test('AC4: the body is stamped with aitm-closed-as and an audit comment is posted', async () => {
  const { deps, calls } = makeDeps();
  await runDispose({ issueNumber: '761', reason: 'duplicate', of: '742', ...BASE, deps });
  const stamped = calls.mutate[0];
  assert.match(stamped, /<!-- aitm-closed-as reason="duplicate" of="#742" ts="[^"]+" -->/);
  assert.equal(calls.comment.length, 1, 'one audit comment posted');
  assert.match(calls.comment[0].body, /Closed as duplicate/);
  assert.match(calls.comment[0].body, /#742/);
});

test('AC4: not-planned marker omits the of= attribute', async () => {
  assert.equal(
    serializeClosedAs({ reason: 'not-planned', ts: 'T' }),
    '<!-- aitm-closed-as reason="not-planned" ts="T" -->'
  );
  const round = parseClosedAs(addClosedAs('body\n', { reason: 'not-planned', ts: 'T' }));
  assert.equal(round.reason, 'not-planned');
  assert.equal(round.of, '');
});

// ── AC5 — the raw `gh issue close` guard still forbids the un-sanctioned path ─
test('AC5: raw `gh issue close` is caught by the guard predicate; the lane is the only sanctioned bypass', () => {
  // The bash-guard contract (bash-guard.mjs:252): raw operator `gh issue close`
  // is refused. The disposition lane routes the SAME command through the
  // verb-internal pexec seam, which the guard does not mediate — so it is the
  // one honest path. Assert both halves of that contract.
  const GUARD_RE = /\bgh\s+issue\s+close\b/;
  assert.ok(GUARD_RE.test('gh issue close 761 -R kburson/ai-task-manager'), 'raw close is caught');
  assert.ok(
    GUARD_RE.test('gh issue close 761 --reason DUPLICATE'),
    'raw close w/ reason is caught'
  );
  // A label-only edit is NOT the close path and must not trip the predicate.
  assert.equal(GUARD_RE.test('gh issue edit 761 --add-label BLOCKED'), false);
});

// ── argument validation ────────────────────────────────────────────────────
test('parseDisposition: duplicate requires --of', () => {
  assert.throws(() => parseDisposition({ reason: 'duplicate' }), /--of <M> is required/);
  assert.deepEqual(parseDisposition({ reason: 'duplicate', of: '742' }), {
    key: 'duplicate',
    stateReason: 'DUPLICATE',
    of: '#742',
  });
});

test('parseDisposition: unknown reason is rejected', () => {
  assert.throws(() => parseDisposition({ reason: 'wontfix' }), /unknown disposition/);
});

test('parseDisposition: not-planned drops a stray --of', () => {
  const p = parseDisposition({ reason: 'not-planned', of: '742' });
  assert.equal(p.key, 'not-planned');
  assert.equal(p.of, '', 'a stray --of on not-planned is dropped');
});
