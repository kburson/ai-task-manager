#!/usr/bin/env node
// @story #1490
//
// Binding ownership for a completed-then-reopened close.
//
// The first recovery predicate required `bindingStatus === 'pending'`. That was
// wrong at the CATEGORY level, not merely the wrong value: the four statuses from
// `inspectTerminalIssueBindingRelease` describe how far the OLD release got, so
// none of them authorizes a NEW close. `pending` is additionally unreachable for a
// reopened issue — it is returned only when the ledger holds no `closedAt`, and a
// reopened issue necessarily has one.
//
// Measured on the live #1490 before this repair:
//   ledger closedAt  2026-09-03T01:51:22.821Z   (the original close)
//   occupancy row    sid = the invoking session, boundAt 2026-09-03T04:58:36.386Z
//   => conflict, via the occupancy branch, because boundAt > closedAt
//
// That is a legitimate same-session rebind to perform the corrective delivery, not
// contention. These tests exercise the PRODUCTION inspector against real files on
// an isolated filesystem, so they pin behaviour the mocked wiring suite could not:
// that suite supplied `pending` directly and never touched a binding.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { closedBindingsPath, occupancyPath } from '../../../../task-tracker/paths.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import {
  inspectTerminalIssueBindingRelease,
  markClosedBinding,
} from '../../../../task-tracker/lib/worktree-binding-lifecycle.mjs';
import { claimOccupancy } from '../../../../task-tracker/lib/occupancy.mjs';
import { resolveReopenedBindingOwnership } from '../../../../task-tracker/lib/reopened-close-recovery.mjs';

const SESSION = '09d364b0-4286-4e1b-991b-a6a8ca5db61d';
const OTHER_SESSION = 'ffffffff-0000-0000-0000-000000000000';
const CLOSED_AT = '2026-09-03T01:51:22.821Z';
const REBOUND_AT = '2026-09-03T04:58:36.386Z';
const BEFORE_CLOSE = '2026-09-03T00:10:00.000Z';
let linkedSequence = 0;

function addLinkedWorktree(main, label) {
  linkedSequence += 1;
  const linked = `${main}-${label}`;
  execFileSync(
    'git',
    ['worktree', 'add', '-q', '-b', `reopened-binding-${label}-${linkedSequence}`, linked],
    { cwd: main }
  );
  return linked;
}

function productionLinkedProject() {
  const main = mkdtempProjectIsolated('reopened-binding-main-', 'test');
  const linked = addLinkedWorktree(main, 'current');
  const currentSession = 'codex-current-session';
  markClosedBinding({
    mainWorktreePath: main,
    sessionId: SESSION,
    issue: '#1490',
    closedAt: CLOSED_AT,
  });
  claimOccupancy({
    projectDir: linked,
    issue: 1490,
    sid: currentSession,
    provider: 'codex',
    worktreePath: linked,
    now: () => REBOUND_AT,
  });
  setActiveTask(
    currentSession,
    {
      issue: '#1490',
      boundAt: REBOUND_AT,
      worktreePath: linked,
      worktreeResolvedAt: REBOUND_AT,
    },
    linked
  );
  return { main, linked, currentSession };
}

// Build a real project directory carrying a real ledger and occupancy file.
function project({ closedAt = CLOSED_AT, occupancy = null } = {}) {
  const dir = mkdtempProjectIsolated('reopened-binding-', 'test');
  const ledgerFile = closedBindingsPath(dir);
  mkdirSync(path.dirname(ledgerFile), { recursive: true });
  writeFileSync(
    ledgerFile,
    JSON.stringify(
      closedAt
        ? { schema: 1, sessions: { [SESSION]: { '#1490': { closedAt } } } }
        : { schema: 1, sessions: {} }
    )
  );
  writeFileSync(occupancyPath(dir), JSON.stringify(occupancy ?? {}));
  return dir;
}

const OWN_ROW = {
  issue: 1490,
  sid: SESSION,
  provider: 'claude',
  worktreePath: '/wt/1490',
  boundAt: REBOUND_AT,
  lastHeartbeatAt: REBOUND_AT,
};

test('#1490: the production inspector reports conflict for a same-session post-close rebind', () => {
  const dir = project({ occupancy: { 1490: OWN_ROW } });
  const result = inspectTerminalIssueBindingRelease({
    projectDir: dir,
    issue: '#1490',
    deps: { sessionId: SESSION, resolveMain: () => dir, collectCandidates: () => [] },
  });
  // Documents the real behaviour the recovery must interpret rather than fight.
  assert.equal(result.status, 'conflict');
  assert.equal(result.closedAt, CLOSED_AT);
});

test('#1490: `pending` is unreachable once a reopened issue carries a ledger closedAt', () => {
  const withLedger = project({ occupancy: {} });
  assert.notEqual(
    inspectTerminalIssueBindingRelease({
      projectDir: withLedger,
      issue: '#1490',
      deps: { sessionId: SESSION, resolveMain: () => withLedger, collectCandidates: () => [] },
    }).status,
    'pending'
  );
  // Only a session that never closed the issue sees `pending`.
  const foreign = project({ occupancy: {} });
  assert.equal(
    inspectTerminalIssueBindingRelease({
      projectDir: foreign,
      issue: '#1490',
      deps: { sessionId: OTHER_SESSION, resolveMain: () => foreign, collectCandidates: () => [] },
    }).status,
    'pending'
  );
});

test('#1490: ownership resolves a same-session post-close rebind as the recovery own claim', () => {
  const dir = project({ occupancy: { 1490: OWN_ROW } });
  const ownership = resolveReopenedBindingOwnership({
    projectDir: dir,
    issue: '#1490',
    sessionId: SESSION,
    recordedWorktreePath: '/wt/1490',
    deps: { resolveMain: () => dir, collectCandidates: () => [] },
  });
  assert.equal(ownership.disposition, 'own-post-close-claim');
  assert.equal(ownership.closedAt, CLOSED_AT);
  assert.equal(ownership.occupancy.boundAt, REBOUND_AT);
  assert.equal(ownership.authorized, true);
});

test('#1490: a foreign occupancy claim is refused, not adopted', () => {
  const dir = project({
    occupancy: { 1490: { ...OWN_ROW, sid: OTHER_SESSION } },
  });
  const ownership = resolveReopenedBindingOwnership({
    projectDir: dir,
    issue: '#1490',
    sessionId: SESSION,
    recordedWorktreePath: '/wt/1490',
    deps: { resolveMain: () => dir, collectCandidates: () => [] },
  });
  assert.equal(ownership.disposition, 'foreign-claim');
  assert.equal(ownership.authorized, false);
});

test('#1490: an own claim on a different worktree is refused', () => {
  const dir = project({
    occupancy: { 1490: { ...OWN_ROW, worktreePath: '/wt/somewhere-else' } },
  });
  const ownership = resolveReopenedBindingOwnership({
    projectDir: dir,
    issue: '#1490',
    sessionId: SESSION,
    recordedWorktreePath: '/wt/1490',
    deps: { resolveMain: () => dir, collectCandidates: () => [] },
  });
  assert.equal(ownership.disposition, 'foreign-worktree');
  assert.equal(ownership.authorized, false);
});

test('#1490: a claim predating the old close is not a post-close rebind', () => {
  const dir = project({ occupancy: { 1490: { ...OWN_ROW, boundAt: BEFORE_CLOSE } } });
  const ownership = resolveReopenedBindingOwnership({
    projectDir: dir,
    issue: '#1490',
    sessionId: SESSION,
    recordedWorktreePath: '/wt/1490',
    deps: { resolveMain: () => dir, collectCandidates: () => [] },
  });
  assert.notEqual(ownership.disposition, 'own-post-close-claim');
  assert.equal(ownership.authorized, false);
});

test('#1490: no historical ledger closedAt means the issue was never closed', () => {
  const dir = project({ closedAt: null, occupancy: { 1490: OWN_ROW } });
  const ownership = resolveReopenedBindingOwnership({
    projectDir: dir,
    issue: '#1490',
    sessionId: SESSION,
    recordedWorktreePath: '/wt/1490',
    deps: { resolveMain: () => dir, collectCandidates: () => [] },
  });
  assert.equal(ownership.disposition, 'no-prior-close');
  assert.equal(ownership.authorized, false);
});

test('#1490: a live active-task record not marked closed refuses', () => {
  const dir = project({ occupancy: { 1490: OWN_ROW } });
  const ownership = resolveReopenedBindingOwnership({
    projectDir: dir,
    issue: '#1490',
    sessionId: SESSION,
    recordedWorktreePath: '/wt/1490',
    deps: {
      resolveMain: () => dir,
      collectCandidates: () => ['/wt/other'],
      getActiveTask: () => ({ issue: '#1490', boundAt: '2026-09-03T05:30:00.000Z' }),
      isBindingRecordClosed: () => false,
    },
  });
  assert.equal(ownership.disposition, 'live-binding');
  assert.equal(ownership.authorized, false);
});

test('#1490: a paused session is authorized — an active-task file is not required', () => {
  // #1490 is paused. Requiring an active-task record unconditionally would be
  // exactly the class of false predicate this repair exists to remove.
  const dir = project({ occupancy: { 1490: OWN_ROW } });
  const ownership = resolveReopenedBindingOwnership({
    projectDir: dir,
    issue: '#1490',
    sessionId: SESSION,
    recordedWorktreePath: '/wt/1490',
    deps: {
      resolveMain: () => dir,
      collectCandidates: () => ['/wt/1490'],
      getActiveTask: () => null,
    },
  });
  assert.equal(ownership.disposition, 'own-post-close-claim');
  assert.equal(ownership.authorized, true);
});

test('#1490: production defaults resolve historical authority from a linked worktree', () => {
  const { linked, currentSession } = productionLinkedProject();
  const ownership = resolveReopenedBindingOwnership({
    projectDir: linked,
    issue: '#1490',
    sessionId: currentSession,
    recordedWorktreePath: linked,
  });
  assert.equal(ownership.disposition, 'own-post-close-claim');
  assert.equal(ownership.closedAt, CLOSED_AT);
  assert.equal(ownership.occupancy.sid, currentSession);
  assert.equal(ownership.authorized, true);
});

test('#1490: production defaults refuse a second live binding for the current session', () => {
  const { main, linked, currentSession } = productionLinkedProject();
  const competing = addLinkedWorktree(main, 'competing');
  setActiveTask(
    currentSession,
    {
      issue: '#1490',
      boundAt: '2026-09-03T05:30:00.000Z',
      worktreePath: competing,
      worktreeResolvedAt: '2026-09-03T05:30:00.000Z',
    },
    competing
  );
  const ownership = resolveReopenedBindingOwnership({
    projectDir: linked,
    issue: '#1490',
    sessionId: currentSession,
    recordedWorktreePath: linked,
  });
  assert.equal(ownership.disposition, 'live-binding');
  assert.equal(ownership.authorized, false);
});
