// @story #1191
import assert from 'node:assert/strict';
import test from 'node:test';

import { findLostMarkers } from '../../../lib/body-invariants.mjs';
import {
  mostRecentIssueWorktreeLocation,
  parseIssueWorktreeLocations,
  recordIssueWorktreeLocationOnChange,
  serializeIssueWorktreeLocationMarker,
} from '../../../lib/issue-worktree-location.mjs';

const FIRST = {
  worktreePath: '/work/epic child',
  worktreeBranch: 'feature/child/1191',
  sessionId: '',
  ts: '2026-08-10T00:00:00.000Z',
};

test('AC1/AC2: location marker records worktree and branch when session id is unavailable', () => {
  const marker = serializeIssueWorktreeLocationMarker(FIRST);
  assert.equal(
    marker,
    '<!-- aitm-worktree-location worktree="/work/epic child" branch="feature/child/1191" sid="" ts="2026-08-10T00:00:00.000Z" -->'
  );
  assert.deepEqual(parseIssueWorktreeLocations(marker), [FIRST]);
});

test('AC1/AC6: marker-free issues append an initial location before the fields trailer', () => {
  const base = '## Body\n\n<!-- aitm-fields: {"schema":1} -->\n';
  const result = recordIssueWorktreeLocationOnChange(base, FIRST);
  assert.equal(result.appended, true);
  assert.ok(result.body.indexOf('aitm-worktree-location') < result.body.indexOf('aitm-fields'));
  assert.deepEqual(mostRecentIssueWorktreeLocation(result.body), FIRST);
});

test('AC5: the same normalized worktree and branch is an idempotent no-op', () => {
  const seeded = recordIssueWorktreeLocationOnChange('## Body\n', FIRST).body;
  const result = recordIssueWorktreeLocationOnChange(seeded, {
    ...FIRST,
    sessionId: 'new-session',
    ts: '2026-08-10T01:00:00.000Z',
  });
  assert.equal(result.appended, false);
  assert.equal(result.body, seeded);
  assert.equal(parseIssueWorktreeLocations(result.body).length, 1);
});

test('AC1/AC4: a changed location appends history and never rewrites the prior entry', () => {
  const seeded = recordIssueWorktreeLocationOnChange('## Body\n', FIRST).body;
  const moved = {
    worktreePath: '/work/epic',
    worktreeBranch: 'feature/epic/1162',
    sessionId: 'session-b',
    ts: '2026-08-10T02:00:00.000Z',
  };
  const result = recordIssueWorktreeLocationOnChange(seeded, moved);
  assert.equal(result.appended, true);
  assert.deepEqual(parseIssueWorktreeLocations(result.body), [FIRST, moved]);
  assert.ok(result.body.includes(serializeIssueWorktreeLocationMarker(FIRST)));
});

test('AC1: body invariants reject deletion of append-only location history', () => {
  const one = recordIssueWorktreeLocationOnChange('## Body\n', FIRST).body;
  const two = recordIssueWorktreeLocationOnChange(one, {
    ...FIRST,
    worktreeBranch: 'feature/epic/1162',
    ts: '2026-08-10T03:00:00.000Z',
  }).body;
  assert.deepEqual(findLostMarkers(two, one), ['aitm-worktree-location']);
  assert.deepEqual(findLostMarkers(one, '## Body\n'), ['aitm-worktree-location']);
});
