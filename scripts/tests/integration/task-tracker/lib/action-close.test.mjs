// @story #1669
// @story #1802
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveActionNavigation } from '../../../../task-tracker/lib/action-decision/navigation.mjs';
import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import * as closeReadiness from '../../../../task-tracker/lib/action-decision/close.mjs';
import { upsertUnauthorizedCloseRecovery } from '../../../../task-tracker/lib/closed-issue-convergence.mjs';
import { assertCloseDeliveryAuthorityStable } from '../../../../task-tracker/verbs/close.mjs';

const ISSUE = 1669;
const HEAD = 'a'.repeat(40);
const BODY =
  '## User Story\nClose safely\n\n## Scope\nRead-only close\n\n## Acceptance Criteria\n- [x] Close safely\n\n<!-- aitm-last-known-state state="review" ts="2026-09-21T00:00:00Z" -->';
const REPO = 'example/project';
const now = () => '2026-09-21T00:00:00.000Z';

test('production child reader retains complete paginated child identity and refuses malformed pages', async () => {
  assert.equal(typeof closeReadiness.createCloseReadOnlyPorts, 'function');
  const calls = [];
  const ports = closeReadiness.createCloseReadOnlyPorts({
    issue: ISSUE,
    cfg: { repo: REPO },
    projectDir: process.cwd(),
    deps: {
      run: async (command, args) => {
        calls.push([command, args]);
        return {
          stdout: JSON.stringify([
            [{ number: 1701, state: 'closed', state_reason: 'completed', body: '' }],
            [{ number: 1702, state: 'closed', state_reason: 'not_planned', body: '' }],
          ]),
        };
      },
      fetchBoard: async () => ({ state: 'done' }),
    },
  });
  const result = await ports.readChildren({ issue: ISSUE });
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.children.map(({ number }) => number),
    [1701, 1702]
  );
  assert.equal(result.children[1].closeReason, 'not_planned');
  assert.ok(calls[0][1].includes('--paginate'));
  const malformed = closeReadiness.createCloseReadOnlyPorts({
    issue: ISSUE,
    cfg: { repo: REPO },
    projectDir: process.cwd(),
    deps: { run: async () => ({ stdout: '{}' }) },
  });
  await assert.rejects(malformed.readChildren({ issue: ISSUE }), /children/);
});

test('production worktree reader compares binding identity and observes dirty paths without writing', async () => {
  assert.equal(typeof closeReadiness.createCloseReadOnlyPorts, 'function');
  const calls = [];
  const ports = closeReadiness.createCloseReadOnlyPorts({
    issue: ISSUE,
    cfg: { repo: REPO },
    projectDir: process.cwd(),
    deps: {
      resolveBoundDir: () => process.cwd(),
      worktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      run: async (command, args) => {
        calls.push([command, args]);
        return { stdout: args[0] === 'rev-parse' ? HEAD : ' M edited.mjs\n' };
      },
    },
  });
  const result = await ports.readWorktree();
  assert.equal(result.matches, true);
  assert.equal(result.headSha, HEAD);
  assert.deepEqual(result.dirtyPaths, ['edited.mjs']);
  assert.ok(
    calls.every(([command, args]) => command === 'git' && ['rev-parse', 'status'].includes(args[0]))
  );
});

test('production delivery reader uses canonical parent lineage and current receipt evidence', async () => {
  const data = Buffer.from(JSON.stringify({ stage: 'test', commitSha: HEAD })).toString(
    'base64url'
  );
  const body = `${BODY}\n- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->\n<!-- aitm-verification-receipt stage="test" data="${data}" -->`;
  const calls = [];
  const ports = closeReadiness.createCloseReadOnlyPorts({
    issue: ISSUE,
    cfg: { repo: REPO, trunkRef: 'origin/trunk' },
    projectDir: process.cwd(),
    deps: {
      readGraph: async () => ({
        parent: 1558,
        children: [],
        parentAuthoritativeBranch: 'feature/epic/1558',
      }),
      run: async (command, args) => {
        calls.push([command, args]);
        if (command === 'git' && args[0] === 'branch') return { stdout: 'feature/child/1669' };
        if (command === 'git' && args[0] === 'rev-parse') return { stdout: HEAD };
        if (command === 'git' && args[0] === 'ls-remote')
          return { stdout: `${HEAD}\trefs/heads/feature/epic/1558\n` };
        if (command === 'gh' && args[0] === 'pr') return { stdout: '[]' };
        throw new Error(`unexpected ${command} ${args.join(' ')}`);
      },
    },
  });
  assert.equal(typeof ports.readDelivery, 'function');
  const delivery = await ports.readDelivery({ body });
  assert.equal(delivery.gateInput.lineage.deliveryTarget, 'feature/epic/1558');
  assert.equal(delivery.gateInput.acceptedSha, HEAD);
  assert.ok(calls.every(([command, args]) => !(command === 'git' && args[0] === 'fetch')));
  assert.ok(
    calls.every(
      ([command, args]) => !(command === 'git' && args[0] === 'rev-parse' && args[1] === '--verify')
    ),
    'an explicit trunkRef must win without a default probe'
  );
});

test('production delivery reader resolves empty or omitted trunkRef for an attributed epic child', async () => {
  const data = Buffer.from(JSON.stringify({ stage: 'test', commitSha: HEAD })).toString(
    'base64url'
  );
  const body = `${BODY}\n- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->\n<!-- aitm-verification-receipt stage="test" data="${data}" -->`;
  for (const cfg of [{ repo: REPO }, { repo: REPO, trunkRef: '' }]) {
    const calls = [];
    const ports = closeReadiness.createCloseReadOnlyPorts({
      issue: ISSUE,
      cfg,
      projectDir: process.cwd(),
      deps: {
        readGraph: async () => ({
          parent: 1558,
          children: [],
          parentAuthoritativeBranch: 'feature/epic/1558',
        }),
        run: async (command, args) => {
          calls.push([command, args]);
          if (command === 'git' && args[0] === 'rev-parse') return { stdout: HEAD };
          if (command === 'git' && args[0] === 'branch') return { stdout: 'feature/child/1669' };
          if (command === 'git' && args[0] === 'ls-remote')
            return { stdout: `${HEAD}\trefs/heads/feature/epic/1558\n` };
          if (command === 'gh' && args[0] === 'pr') return { stdout: '[]' };
          throw new Error(`unexpected ${command} ${args.join(' ')}`);
        },
      },
    });
    const delivery = await ports.readDelivery({ body });
    assert.equal(delivery.gateInput.lineage.deliveryTarget, 'feature/epic/1558');
    assert.equal(delivery.gateInput.acceptedSha, HEAD);
    assert.ok(calls.every(([command, args]) => command !== 'git' || args[0] !== 'fetch'));
    assert.ok(
      calls.some(
        ([command, args]) => command === 'git' && args.includes('refs/remotes/origin/trunk')
      ),
      'the shared resolver must probe the default remote ref'
    );
  }
});

test('production delivery reader follows the shared local and configured-remote fallback authority', async () => {
  const data = Buffer.from(JSON.stringify({ stage: 'test', commitSha: HEAD })).toString(
    'base64url'
  );
  const body = `${BODY}\n- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->\n<!-- aitm-verification-receipt stage="test" data="${data}" -->`;
  for (const { cfg, remote, local } of [
    { cfg: { repo: REPO }, remote: null, local: true },
    { cfg: { repo: REPO, trunkRemote: 'upstream' }, remote: 'upstream', local: false },
  ]) {
    const calls = [];
    const ports = closeReadiness.createCloseReadOnlyPorts({
      issue: ISSUE,
      cfg,
      projectDir: process.cwd(),
      deps: {
        readGraph: async () => ({
          parent: 1558,
          children: [],
          parentAuthoritativeBranch: 'feature/epic/1558',
        }),
        run: async (command, args) => {
          calls.push([command, args]);
          if (
            command === 'git' &&
            args[0] === 'rev-parse' &&
            args.includes('refs/remotes/upstream/trunk')
          )
            return { stdout: HEAD };
          if (command === 'git' && args[0] === 'rev-parse' && args.includes('refs/heads/trunk'))
            return { stdout: HEAD };
          if (command === 'git' && args[0] === 'rev-parse' && args.includes('--verify'))
            throw new Error('ref absent');
          if (command === 'git' && args[0] === 'rev-parse') return { stdout: HEAD };
          if (command === 'git' && args[0] === 'branch') return { stdout: 'feature/child/1669' };
          if (command === 'git' && args[0] === 'ls-remote')
            return { stdout: `${HEAD}\trefs/heads/feature/epic/1558\n` };
          if (command === 'gh' && args[0] === 'pr') return { stdout: '[]' };
          throw new Error(`unexpected ${command} ${args.join(' ')}`);
        },
      },
    });
    const delivery = await ports.readDelivery({ body });
    assert.deepEqual(delivery.authority, local ? { localRef: 'feature/epic/1558' } : { remote });
    assert.equal(delivery.gateInput.lineage.deliveryTarget, 'feature/epic/1558');
    assert.equal(delivery.gateInput.acceptedSha, HEAD);
    assert.equal(
      calls.filter(([command, args]) => command === 'git' && args[0] === 'ls-remote').length,
      local ? 0 : 1
    );
    if (remote)
      assert.ok(
        calls.some(
          ([command, args]) => command === 'git' && args[0] === 'ls-remote' && args[1] === remote
        )
      );
  }
});

test('production delivery rejects evidence-v2 without invoking its mutating close runner', async () => {
  const ports = closeReadiness.createCloseReadOnlyPorts({
    issue: ISSUE,
    cfg: { repo: REPO },
    projectDir: process.cwd(),
    deps: {
      run: async () => {
        throw new Error('unexpected external call');
      },
    },
  });
  assert.equal(typeof ports.readDelivery, 'function');
  await assert.rejects(
    ports.readDelivery({ body: `${BODY}\n<!-- aitm-evidence-v2 data="unavailable" -->` }),
    /evidence-v2-read-only-cycle-unavailable/
  );
});

test('production guard adapter reads dependencies and refuses missing local commit objects', async () => {
  const ports = closeReadiness.createCloseReadOnlyPorts({
    issue: ISSUE,
    cfg: { repo: REPO, projectId: 'P' },
    projectDir: process.cwd(),
    deps: {
      run: async (command, args) => {
        if (command === 'gh' && args[0] === 'api')
          return {
            stdout: JSON.stringify([
              [
                {
                  id: 1,
                  body: `### 🔗 Commits\n<!-- aitm-commits: ${HEAD} -->`,
                  created_at: now(),
                },
              ],
            ]),
          };
        if (command === 'gh' && args[0] === 'issue')
          return {
            stdout: JSON.stringify({
              blockedBy: { nodes: [], totalCount: 0 },
              blocking: { nodes: [], totalCount: 0 },
            }),
          };
        if (command === 'git' && args[0] === 'cat-file') throw new Error('missing local object');
        if (command === 'git' && args[0] === 'status') return { stdout: '' };
        throw new Error(`unexpected ${command} ${args.join(' ')}`);
      },
    },
  });
  assert.equal(typeof ports.readGuardAuthority, 'function');
  await assert.rejects(ports.readGuardAuthority(), /missing local object/);
});

async function productionCloseFixture({
  issueState = 'OPEN',
  bodyOnRead,
  revisionOnRead,
  policyGuard = false,
  child = false,
  parentAvailable = true,
  attributed = true,
  trunkRef = 'origin/trunk',
} = {}) {
  const data = Buffer.from(JSON.stringify({ stage: 'test', commitSha: HEAD })).toString(
    'base64url'
  );
  const body = [
    BODY,
    ...['backlog', 'refine', 'plan', 'develop', 'test', 'review'].map(
      (stage, index) => `<!-- aitm-entered-${stage}: 2026-06-07T0${index}:00:00Z -->`
    ),
    `<!-- aitm-dod-verified: ${HEAD}:2026-06-07T07:00:00Z -->`,
    '<!-- aitm-review-approved: 2026-06-07T08:00:00Z -->',
    '- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->',
    `<!-- aitm-verification-receipt stage="test" data="${data}" -->`,
  ].join('\n');
  const commands = [];
  let issueReads = 0;
  const result = await closeReadiness.evaluateCloseReadiness({
    issue: ISSUE,
    cfg: {
      repo: REPO,
      projectId: 'P',
      trunkRef,
      lifecycleCheckboxesRequired: false,
      fullAutoMerge: { mechanism: 'local-trunk-lane', operatorAuthorized: true },
    },
    projectDir: process.cwd(),
    now,
    deps: {
      ...(policyGuard
        ? {
            workflowPolicyRuntime: { listRecords: async () => [] },
            runReadOnlyGuards: async (_from, _to, context) =>
              context.workflowPolicy
                ? { ok: true, status: 'ready', refusals: [], humanDecision: null, warns: [] }
                : {
                    ok: false,
                    status: 'blocked',
                    refusals: [
                      { id: 'body-gates-entry-done', code: 'unclassified-refusal', args: {} },
                    ],
                    humanDecision: null,
                    warns: [],
                  },
          }
        : {}),
      resolveBoundDir: () => process.cwd(),
      worktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      fetchBoard: async () => ({ state: 'review' }),
      run: async (command, args) => {
        commands.push([command, args]);
        if (command === 'gh' && args[0] === 'issue' && !args.includes('blockedBy,blocking'))
          issueReads += 1;
        if (command === 'gh' && args[0] === 'issue')
          return {
            stdout: args.includes('blockedBy,blocking')
              ? JSON.stringify({
                  blockedBy: { nodes: [], totalCount: 0 },
                  blocking: { nodes: [], totalCount: 0 },
                })
              : args.includes('body')
                ? body
                : JSON.stringify({
                    number: ISSUE,
                    body: bodyOnRead?.(issueReads, body) ?? body,
                    state: issueState,
                    stateReason: issueState === 'CLOSED' ? 'COMPLETED' : null,
                    updatedAt: revisionOnRead?.(issueReads) ?? now(),
                  }),
          };
        if (command === 'gh' && args[0] === 'pr') return { stdout: '[]' };
        if (command === 'gh' && args.includes('graphql'))
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  issue: { number: ISSUE, body, parent: child ? { number: 1558, body: '' } : null },
                },
              },
            }),
          };
        if (command === 'gh' && args[0] === 'api') return { stdout: '[[]]' };
        if (command === 'git' && args[0] === 'rev-parse')
          return { stdout: args.includes('--is-shallow-repository') ? 'false' : HEAD };
        if (command === 'git' && args[0] === 'branch') return { stdout: 'trunk' };
        if (command === 'git' && args[0] === 'status') return { stdout: '' };
        if (command === 'git' && args[0] === 'cat-file') return { stdout: '' };
        if (command === 'git' && args[0] === 'rev-list') return { stdout: HEAD };
        if (command === 'git' && args[0] === 'ls-remote')
          return {
            stdout: child
              ? parentAvailable
                ? `${HEAD}\trefs/heads/feature/epic/1558\n`
                : ''
              : `${HEAD}\trefs/heads/trunk\n`,
          };
        if (command === 'git' && args[0] === 'log')
          return {
            stdout: attributed ? `${HEAD}\t[#1669] Close readiness\t2026-09-21T00:00:00Z\n` : '',
          };
        throw new Error(`unexpected ${command} ${args.join(' ')}`);
      },
    },
  });
  return { result, commands };
}

test('production close reaches ready with fresh authority and only read transports', async () => {
  const { result, commands } = await productionCloseFixture();
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.ok(result.bundle.observations.some(({ identity }) => identity === 'evidence:1669:4'));
  assert.ok(
    commands.every(([command, args]) =>
      command === 'git'
        ? !['fetch', 'update-ref', 'checkout'].includes(args[0])
        : ['view', 'list'].includes(args[1]) || args[0] === 'api'
    )
  );
});

test('production child close resolves an omitted trunkRef and keeps parent attribution blockers', async () => {
  for (const { parentAvailable, attributed, status } of [
    { parentAvailable: true, attributed: true, status: 'ready' },
    { parentAvailable: false, attributed: true, status: 'indeterminate' },
    { parentAvailable: true, attributed: false, status: 'blocked' },
  ]) {
    const { result } = await productionCloseFixture({
      child: true,
      parentAvailable,
      attributed,
      trunkRef: '',
    });
    assert.equal(result.status, status, JSON.stringify(result));
    if (status !== 'ready') {
      assert.ok(result.blockers.length > 0);
      assert.ok(
        result.blockers.every(
          ({ code, guardId }) => typeof code === 'string' && typeof guardId === 'string'
        )
      );
    }
  }
});

test('production child close projects the same gate outcome with explicit and default trunk refs', async () => {
  for (const { parentAvailable, attributed } of [
    { parentAvailable: true, attributed: true },
    { parentAvailable: false, attributed: true },
    { parentAvailable: true, attributed: false },
  ]) {
    const options = { child: true, parentAvailable, attributed };
    const configured = (await productionCloseFixture({ ...options, trunkRef: 'origin/trunk' })).result;
    const omitted = (await productionCloseFixture({ ...options, trunkRef: '' })).result;
    assert.equal(omitted.status, configured.status);
    assert.deepEqual(
      omitted.blockers.map(({ code, guardId }) => ({ code, guardId })),
      configured.blockers.map(({ code, guardId }) => ({ code, guardId }))
    );
  }
});

test('production close collector and terminal authority guard refuse changed delivery after ready', async () => {
  const ready = await productionCloseFixture();
  assert.equal(ready.result.status, 'ready', JSON.stringify(ready.result));
  const gate = () => ({
    authorization: { mode: 'full-auto', approvedSha: HEAD },
    gateInput: {
      acceptedSha: HEAD,
      reviewAuthority: { outcome: 'passed', acceptedSha: HEAD },
      observedLocalHeadSha: HEAD,
      pullRequests: [{ number: 70, headRefOid: HEAD, state: 'MERGED' }],
      records: { liveIntent: { record: { intentId: 'intent-1', expectedHeadSha: HEAD } } },
    },
    receipt: { mode: 'pr', receipt: { intentId: 'intent-1', expectedHeadSha: HEAD } },
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    recoveryReviewApprovedSha: HEAD,
  });
  const before = gate();
  const changed = gate();
  changed.gateInput.pullRequests[0].headRefOid = 'b'.repeat(40);
  assert.doesNotThrow(() => assertCloseDeliveryAuthorityStable(before, before));
  assert.throws(() => assertCloseDeliveryAuthorityStable(before, changed), /close-authority-drift/);
});

test('production close observes workflow policy when a guard requires enrichment', async () => {
  const { result } = await productionCloseFixture({ policyGuard: true });
  assert.equal(result.status, 'ready', JSON.stringify(result));
  const policyObservation = result.bundle.observations.find(
    ({ resource }) => resource === 'workflow-policy'
  );
  assert.ok(policyObservation);
  assert.match(policyObservation.identity, /^evidence:1669:\d+$/);
});

test('production close cannot select ordinary completion for a CLOSED GitHub issue in Review', async () => {
  const { result } = await productionCloseFixture({ issueState: 'CLOSED' });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'state-unavailable'));
});

test('production close refuses issue-body changes even when semantic scope is unchanged', async () => {
  const { result } = await productionCloseFixture({
    bodyOnRead: (read, body) => (read > 1 ? `${body}\n<!-- changed approval authority -->` : body),
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(
    result.bundle.observations.some(
      ({ provenance }) => provenance?.detail === 'close-readiness:issue-authority-drift'
    )
  );
});

test('production close refuses a changed issue revision with byte-identical body', async () => {
  const { result } = await productionCloseFixture({
    revisionOnRead: (read) => (read > 1 ? '2026-09-21T00:00:01.000Z' : now()),
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(
    result.bundle.observations.some(
      ({ provenance }) => provenance?.detail === 'close-readiness:issue-authority-drift'
    )
  );
});

test('production close cannot bypass pending recovery on an OPEN issue in Review', async () => {
  const { result } = await productionCloseFixture({
    bodyOnRead: (_read, body) =>
      upsertUnauthorizedCloseRecovery(body, {
        tx: 'close-recovery-1669',
        phase: 'review',
        stateReason: 'completed',
        actor: 'operator',
        ts: now(),
        unticked: [],
      }),
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'state-unavailable'));
});

test('production close retains immutable initial and current issue revisions', async () => {
  const { result } = await productionCloseFixture();
  const sources = result.bundle.observations.filter(({ resource }) => resource === 'issue-body');
  assert.equal(sources.length, 2);
  assert.deepEqual(
    sources.map(({ identity }) => identity),
    ['issue:1669:0', 'issue:1669:1']
  );
  for (const source of sources) {
    assert.equal(source.value.state, 'OPEN');
    assert.equal(source.revision, now());
    assert.ok(Object.isFrozen(source.value));
  }
});

function closeFixture({ values = {}, guards, unreadable } = {}) {
  const effects = [];
  const scope = computeScopeIdentity({ repository: REPO, issue: ISSUE, body: BODY });
  const authority = {
    'issue-body': { number: ISSUE, body: BODY, state: 'OPEN' },
    'project-board': { state: 'review' },
    worktree: { matches: true, headSha: HEAD },
    'evidence:1669:1': {
      mode: 'ordinary',
      gateInput: {
        issueNumber: ISSUE,
        repository: REPO,
        body: BODY,
        branch: 'feature/1669',
        acceptedSha: HEAD,
        lineage: { parentIssueNumber: 1558, deliveryTarget: 'feature/epic/1558' },
      },
    },
    'evidence:1669:2': {
      status: 'attributed',
      tip: {
        status: 'observed',
        remote: 'origin',
        ref: 'refs/heads/feature/epic/1558',
        sha: HEAD,
        objectComplete: true,
        shallow: false,
      },
    },
    'evidence:1669:3': { complete: true, children: [] },
    ...values,
  };
  const attempt = createObservationAttempt({
    repository: REPO,
    issue: ISSUE,
    boundaryId: 'close-test',
    now,
    read: async (request) => {
      if (request.resource === unreadable || request.identity === unreadable)
        throw new Error('unavailable');
      return { ...request, value: authority[request.identity] ?? authority[request.resource] };
    },
  });
  const ports = {
    scope,
    cfg: { repo: REPO },
    head: HEAD,
    evaluatedAt: now(),
    runGuards:
      guards ?? (async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null })),
  };
  return {
    effects,
    attempt,
    ports,
    evaluate: () =>
      evaluateAction({
        actionId: 'close',
        repository: REPO,
        issue: ISSUE,
        inputs: { state: 'review', body: BODY, head: HEAD },
        attempt,
        deps: { closePorts: ports, effectAttempts: () => effects },
      }),
  };
}

test('ordinary close collects current authority without effects', async () => {
  const fixture = closeFixture();
  const result = await fixture.evaluate();
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.equal(result.actionId, 'close');
  assert.equal(result.snapshot.observations.length, 6);
  assert.deepEqual(fixture.effects, []);
});

test('close fails closed on missing objects and retains independent guard blockers', async () => {
  const fixture = closeFixture({
    values: { 'evidence:1669:2': { status: 'indeterminate' } },
    guards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [
        {
          id: 'review-exit-close-gates',
          code: 'unclassified-refusal',
          args: {},
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        },
      ],
      humanDecision: null,
    }),
  });
  const result = await fixture.evaluate();
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'attribution-authority-unavailable'));
  assert.ok(result.blockers.some(({ code }) => code === 'unclassified-refusal'));
  assert.deepEqual(fixture.effects, []);
});

test('close cannot convert a missing receipt or child read into readiness', async () => {
  for (const unreadable of ['evidence:1669:1', 'evidence:1669:3']) {
    const result = await closeFixture({ unreadable }).evaluate();
    assert.equal(result.status, 'indeterminate');
    assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
  }
});

test('production close adapter fails closed without read-only delivery and guard seams', async () => {
  assert.equal(typeof closeReadiness.evaluateCloseReadiness, 'function');
  const result = await closeReadiness.evaluateCloseReadiness({
    issue: ISSUE,
    cfg: { repo: REPO },
    projectDir: process.cwd(),
    now,
    deps: {
      run: async () => {
        throw new Error('reader unavailable');
      },
      readBody: async () => BODY,
      readHead: async () => HEAD,
      fetchBoard: async () => ({ state: 'review' }),
      readWorktree: async () => ({ matches: true, headSha: HEAD }),
    },
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
});

test('production guards pin both child and epic delivery proofs to the verified immutable tip', async () => {
  const approved = [
    '## Scope',
    ...['backlog', 'refine', 'plan', 'develop', 'test', 'review'].map(
      (stage, index) => `<!-- aitm-entered-${stage}: 2026-06-07T0${index}:00:00Z -->`
    ),
    `<!-- aitm-dod-verified: ${HEAD}:2026-06-07T07:00:00Z -->`,
    '<!-- aitm-review-approved: 2026-06-07T08:00:00Z -->',
  ].join('\n');
  for (const epic of [false, true]) {
    const commands = [];
    const cfg = { repo: REPO, projectId: 'P', lifecycleCheckboxesRequired: false };
    const ports = closeReadiness.createCloseReadOnlyPorts({
      issue: ISSUE,
      cfg,
      projectDir: process.cwd(),
      deps: {
        run: async (command, args) => {
          commands.push([command, args]);
          if (command === 'git' && args[0] === 'log' && args.includes(HEAD))
            return {
              stdout: `${HEAD}\x1f[#1701] Delivered\x1fAuthor\x1f2026-09-21T00:00:00Z\x1f\n`,
            };
          throw new Error(`unexpected ${command} ${args.join(' ')}`);
        },
      },
    });
    const result = await ports.runReadOnlyGuards(
      'review',
      'done',
      {
        issueNumber: ISSUE,
        cfg,
        body: approved + (epic ? '\n<!-- aitm-issue-kind: epic -->' : ''),
        toState: 'done',
        headSha: HEAD,
        children: epic
          ? [
              {
                number: 1701,
                state: 'done',
                boardState: 'done',
                issueState: 'closed',
                closeReason: 'completed',
              },
            ]
          : [],
        delivery: {
          gateInput: {
            issueNumber: ISSUE,
            lineage: {
              parentIssueNumber: epic ? null : 1558,
              deliveryTarget: 'trunk',
              localTrunkLaneAuthorized: true,
            },
            branch: 'trunk',
            pullRequests: [],
          },
          graph: [
            [
              ISSUE,
              {
                parent: epic ? null : 1558,
                children: [],
                parentAuthoritativeBranch: 'feature/epic/1558',
              },
            ],
          ],
        },
        attribution: { status: 'attributed', tip: { sha: HEAD } },
      },
      {
        comments: [{ body: `### 🔗 Commits\n<!-- aitm-commits: ${HEAD} -->` }],
        files: { [HEAD]: [] },
        dirty: [],
        parentState: 'review',
        dependency: { status: 'ready', blockedBy: [], unfinished: [], states: [] },
      }
    );
    assert.equal(result.status, 'ready', JSON.stringify(result));
    assert.ok(
      commands.every(
        ([command, args]) => command === 'git' && args[0] === 'log' && args.includes(HEAD)
      )
    );
  }
});

test('collector preserves all seven fields on read failure and does not execute effects', async () => {
  const fixture = closeFixture({ unreadable: 'issue-body' });
  const result = await closeReadiness.collectCloseReadiness({
    issue: ISSUE,
    attempt: fixture.attempt,
    ports: fixture.ports,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'blockers',
    'humanDecision',
    'normalizations',
    'observations',
    'selectedAction',
    'status',
    'warnings',
  ]);
  assert.equal(result.status, 'indeterminate');
  assert.deepEqual(fixture.effects, []);
});

test('epic child refusals and independent child approval requests survive close collection', async () => {
  const requests = [1701, 1702].map((issue) => ({
    kind: 'plan-approval',
    actor: 'configured-approver',
    subject: { issue, actionId: 'promote' },
    args: {},
  }));
  const fixture = closeFixture({
    values: {
      'evidence:1669:3': {
        complete: true,
        children: [
          { number: 1701, state: 'plan' },
          { number: 1702, state: 'plan' },
        ],
      },
    },
    guards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [1701, 1702].map((issue) => ({
        id: 'review-exit-epic-child-disposition',
        code: 'plan-approval-missing',
        args: {},
        remediation: { id: 'request-plan-approval', args: { issue } },
      })),
      humanDecision: { requests },
    }),
  });
  const result = await closeReadiness.collectCloseReadiness({
    issue: ISSUE,
    attempt: fixture.attempt,
    ports: fixture.ports,
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.humanDecision, { requests });
  assert.equal(result.blockers.length, 2);
});

test('close preserves approval requests alongside attribution investigation', async () => {
  const fixture = closeFixture({
    values: { 'evidence:1669:2': { status: 'indeterminate' } },
    guards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [
        {
          id: 'review-exit-review-approved',
          code: 'review-approval-missing',
          args: { head: HEAD },
          remediation: { id: 'request-review-approval', args: { issue: ISSUE, head: HEAD } },
        },
      ],
      humanDecision: {
        requests: [
          {
            kind: 'review-approval',
            actor: 'configured-approver',
            subject: { issue: ISSUE, actionId: 'close' },
            args: { head: HEAD },
          },
        ],
      },
    }),
  });
  const result = await fixture.evaluate();
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.humanDecision.requests.some(({ kind }) => kind === 'review-approval'));
});

test('incorporated and malformed evidence-v2 authority cannot select a special close lane', async () => {
  for (const mode of ['incorporated', 'evidence-v2']) {
    const fixture = closeFixture();
    const original = fixture.attempt.observe;
    const attempt = {
      observe: async (request) => {
        const observation = await original(request);
        return request.identity === 'evidence:1669:1'
          ? { ...observation, value: { ...observation.value, mode } }
          : observation;
      },
    };
    const result = await closeReadiness.collectCloseReadiness({
      issue: ISSUE,
      attempt,
      ports: fixture.ports,
    });
    assert.equal(result.status, 'indeterminate');
    assert.equal(result.selectedAction, 'close');
    assert.deepEqual(fixture.effects, []);
  }
});

test('a current Review state selects sanctioned close navigation', () => {
  const result = resolveActionNavigation({ actionId: 'close', state: 'review' });
  assert.deepEqual(result, { status: 'ready', target: 'done', delegate: 'close', blocker: null });
});

test('Done remains terminal and cannot select another close', () => {
  const result = resolveActionNavigation({ actionId: 'close', state: 'done' });
  assert.deepEqual(result, { status: 'terminal', target: null, delegate: null, blocker: null });
});

test('Review promotion delegates to the close collector', async () => {
  const fixture = closeFixture();
  const navigation = resolveActionNavigation({ actionId: 'promote', state: 'review' });
  assert.equal(navigation.delegate, 'close');
  const result = await evaluateAction({
    actionId: 'promote',
    repository: REPO,
    issue: ISSUE,
    inputs: { state: 'review', body: BODY, head: HEAD },
    attempt: fixture.attempt,
    deps: { closePorts: fixture.ports, effectAttempts: () => fixture.effects },
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.actionId, 'close');
});

test('close retains approval and investigation requests simultaneously', async () => {
  const fixture = closeFixture({
    unreadable: 'evidence:1669:3',
    guards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [
        {
          id: 'review-exit-review-approved',
          code: 'review-approval-missing',
          args: { head: HEAD },
          remediation: { id: 'request-review-approval', args: { issue: ISSUE, head: HEAD } },
        },
      ],
      humanDecision: {
        requests: [
          {
            kind: 'review-approval',
            actor: 'configured-approver',
            subject: { issue: ISSUE, actionId: 'close' },
            args: { head: HEAD },
          },
        ],
      },
    }),
  });
  const result = await fixture.evaluate();
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.humanDecision.requests.some(({ kind }) => kind === 'review-approval'));
  assert.ok(result.humanDecision.requests.some(({ kind }) => kind === 'manual-investigation'));
});

test('missing workflow-policy reader is a typed indeterminate result', async () => {
  const fixture = closeFixture({
    guards: async () => ({
      ok: false,
      status: 'blocked',
      refusals: [{ id: 'body-gates-entry-done', code: 'unclassified-refusal', args: {} }],
      humanDecision: null,
    }),
  });
  const result = await closeReadiness.collectCloseReadiness({
    issue: ISSUE,
    attempt: fixture.attempt,
    ports: fixture.ports,
  });
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some(({ code }) => code === 'authority-read-failed'));
});
