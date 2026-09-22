// @story #1670
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateSessionReadiness } from '../../../../task-tracker/lib/action-decision/session.mjs';
import { runPreflight } from '../../../../task-tracker/lib/verb-preflight.mjs';

const body = `## User Story
As an operator
I want to resume a paused session
So that execution refreshes its authority

## Scope
Read-only resume readiness for the selected issue.

## Acceptance Criteria
- [ ] Resume is ready.

<!-- aitm-last-known-state state="plan" ts="2026-09-21T16:00:00Z" -->`;
const now = () => '2026-09-21T16:00:00.000Z';

test('production resume collector and guarded preflight refuse a post-ready migration freeze', async () => {
  let frozen = false;
  const stateBefore = { active: null, lastActive: '#1750', paused: true };
  const config = {
    repo: 'example/project',
    projectId: 'project-1',
    preferences: { gateAssigneeMatch: false },
  };
  const explanation = await evaluateSessionReadiness({
    actionId: 'resume',
    issue: 1750,
    stateBefore,
    config,
    projectDir: '/issue-worktree',
    invokingDir: '/issue-worktree',
    now,
    deps: {
      readIssueBody: async () => body,
      fetchAssignmentSnapshot: async () => ({ state: 'plan', assignees: [] }),
      readWorktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      resolveProjectDir: () => '/issue-worktree',
      readOccupancy: () => ({}),
      findMainWorktreePath: () => '/issue-worktree',
      currentSessionId: () => 'session-1750',
      loadMigrationJournal: () => (frozen ? { active: true } : null),
    },
  });
  assert.equal(explanation.status, 'ready', JSON.stringify(explanation));

  frozen = true;
  const execution = await runPreflight({
    stateBefore,
    target: '#1750',
    cfg: config,
    deps: {
      migrationFreezeActive: () => frozen,
      fetchLive: async () => 'plan',
      fetchLastKnownState: async () => 'plan',
      fetchLastStatusActor: async () => null,
    },
  });
  assert.deepEqual(
    { ok: execution.ok, kind: execution.kind, code: execution.code },
    { ok: false, kind: 'migration-freeze', code: 14 }
  );
});
