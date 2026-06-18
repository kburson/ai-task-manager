// @story #309
// #299 Item 2 — `/task plan #N` is a dedicated refine→plan promoter.
// These tests pin the behavior the deprecation alias used to drop.

import assert from 'node:assert/strict';
import { runPlan } from '../../verbs/plan.mjs';

const cfg = { repo: 'kburson/ai-task-manager', projectId: 'PVT_TEST' };

// 1. From `refine`: delegates to verbPromote and returns the promoted result.
{
  const calls = [];
  const result = await runPlan({
    issueNumber: 299,
    cfg,
    deps: {
      assertBound: () => {},
      getLiveState: async ({ issueNumber }) => {
        calls.push(['live', issueNumber]);
        return 'refine';
      },
      verbPromote: async (rest, cfgArg) => {
        calls.push(['promote', rest, cfgArg.repo]);
      },
    },
  });
  assert.equal(result.status, 'promoted');
  assert.equal(result.issueNumber, 299);
  assert.equal(result.from, 'refine');
  assert.equal(result.to, 'plan');
  assert.deepEqual(calls, [
    ['live', 299],
    ['promote', ['299'], 'kburson/ai-task-manager'],
  ]);
  console.log('PASS: runPlan(refine) promotes refine→plan via verbPromote');
}

// 2. From any non-refine state: refuse, do NOT delegate to verbPromote, and
//    explicitly mention `/task discover` as the alternative for backlog work.
for (const wrong of ['backlog', 'plan', 'develop', 'test', 'review', 'done', null]) {
  let promoteCalled = false;
  const result = await runPlan({
    issueNumber: 42,
    cfg,
    deps: {
      assertBound: () => {},
      getLiveState: async () => wrong,
      verbPromote: async () => {
        promoteCalled = true;
      },
    },
  });
  assert.equal(promoteCalled, false, `verbPromote MUST NOT run when state is ${wrong}`);
  assert.equal(result.status, 'wrong-state', `expected wrong-state for ${wrong}`);
  assert.equal(result.current, wrong);
  assert.match(result.message, /\/task discover/, 'refusal must redirect to discover');
  assert.match(result.message, /refine/i);
}
console.log('PASS: runPlan refuses any non-refine current state and never delegates to promote');

// 3. Bad args.
await assert.rejects(() => runPlan({ cfg }), /positive integer/);
await assert.rejects(() => runPlan({ issueNumber: 0, cfg }), /positive integer/);
await assert.rejects(() => runPlan({ issueNumber: 1 }), /cfg is required/);
console.log('PASS: runPlan validates args');

// 4. discover.mjs must NOT export verbPlan anymore — the alias is gone.
const discoverMod = await import('../../verbs/discover.mjs');
assert.equal(
  typeof discoverMod.verbPlan,
  'undefined',
  'verbPlan must be removed from discover.mjs (deprecation alias purged)'
);
console.log('PASS: discover.mjs no longer exports verbPlan');
