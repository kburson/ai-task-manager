// @story #1016
// Sentinel-only drift recovery: the board and recorded marker can agree after
// an out-of-band Status write while the saga-owned move-complete sentinel still
// names the last verified state. Reconcile must restore the verified state
// without minting lifecycle history or a replacement sentinel.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  defaultRunSentinelStatusWrite,
  runReconcile,
  verbReconcile,
} from '../../../verbs/reconcile.mjs';
import { VERB_REFERENCE } from '../../../verbs/help-data.mjs';
import {
  classifyMoveInvariants,
  formatAuditReadout,
} from '../../../lib/verify-move-invariants.mjs';

const cfg = {
  repo: 'o/r',
  projectId: 'PROJ_1',
  kanbanFieldId: 'STATUS_FIELD',
  kanbanOptionPlan: 'OPT_PLAN',
};

function driftBody({ recorded = 'develop', sentinel = 'plan' } = {}) {
  return [
    `<!-- aitm-last-known-state state="${recorded}" ts="2026-07-27T00:01:00.000Z" -->`,
    '<!-- aitm-entered-plan ts="2026-07-27T00:00:00.000Z" -->',
    sentinel ? `<!-- aitm-move-complete state=${sentinel} ts=2026-07-27T00:00:30.000Z -->` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function makeDeps({
  body = driftBody(),
  freshBody = body,
  live = 'develop',
  statusCode = 0,
  recordFailures = 0,
} = {}) {
  const calls = { statusWrites: [], bodyWrites: [], audits: [], persists: [] };
  let recordAttempts = 0;
  let recordedBody = '';
  return {
    calls,
    deps: {
      fetchIssueBody: async () => ({ body }),
      getLiveState: async () => live,
      runSentinelStatusWrite: async (args) => {
        calls.statusWrites.push(args);
        return statusCode;
      },
      mutateIssueBody: async ({ mutate }) => {
        const base = recordedBody || freshBody;
        const next = mutate(base);
        if (/aitm-reverted/.test(next)) {
          calls.audits.push(next);
          return { status: 'ok' };
        }
        recordAttempts += 1;
        if (recordAttempts <= recordFailures) throw new Error('recording unavailable');
        recordedBody = next;
        calls.bodyWrites.push(next);
        return { status: 'ok' };
      },
      postComment: async () => {},
      warn: () => {},
      persistTrackerState: (args) => {
        calls.persists.push(args);
      },
    },
  };
}

test('#1016 restores board=recorded drift to the saga-verified sentinel', async () => {
  const { deps, calls } = makeDeps();
  const result = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
    now: () => '2026-07-27T00:02:00.000Z',
  });

  assert.deepEqual(result, {
    status: 'reconciled',
    mode: 'revert-to-sentinel',
    from: 'develop',
    recorded: 'develop',
    to: 'plan',
  });
  assert.deepEqual(calls.statusWrites, [{ issueNumber: 1007, target: 'plan', cfg }]);
  assert.equal(calls.bodyWrites.length, 1);
  assert.match(calls.bodyWrites[0], /aitm-last-known-state state="plan"/);
  assert.match(calls.bodyWrites[0], /aitm-move-complete state=plan/);
  assert.doesNotMatch(calls.bodyWrites[0], /aitm-entered-plan-2/);
  assert.deepEqual(calls.persists, [{ issueNumber: 1007, state: 'plan' }]);
  assert.equal(calls.audits.length, 1);
  assert.match(calls.audits[0], /aitm-reverted/);
  assert.match(calls.audits[0], /revert-to-sentinel/);
  assert.match(calls.audits[0], /develop.*plan/);
});

test('#1016 missing sentinel refuses before any write', async () => {
  const { deps, calls } = makeDeps({ body: driftBody({ sentinel: '' }) });
  const result = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'error');
  assert.match(result.message, /no move-complete sentinel/);
  assert.deepEqual(calls.statusWrites, []);
  assert.deepEqual(calls.bodyWrites, []);
  assert.deepEqual(calls.audits, []);
});

test('#1016 unknown sentinel state refuses before any write', async () => {
  const { deps, calls } = makeDeps({ body: driftBody({ sentinel: 'sideways' }) });
  const result = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'error');
  assert.match(result.message, /unrecognized sentinel state "sideways"/);
  assert.deepEqual(calls.statusWrites, []);
  assert.deepEqual(calls.bodyWrites, []);
});

test('#1016 aligned board and sentinel is a no-drift refusal', async () => {
  const { deps, calls } = makeDeps({
    body: driftBody({ recorded: 'plan', sentinel: 'plan' }),
    live: 'plan',
  });
  const result = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'no-drift-refused');
  assert.match(result.message, /already matches/);
  assert.deepEqual(calls.statusWrites, []);
  assert.deepEqual(calls.bodyWrites, []);
});

test('#1016 failed sentinel Status write leaves body and cache untouched', async () => {
  const { deps, calls } = makeDeps({ statusCode: 7 });
  const result = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'transition-failed');
  assert.equal(result.exitCode, 7);
  assert.equal(result.failedAt, 'plan');
  assert.deepEqual(calls.bodyWrites, []);
  assert.deepEqual(calls.audits, []);
  assert.deepEqual(calls.persists, []);
});

test('#1016 body-write exhaustion is a nonzero partial-recovery result', async () => {
  const { deps, calls } = makeDeps({ recordFailures: 2 });
  const result = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'recording-failed');
  assert.equal(result.exitCode, 8);
  assert.match(result.message, /board is "plan".*recorded marker remains "develop"/);
  assert.equal(calls.statusWrites.length, 1);
  assert.deepEqual(calls.bodyWrites, []);
  assert.deepEqual(calls.audits, []);
  assert.deepEqual(calls.persists, []);
});

test('#1016 partial board success can retry marker repair without another Status write', async () => {
  const first = makeDeps({ recordFailures: 2 });
  const failed = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps: first.deps,
  });
  assert.equal(failed.status, 'recording-failed');

  const retry = makeDeps({ live: 'plan' });
  const repaired = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps: retry.deps,
  });
  assert.equal(repaired.status, 'reconciled');
  assert.deepEqual(retry.calls.statusWrites, []);
  assert.equal(retry.calls.bodyWrites.length, 1);
  assert.match(retry.calls.bodyWrites[0], /aitm-last-known-state state="plan"/);
  assert.deepEqual(retry.calls.persists, [{ issueNumber: 1007, state: 'plan' }]);
});

test('#1016 closure-based state repair preserves a concurrent body edit', async () => {
  const freshBody = `${driftBody()}\n<!-- concurrent-provenance preserved=yes -->`;
  const { deps, calls } = makeDeps({ freshBody });
  const result = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'reconciled');
  assert.match(calls.bodyWrites[0], /concurrent-provenance preserved=yes/);
});

test('#1016 fresh-body sentinel mismatch fails instead of overwriting provenance', async () => {
  const { deps, calls } = makeDeps({
    freshBody: driftBody({ sentinel: 'test' }),
  });
  const result = await runReconcile({
    issueNumber: 1007,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'recording-failed');
  assert.match(result.message, /expected sentinel "plan"/);
  assert.deepEqual(calls.bodyWrites, []);
  assert.deepEqual(calls.audits, []);
  assert.deepEqual(calls.persists, []);
});

test('#1016 default adapter selects the sentinel option and confirmed Status-only seam', async () => {
  const calls = [];
  const ghFn = async () => {};
  const projectItemForIssueFn = async () => ({ itemId: 'ITEM_1' });
  const exitCode = await defaultRunSentinelStatusWrite(
    { issueNumber: 1007, target: 'plan', cfg },
    {
      ghFn,
      projectItemForIssueFn,
      statusWriter: async (ctx) => {
        calls.push(ctx);
        return { itemId: 'ITEM_1', exit: null };
      },
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].issueArg, '1007');
  assert.equal(calls[0].stateArg, 'plan');
  assert.equal(calls[0].optionId, 'OPT_PLAN');
  assert.equal(calls[0].gh, ghFn);
  assert.equal(calls[0].projectItemForIssue, projectItemForIssueFn);
  assert.equal('stampEntryMarkers' in calls[0], false);
  assert.equal('writeMoveCompleteMarker' in calls[0], false);
});

test('#1016 public reconcile help lists the accepted sentinel mode', () => {
  assert.match(VERB_REFERENCE.reconcile.usage, /revert-to-sentinel/);
  assert.ok(
    VERB_REFERENCE.reconcile.examples.some((example) => /revert-to-sentinel/.test(example))
  );
});

test('#1016 invariant diagnostic recommends a mode the public verb accepts', async () => {
  const verdict = classifyMoveInvariants({
    boardState: 'develop',
    recordedState: 'develop',
    sentinelState: 'plan',
  });
  const readout = formatAuditReadout({ issueNumber: 91016, verdict });
  assert.match(readout, /reconcile revert-to-sentinel #91016/);

  const { deps } = makeDeps();
  await assert.doesNotReject(() => verbReconcile(['91016', 'revert-to-sentinel'], cfg, deps));
});
