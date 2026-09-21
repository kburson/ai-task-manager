// @story #1666
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import { runTestWithEntryInterlock } from '../../../../task-tracker/verbs/test.mjs';
import { evaluateTestReadiness } from '../../../../task-tracker/lib/action-decision/test.mjs';

const ISSUE = 1666;
const REPOSITORY = 'example/project';
const HEAD = 'a'.repeat(40);
const now = () => '2026-09-21T16:00:00.000Z';

const readyBody = `## User Story
As a verification operator
I want to inspect Test readiness
So that guidance does not run verification

## Scope
Read-only Test-entry readiness.

## Acceptance Criteria
- [ ] Test entry can be explained without effects.

## Verification Commands
- [ ] \`node --test scripts/tests/integration/task-tracker/lib/action-test.test.mjs\`

<!-- aitm-last-known-state state="develop" ts="2026-09-21T16:00:00Z" -->`;

function testFixture({
  body,
  state = 'develop',
  worktree,
  sessionState,
  delivery,
  unreadable = null,
  runGuards,
  config,
  projectDir = process.cwd(),
  resolveProjectDir,
  skipNetwork = false,
} = {}) {
  const effectiveBody = body ?? readyBody.replace('state="develop"', `state="${state}"`);
  const scope = computeScopeIdentity({ repository: REPOSITORY, issue: ISSUE, body: effectiveBody });
  const effects = [];
  const calls = { createWorktree: 0, execVerification: 0, provider: 0, write: 0 };
  const attempt = createObservationAttempt({
    repository: REPOSITORY,
    issue: ISSUE,
    boundaryId: `action:test:${ISSUE}`,
    now,
    read: async (request) => {
      if (request.resource === unreadable) return undefined;
      const values = {
        'issue-body': { number: ISSUE, body: effectiveBody },
        'project-board': { state },
        worktree: worktree ?? { matches: true, headSha: HEAD },
        'session-state': sessionState ?? { active: '#1666', paused: false },
        delivery,
      };
      return { ...request, value: values[request.resource] ?? { active: false } };
    },
  });
  const evaluate = (actionId) =>
    evaluateAction({
      actionId,
      repository: REPOSITORY,
      issue: ISSUE,
      inputs: { state, head: HEAD, body: effectiveBody },
      attempt,
      deps: {
        effectAttempts: () => effects,
        testPorts: {
          scope,
          projectDir: projectDir === false ? undefined : projectDir,
          resolveProjectDir,
          skipNetwork,
          cfg: config ?? { repo: REPOSITORY, projectId: 'PVT_TEST' },
          runGuards:
            runGuards ??
            (async () => ({
              ok: true,
              status: 'ready',
              refusals: [],
              humanDecision: null,
            })),
          createWorktree: async () => {
            calls.createWorktree += 1;
          },
          execVerification: async () => {
            calls.execVerification += 1;
          },
          startProvider: async () => {
            calls.provider += 1;
          },
          writeReceipt: async () => {
            calls.write += 1;
          },
        },
      },
    });
  return { calls, effects, evaluate };
}

test('direct Test and Develop Promote explain the same ready entry without effects', async (t) => {
  for (const scenario of [
    { name: 'direct Test from Develop', actionId: 'test', state: 'develop' },
    { name: 'direct Test self-rerun from Test', actionId: 'test', state: 'test' },
    { name: 'Promote from Develop', actionId: 'promote', state: 'develop' },
  ]) {
    await t.test(scenario.name, async () => {
      const fixture = testFixture({ state: scenario.state });
      const decision = await fixture.evaluate(scenario.actionId);

      assert.equal(decision.status, 'ready', JSON.stringify(decision));
      assert.deepEqual(decision.blockers, []);
      assert.deepEqual(fixture.effects, []);
      assert.deepEqual(fixture.calls, {
        createWorktree: 0,
        execVerification: 0,
        provider: 0,
        write: 0,
      });
    });
  }
});

test('accepted directory-backed Test evidence does not require legacy VCs or sandbox', async () => {
  const directory = {
    schema: 'aitm.directory/v1',
    revision: 1,
    issueNodeId: 'issue-node',
    singletons: {
      coordination: 'coord',
      'delivery-contract': 'contract',
      'evidence-projection': 'evidence',
      timing: 'timing',
    },
  };
  const body =
    readyBody.replace(/\n## Verification Commands[\s\S]*?\n\n<!--/, '\n\n<!--') +
    `\n<!-- aitm-directory\n${JSON.stringify(directory)}\n-->`;
  const delivery = {
    sourceKind: 'github-records/v1',
    expectedSha: HEAD,
    acceptedRecordIds: ['accepted-test'],
    authority: { contractEpoch: 1, coordinatorGrantId: 'grant', authorityEpoch: 1 },
    evidence: [
      {
        recordId: 'accepted-test',
        evidenceKind: 'test',
        result: 'passed',
        provenance: 'agent',
        commitSha: HEAD,
        contractEpoch: 1,
        authority: { grantId: 'grant', epoch: 1 },
      },
    ],
  };
  const fixture = testFixture({ body, delivery });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  assert.deepEqual(fixture.effects, []);
});

test('Review-state Test request is not advertised as runnable', async () => {
  const fixture = testFixture({ state: 'review' });
  const decision = await fixture.evaluate('test');
  assert.notEqual(decision.status, 'ready');
  assert.deepEqual(fixture.effects, []);
});

test('Test entry needs an explicit project directory for command and provider authority', async () => {
  const fixture = testFixture({ state: 'test', projectDir: null });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'indeterminate');
  assert.ok(
    decision.blockers.some(
      ({ code, args }) => code === 'authority-read-failed' && args.source === 'local-config'
    )
  );
});

test('Test entry resolves the bound project directory when the caller omits it', async () => {
  const fixture = testFixture({
    state: 'test',
    projectDir: false,
    resolveProjectDir: () => process.cwd(),
  });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
});

test('Test explanation reports missing Verification Commands without effects', async () => {
  const fixture = testFixture({
    body: readyBody.replace(/\n## Verification Commands[\s\S]*?\n\n<!--/, '\n\n<!--'),
  });
  const decision = await fixture.evaluate('test');

  assert.equal(decision.status, 'blocked', JSON.stringify(decision));
  assert.ok(decision.blockers.some(({ code }) => code === 'test-verification-commands-missing'));
  assert.deepEqual(fixture.effects, []);
});

test('Test entry preserves simultaneous declaration and Develop-exit refusals', async () => {
  const guardId = 'develop-exit-code-complete';
  const body = readyBody.replace(/\n## Verification Commands[\s\S]*?\n\n<!--/, '\n\n<!--');
  const fixture = testFixture({
    body,
    runGuards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [
        {
          id: guardId,
          guardId,
          code: 'unclassified-refusal',
          args: {},
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        },
      ],
      humanDecision: null,
    }),
  });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'blocked');
  assert.deepEqual(
    decision.blockers.map(({ code }) => code),
    ['test-verification-commands-missing', 'unclassified-refusal']
  );
});

test('Test entry aggregates independent binding and declaration blockers', async () => {
  const body = readyBody
    .replace(/\n## Verification Commands[\s\S]*?\n\n<!--/, '\n\n<!--')
    .replace('state="develop"', 'state="test"');
  const fixture = testFixture({ body, state: 'test', sessionState: { active: '#9999' } });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'blocked', JSON.stringify(decision));
  assert.deepEqual(
    decision.blockers.map(({ code }) => code),
    ['session-bind-mismatch', 'test-verification-commands-missing']
  );
});

test('Test explanation reports mismatched HEAD, binding, and malformed receipt authority', async (t) => {
  const malformedReceipt = `${readyBody}\n<!-- aitm-verification-receipt stage="develop-final" data="invalid" -->`;
  for (const scenario of [
    {
      name: 'worktree HEAD',
      options: { worktree: { matches: true, headSha: 'b'.repeat(40) } },
      code: 'test-head-mismatch',
    },
    {
      name: 'session binding',
      options: { sessionState: { active: '#9999', paused: false } },
      code: 'session-bind-mismatch',
    },
    {
      name: 'claimed receipt',
      options: { body: malformedReceipt },
      code: 'test-receipt-malformed',
    },
  ]) {
    await t.test(scenario.name, async () => {
      const fixture = testFixture(scenario.options);
      const decision = await fixture.evaluate('test');

      assert.equal(decision.status, 'blocked');
      assert.ok(decision.blockers.some(({ code }) => code === scenario.code));
      assert.deepEqual(fixture.effects, []);
    });
  }
});

test('Test explanation names an unavailable required authority read and makes no effects', async () => {
  const fixture = testFixture({ unreadable: 'project-board' });
  const decision = await fixture.evaluate('test');

  assert.equal(decision.status, 'indeterminate');
  assert.ok(
    decision.blockers.some(
      ({ code, args }) => code === 'authority-read-failed' && args.source === 'project-board'
    )
  );
  assert.deepEqual(fixture.effects, []);
});

test('network-skipped Test entry is indeterminate without an empty observation attempt', async () => {
  const fixture = testFixture({ skipNetwork: true });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'indeterminate');
  assert.ok(decision.blockers.some(({ code }) => code === 'authority-read-skipped'));
  assert.deepEqual(fixture.effects, []);
});

test('malformed observed HEAD is indeterminate, not blocked or ready', async () => {
  const fixture = testFixture({ worktree: { matches: true, headSha: 'not-a-head' } });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'indeterminate');
  assert.ok(decision.blockers.some(({ code }) => code === 'authority-read-failed'));
  assert.deepEqual(fixture.effects, []);
});

test('a required workflow-policy read failure remains indeterminate for Test entry', async () => {
  const refusal = {
    id: 'body-gates-entry-test',
    guardId: 'body-gates-entry-test',
    code: 'unclassified-refusal',
    args: {},
    noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
    reason: 'deep dive is absent',
  };
  const fixture = testFixture({
    unreadable: 'workflow-policy',
    runGuards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [refusal],
      humanDecision: null,
    }),
  });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'indeterminate');
  assert.ok(
    decision.blockers.some(
      ({ code, args }) => code === 'authority-read-failed' && args.source === 'workflow-policy'
    )
  );
  assert.deepEqual(fixture.effects, []);
});

test('a configured provider rejected by execution is blocked in Test explanation', async () => {
  const fixture = testFixture({
    state: 'test',
    config: { repo: REPOSITORY, verificationProvider: { id: 'unknown' } },
  });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'blocked');
  assert.ok(decision.blockers.some(({ code }) => code === 'test-provider-invalid'));
  assert.deepEqual(fixture.effects, []);
});

test('real Develop-exit guards refuse incomplete body evidence without effects', async () => {
  const fixture = testFixture({ runGuards });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'blocked', JSON.stringify(decision));
  assert.ok(decision.blockers.some(({ guardId }) => guardId !== 'authority-collection'));
  assert.deepEqual(fixture.effects, []);
});

test('Test entry retains registered guard warnings while remaining blocked', async () => {
  const guardId = 'develop-exit-code-complete';
  const fixture = testFixture({
    runGuards: async () => ({
      ok: false,
      status: 'blocked',
      humanDecision: null,
      refusals: [
        {
          id: guardId,
          guardId,
          code: 'unclassified-refusal',
          args: {},
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        },
      ],
      warns: [{ id: guardId, code: 'legacy-guard-warning', args: { guardId } }],
    }),
  });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'blocked');
  assert.deepEqual(decision.warnings, [{ code: 'legacy-guard-warning', args: { guardId } }]);
});

test('a missing Develop-final receipt is runnable resident work, not completed proof', async () => {
  const fixture = testFixture({
    runGuards: async () => ({
      ok: false,
      status: 'blocked',
      humanDecision: null,
      refusals: [
        {
          id: 'develop-exit-receipt',
          guardId: 'develop-exit-receipt',
          code: 'unclassified-refusal',
          args: {},
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        },
      ],
    }),
  });
  const decision = await fixture.evaluate('test');
  assert.equal(decision.status, 'ready', JSON.stringify(decision));
  assert.deepEqual(decision.warnings, [{ code: 'test-develop-finalization-pending', args: {} }]);
});

test('a ready Test explanation does not predetermine a later red locked execution', async () => {
  const explanation = await testFixture().evaluate('test');
  assert.equal(explanation.status, 'ready');
  const events = [];
  let currentBody = readyBody;
  const result = await runTestWithEntryInterlock({
    cfg: { repo: REPOSITORY },
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    deps: {
      acquireIssueLock: async (_key, run) => {
        events.push('lock');
        return run();
      },
      entryPreflight: async () => ({ status: 'ready', blockers: [] }),
      fetchBody: async () => currentBody,
      getHeadSha: async () => HEAD,
      reapStaleTestSandboxes: async () => ({}),
      mutateBody: async ({ mutate }) => {
        currentBody = mutate(currentBody);
      },
      postComment: async () => {
        events.push('comment');
      },
      createWorktree: async () => {
        events.push('worktree');
      },
      removeWorktree: async () => {},
      npmCi: async () => {
        events.push('npm-ci');
      },
      execInSandbox: async () => {
        events.push('verification');
        return { exit: 1, stdout: '', stderr: 'red' };
      },
      moveState: async () => {
        events.push('move');
      },
      demoteState: async () => {
        events.push('demote');
      },
    },
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(events.slice(0, 4), ['lock', 'move', 'worktree', 'npm-ci']);
  assert.ok(events.includes('verification'));
  assert.ok(events.includes('demote'));
});

test('production Test read adapter rechecks live body and board at a fresh boundary', async () => {
  const reads = [];
  const result = await evaluateTestReadiness({
    issue: ISSUE,
    cfg: { repo: REPOSITORY, projectId: 'PVT_TEST' },
    projectDir: process.cwd(),
    body: readyBody,
    head: HEAD,
    deps: {
      readBody: async () => {
        reads.push('body');
        return readyBody;
      },
      readHead: async () => {
        reads.push('head');
        return HEAD;
      },
      fetchBoard: async () => {
        reads.push('board');
        return { state: 'develop' };
      },
      resolveBoundDir: () => process.cwd(),
      readWorktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      readSessionState: () => ({ active: '#1666' }),
      runGuards: async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null }),
    },
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(reads, ['body', 'board', 'head']);
  assert.equal(result.bundle.observations.length, 4);
});

test('production adapter rejects directory evidence whose accepted record epoch is stale', async () => {
  const directory = {
    schema: 'aitm.directory/v1',
    revision: 1,
    issueNodeId: 'issue-node',
    singletons: {
      coordination: 'coord',
      'delivery-contract': 'contract',
      'evidence-projection': 'evidence',
      timing: 'timing',
    },
  };
  const body = readyBody + `\n<!-- aitm-directory\n${JSON.stringify(directory)}\n-->`;
  let resolverCalls = 0;
  let bodyReads = 0;
  const result = await evaluateTestReadiness({
    issue: ISSUE,
    cfg: { repo: REPOSITORY, projectId: 'PVT_TEST' },
    projectDir: process.cwd(),
    body,
    head: HEAD,
    deps: {
      readBody: async () => {
        bodyReads += 1;
        return body;
      },
      readHead: async () => HEAD,
      fetchBoard: async () => ({ state: 'develop' }),
      resolveBoundDir: () => process.cwd(),
      readWorktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      readSessionState: () => ({ active: '#1666' }),
      resolveLifecycleEvidence: async ({ expectedSha, issueBody }) => {
        resolverCalls += 1;
        assert.equal(issueBody, body);
        return {
          sourceKind: 'github-records/v1',
          expectedSha,
          acceptedRecordIds: ['r1'],
          authority: { contractEpoch: 2, coordinatorGrantId: 'g', authorityEpoch: 2 },
          evidence: [
            {
              recordId: 'r1',
              evidenceKind: 'test',
              result: 'passed',
              provenance: 'agent',
              commitSha: expectedSha,
              contractEpoch: 1,
              authority: { grantId: 'g', epoch: 1 },
            },
          ],
        };
      },
    },
  });
  assert.equal(resolverCalls, 1);
  assert.equal(bodyReads, 1);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some(({ code }) => code === 'test-directory-evidence-invalid'));
});

test('the locked Test wrapper supplies the production preflight by default', async () => {
  let seenPreflight;
  await runTestWithEntryInterlock({
    cfg: { repo: REPOSITORY },
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    deps: {
      acquireIssueLock: async (_key, run) => run(),
      runVerbTest: async ({ deps }) => {
        seenPreflight = deps.entryPreflight;
        return { status: 'stubbed' };
      },
    },
  });
  assert.equal(seenPreflight, evaluateTestReadiness);
});

test('locked Test execution refuses a freshly blocked entry before any sandbox effect', async () => {
  const events = [];
  const result = await runTestWithEntryInterlock({
    cfg: { repo: REPOSITORY },
    issueNumber: ISSUE,
    projectDir: process.cwd(),
    deps: {
      acquireIssueLock: async (_key, run) => {
        events.push('lock');
        return run();
      },
      fetchBody: async () => readyBody,
      getHeadSha: async () => HEAD,
      entryPreflight: async () => ({
        status: 'blocked',
        blockers: [{ code: 'session-bind-mismatch' }],
      }),
      createWorktree: async () => {
        events.push('worktree');
      },
      npmCi: async () => {
        events.push('npm-ci');
      },
      moveState: async () => {
        events.push('move');
      },
    },
  });
  assert.equal(result.status, 'entry-preflight-refused');
  assert.deepEqual(events, ['lock']);
});
