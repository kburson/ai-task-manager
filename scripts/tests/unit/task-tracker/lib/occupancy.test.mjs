import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  claimOccupancy,
  forceReleaseOccupancy,
  heartbeatOccupancy,
  readOccupancy,
  releaseOccupancy,
  rollbackOccupancyClaim,
} from '../../../../task-tracker/lib/occupancy.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'aitm-occupancy-'));
  const file = path.join(root, '.tmp', 'aitm', 'fleet', 'occupancy.json');
  const now = (() => {
    let tick = 0;
    return () => `2026-08-19T00:00:${String(tick++).padStart(2, '0')}.000Z`;
  })();
  const claim = (overrides = {}, options = {}) =>
    claimOccupancy(
      {
        occupancyFile: file,
        issue: 1325,
        sid: 'codex-a',
        provider: 'codex',
        worktreePath: '/repo/wt-a',
        now,
        ...overrides,
      },
      options
    );
  return { root, file, now, claim };
}

test('claim is idempotent for the same issue and session', () => {
  const { file, claim } = fixture();
  const first = claim();
  const repeat = claim();
  assert.equal(first.status, 'claimed');
  assert.equal(repeat.status, 'unchanged');
  assert.deepEqual(Object.keys(readOccupancy(file)), ['1325']);
  assert.equal(readOccupancy(file)['1325'].boundAt, '2026-08-19T00:00:00.000Z');
});

test('one session switching issues atomically releases its prior issue', () => {
  const { file, claim } = fixture();
  claim();
  const moved = claim({ issue: '#1326' });
  assert.equal(moved.status, 'moved');
  assert.deepEqual(Object.keys(readOccupancy(file)), ['1326']);
});

test('another session cannot claim the held issue and diagnostics name the holder', () => {
  const { claim } = fixture();
  claim();
  assert.throws(
    () => claim({ sid: 'grok-reviewer-12345', provider: 'grok', worktreePath: '/repo/wt-b' }),
    (error) =>
      error.code === 'occupancy-issue-held' &&
      /provider=codex/.test(error.message) &&
      /worktree=\/repo\/wt-a/.test(error.message) &&
      /sid=codex-a/.test(error.message)
  );
});

test('another session cannot share a worktree without a co-review exception', () => {
  const { claim } = fixture();
  claim();
  assert.throws(
    () => claim({ issue: 1326, sid: 'grok-b', provider: 'grok' }),
    (error) => error.code === 'occupancy-worktree-held'
  );
});

test('an active co-review predicate permits different providers on different issues', () => {
  const { file, claim } = fixture();
  claim();
  const second = claim(
    { issue: 1326, sid: 'grok-b', provider: 'grok' },
    { coReviewAllowsWorktree: ({ worktreePath }) => worktreePath === '/repo/wt-a' }
  );
  assert.equal(second.status, 'claimed');
  assert.deepEqual(Object.keys(readOccupancy(file)).sort(), ['1325', '1326']);
});

test('corrupt authority data fails closed', () => {
  const { file, claim } = fixture();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '{broken', 'utf8');
  assert.throws(() => readOccupancy(file), /occupancy: unreadable authority store/);
  assert.throws(() => claim(), /occupancy: unreadable authority store/);
});

test('heartbeat updates only an exact session claim', () => {
  const { file, now, claim } = fixture();
  claim();
  const beat = heartbeatOccupancy({ occupancyFile: file, issue: 1325, sid: 'codex-a', now });
  assert.equal(beat.status, 'updated');
  assert.equal(readOccupancy(file)['1325'].lastHeartbeatAt, '2026-08-19T00:00:01.000Z');
  assert.throws(
    () => heartbeatOccupancy({ occupancyFile: file, issue: 1325, sid: 'other', now }),
    /occupancy: heartbeat refused/
  );
});

test('release is exact-session scoped while force release is issue scoped', () => {
  const { file, claim } = fixture();
  claim();
  assert.throws(
    () => releaseOccupancy({ occupancyFile: file, issue: 1325, sid: 'other' }),
    /occupancy: release refused/
  );
  assert.equal(
    releaseOccupancy({ occupancyFile: file, issue: 1325, sid: 'codex-a' }).status,
    'released'
  );
  claim();
  const forced = forceReleaseOccupancy({ occupancyFile: file, issue: 1325 });
  assert.equal(forced.status, 'released');
  assert.equal(forced.row.provider, 'codex');
  assert.deepEqual(readOccupancy(file), {});
});

test('rollback restores the exact prior rows after a downstream bind failure', () => {
  const { file, claim } = fixture();
  claim();
  const moved = claim({ issue: 1326 });
  assert.equal(rollbackOccupancyClaim(moved).status, 'rolled-back');
  assert.deepEqual(Object.keys(readOccupancy(file)), ['1325']);
});

test('rollback cannot erase a later valid claim', () => {
  const { file, claim } = fixture();
  claim();
  const moved = claim({ issue: 1326 });
  heartbeatOccupancy({ occupancyFile: file, issue: 1326, sid: 'codex-a', now: () => 'later' });
  assert.equal(rollbackOccupancyClaim(moved).status, 'superseded');
  assert.deepEqual(Object.keys(readOccupancy(file)), ['1326']);
});
