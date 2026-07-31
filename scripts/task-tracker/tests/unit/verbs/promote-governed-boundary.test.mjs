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

  assert.equal(result.status, 'promoted', JSON.stringify(result));
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

test('promote authorization admits production issue-body mutation helpers on the same issue', async () => {
  const events = [];
  const deps = baseDeps({ body: '## User Story\n\nbootstrap\n', live: 'backlog' });
  deps.withGovernedEffect = async (_options, callback) =>
    callback({
      leaseContext: LEASE_CONTEXT,
      reverify: async () => events.push('reverify'),
    });
  deps.mutateIssueBody = async ({ mutate, withGovernedEffect }) =>
    withGovernedEffect(
      {
        issueId: '1049',
        operation: 'issue-body-mutation',
        heartbeat: true,
      },
      async () => {
        mutate('## User Story\n\nbootstrap\n');
        events.push('body');
      }
    );
  deps.runMoveState = async () => 0;

  const result = await runPromote({ issueNumber: 1049, cfg: CFG, deps });
  assert.equal(result.status, 'promoted');
  assert.deepEqual(events, ['reverify', 'body']);
});

test('test-to-review derive uses production issue-body authority on the same root', async () => {
  const events = [];
  const deps = baseDeps({ body: bodyWithState('test'), live: 'test' });
  deps.withGovernedEffect = async (_options, callback) =>
    callback({
      leaseContext: LEASE_CONTEXT,
      reverify: async () => events.push('reverify'),
    });
  deps.deriveAndRescan = async ({ deps: deriveDeps, scanBody }) => {
    await deriveDeps.withGovernedEffect(
      {
        issueId: '1049',
        operation: 'issue-body-mutation',
        heartbeat: true,
      },
      async () => events.push('derive')
    );
    return { scanBody, derived: null, errors: [] };
  };

  await runPromote({ issueNumber: 1049, cfg: CFG, deps });
  assert.deepEqual(events, ['reverify', 'derive']);
});

test('develop-to-test production git and GH helpers receive only the owned lease env', async () => {
  const calls = [];
  let liveReads = 0;
  const deps = baseDeps({ body: bodyWithState('develop'), live: 'develop' });
  deps.withGovernedEffect = async (_options, callback) =>
    callback({ leaseContext: LEASE_CONTEXT, reverify: async () => {} });
  deps.getLiveState = async () => {
    liveReads += 1;
    return liveReads === 1 ? 'develop' : 'test';
  };
  deps.spawnVerb = async ({ baseEnv }) => {
    assert.deepEqual(baseEnv, {
      KEEP_ME: 'yes',
      AITM_LEASE_ID: 'lease-1049',
      AITM_FENCING_TOKEN: '42',
    });
    return 0;
  };
  deps.pexec = async (command, args, options) => {
    calls.push({ command, args, env: options.env });
    if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
      return {
        stdout: JSON.stringify([{ body: '### 🔗 Commits\n<!-- aitm-commits shas="deadbeef" -->' }]),
      };
    }
    if (command === 'git') {
      return { stdout: '+++ b/new.test.mjs\n+test(\"owned helper env\", () => {});' };
    }
    return { stdout: '' };
  };

  const result = await runPromote({ issueNumber: 1049, cfg: CFG, deps });

  assert.equal(result.status, 'promoted');
  assert.equal(result.newTestsPost.status, 'posted');
  assert.deepEqual(
    calls.map(({ command }) => command),
    ['gh', 'git', 'gh']
  );
  for (const call of calls) {
    assert.deepEqual(call.env, {
      KEEP_ME: 'yes',
      AITM_LEASE_ID: 'lease-1049',
      AITM_FENCING_TOKEN: '42',
    });
  }
});

test('refine-to-plan production refinement GH helpers receive only the owned lease env', async () => {
  const rationale =
    '<!-- aitm-refinement-rationale: {"size":"a","estimate":"b","priority":"c"} -->';
  const body =
    `${bodyWithState('refine')}\n` +
    '<!-- aitm-refine-complete: 2026-07-31T00:00:00Z -->\n' +
    `${rationale}\n\n## Acceptance Criteria\n- [ ] one\n`;
  const calls = [];
  const deps = baseDeps({ body, live: 'refine' });
  deps.withGovernedEffect = async (_options, callback) =>
    callback({ leaseContext: LEASE_CONTEXT, reverify: async () => {} });
  deps.runMoveState = async () => 0;
  deps.refineToPlanGate = async () => ({ ok: true, blockers: [] });
  deps.refinementEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
    mutateIssueBody: async () => ({ status: 'ok' }),
  };
  deps.pexec = async (command, args, options) => {
    calls.push({ command, args, env: options.env });
    return { stdout: '' };
  };

  const result = await runPromote({ issueNumber: 1049, cfg: CFG, deps });

  assert.equal(result.status, 'promoted', JSON.stringify(result));
  assert.equal(result.refinementPost.status, 'posted');
  assert.deepEqual(
    calls.map(({ command }) => command),
    ['gh', 'gh']
  );
  for (const call of calls) {
    assert.deepEqual(call.env, {
      KEEP_ME: 'yes',
      AITM_LEASE_ID: 'lease-1049',
      AITM_FENCING_TOKEN: '42',
    });
  }
});
