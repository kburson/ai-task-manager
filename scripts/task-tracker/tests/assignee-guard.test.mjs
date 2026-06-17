#!/usr/bin/env node
// @story #219
// Unit: `checkAssigneeMatch` from lib/assignee-guard.mjs (#219).

import { strict as assert } from 'node:assert';
import {
  checkAssigneeMatch,
  formatAssigneeRefusal,
  formatAssigneePromptLine,
  EXIT_ASSIGNEE_MISMATCH,
} from '../lib/assignee-guard.mjs';

const CFG = { repo: 'test/repo' };

function depsOf({ assignees = [], currentUser = 'kburson', cache } = {}) {
  let assigneeCalls = 0;
  let userCalls = 0;
  const deps = {
    fetchAssignees: async () => {
      assigneeCalls++;
      return assignees;
    },
    fetchCurrentUser: async () => {
      userCalls++;
      return currentUser;
    },
    cache: cache ?? {},
    _calls: () => ({ assigneeCalls, userCalls }),
  };
  return deps;
}

// 1. Current user in assignees → ok.
{
  const deps = depsOf({ assignees: ['kburson'], currentUser: 'kburson' });
  const v = await checkAssigneeMatch({ issueNumber: 219, cfg: CFG, deps });
  assert.equal(v.ok, true);
  assert.equal(v.currentUser, 'kburson');
}

// 1b. Current user in assignees (case-insensitive).
{
  const deps = depsOf({ assignees: ['KBurson'], currentUser: 'kburson' });
  const v = await checkAssigneeMatch({ issueNumber: 219, cfg: CFG, deps });
  assert.equal(v.ok, true);
}

// 2. Current user not in non-empty assignees → assigned-to-other.
{
  const deps = depsOf({ assignees: ['alice', 'bob'], currentUser: 'kburson' });
  const v = await checkAssigneeMatch({ issueNumber: 219, cfg: CFG, deps });
  assert.equal(v.ok, false);
  assert.equal(v.kind, 'assigned-to-other');
  assert.deepEqual(v.assignees, ['alice', 'bob']);
}

// 3. Empty assignees → unassigned.
{
  const deps = depsOf({ assignees: [], currentUser: 'kburson' });
  const v = await checkAssigneeMatch({ issueNumber: 219, cfg: CFG, deps });
  assert.equal(v.ok, false);
  assert.equal(v.kind, 'unassigned');
}

// 4. Memoized currentUser — second invocation reuses cache.
{
  const cache = {};
  const deps = depsOf({ assignees: ['kburson'], currentUser: 'kburson', cache });
  await checkAssigneeMatch({ issueNumber: 219, cfg: CFG, deps });
  await checkAssigneeMatch({ issueNumber: 220, cfg: CFG, deps });
  const calls = deps._calls();
  assert.equal(calls.userCalls, 1, 'currentUser fetched only once');
  assert.equal(calls.assigneeCalls, 2);
  assert.equal(cache.currentUser, 'kburson');
}

// 5. Missing cfg throws.
{
  await assert.rejects(
    () => checkAssigneeMatch({ issueNumber: 219, cfg: null, deps: depsOf() }),
    /cfg is required/
  );
}

// 6. Missing issueNumber throws.
{
  await assert.rejects(
    () => checkAssigneeMatch({ issueNumber: null, cfg: CFG, deps: depsOf() }),
    /issueNumber is required/
  );
}

// 7. Refusal message includes assignees and gh edit command (assigned-to-other).
{
  const msg = formatAssigneeRefusal({
    verb: 'promote',
    issueNumber: 219,
    verdict: { kind: 'assigned-to-other', currentUser: 'kburson', assignees: ['alice'] },
  });
  assert.match(msg, /Refusing \/task promote/);
  assert.match(msg, /#219/);
  assert.match(msg, /alice/);
  assert.match(msg, /gh issue edit 219 --add-assignee @me/);
  assert.match(msg, /gateAssigneeMatch/);
}

// 8. Refusal message handles unassigned case.
{
  const msg = formatAssigneeRefusal({
    verb: 'promote',
    issueNumber: 219,
    verdict: { kind: 'unassigned', currentUser: 'kburson', assignees: [] },
  });
  assert.match(msg, /no assignees/);
  assert.match(msg, /gh issue edit 219 --add-assignee @me/);
}

// 9. Prompt line format.
{
  const line = formatAssigneePromptLine({
    issueNumber: 219,
    verdict: { kind: 'assigned-to-other', assignees: ['alice', 'bob'] },
  });
  assert.equal(line, 'PROMPT_REQUIRED: assignee-mismatch #219 assigned-to-other alice,bob');
}

// 10. Exit code constant.
{
  assert.equal(EXIT_ASSIGNEE_MISMATCH, 10);
}

console.log('assignee-guard.test.mjs: ok');
