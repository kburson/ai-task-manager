#!/usr/bin/env node
// @story #1552

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createDefaultDeliverDeps } from '../../../../task-tracker/verbs/deliver.mjs';

test('default delivery adapter unwraps the raw GitHub GraphQL envelope for child lineage', async () => {
  const calls = [];
  const deps = createDefaultDeliverDeps(
    {
      projectDir: '/repo',
      cfg: {
        repo: 'kburson/ai-task-manager',
        trunkRef: 'origin/trunk',
      },
    },
    {
      async exec(command, args) {
        calls.push([command, args]);
        return {
          stdout: JSON.stringify({
            data: {
              repository: {
                issue: { parent: { number: 1531 } },
              },
            },
          }),
        };
      },
    }
  );

  assert.deepEqual(await deps.resolveLineage({ issueNumber: 1532 }), {
    parentIssueNumber: 1531,
    deliveryTarget: 'epic/1531',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'gh');
  assert.deepEqual(calls[0][1].slice(0, 2), ['api', 'graphql']);
});
