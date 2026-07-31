// @story #1049
import assert from 'node:assert/strict';
import test from 'node:test';

import { runPromote } from '../../../verbs/promote.mjs';

const CFG = {
  repo: 'o/r',
  projectId: 'project-board',
  workLease: { tokenEnv: 'REMOTE_LEASE_BEARER' },
};
const LEASE_CONTEXT = {
  projectId: 'project-authority',
  leaseId: 'lease-1049',
  fencingToken: '42',
  worktreeId: 'wt-1049',
};

function bodyWithState(state) {
  return (
    `<!-- aitm-last-known-state: ${state} -->\n` +
    '<!-- aitm-last-known-state-ts: 2026-07-31T00:00:00.000Z -->\n\n' +
    '## User Story\n\nAs a worker\nI want governed promotion\nSo that effects stay fenced\n'
  );
}

function baseDeps({ body = bodyWithState('backlog'), live = 'backlog' } = {}) {
  return {
    assertBound: () => {},
    fetchIssueBody: async () => ({ body }),
    getLiveState: async () => live,
    epicChildren: { fetchSiblings: async () => [] },
    codeCompleteGate: async () => ({ ok: true, blockers: [], shas: [] }),
    commitTrailHeadGate: async () => ({
      ok: true,
      headSha: 'deadbeef',
      trailShas: ['deadbeef'],
    }),
    baseEnv: {
      KEEP_ME: 'yes',
      REMOTE_LEASE_BEARER: 'secret',
      AITM_LEASE_ID: 'stale',
      AITM_FENCING_TOKEN: '7',
      AITM_LEASE_RECEIPT: 'untrusted',
    },
  };
}

test('promote holds one issue root across bootstrap body and move callbacks', async () => {
  const events = [];
  let roots = 0;
  const deps = baseDeps({ body: '## User Story\n\nbootstrap\n', live: 'backlog' });
  deps.withGovernedEffect = async (options, callback) => {
    roots += 1;
    events.push(`root:${options.issueId}:${options.operation}:${options.heartbeat}`);
    return callback({
      leaseContext: LEASE_CONTEXT,
      reverify: async () => events.push('reverify'),
    });
  };
  deps.mutateIssueBody = async ({ mutate, withGovernedEffect }) =>
    withGovernedEffect(
      { issueId: '1049', operation: 'evidence-mutation', heartbeat: true },
      async () => {
        assert.match(
          mutate('## User Story\n\nbootstrap\n'),
          /aitm-last-known-state state="backlog"/
        );
        events.push('body');
        return { status: 'ok' };
      }
    );
  deps.runMoveState = async ({ issueNumber, target, withGovernedEffect, env }) => {
    assert.equal(issueNumber, 1049);
    assert.equal(target, 'on-deck');
    assert.deepEqual(env, {
      KEEP_ME: 'yes',
      AITM_LEASE_ID: 'lease-1049',
      AITM_FENCING_TOKEN: '42',
    });
    return withGovernedEffect(
      { issueId: '1049', operation: 'lifecycle-mutation', heartbeat: true },
      async () => {
        events.push('move');
        return 0;
      }
    );
  };

  const result = await runPromote({ issueNumber: 1049, cfg: CFG, deps });

  assert.equal(result.status, 'promoted');
  assert.equal(roots, 1);
  assert.deepEqual(events, [
    'root:1049:lifecycle-mutation:true',
    'reverify',
    'body',
    'reverify',
    'move',
  ]);
});

test('promote best-effort post hook rethrows governed authority failures', async () => {
  const deps = baseDeps({ body: bodyWithState('on-deck'), live: 'on-deck' });
  deps.withGovernedEffect = async (_options, callback) =>
    callback({ leaseContext: LEASE_CONTEXT, reverify: async () => {} });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ priority: 'P2' }),
  };
  deps.runMoveState = async () => 0;
  deps.stampStartTime = async () => {
    const error = new Error('lease became stale before start-time write');
    error.code = 'fence-stale';
    throw error;
  };

  await assert.rejects(
    runPromote({ issueNumber: 1049, cfg: CFG, deps }),
    (error) => error.code === 'fence-stale'
  );
});
