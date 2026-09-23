// @story #1729
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  evaluateAction,
  evaluateCompleteGuards,
  evaluateExactTrunkAttribution,
  observeExactTrunkAttribution,
  readExactTrunkTip,
} from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

const ready = Object.freeze({ ok: true, status: 'ready', refusals: [], humanDecision: null });
const waiverRefusal = Object.freeze({
  id: 'plan-exit-plan-approved',
  guardId: 'plan-exit-plan-approved',
  code: 'plan-approval-missing',
  args: {},
  remediation: { id: 'record-plan-approval', args: { issue: 1729 } },
  reason: 'approval missing',
});
const body = '## User Story\nA user\n## Scope\nDo work\n## Acceptance Criteria\n- [ ] It works';

function bodyAttempt({
  read = async (request) => ({
    ...request,
    value: { number: 1729, body },
  }),
} = {}) {
  return createObservationAttempt({
    repository: 'owner/repo',
    issue: 1729,
    boundaryId: 'test:1729',
    now: () => '2026-09-21T10:00:00.000Z',
    read,
  });
}

test('complete shared guards skip policy transport on a ready baseline', async () => {
  const calls = [];
  const result = await evaluateCompleteGuards({
    fromState: 'plan',
    toState: 'develop',
    context: { issueNumber: 1729, body: 'body' },
    runGuards: async (_from, _to, context) => {
      calls.push(['guards', context.workflowPolicy ?? null]);
      return ready;
    },
    loadPolicy: async () => {
      calls.push(['policy']);
      throw new Error('unexpected policy read');
    },
  });
  assert.deepEqual(calls, [['guards', null]]);
  assert.deepEqual(result.guardResult, ready);
});

test('qualifying refusal loads policy once and replaces the entire baseline result', async () => {
  const calls = [];
  const baseline = {
    ok: false,
    status: 'blocked',
    refusals: [waiverRefusal],
    warns: [{ id: 'provisional-warning' }],
    humanDecision: { requests: [{ kind: 'plan-approval' }] },
  };
  const final = { ...ready, derived: { refinementPlan: { commentBody: 'final' } } };
  const policy = { status: 'policy-compatible', isWaived: () => true };
  const result = await evaluateCompleteGuards({
    fromState: 'plan',
    toState: 'develop',
    context: { issueNumber: 1729, body: 'body' },
    runGuards: async (_from, _to, context) => {
      calls.push(['guards', context.workflowPolicy ?? null]);
      return context.workflowPolicy ? final : baseline;
    },
    loadPolicy: async ({ requirementIds }) => {
      calls.push(['policy', requirementIds]);
      return policy;
    },
  });
  assert.deepEqual(calls, [
    ['guards', null],
    ['policy', ['approval.plan']],
    ['guards', policy],
  ]);
  assert.deepEqual(result.guardResult, final);
  assert.equal(result.guardResult.warns, undefined);
  assert.deepEqual(result.guardResult.derived, final.derived);
});

test('a non-applicable exception does not erase an ordinary guard refusal', async () => {
  const calls = [];
  const result = await evaluateCompleteGuards({
    fromState: 'plan',
    toState: 'develop',
    context: { issueNumber: 1729, body },
    runGuards: async (_from, _to, context) => {
      calls.push(context.workflowPolicy ? 'final' : 'baseline');
      return { ok: false, status: 'blocked', refusals: [waiverRefusal], humanDecision: null };
    },
    loadPolicy: async () => ({
      status: 'blocked',
      decisions: [{ id: 'approval.plan', outcome: 'not-applicable' }],
    }),
  });
  assert.deepEqual(calls, ['baseline', 'final']);
  assert.equal(result.guardResult.status, 'blocked');
  assert.deepEqual(result.guardResult.refusals, [waiverRefusal]);
});

test('failed required policy collection is indeterminate and preserves known refusals', async () => {
  let guardCalls = 0;
  const result = await evaluateCompleteGuards({
    fromState: 'plan',
    toState: 'develop',
    context: { issueNumber: 1729, body },
    runGuards: async () => {
      guardCalls += 1;
      return { ok: false, status: 'blocked', refusals: [waiverRefusal], humanDecision: null };
    },
    loadPolicy: async () => ({
      status: 'indeterminate',
      blockers: [{ code: 'policy-authority-unavailable' }],
    }),
  });
  assert.equal(guardCalls, 1, 'no second guard pass may treat failed policy as no waiver');
  assert.equal(result.guardResult.status, 'indeterminate');
  assert.equal(result.guardResult.refusals[0], waiverRefusal);
  assert.equal(result.guardResult.refusals[1].code, 'authority-read-failed');
});

test('malformed complete guard output never passes shared execution', async () => {
  const result = await evaluateCompleteGuards({
    fromState: 'plan',
    toState: 'develop',
    context: { issueNumber: 1729 },
    runGuards: async () => ({ ok: true, refusals: [] }),
  });
  assert.equal(result.guardResult.ok, false);
  assert.equal(result.guardResult.status, 'indeterminate');
  assert.equal(result.guardResult.refusals[0].code, 'guard-result-invalid');
});

test('a completed promotion adapter without an outer effect ledger is indeterminate', async () => {
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    projectDir: '/unused',
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt(),
  });
  assert.equal(decision.status, 'indeterminate');
  assert.ok(decision.blockers.some((blocker) => blocker.code === 'guard-result-invalid'));
});

test('a complete read-only adapter can report ready from one observed body', async () => {
  const calls = [];
  const effects = [];
  try {
    const decision = await evaluateAction({
      actionId: 'promote',
      repository: 'owner/repo',
      issue: 1729,
      inputs: { state: 'plan', head: 'a'.repeat(40), body },
      attempt: bodyAttempt({
        read: async (request) => {
          calls.push(request.resource);
          return { ...request, value: { number: 1729, body } };
        },
      }),
      deps: {
        effectAttempts: () => effects,
        runReadOnlyGuards: async (_from, _to, context) => {
          assert.equal(context.body, body);
          return ready;
        },
      },
    });
    assert.equal(decision.status, 'ready');
    assert.deepEqual(decision.blockers, []);
    assert.deepEqual(calls, ['issue-body']);
    assert.equal(decision.snapshot.observations[0].source, 'issue-body');
  } finally {
    assert.deepEqual(effects, [], 'outer effect ledger is checked independently');
  }
});

test('an adapter without an outer effect ledger cannot claim readiness', async () => {
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt(),
    deps: { runReadOnlyGuards: async () => ready },
  });
  assert.equal(decision.status, 'indeterminate');
  assert.equal(decision.blockers[0].code, 'guard-result-invalid');
});

test('an ineligible action cannot become ready through a supplied target', async () => {
  const decision = await evaluateAction({
    actionId: 'close',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', toState: 'done', head: 'a'.repeat(40), body },
    attempt: bodyAttempt(),
    deps: { effectAttempts: () => [], runReadOnlyGuards: async () => ready },
  });
  assert.equal(decision.status, 'indeterminate');
  assert.equal(decision.blockers[0].code, 'action-not-explain-ready');
});

test('lazy guard reads join the same attempt and memoize one physical read', async () => {
  const calls = [];
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt({
      read: async (request) => {
        calls.push(request.resource);
        return {
          ...request,
          value:
            request.resource === 'issue-body' ? { number: 1729, body } : { state: 'plan', rank: 1 },
        };
      },
    }),
    deps: {
      effectAttempts: () => [],
      runReadOnlyGuards: async (_from, _to, context) => {
        const request = {
          resource: 'project-board',
          identity: 'evidence:1729:3',
          scope: 'sha256:' + 'd'.repeat(64),
        };
        const first = await context.observe(request);
        const second = await context.observe(request);
        assert.strictEqual(first, second);
        return ready;
      },
    },
  });
  assert.equal(decision.status, 'ready');
  assert.deepEqual(calls, ['issue-body', 'project-board']);
  assert.deepEqual(
    decision.snapshot.observations.map(({ source }) => source),
    calls
  );
});

test('waivable explanation observes one body and one policy transport, then replaces guards', async () => {
  const calls = [];
  const effects = [];
  try {
    const decision = await evaluateAction({
      actionId: 'promote',
      repository: 'owner/repo',
      issue: 1729,
      inputs: { state: 'plan', head: 'a'.repeat(40), body },
      attempt: bodyAttempt({
        read: async (request) => {
          calls.push(request.resource);
          if (request.resource === 'issue-body') {
            return { ...request, value: { number: 1729, body } };
          }
          return {
            ...request,
            value: {
              schema: 'aitm.workflow-boundary-policy/v1',
              status: 'policy-compatible',
              repository: 'owner/repo',
              issue: 1729,
              scopeIdentity: computeScopeIdentity({ repository: 'owner/repo', issue: 1729, body }),
              decisions: [{ id: 'approval.plan', outcome: 'waived' }],
            },
          };
        },
      }),
      deps: {
        effectAttempts: () => effects,
        runReadOnlyGuards: async (_from, _to, context) =>
          context.workflowPolicy?.isWaived('approval.plan')
            ? ready
            : { ok: false, status: 'blocked', refusals: [waiverRefusal], humanDecision: null },
      },
    });
    assert.equal(decision.status, 'ready');
    assert.deepEqual(calls, ['issue-body', 'workflow-policy']);
    assert.deepEqual(
      decision.snapshot.observations.map((item) => item.source),
      calls
    );
  } finally {
    assert.deepEqual(effects, []);
  }
});

test('a scope-incompatible policy waiver cannot turn a known refusal ready', async () => {
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt({
      read: async (request) => ({
        ...request,
        value:
          request.resource === 'issue-body'
            ? { number: 1729, body }
            : {
                schema: 'aitm.workflow-boundary-policy/v1',
                status: 'policy-compatible',
                repository: 'owner/repo',
                issue: 1729,
                scopeIdentity: `sha256:${'f'.repeat(64)}`,
                decisions: [{ id: 'approval.plan', outcome: 'waived' }],
              },
      }),
    }),
    deps: {
      effectAttempts: () => [],
      runReadOnlyGuards: async (_from, _to, context) =>
        context.workflowPolicy?.isWaived('approval.plan')
          ? ready
          : {
              ok: false,
              status: 'blocked',
              refusals: [waiverRefusal],
              humanDecision: {
                requests: [
                  {
                    kind: 'plan-approval',
                    actor: 'configured-approver',
                    subject: { issue: 1729, actionId: 'promote' },
                    args: {},
                  },
                ],
              },
            },
    },
  });
  assert.equal(decision.status, 'indeterminate');
  assert.deepEqual(
    decision.blockers.map(({ code }) => code),
    ['plan-approval-missing', 'authority-read-failed']
  );
});

test('failed required policy read retains the known refusal and adds an indeterminate cause', async () => {
  const requests = [
    {
      kind: 'plan-approval',
      actor: 'configured-approver',
      subject: { issue: 1729, actionId: 'promote' },
      args: {},
    },
  ];
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt({
      read: async (request) => {
        if (request.resource === 'workflow-policy') {
          const error = new Error('transport failed');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return { ...request, value: { number: 1729, body } };
      },
    }),
    deps: {
      effectAttempts: () => [],
      runReadOnlyGuards: async () => ({
        ok: false,
        status: 'blocked',
        refusals: [waiverRefusal],
        humanDecision: { requests },
      }),
    },
  });
  assert.equal(decision.status, 'indeterminate');
  assert.deepEqual(
    decision.blockers.map(({ code }) => code),
    ['plan-approval-missing', 'authority-read-failed']
  );
  assert.equal(decision.blockers[1].args.reason, 'timeout');
  assert.deepEqual(decision.humanDecision?.requests, [
    ...requests,
    {
      kind: 'manual-investigation',
      actor: 'human-operator',
      subject: { issue: 1729, actionId: 'promote' },
      args: { guardId: 'authority-collection', code: 'authority-read-failed' },
    },
  ]);
});

test('a throwing shared read-only guard is indeterminate, not a ready result', async () => {
  const effects = [];
  try {
    const decision = await evaluateAction({
      actionId: 'promote',
      repository: 'owner/repo',
      issue: 1729,
      inputs: { state: 'plan', head: 'a'.repeat(40), body },
      attempt: bodyAttempt(),
      deps: {
        effectAttempts: () => effects,
        runReadOnlyGuards: async () => ({
          ok: false,
          status: 'indeterminate',
          refusals: [
            {
              id: 'develop-exit-code-complete',
              guardId: 'develop-exit-code-complete',
              code: 'guard-error',
              args: {},
              noAutomaticRemediation: { reason: 'result-investigation-required' },
            },
          ],
          humanDecision: null,
        }),
      },
    });
    assert.equal(decision.status, 'indeterminate');
    assert.equal(decision.blockers[0].code, 'guard-error');
  } finally {
    assert.deepEqual(effects, []);
  }
});

test('a thrown shared evaluator is a typed guard-error', async () => {
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt(),
    deps: {
      effectAttempts: () => [],
      runReadOnlyGuards: async () => {
        throw new Error('adapter crashed');
      },
    },
  });
  assert.equal(decision.status, 'indeterminate');
  assert.equal(decision.blockers[0].code, 'guard-error');
});

test('a malformed adapter result is separately classified as invalid', async () => {
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt(),
    deps: { effectAttempts: () => [], runReadOnlyGuards: async () => ({ ok: true, refusals: [] }) },
  });
  assert.equal(decision.status, 'indeterminate');
  assert.equal(decision.blockers[0].code, 'guard-result-invalid');
});

test('incompatible issue body fails before any guard is evaluated', async () => {
  let guards = 0;
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt({
      read: async (request) => ({
        ...request,
        value: { number: 1729, body: body.replace('Do work', 'Different work') },
      }),
    }),
    deps: {
      runReadOnlyGuards: async () => {
        guards += 1;
        return ready;
      },
    },
  });
  assert.equal(guards, 0);
  assert.equal(decision.status, 'indeterminate');
  assert.equal(decision.blockers[0].code, 'authority-read-failed');
});

test('missing required body source is an authority failure, not a skipped success', async () => {
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt({ read: async () => undefined }),
    deps: {
      runReadOnlyGuards: async () => {
        throw new Error('must not run');
      },
    },
  });
  assert.equal(decision.status, 'indeterminate');
  assert.deepEqual(
    decision.blockers.map(({ code }) => code),
    ['authority-read-failed']
  );
});

test('known blocked refusal, warning and human request remain complete', async () => {
  const blocker = {
    id: 'develop-exit-code-complete',
    guardId: 'develop-exit-code-complete',
    code: 'unclassified-refusal',
    args: {},
    noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
    reason: 'not complete',
  };
  const request = {
    kind: 'manual-investigation',
    actor: 'human-operator',
    subject: { issue: 1729, actionId: 'promote' },
    args: { guardId: blocker.guardId, code: blocker.code },
  };
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt(),
    deps: {
      effectAttempts: () => [],
      runReadOnlyGuards: async () => ({
        ok: false,
        status: 'blocked',
        refusals: [blocker],
        warns: [{ id: blocker.id, code: 'legacy-guard-warning', args: { guardId: blocker.id } }],
        humanDecision: { requests: [request] },
      }),
    },
  });
  assert.equal(decision.status, 'blocked');
  assert.deepEqual(
    decision.blockers.map(({ code }) => code),
    ['unclassified-refusal']
  );
  assert.deepEqual(decision.warnings, [
    { code: 'legacy-guard-warning', args: { guardId: blocker.id } },
  ]);
  assert.deepEqual(decision.humanDecision, { requests: [request] });
});

test('the complete result retains normalization intent and hashes its inputs', async () => {
  const normalizerId = 'functional-dod-derived/v1';
  const decisions = [{ key: 'acs', derivationRule: 'derive-acs/v1', stamp: true, tick: true }];
  const normalization = {
    normalizerId,
    inputDigest: 'sha256:' + 'b'.repeat(64),
    decisions,
    decisionDigest: `sha256:${createHash('sha256').update(canonicalRecordJson({ normalizerId, decisions })).digest('hex')}`,
    disposition: 'persist-on-execute',
  };
  const decision = await evaluateAction({
    actionId: 'promote',
    repository: 'owner/repo',
    issue: 1729,
    inputs: { state: 'plan', head: 'a'.repeat(40), body },
    attempt: bodyAttempt(),
    deps: {
      effectAttempts: () => [],
      runReadOnlyGuards: async () => ({ ...ready, normalizations: [normalization] }),
    },
  });
  assert.deepEqual(decision.normalizations, [normalization]);
});

test('an attempted effect stays visible outside guard conversion and forbids readiness', async () => {
  const effects = [];
  try {
    const decision = await evaluateAction({
      actionId: 'promote',
      repository: 'owner/repo',
      issue: 1729,
      inputs: { state: 'plan', head: 'a'.repeat(40), body },
      attempt: bodyAttempt(),
      deps: {
        runReadOnlyGuards: async () => {
          effects.push({ guardId: 'develop-exit-code-complete', operation: 'network:fetch' });
          return ready;
        },
        effectAttempts: () => effects,
      },
    });
    assert.equal(decision.status, 'indeterminate');
    assert.equal(decision.blockers[0].code, 'guard-effect-forbidden');
  } finally {
    assert.deepEqual(
      effects.map(({ operation }) => operation),
      ['network:fetch']
    );
    assert.throws(() => assert.deepEqual(effects, []), 'outer no-effect assertion must fail');
  }
});

test('exact remote tip needs a complete non-shallow local graph without fetch', async () => {
  const tip = 'b'.repeat(40);
  const calls = [];
  const effects = [];
  try {
    const result = await readExactTrunkTip({
      remote: 'origin',
      ref: 'refs/heads/trunk',
      execGit: async (args) => {
        calls.push(args);
        if (args[0] === 'ls-remote') return `${tip}\trefs/heads/trunk\n`;
        if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') return 'false\n';
        if (args[0] === 'cat-file') return '';
        if (args[0] === 'rev-list') return `${tip}\n`;
        throw new Error('unexpected git command');
      },
    });
    assert.deepEqual(result, {
      status: 'observed',
      remote: 'origin',
      ref: 'refs/heads/trunk',
      sha: tip,
      objectComplete: true,
      shallow: false,
    });
    assert.deepEqual(
      calls.map(([command]) => command),
      ['ls-remote', 'rev-parse', 'cat-file', 'rev-list']
    );
    assert.ok(!calls.some((args) => args.includes('fetch')));
  } finally {
    assert.deepEqual(effects, []);
  }
});

test('missing or shallow remote-tip history is attribution-unavailable', async () => {
  const tip = 'b'.repeat(40);
  const base = async (args) => {
    if (args[0] === 'ls-remote') return `${tip}\trefs/heads/trunk\n`;
    if (args[0] === 'rev-parse') return 'false\n';
    if (args[0] === 'cat-file') return '';
    if (args[0] === 'rev-list') throw new Error('missing object');
    throw new Error('unexpected git command');
  };
  const missing = await readExactTrunkTip({
    remote: 'origin',
    ref: 'refs/heads/trunk',
    execGit: base,
  });
  assert.equal(missing.status, 'indeterminate');
  assert.equal(missing.code, 'attribution-authority-unavailable');
  const shallow = await readExactTrunkTip({
    remote: 'origin',
    ref: 'refs/heads/trunk',
    execGit: async (args) => (args[0] === 'rev-parse' ? 'true\n' : base(args)),
  });
  assert.equal(shallow.status, 'indeterminate');
  assert.equal(shallow.code, 'attribution-authority-unavailable');
});

test('exact tip is admitted only as a pinned delivery observation', async () => {
  const tip = 'b'.repeat(40);
  const scope = 'sha256:' + 'c'.repeat(64);
  const attempt = createObservationAttempt({
    repository: 'owner/repo',
    issue: 1729,
    boundaryId: 'attribution:1729',
    now: () => '2026-09-21T10:00:00.000Z',
    read: async (request) => ({
      ...request,
      value: {
        status: 'observed',
        remote: 'origin',
        ref: 'refs/heads/trunk',
        sha: tip,
        objectComplete: true,
        shallow: false,
      },
    }),
  });
  const result = await observeExactTrunkAttribution({
    attempt,
    issue: 1729,
    scope,
    remote: 'origin',
    ref: 'refs/heads/trunk',
  });
  assert.equal(result.status, 'observed');
  assert.equal(result.value.sha, tip);
  const bundle = attempt.finish();
  assert.equal(bundle.observations[0].resource, 'delivery');
  assert.equal(bundle.observations[0].value.objectComplete, true);
});

test('complete exact remote tip scopes the existing attribution predicate to its SHA', async () => {
  const tip = 'b'.repeat(40);
  const calls = [];
  const cwd = '/repo-under-test';
  const result = await evaluateExactTrunkAttribution({
    issue: 1729,
    cwd,
    remote: 'origin',
    ref: 'refs/heads/trunk',
    execGit: async (args, options) => {
      assert.equal(options.cwd, cwd);
      if (args[0] === 'ls-remote') return `${tip}\trefs/heads/trunk\n`;
      if (args[0] === 'rev-parse') return 'false\n';
      if (args[0] === 'cat-file') return '';
      if (args[0] === 'rev-list') return `${tip}\n`;
      throw new Error('unexpected git command');
    },
    hasAttributingCommit: async (issue, options) => {
      calls.push({ issue, refs: options.refs, cwd: options.cwd });
      return true;
    },
  });
  assert.deepEqual(calls, [{ issue: 1729, refs: [tip], cwd }]);
  assert.equal(result.status, 'attributed');
  assert.equal(result.tip.sha, tip);
});

test('incomplete exact remote history never invokes attribution', async () => {
  let calls = 0;
  const result = await evaluateExactTrunkAttribution({
    issue: 1729,
    cwd: '/repo-under-test',
    remote: 'origin',
    ref: 'refs/heads/trunk',
    execGit: async (args) => {
      if (args[0] === 'ls-remote') return `${'b'.repeat(40)}\trefs/heads/trunk\n`;
      if (args[0] === 'rev-parse') return 'true\n';
      throw new Error('unexpected git command');
    },
    hasAttributingCommit: async () => {
      calls += 1;
      return true;
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.code, 'attribution-authority-unavailable');
});

test('configured local trunk ref retains explicit local provenance and scopes attribution', async () => {
  const sha = 'd'.repeat(40);
  const cwd = '/repo-under-test';
  const calls = [];
  const result = await evaluateExactTrunkAttribution({
    issue: 1729,
    cwd,
    localRef: 'refs/heads/trunk',
    execGit: async (args, options) => {
      assert.equal(options.cwd, cwd);
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') return 'false\n';
      if (args[0] === 'rev-parse') return `${sha}\n`;
      if (args[0] === 'cat-file') return '';
      if (args[0] === 'rev-list') return `${sha}\n`;
      throw new Error('unexpected git command');
    },
    hasAttributingCommit: async (_issue, options) => {
      assert.deepEqual(options, { cwd, refs: [sha] });
      return true;
    },
  });
  assert.equal(result.status, 'attributed');
  assert.deepEqual(result.tip, {
    status: 'observed',
    authority: 'local',
    ref: 'refs/heads/trunk',
    sha,
    objectComplete: true,
    shallow: false,
  });
  assert.equal(
    calls.some((args) => args[0] === 'ls-remote'),
    false
  );
});

test('bare local trunk fallback resolves only the qualified local branch', async () => {
  const sha = 'e'.repeat(40);
  const calls = [];
  const result = await evaluateExactTrunkAttribution({
    issue: 1729,
    cwd: '/repo-under-test',
    localRef: 'trunk',
    execGit: async (args) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--verify') return `${sha}\n`;
      if (args[0] === 'rev-parse') return 'false\n';
      if (args[0] === 'cat-file') return '';
      if (args[0] === 'rev-list') return `${sha}\n`;
      throw new Error('unexpected git command');
    },
    hasAttributingCommit: async () => true,
  });
  assert.equal(result.status, 'attributed');
  assert.equal(result.tip.authority, 'local');
  assert.equal(result.tip.ref, 'refs/heads/trunk');
  assert.deepEqual(calls[0], ['rev-parse', '--verify', 'refs/heads/trunk^{commit}']);
  assert.equal(
    calls.some((args) => args[0] === 'ls-remote'),
    false
  );
});
