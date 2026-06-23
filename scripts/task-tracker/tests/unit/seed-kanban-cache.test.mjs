// @story #273
// #273 — the seeder must (1) retry GraphQL once, (2) tag its failure modes,
// and (3) actually populate the cache on success. The pre-#273 swallowing
// try/catch is gone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

import {
  SeederGraphQLError,
  SeederMarkerMissingError,
  seedSessionKanbanFromBody,
} from '../../lib/seed-kanban-cache.mjs';
import { getActiveTask, setActiveTask } from '../../session-state.mjs';
import { resolveSessionId } from '../../lib/session-id.mjs';

test('SeederGraphQLError carries cause and a tagged message', () => {
  const inner = new Error('connect ETIMEDOUT');
  const err = new SeederGraphQLError('failed to fetch #1: connect ETIMEDOUT', inner);
  assert.ok(err.message.startsWith('SeederGraphQLError:'));
  assert.equal(err.name, 'SeederGraphQLError');
  assert.equal(err.cause, inner);
});

test('SeederMarkerMissingError names the issue and points to reconcile', () => {
  const err = new SeederMarkerMissingError(273);
  assert.equal(err.name, 'SeederMarkerMissingError');
  assert.equal(err.issueNumber, 273);
  assert.match(err.message, /#273/);
  assert.match(err.message, /reconcile accept-live 273/);
});

test('SeederGraphQLError is distinguishable from SeederMarkerMissingError', () => {
  const a = new SeederGraphQLError('x');
  const b = new SeederMarkerMissingError(1);
  assert.notEqual(a.name, b.name);
  assert.ok(a instanceof Error);
  assert.ok(b instanceof Error);
});

// @story #519
// #519 — Backlog is the first state, so a freshly-created issue with no
// `aitm-last-known-state` marker (and no entry marker beyond backlog) must
// seed `backlog` instead of throwing. A body that advanced past Backlog with
// the marker absent is genuine corruption and must still throw.

function makeBoundSession() {
  const projDir = mkdtempSync(path.join(projectScratchDir('test'), 'seed-519-'));
  mkdirSync(path.join(projDir, '.ai-task-manager', 'sessions'), { recursive: true });
  const sid = resolveSessionId({ env: {}, transcriptDir: () => projDir });
  setActiveTask(
    sid,
    {
      issue: '#519',
      entryStartTs: '2026-06-23T00:00:00.000Z',
      wordsAtStart: 0,
      boundAt: '2026-06-23T00:00:00.000Z',
    },
    projDir
  );
  return { projDir, sid };
}

test('#519 backlog-only body (no last-known-state marker) seeds backlog, no throw', async () => {
  const { projDir, sid } = makeBoundSession();
  const body =
    '## User Story\n\nbody\n\n<!-- aitm-entered-backlog ts="2026-06-23T00:00:00.000Z" -->\n';
  const state = await seedSessionKanbanFromBody({
    sid,
    issue: '#519',
    projDir,
    repo: 'owner/repo',
    deps: { fetchBody: async () => body },
  });
  assert.equal(state.kanbanState, 'backlog');
  assert.equal(getActiveTask(sid, projDir).kanbanState, 'backlog');
});

test('#519 body with no entry markers at all seeds backlog, no throw', async () => {
  const { projDir, sid } = makeBoundSession();
  const state = await seedSessionKanbanFromBody({
    sid,
    issue: '#519',
    projDir,
    repo: 'owner/repo',
    deps: { fetchBody: async () => '## User Story\n\nno markers here\n' },
  });
  assert.equal(state.kanbanState, 'backlog');
});

test('#519 body advanced past backlog (entered-develop) with no marker still throws', async () => {
  const { projDir, sid } = makeBoundSession();
  const body =
    '## User Story\n\nbody\n\n' +
    '<!-- aitm-entered-backlog ts="2026-06-23T00:00:00.000Z" -->\n' +
    '<!-- aitm-entered-develop ts="2026-06-23T01:00:00.000Z" -->\n';
  await assert.rejects(
    () =>
      seedSessionKanbanFromBody({
        sid,
        issue: '#519',
        projDir,
        repo: 'owner/repo',
        deps: { fetchBody: async () => body },
      }),
    SeederMarkerMissingError
  );
});
