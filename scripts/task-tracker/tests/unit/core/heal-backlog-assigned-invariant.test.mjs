// @story #1207
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parseArgs, runAssignedInvariantHeal } from '../../../heal-backlog.mjs';

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
  const result = await runAssignedInvariantHeal(
    {
      cfg: { repo: 'o/r', projectId: 'P1' },
      args: { state: 'all', scope: [1, 2, 3], apply: true, yes: true },
      projectDir: '/workspace',
    },
    {
      fetchInvariantRow: async (number) =>
        ({
          1: { state: 'assigned', assignees: [] },
          2: { state: 'backlog', assignees: ['alice'] },
          3: { state: 'refine', assignees: [] },
        })[number],
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
});
