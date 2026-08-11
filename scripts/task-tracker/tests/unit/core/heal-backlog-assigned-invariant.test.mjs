// @story #1207
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { main, parseArgs, runAssignedInvariantHeal } from '../../../heal-backlog.mjs';

test('parser exposes an explicit assigned-invariant mode', () => {
  const args = parseArgs(['--assigned-invariant', '--scope', '1,2']);
  assert.equal(args.assignedInvariant, true);
  assert.deepEqual(args.scope, [1, 2]);
});

test('project-wide dry-run reports both drift shapes and writes nothing', async () => {
  const moves = [];
  const output = [];
  const result = await runAssignedInvariantHeal(
    {
      cfg: { repo: 'o/r', projectId: 'P1' },
      args: { state: 'all', scope: [1, 2, 3], apply: false, yes: false },
      projectDir: '/workspace',
    },
    {
      fetchInvariantRow: async (number) =>
        ({
          1: { state: 'assigned', assignees: [] },
          2: { state: 'backlog', assignees: ['alice'] },
          3: { state: 'develop', assignees: [] },
        })[number],
      runMoveState: async (args) => moves.push(args),
      writeReport: () => {},
      out: { write: (value) => output.push(value) },
    }
  );
  assert.equal(result.violations, 2);
  assert.equal(result.repaired, 0);
  assert.deepEqual(moves, []);
  assert.match(output.join(''), /#1 assigned-without-assignee/);
  assert.match(output.join(''), /#2 backlog-with-assignee/);
});

test('project-wide apply repairs only violations through adjacent moves', async () => {
  const moves = [];
  const reads = new Map();
  const result = await runAssignedInvariantHeal(
    {
      cfg: { repo: 'o/r', projectId: 'P1' },
      args: { state: 'all', scope: [1, 2, 3], apply: true, yes: true },
      projectDir: '/workspace',
    },
    {
      fetchInvariantRow: async (number) => {
        const count = (reads.get(number) || 0) + 1;
        reads.set(number, count);
        if (count > 1) {
          return {
            1: { state: 'backlog', assignees: [] },
            2: { state: 'assigned', assignees: ['alice'] },
          }[number];
        }
        return {
          1: { state: 'assigned', assignees: [] },
          2: { state: 'backlog', assignees: ['alice'] },
          3: { state: 'refine', assignees: [] },
        }[number];
      },
      runMoveState: async (args) => moves.push(args) && 0,
      confirmBlastRadius: async () => ({ proceed: true }),
      writeReport: () => {},
      out: { write: () => {} },
    }
  );
  assert.equal(result.repaired, 2);
  assert.deepEqual(
    moves.map(({ issueNumber, target }) => ({ issueNumber, target })),
    [
      { issueNumber: 1, target: 'backlog' },
      { issueNumber: 2, target: 'assigned' },
    ]
  );
  assert.match(moves[0].reason, /Assigned has no live assignee/i);
});

test('apply does not count a zero-exit move as repaired without a confirmed postcondition', async () => {
  const result = await runAssignedInvariantHeal(
    {
      cfg: { repo: 'o/r', projectId: 'P1' },
      args: { state: 'all', scope: [1], apply: true, yes: true },
      projectDir: '/workspace',
    },
    {
      fetchInvariantRow: async () => ({ state: 'assigned', assignees: [] }),
      runMoveState: async () => 0,
      confirmBlastRadius: async () => ({ proceed: true }),
      writeReport: () => {},
      out: { write: () => {} },
    }
  );
  assert.equal(result.repaired, 0);
  assert.equal(result.errors, 1);
});

test('assigned-invariant CLI exits non-zero when the healer reports errors', async () => {
  let exitCode = null;
  await main(['--assigned-invariant', '--scope', '1'], {
    loadConfig: () => ({ repo: 'o/r', projectId: 'P1' }),
    getProjectDir: () => '/workspace',
    runAssignedInvariantHeal: async () => ({ scanned: 1, violations: 1, repaired: 0, errors: 1 }),
    exit: (code) => {
      exitCode = code;
      return code;
    },
  });
  assert.equal(exitCode, 1);
});
