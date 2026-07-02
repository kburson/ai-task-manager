// @story #630
// Coverage-lift unit test for `lib/refine-to-plan-gate.mjs` (`gateRefineToPlan`
// plus its two module-private default gh fetchers). Every collaborator is
// injected via the module's existing `deps` seam — extended in #630 with a
// `deps.gql` default-through so `defaultFetchBody`/`defaultFetchLabels` are
// reachable with a canned GraphQL payload. Zero network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gateRefineToPlan } from '../../lib/refine-to-plan-gate.mjs';

const PICKUP = '## Pickup Directive — MANDATORY, DO NOT SKIP';

// A minimal body that clears every body-derived blocker: has the Pickup
// Directive heading, no forbidden commands, no non-demonstrable ACs.
const CLEAN_BODY = `# Story\n\nSome prose.\n\n${PICKUP}\n\nDo the thing.\n`;

// Build a fully-passing `deps` set; callers override individual keys.
function makeDeps(over = {}) {
  return {
    loadProjectFieldDefs: () => ({}),
    projectValuesForIssue: async () => ({ rank: '1', startTime: '2026-07-02T00:00:00Z' }),
    fetchLabels: async () => ['bug'],
    fetchBody: async () => CLEAN_BODY,
    ...over,
  };
}

const cfg = { repo: 'kburson/ai-task-manager' };

test('throws when cfg is missing', async () => {
  await assert.rejects(() => gateRefineToPlan({ issueNumber: 1 }), /cfg is required/);
});

test('throws when issueNumber is missing', async () => {
  await assert.rejects(() => gateRefineToPlan({ cfg }), /issueNumber is required/);
});

test('board-fetch failure returns refine-exit-board-fetch-failed', async () => {
  const deps = makeDeps({
    projectValuesForIssue: async () => {
      throw new Error('boom-board');
    },
  });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.equal(res.blockers.length, 1);
  assert.match(res.blockers[0], /refine-exit-board-fetch-failed: boom-board/);
});

test('labels-fetch failure returns refine-exit-labels-fetch-failed', async () => {
  const deps = makeDeps({
    fetchLabels: async () => {
      throw new Error('boom-labels');
    },
  });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.equal(res.blockers.length, 1);
  assert.match(res.blockers[0], /refine-exit-labels-fetch-failed: boom-labels/);
});

test('missing Rank is a blocker', async () => {
  const deps = makeDeps({ projectValuesForIssue: async () => ({ rank: null, startTime: 't' }) });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('refine-exit-missing: Rank')));
});

test('empty labels is a blocker', async () => {
  const deps = makeDeps({ fetchLabels: async () => [] });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('refine-exit-missing: issue has no labels')));
});

test('missing Start Time is a blocker', async () => {
  const deps = makeDeps({ projectValuesForIssue: async () => ({ rank: '1', startTime: '' }) });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('refine-exit-missing: Start time')));
});

test('missing Pickup Directive heading is a blocker', async () => {
  const deps = makeDeps({ fetchBody: async () => '# Story\n\nNo directive here.\n' });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('refine-exit-pickup-directive-missing')));
});

test('a Pickup Directive inside a <details> block does not satisfy the gate', async () => {
  const body = `# Story\n\n<details>\n${PICKUP}\n</details>\n`;
  const deps = makeDeps({ fetchBody: async () => body });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.ok(res.blockers.some((b) => b.startsWith('refine-exit-pickup-directive-missing')));
});

test('a forbidden compound command in Verification Commands is a blocker', async () => {
  const body = `${CLEAN_BODY}\n## Verification Commands\n\n- [ ] \`npm test && npm run lint\`\n`;
  const deps = makeDeps({ fetchBody: async () => body });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('refine-exit-forbidden-command')));
});

test('a non-demonstrable AC (no verifier) is a blocker', async () => {
  const body = `${CLEAN_BODY}\n## Acceptance Criteria\n\n- [ ] Something happens with no verifier\n`;
  const deps = makeDeps({ fetchBody: async () => body });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('refine-exit-demonstrable')));
});

test('body-fetch failure appends refine-exit-body-fetch-failed', async () => {
  const deps = makeDeps({
    fetchBody: async () => {
      throw new Error('boom-body');
    },
  });
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.startsWith('refine-exit-body-fetch-failed: boom-body')));
});

test('happy path — all signals present — returns ok:true', async () => {
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps: makeDeps() });
  assert.equal(res.ok, true);
  assert.deepEqual(res.blockers, []);
  assert.deepEqual(res.labels, ['bug']);
  assert.equal(res.projectValues.rank, '1');
});

test('default fetchers run when deps.gql is injected (no fetchBody/fetchLabels)', async () => {
  // Exercise `defaultFetchBody` + `defaultFetchLabels` against a canned
  // GraphQL payload — both read from the same shape, so one fake serves both.
  const gqlPayload = {
    repository: { issue: { body: CLEAN_BODY, labels: { nodes: [{ name: 'bug' }, { name: '' }] } } },
  };
  const calls = [];
  const deps = {
    loadProjectFieldDefs: () => ({}),
    projectValuesForIssue: async () => ({ rank: '1', startTime: 't' }),
    gql: async (query, vars) => {
      calls.push({ query, vars });
      return gqlPayload;
    },
  };
  const res = await gateRefineToPlan({ cfg, issueNumber: 630, deps });
  assert.equal(res.ok, true);
  assert.deepEqual(res.blockers, []);
  // defaultFetchLabels mapped nodes[].name and dropped the empty one.
  assert.deepEqual(res.labels, ['bug']);
  // Both default fetchers issued a GraphQL round-trip.
  assert.equal(calls.length, 2);
  assert.equal(calls[0].vars.issue, 630);
});
