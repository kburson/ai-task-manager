// @story #1557
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  observeDependencyReadiness,
  reconcileAfterSuccessfulBind,
} from '../../../../task-tracker/lib/dependency-disposition.mjs';

const cfg = { repo: 'o/r', projectId: 'P', fieldDisposition: 'F_DISPOSITION' };

test('shared observation reads native refs and AITM Status including external issues', async () => {
  const seen = [];
  const result = await observeDependencyReadiness({
    issueNumber: 12,
    cfg,
    deps: {
      readNativeDependencies: async () => ({ blockedBy: [4, 88], blocking: [] }),
      fetchAssignmentSnapshot: async ({ issueNumber }) => {
        seen.push(issueNumber);
        return { state: issueNumber === 4 ? 'done' : 'develop', assignees: [] };
      },
    },
  });
  assert.deepEqual(seen, [4, 88]);
  assert.deepEqual(result, {
    blockedBy: [4, 88],
    states: new Map([
      [4, 'done'],
      [88, 'develop'],
    ]),
    status: 'blocked',
    unfinished: [{ ref: 88, state: 'develop' }],
  });
});

test('post-bind reconciliation succeeds or warns without undoing the binding', async () => {
  const warnings = [];
  const ok = await reconcileAfterSuccessfulBind({
    issueNumber: 12,
    cfg,
    reconcile: async () => ({ status: 'projected' }),
    warn: (message) => warnings.push(message),
  });
  assert.equal(ok.status, 'projected');

  const failed = await reconcileAfterSuccessfulBind({
    issueNumber: 12,
    cfg,
    reconcile: async () => {
      throw new Error('project unavailable');
    },
    warn: (message) => warnings.push(message),
  });
  assert.equal(failed.status, 'warning');
  assert.match(warnings[0], /#12/);
  assert.match(warnings[0], /binding remains active/i);
  assert.match(warnings[0], /retry.*projection/i);
});

test('switch and resume invoke projection after writing active binding state', () => {
  for (const relative of [
    '../../../../task-tracker/verbs/switch.mjs',
    '../../../../task-tracker/verbs/resume.mjs',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /reconcileAfterSuccessfulBind/);
    assert.ok(
      source.indexOf('saveState(') < source.lastIndexOf('reconcileAfterSuccessfulBind('),
      `${relative} must save the binding before best-effort projection`
    );
  }
});

// #1859 workflow admission: outgoing dependents do not govern this issue's readiness.
for (const incoming of [[], [{ number: 4, repository: { nameWithOwner: 'o/r' } }]]) {
  test(`readiness reads only incoming blockers with ${incoming.length} incoming relation`, async () => {
    const commands = [];
    const connection = (nodes) => ({
      nodes,
      totalCount: nodes.length,
      pageInfo: { hasNextPage: false },
    });
    const result = await observeDependencyReadiness({
      issueNumber: 1859,
      cfg,
      deps: {
        nativeDependencies: {
          pexec: async (_command, args) => {
            commands.push(args);
            return {
              stdout: JSON.stringify({
                blockedBy: connection(incoming),
                blocking: connection([
                  { number: 132, repository: { nameWithOwner: 'o/peer-review' } },
                ]),
              }),
            };
          },
        },
        fetchAssignmentSnapshot: async () => ({ state: 'develop' }),
      },
    });
    assert.equal(result.status, incoming.length ? 'blocked' : 'ready');
    assert.deepEqual(
      result.blockedBy,
      incoming.map(({ number }) => number)
    );
    assert.equal(commands[0].at(-1), 'blockedBy');
  });
}

test('incoming cross-repository blockers still refuse rather than lose identity', async () => {
  await assert.rejects(
    () =>
      observeDependencyReadiness({
        issueNumber: 1859,
        cfg,
        deps: {
          nativeDependencies: {
            pexec: async () => ({
              stdout: JSON.stringify({
                blockedBy: {
                  nodes: [{ number: 132, repository: { nameWithOwner: 'o/peer-review' } }],
                  totalCount: 1,
                  pageInfo: { hasNextPage: false },
                },
                blocking: { nodes: [], totalCount: 0, pageInfo: { hasNextPage: false } },
              }),
            }),
          },
        },
      }),
    /native-dependencies:blockedBy-repository/
  );
});
