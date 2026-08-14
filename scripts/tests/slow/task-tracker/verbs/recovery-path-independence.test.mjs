#!/usr/bin/env node
// @story #438
// #438 AC4 — Recovery-path independence.
//
// The recovery verbs (`demote`, `unblock`) must not themselves fail on the
// body-write path when operating on an issue carrying realistic accumulated
// markers — that write-path fragility (Bug B) is exactly what turned a single
// stuck issue into a total seizure.
//
// It also pins the CONFIRMED current contract for a backward demote out of a
// `test` whose blockers are open. move-state runs the universal blockedByGuard
// on EVERY exit slot, including the `--demote` path (only TT_SKIP_NETWORK and
// --supersede bypass it). So a backward demote from `test` with an open
// blocker IS refused today — the sanctioned escape is `unblock` (clear the
// stale ref) THEN move, NOT a demote-specific guard exemption. Pinning it this
// way prevents a future "let demote skip the guard" change from silently
// re-opening the deadlock the guard exists to close.
//
// NOTE (deep-dive correction): the posted deep-dive predicted demote would be
// guard-EXEMPT. Reading move-state.mjs showed the opposite — the guard is
// universal across exit slots. This AC pins the true behavior; the discrepancy
// is recorded in the Full-Auto audit comment.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { runDemote } from '../../../../task-tracker/verbs/demote.mjs';
import { runUnblock } from '../../../../task-tracker/verbs/unblock.mjs';
import { blockedByGuard } from '../../../../task-tracker/lib/blocked-by-guard.mjs';
import { addBlockedBy, parseBlockedBy } from '../../../../task-tracker/lib/blocked-marker.mjs';
import {
  fleetPath,
  orchestratorLockPath,
  getProjectDir,
  pickupDirectivePath,
  dodPath,
} from '../../../../task-tracker/paths.mjs';
import {
  findMainWorktreePath,
  fleetRegistryPath,
} from '../../../../task-tracker/fleet-registry.mjs';
import { mkdtempOutsideRepo } from '../../../../task-tracker/lib/scratch-dir.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

// A body carrying the kind of marker load a real in-flight issue accumulates.
function markerHeavyBody(state) {
  return [
    `<!-- aitm-last-known-state: ${state} -->`,
    `<!-- aitm-last-known-state-ts: 2026-06-17T00:00:00Z -->`,
    `<!-- aitm-body-version version="11" -->`,
    `<!-- aitm-entered-develop ts="2026-06-16T10:00:00Z" -->`,
    `<!-- aitm-entered-test ts="2026-06-17T09:00:00Z" -->`,
    ``,
    `## Scope`,
    `Real body prose.`,
    ``,
    `<!-- aitm-fields: {"schema":1,"values":{"priority":"P2"}} -->`,
    ``,
  ].join('\n');
}

// DI fake mirroring demote-verb.test.mjs's makeDeps.
function makeDemoteDeps({ body, live, moveCode = 0 }) {
  const calls = { writes: [], moves: [] };
  let remote = body;
  return {
    calls,
    deps: {
      assertBound: () => {},
      fetchIssueBody: async () => ({ body: remote }),
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(remote);
        if (next !== remote) {
          remote = next;
          calls.writes.push({ after: next });
        }
        return { status: 'ok' };
      },
      getLiveState: async () => live,
      runMoveState: async ({ issueNumber, target }) => {
        calls.moves.push({ issueNumber, target });
        return moveCode;
      },
      postTimingRow: async () => {},
    },
  };
}

test('AC4: runDemote succeeds on a marker-heavy body (write path is not fragile)', async () => {
  const { deps, calls } = makeDemoteDeps({ body: markerHeavyBody('test'), live: 'test' });
  // #935 — demote-to-develop is a code-rework path and hard-refuses without a
  // declared `--rework` reason; supply one so this exercises the success write
  // path (the point of this test) rather than the refusal.
  const r = await runDemote({ issueNumber: 500, cfg, rework: 'rebuild the resolver', deps });
  assert.equal(r.status, 'demoted');
  assert.equal(r.from, 'test');
  assert.equal(r.to, 'develop');
  assert.deepEqual(calls.moves, [{ issueNumber: 500, target: 'develop' }]);
  // The post-move develop stamp landed without a write-path failure.
  assert.ok(calls.writes.length >= 1);
});

test('AC4: runUnblock clears a stale blocker on a marker-heavy body (non-manual escape)', async () => {
  const base = addBlockedBy(markerHeavyBody('test'), 999);
  assert.deepEqual(parseBlockedBy(base), [999], 'fixture must carry the blocker');

  let remote = base;
  const labelCalls = [];
  const comments = [];
  const r = await runUnblock({
    target: 501,
    refs: null, // drop ALL
    cfg,
    deps: {
      assertBound: () => {},
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(remote);
        if (next !== remote) remote = next;
        return { status: 'ok' };
      },
      runLabel: async ({ args }) => labelCalls.push(args),
      postComment: async ({ body }) => comments.push(body),
      writeFieldValue: async () => {},
    },
  });
  assert.equal(r.status, 'removed');
  assert.equal(r.cleared, true);
  assert.deepEqual(r.removed, [999]);
  assert.deepEqual(parseBlockedBy(remote), [], 'blocker marker must be gone from the body');
  assert.ok(
    labelCalls.some((a) => a.includes('--remove-label')),
    'BLOCKED label must be dropped when fully cleared'
  );
});

test('AC4: backward demote exit guard fires while a blocker is open (confirmed contract)', async () => {
  const body = addBlockedBy(markerHeavyBody('test'), 600);
  // Open blocker → guard refuses the exit (the demote cannot proceed until
  // `unblock` clears the ref; demote gets NO special exemption).
  const refused = await blockedByGuard.run({
    issueNumber: 501,
    repo: 'o/r',
    body,
    fetchBlockerState: async () => 'develop', // open
  });
  assert.equal(refused.ok, false, 'open blocker must refuse the test exit slot');
  assert.match(refused.reason, /blockers are open: #600/);

  // Once the blocker is done, the same exit slot is permitted.
  const allowed = await blockedByGuard.run({
    issueNumber: 501,
    repo: 'o/r',
    body,
    fetchBlockerState: async () => 'done',
  });
  assert.equal(allowed.ok, true, 'done blocker must permit the exit');
});

// ---------------------------------------------------------------------------
// @story #572 — path-resolver indirection layer.
//
// AC: the project-dir precedence is honored by the resolver, and the
// main-anchored helpers (`fleetPath`, `orchestratorLockPath`) resolve against
// the MAIN worktree even when called from a sibling-worktree cwd. This is the
// invariant EPIC #571 leans on — `orchestrator.lock` + `task-fleet.json` stay
// main-anchored so every sibling worktree shares one fleet registry / lock.
//
// Real git worktrees are created here (slow lane) so `findMainWorktreePath`
// exercises its actual `git worktree list --porcelain` path instead of a stub.
// ---------------------------------------------------------------------------

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('AC (#572): main-anchored resolvers build under the passed main path regardless of cwd', () => {
  // #573 — fleet/lock relocated under `.tmp/aitm/fleet/`; the MAIN-worktree
  // anchor is preserved so sibling worktrees still share one registry/lock.
  const main = fleetPath('/abs/main/worktree');
  assert.equal(main, path.join('/abs/main/worktree', '.tmp', 'aitm', 'fleet', 'task-fleet.json'));
  const lock = orchestratorLockPath('/abs/main/worktree');
  assert.equal(lock, path.join('/abs/main/worktree', '.tmp', 'aitm', 'fleet', 'orchestrator.lock'));
  // Distinct main path → distinct resolution; the helper owns layout, not anchor.
  assert.notEqual(fleetPath('/abs/other'), main);
});

test('AC (#572): findMainWorktreePath anchors fleet/lock to MAIN from a sibling worktree cwd', () => {
  const root = realpathSync(mkdtempOutsideRepo('aitm-572-'));
  try {
    const mainWt = path.join(root, 'main');
    mkdirSync(mainWt, { recursive: true });
    git(mainWt, 'init', '-q', '-b', 'trunk');
    git(mainWt, 'config', 'user.email', 't@t');
    git(mainWt, 'config', 'user.name', 't');
    writeFileSync(path.join(mainWt, 'f'), 'x');
    git(mainWt, 'add', '.');
    git(mainWt, 'commit', '-q', '-m', 'init');

    const siblingWt = path.join(root, 'sibling');
    git(mainWt, 'worktree', 'add', '-q', '-b', 'side', siblingWt);

    // Called with the SIBLING dir as the project dir — must still report MAIN.
    const resolvedMain = findMainWorktreePath(siblingWt);
    assert.equal(
      path.resolve(resolvedMain),
      path.resolve(mainWt),
      'first worktree block (main) must win regardless of caller cwd'
    );

    // fleet-registry's path resolves under MAIN, not the sibling worktree.
    const reg = fleetRegistryPath(resolvedMain);
    assert.equal(reg, path.join(path.resolve(mainWt), '.tmp', 'aitm', 'fleet', 'task-fleet.json'));
    assert.ok(!reg.startsWith(path.resolve(siblingWt)), 'must not anchor to the sibling worktree');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// @story #574 — tracked templates survive a fresh `git worktree add` with zero
// backfill. This is the load-bearing invariant for #571: "tracked set ≡
// worktree-required set". The consolidated templates live under
// `.ai-task-manager/templates/` and are committed, so a sibling worktree gets
// them for free at checkout — no seed-worktree step. Real git worktrees are
// created here (slow lane) so the checkout actually materializes the tracked
// tree instead of a stub.
test('AC (#574): relocated .ai-task-manager/templates survive a fresh worktree checkout', () => {
  const root = realpathSync(mkdtempOutsideRepo('aitm-574-'));
  try {
    const mainWt = path.join(root, 'main');
    const tplDir = path.join(mainWt, '.ai-task-manager', 'templates');
    mkdirSync(tplDir, { recursive: true });
    git(mainWt, 'init', '-q', '-b', 'trunk');
    git(mainWt, 'config', 'user.email', 't@t');
    git(mainWt, 'config', 'user.name', 't');
    writeFileSync(path.join(tplDir, 'pickup-directive.md'), 'PICKUP\n');
    writeFileSync(path.join(tplDir, 'definition-of-done.md'), 'DOD\n');
    git(mainWt, 'add', '.');
    git(mainWt, 'commit', '-q', '-m', 'init');

    // The resolvers point at the nested templates/ tail under SHARED_DIR.
    assert.equal(
      pickupDirectivePath(mainWt),
      path.join(mainWt, '.ai-task-manager', 'templates', 'pickup-directive.md')
    );
    assert.equal(
      dodPath(mainWt),
      path.join(mainWt, '.ai-task-manager', 'templates', 'definition-of-done.md')
    );

    // A fresh worktree checkout — no seed step — carries the tracked templates.
    const siblingWt = path.join(root, 'sibling');
    git(mainWt, 'worktree', 'add', '-q', '-b', 'side', siblingWt);

    const sibPickup = path.join(siblingWt, '.ai-task-manager', 'templates', 'pickup-directive.md');
    const sibDod = path.join(siblingWt, '.ai-task-manager', 'templates', 'definition-of-done.md');
    assert.ok(
      existsSync(sibPickup),
      'pickup-directive.md must exist in the fresh worktree (no backfill)'
    );
    assert.ok(
      existsSync(sibDod),
      'definition-of-done.md must exist in the fresh worktree (no backfill)'
    );
    assert.equal(readFileSync(sibPickup, 'utf8'), 'PICKUP\n');
    assert.equal(readFileSync(sibDod, 'utf8'), 'DOD\n');
    assert.equal(pickupDirectivePath(siblingWt), sibPickup);
    assert.equal(dodPath(siblingWt), sibDod);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AC (#572): getProjectDir precedence — AI_TASK_MANAGER_PROJECT_DIR > CLAUDE_PROJECT_DIR > cwd', () => {
  assert.equal(
    getProjectDir({ AI_TASK_MANAGER_PROJECT_DIR: '/a', CLAUDE_PROJECT_DIR: '/b' }, '/c'),
    '/a'
  );
  assert.equal(getProjectDir({ CLAUDE_PROJECT_DIR: '/b' }, '/c'), '/b');
  assert.equal(getProjectDir({}, '/c'), '/c');
});
