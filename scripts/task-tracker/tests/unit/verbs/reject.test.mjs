// @story #996
// #996 — `reject.mjs` posted a second, self-authored audit row after
// `runMoveState` already wrote a correct `develop:started` entry row. That
// second row used the bare, unqualified event slug `develop`, which
// `timing-log-sequence`'s `isKnownSlug()` rejects (only `develop:started` /
// `develop:completed` etc are recognized bare-phase forms) — flagged
// `malformed — unknown event slug "develop"` (discovered live on #931). Fixed
// by re-qualifying to `rejected:develop`, mirroring `demote.mjs`'s existing
// `demoted:<state>` convention: any colon-qualified slug passes
// `isKnownSlug()` unconditionally, and `stageOf('rejected:develop')` returns
// null (since `rejected` is not itself a ladder stage), so the row is a pure
// audit note, never a stage transition.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verbReject } from '../../../verbs/reject.mjs';
import { validate } from '../../../lib/agent-review/validators/timing-log-sequence.mjs';

const HEADER = '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |';
const SEP = '|---|---|---|---|---|---|---|';

function bodyWith(rows) {
  return ['## ⏱ Timing Log', '', HEADER, SEP, ...rows, ''].join('\n') + '\n';
}

function driveVerbReject() {
  const posted = [];
  const moves = [];
  const ctx = {
    cfg: { repo: 'kburson/ai-task-manager' },
    statePath: '/nonexistent/state.json',
    rest: ['#996', '--reason', 'gate objection'],
    SKIP_NETWORK: true,
    pexec: async () => ({ stdout: '{}' }),
    safePostTiming: async (_target, row) => {
      posted.push(row);
    },
    runMoveState: async (_target, state) => {
      moves.push(state);
      return { ok: true };
    },
    getIssueBoardState: async () => 'review',
    nowIso: () => new Date().toISOString(),
  };
  return { posted, moves, ctx };
}

test('reject.mjs posts an audit row with event slug `rejected:develop`, not bare `develop`', async () => {
  const { posted, moves, ctx } = driveVerbReject();
  await verbReject(ctx);

  assert.equal(moves.length, 1, 'exactly one Review→Develop move');
  assert.equal(moves[0], 'develop');

  assert.equal(posted.length, 1, 'exactly one self-posted audit row');
  const [row] = posted;
  assert.ok(
    row.includes('| rejected:develop |'),
    `posted row must carry the rejected:develop event slug, got: ${row}`
  );
  assert.ok(
    !row.includes('| develop |'),
    `posted row must never carry the bare malformed develop slug, got: ${row}`
  );
});

test('a timing log containing a `rejected:develop` row passes timing-log-sequence validation', () => {
  const ts = '2026-07-26 13:00:00 -05:00';
  const rejectedTs = '2026-07-26 13:05:00 -05:00';
  const body = bodyWith([
    `| ${ts} | develop:started |  |  |  | 0 | entered develop |`,
    `| ${rejectedTs} | rejected:develop |  |  |  | 0 | review rejected: gate objection |`,
  ]);
  const ctx = {
    comments: [{ body }],
    markers: { enteredStages: [{ stage: 'develop' }] },
  };
  const res = validate(ctx);
  assert.deepEqual(
    res.failures.filter((f) => /malformed — unknown event slug/.test(f)),
    [],
    `rejected:develop must not be flagged as a malformed/unknown slug: ${JSON.stringify(res.failures)}`
  );
});
