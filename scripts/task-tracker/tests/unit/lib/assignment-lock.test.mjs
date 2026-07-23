#!/usr/bin/env node
// @story #769
// Unit: assignment-lock contract — the GitHub assignee is an exclusive
// work-lock enforced at bind, every state mutator, and commit time.
//
// One case per acceptance criterion:
//   AC1  bind refused when assigned-to-other; allowed when among assignees.
//   AC2  unassigned → alert+claim-permitted; AI other→me reassignment forbidden.
//   AC3  every state mutator re-checks the lock (shared runPreflight gate).
//   AC4  commit-time `[#N]` attribution block; chore/token-less passthrough.
//   AC5  multi-assignee including the current user satisfies the lock.
//   AC6  a single `gateAssigneeMatch` flag governs the gate; default on.
//   AC7  Full-Auto unassigned auto-claim (no prompt) + audit; foreign refused.
//   AC8  this file — every case above is covered.

import { strict as assert } from 'node:assert';
import {
  checkAssigneeMatch,
  claimAssignee,
  parseCommitIssueRefs,
} from '../../../lib/assignee-guard.mjs';
import {
  runPreflight,
  preflightVerb,
  EXIT_ASSIGNEE_MISMATCH,
} from '../../../lib/verb-preflight.mjs';

const CFG = { repo: 'test/repo', projectId: 'PVT_test' };

function depsOf({
  live = 'develop',
  marker = 'develop',
  assignees = ['kburson'],
  currentUser = 'kburson',
} = {}) {
  return {
    fetchLive: async () => live,
    fetchLastKnownState: async () => marker,
    fetchLastStatusActor: async () => null,
    fetchAssignees: async () => assignees,
    fetchCurrentUser: async () => currentUser,
  };
}

// Capture a preflightVerb call that may `process.exit` and/or write to the
// std streams, so its refusal/claim behavior can be asserted in-process.
async function capturePreflightVerb(opts) {
  const origExit = process.exit;
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let exitCode = null;
  let out = '';
  let err = '';
  process.stdout.write = (s) => {
    out += String(s);
    return true;
  };
  process.stderr.write = (s) => {
    err += String(s);
    return true;
  };
  process.exit = (c) => {
    exitCode = c;
    const e = new Error('__EXIT__');
    e.__exit = true;
    throw e;
  };
  let returned;
  let threw = null;
  try {
    returned = await preflightVerb(opts);
  } catch (e) {
    if (!e.__exit) threw = e;
  } finally {
    process.exit = origExit;
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  if (threw) throw threw;
  return { exitCode, out, err, returned };
}

// --- AC1: assigned-to-other refused; assigned-to-me allowed ----------------
{
  const other = await runPreflight({
    stateBefore: { active: '#769' },
    target: '#769',
    cfg: CFG,
    deps: depsOf({ assignees: ['alice'], currentUser: 'kburson' }),
  });
  assert.equal(other.ok, false);
  assert.equal(other.code, EXIT_ASSIGNEE_MISMATCH);
  assert.equal(other.assigneeKind, 'assigned-to-other');

  const mine = await runPreflight({
    stateBefore: { active: '#769' },
    target: '#769',
    cfg: CFG,
    deps: depsOf({ assignees: ['kburson'], currentUser: 'kburson' }),
  });
  assert.equal(mine.ok, true);
}

// --- AC2: unassigned alerts + claim-permitted; other→me forbidden ----------
{
  // Interactive unassigned bind emits the PROMPT_REQUIRED alert and refuses.
  const cap = await capturePreflightVerb({
    stateBefore: { active: '#769' },
    target: '#769',
    cfg: CFG,
    verb: 'start',
    deps: { ...depsOf({ assignees: [] }), env: {} },
  });
  assert.equal(cap.exitCode, EXIT_ASSIGNEE_MISMATCH);
  assert.match(cap.out, /PROMPT_REQUIRED: assignee-mismatch #769 unassigned/);

  // claimAssignee assigns @me only when the issue is empty.
  let added = 0;
  const okClaim = await claimAssignee({
    issueNumber: 769,
    cfg: CFG,
    deps: {
      fetchAssignees: async () => [],
      addAssignee: async () => {
        added += 1;
      },
    },
  });
  assert.equal(okClaim.ok, true);
  assert.equal(okClaim.claimed, true);
  assert.equal(added, 1);

  // The AI can NEVER go other→me: claimAssignee refuses any pre-assigned issue
  // and never invokes the assignment mutation.
  let addedForeign = 0;
  const refuse = await claimAssignee({
    issueNumber: 769,
    cfg: CFG,
    deps: {
      fetchAssignees: async () => ['alice'],
      addAssignee: async () => {
        addedForeign += 1;
      },
    },
  });
  assert.equal(refuse.ok, false);
  assert.equal(refuse.kind, 'already-assigned');
  assert.equal(addedForeign, 0, 'AI must never reassign an issue from another user');
}

// --- AC3: every mutator re-checks the lock (shared runPreflight gate) -------
// promote/demote/review/approve/close all route through runPreflight, so a
// single refusal verdict for the bound issue proves the mutator gate.
{
  const v = await runPreflight({
    stateBefore: { active: '#769' },
    target: '#769',
    cfg: CFG,
    deps: depsOf({ assignees: ['alice'], currentUser: 'kburson' }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_ASSIGNEE_MISMATCH);
}

// --- AC4: commit-time `[#N]` block; chore/token-less passthrough -----------
{
  // Attributed commit → the referenced issue is resolved and checked.
  const refs = parseCommitIssueRefs('git commit -m "[#769] feat(lock): add guard"');
  assert.deepEqual(refs, [769]);
  const verdict = await checkAssigneeMatch({
    issueNumber: refs[0],
    cfg: CFG,
    deps: { fetchAssignees: async () => ['alice'], fetchCurrentUser: async () => 'kburson' },
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'assigned-to-other', 'attributed foreign commit would block');

  // Chore / un-bound commit carries no token → no check → passthrough.
  assert.deepEqual(parseCommitIssueRefs('git commit -m "chore: tidy scripts"'), []);
  assert.deepEqual(parseCommitIssueRefs('git commit -m "wip no token"'), []);
}

// --- AC5: multi-assignee including me satisfies the lock -------------------
{
  const v = await checkAssigneeMatch({
    issueNumber: 769,
    cfg: CFG,
    deps: {
      fetchAssignees: async () => ['alice', 'kburson', 'bob'],
      fetchCurrentUser: async () => 'kburson',
    },
  });
  assert.equal(v.ok, true);
}

// --- AC6: single gateAssigneeMatch flag; default on ------------------------
{
  // Default on: no preferences block, yet a foreign assignee is refused.
  const on = await runPreflight({
    stateBefore: { active: '#769' },
    target: '#769',
    cfg: CFG, // no preferences → gateAssigneeMatch defaults true
    deps: depsOf({ assignees: ['alice'], currentUser: 'kburson' }),
  });
  assert.equal(on.ok, false);
  assert.equal(on.code, EXIT_ASSIGNEE_MISMATCH);

  // Flag off: guard skipped entirely (assignees never fetched).
  let fetched = false;
  const off = await runPreflight({
    stateBefore: { active: '#769' },
    target: '#769',
    cfg: { ...CFG, preferences: { gateAssigneeMatch: false } },
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'develop',
      fetchAssignees: async () => {
        fetched = true;
        return ['alice'];
      },
      fetchCurrentUser: async () => 'kburson',
    },
  });
  assert.equal(off.ok, true);
  assert.equal(fetched, false, 'guard skipped when gateAssigneeMatch=false');
}

// --- AC7: Full-Auto unassigned auto-claim (no prompt) + audit; foreign refused
{
  // Auto-claim: unassigned issue is claimed with no prompt; audit comment posted.
  let assignees = [];
  let claimCalls = 0;
  let postCalls = 0;
  const cap = await capturePreflightVerb({
    stateBefore: { active: '#769' },
    target: '#769',
    cfg: CFG,
    verb: 'promote',
    deps: {
      env: { TT_FULL_AUTO: '1' },
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'develop',
      fetchLastStatusActor: async () => null,
      fetchAssignees: async () => assignees.slice(),
      fetchCurrentUser: async () => 'kburson',
      claimAssignee: async () => {
        claimCalls += 1;
        assignees = ['kburson'];
        return { ok: true, claimed: true };
      },
      postComment: async () => {
        postCalls += 1;
      },
    },
  });
  assert.equal(cap.exitCode, null, 'Full-Auto claim proceeds without refusal');
  assert.equal(claimCalls, 1, 'auto-claim ran exactly once');
  assert.equal(postCalls, 1, 'audit comment posted');
  assert.ok(cap.returned, 'verb proceeds after claim');
  assert.doesNotMatch(
    cap.out,
    /PROMPT_REQUIRED: assignee-mismatch/,
    'no permission prompt emitted'
  );

  // Foreign refused even under Full-Auto: claim never attempted.
  let foreignClaimCalls = 0;
  const foreign = await capturePreflightVerb({
    stateBefore: { active: '#769' },
    target: '#769',
    cfg: CFG,
    verb: 'promote',
    deps: {
      env: { TT_FULL_AUTO: '1' },
      ...depsOf({ assignees: ['alice'], currentUser: 'kburson' }),
      claimAssignee: async () => {
        foreignClaimCalls += 1;
        return { ok: true };
      },
    },
  });
  assert.equal(
    foreign.exitCode,
    EXIT_ASSIGNEE_MISMATCH,
    'foreign-assigned refused under Full-Auto'
  );
  assert.equal(foreignClaimCalls, 0, 'Full-Auto never claims a foreign-assigned issue');
}

console.log('assignment-lock.test.mjs: ok');
