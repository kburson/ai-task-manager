// @story #1802
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as closeReadiness from '../../../../task-tracker/lib/action-decision/close.mjs';

const ISSUE = 1669;
const HEAD = 'a'.repeat(40);
const BODY =
  '## User Story\nClose safely\n\n## Scope\nRead-only close\n\n## Acceptance Criteria\n- [x] Close safely\n\n<!-- aitm-last-known-state state="review" ts="2026-09-21T00:00:00Z" -->';
const REPO = 'example/project';
const now = () => '2026-09-21T00:00:00.000Z';

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
    const configured = (await productionCloseFixture({ ...options, trunkRef: 'origin/trunk' }))
      .result;
    const omitted = (await productionCloseFixture({ ...options, trunkRef: '' })).result;
    assert.equal(omitted.status, configured.status);
    assert.deepEqual(
      omitted.blockers.map(({ code, guardId }) => ({ code, guardId })),
      configured.blockers.map(({ code, guardId }) => ({ code, guardId }))
    );
  }
});
