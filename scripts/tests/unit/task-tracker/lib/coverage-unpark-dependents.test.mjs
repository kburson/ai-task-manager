#!/usr/bin/env node
// @story #1557
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { unparkDependents } from '../../../../task-tracker/lib/unpark-dependents.mjs';

const cfg = { repo: 'o/r', projectId: 'P', fieldDisposition: 'F_DISPOSITION' };

test('default native reader discovers the complete blocking set through injected gh', async () => {
  const calls = [];
  const reconciled = [];
  const result = await unparkDependents({
    doneIssueNumber: 500,
    cfg,
    deps: {
      nativeDependencies: {
        pexec: async (file, args) => {
          calls.push({ file, args });
          return {
            stdout: JSON.stringify({
              blockedBy: { nodes: [], totalCount: 0 },
              blocking: { nodes: [{ number: 700 }], totalCount: 1 },
            }),
          };
        },
      },
      reconcileDependencyDisposition: async ({ issueNumber }) => {
        reconciled.push(issueNumber);
        return { status: 'cleared' };
      },
    },
  });
  assert.deepEqual(calls[0].args, [
    'issue',
    'view',
    '500',
    '-R',
    'o/r',
    '--json',
    'blockedBy,blocking',
  ]);
  assert.deepEqual(reconciled, [700]);
  assert.deepEqual(result, [{ issue: 700, reconciled: 'cleared' }]);
});

test('default native read failure becomes one non-fatal error row', async () => {
  const result = await unparkDependents({
    doneIssueNumber: 500,
    cfg,
    deps: {
      nativeDependencies: {
        pexec: async () => {
          throw new Error('gh boom');
        },
      },
    },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].issue, null);
  assert.match(result[0].error, /native dependency read failed/);
  assert.match(result[0].error, /gh boom/);
});
