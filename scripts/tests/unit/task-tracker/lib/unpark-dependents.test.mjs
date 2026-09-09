#!/usr/bin/env node
// @story #1557
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { unparkDependents } from '../../../../task-tracker/lib/unpark-dependents.mjs';

const cfg = { repo: 'o/r', projectId: 'P', fieldDisposition: 'F_DISPOSITION' };

test('Done fan-out reconciles every native dependent without removing relationships', async () => {
  const reconciled = [];
  const result = await unparkDependents({
    doneIssueNumber: 10,
    cfg,
    deps: {
      readNativeDependencies: async () => ({ blockedBy: [], blocking: [21, 22] }),
      reconcileDependencyDisposition: async ({ issueNumber }) => {
        reconciled.push(issueNumber);
        return { status: 'cleared' };
      },
    },
  });
  assert.deepEqual(reconciled, [21, 22]);
  assert.deepEqual(result, [
    { issue: 21, reconciled: 'cleared' },
    { issue: 22, reconciled: 'cleared' },
  ]);
});

test('Done fan-out preserves all native relationships while surfacing per-dependent errors', async () => {
  const result = await unparkDependents({
    doneIssueNumber: 10,
    cfg,
    deps: {
      readNativeDependencies: async () => ({ blockedBy: [], blocking: [21, 22] }),
      reconcileDependencyDisposition: async ({ issueNumber }) => {
        if (issueNumber === 22) throw new Error('project unavailable');
        return { status: 'idempotent' };
      },
    },
  });
  assert.deepEqual(result, [
    { issue: 21, reconciled: 'idempotent' },
    { issue: 22, error: 'project unavailable' },
  ]);
});

test('Done fan-out reports graph failure and rejects invalid issue input without throwing', async () => {
  assert.deepEqual(await unparkDependents({ doneIssueNumber: 0, cfg }), []);
  assert.deepEqual(
    await unparkDependents({
      doneIssueNumber: 10,
      cfg,
      deps: {
        readNativeDependencies: async () => {
          throw new Error('graph unavailable');
        },
      },
    }),
    [{ issue: null, error: 'native dependency read failed: graph unavailable' }]
  );
});
