// @story #1859
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import { verbReview } from '../../../../task-tracker/verbs/review.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { saveState } from '../../../../task-tracker/state.mjs';

const ISSUE = 1667;
const REPOSITORY = 'example/project';
const HEAD = 'a'.repeat(40);
const now = () => '2026-09-21T21:20:00.000Z';
const bodyDigest = (body) => `sha256:${createHash('sha256').update(body).digest('hex')}`;

const bodyFor = (state) => `## User Story
As a review operator
I want to inspect Review readiness
So that explanation never performs reviewer work

## Scope
Review readiness is explained without effects.

## Acceptance Criteria
- [x] Review entry is explainable. <!-- aitm-verified cmd="node --test review.test.mjs" -->

## Verification Commands
- [x] \`node --test review.test.mjs\`

<!-- aitm-last-known-state state="${state}" ts="2026-09-21T21:20:00Z" -->`;

function fixture({
  state = 'test',
  issueBody = bodyFor(state),
  boardState = state,
  preflight = null,
  reviewEvidence = { ok: true, mode: 'receipt-v1', reasons: [] },
  worktree = { matches: true, headSha: HEAD, clean: true },
  resident = { status: 'incomplete', reason: 'review-entry-missing' },
  runGuards,
  genericGuards = null,
  unreadable = null,
} = {}) {
  const scope = computeScopeIdentity({ repository: REPOSITORY, issue: ISSUE, body: issueBody });
  const effectivePreflight = preflight ?? {
    ok: true,
    reasons: [],
    headSha: HEAD,
    bodyDigest: bodyDigest(issueBody),
  };
  const effects = [];
  const decision = async (actionId) => {
    const attempt = createObservationAttempt({
      repository: REPOSITORY,
      issue: ISSUE,
      boundaryId: `action:${actionId}:${ISSUE}`,
      now,
      read: async (request) => {
        if (request.resource === unreadable) return undefined;
        const value = {
          'issue-body': { number: ISSUE, body: issueBody },
          'project-board': { state: boardState },
          worktree,
          'session-state': { active: '#1667', paused: false },
          delivery: { preflight: effectivePreflight, reviewEvidence },
        }[request.resource];
        return { ...request, value };
      },
    });
    return evaluateAction({
      actionId,
      repository: REPOSITORY,
      issue: ISSUE,
      inputs: { body: issueBody, state, head: HEAD, config: { repo: REPOSITORY } },
      attempt,
      deps: {
        ...(genericGuards ? { runReadOnlyGuards: genericGuards } : {}),
        effectAttempts: () => effects,
        reviewPorts: {
          scope,
          projectDir: process.cwd(),
          invokingDir: process.cwd(),
          verifyResident: async () => resident,
          runGuards:
            runGuards ??
            (async () => ({
              ok: true,
              status: 'ready',
              refusals: [],
              humanDecision: null,
            })),
        },
      },
    });
  };
  return { decision, effects };
}

// @story #1859
test('real Review projection preserves completeness checkbox labels in action output', async () => {
  const item = fixture({
    issueBody: bodyFor('test').replace('## Scope\n', '## Scope\n- [ ] Step A\n- [ ] Step B\n'),
    runGuards: (_from, _to, context) =>
      runGuards('test', 'review', {
        ...context,
        deps: {
          ...context.deps,
          observeDependencyReadiness: async () => ({ status: 'ready', unfinished: [] }),
          reconcileDependencyDisposition: async () => {},
          fetchParentIssue: async () => null,
          resolveDocsOnlyLaneSkipProof: async () => false,
          evidenceBranchReachability: async () => ({ ok: true }),
        },
      }),
  });
  const result = await item.decision('review');
  assert.deepEqual(
    result.blockers.filter((r) => r.code === 'test-scope-incomplete').map((r) => r.args.label),
    ['- [ ] Step A', '- [ ] Step B']
  );
  assert.deepEqual(item.effects, []);
});

// @story #1859
test('Review consumes normalized typed labels before transitions or reviewer work', async () => {
  const projectDir = mkdtempProjectIsolated('aitm-review-normalization-');
  const statePath = path.join(projectDir, 'state.json');
  // #1857: seed the current actor contract in this isolated fixture.
  const actorEnv = {
    AI_TASK_MANAGER_SESSION_ID: 'fixture-normalization-1667',
    AI_TASK_MANAGER_APP_NAME: 'codex',
    AI_TASK_MANAGER_PROJECT_DIR: projectDir,
  };
  const priorEnv = Object.fromEntries(Object.keys(actorEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, actorEnv);
  saveState(
    { active: '#1667', entryStartTs: new Date().toISOString(), lastWordMarker: 0 },
    statePath
  );
  const original = `## Scope
- [ ] Step A
- [ ] Step B
<!-- aitm-dod-verified sha="${HEAD}" ts="2026-09-21T21:20:00Z" -->
<!-- aitm-last-known-state state="test" ts="2026-09-21T21:20:00Z" -->`;
  const decision = await runGuards('test', 'review', {
    issueNumber: ISSUE,
    body: original,
    toState: 'review',
    cfg: { repo: REPOSITORY },
    deps: {
      observeDependencyReadiness: async () => ({ status: 'ready', unfinished: [] }),
      reconcileDependencyDisposition: async () => {},
      fetchParentIssue: async () => null,
      resolveDocsOnlyLaneSkipProof: async () => false,
    },
  });
  const effects = [];
  let stderr = '';
  let evaluatorCalls = 0;
  const previousExit = process.exit;
  const previousWrite = process.stderr.write;
  process.exit = (code) => {
    const error = new Error(`exit:${code}`);
    error.code = code;
    throw error;
  };
  process.stderr.write = (chunk) => {
    stderr += chunk;
    return true;
  };
  try {
    await assert.rejects(
      verbReview({
        cfg: { repo: REPOSITORY },
        projectDir,
        statePath,
        rest: ['#1667'],
        SKIP_NETWORK: false,
        drainQueueIfAny: async () => {},
        nowIso: () => new Date().toISOString(),
        runReviewPreflight: async () => ({ ok: true }),
        pexec: async (bin) =>
          bin === 'git' ? { stdout: HEAD } : { stdout: JSON.stringify({ body: original }) },
        runGuards: async () => runGuards('done', 'done', {}),
        mutateIssueBody: async () => ({ status: 'noop' }),
        fetchSubIssues: async () => [],
        normalizationReadBack: async () => ({ body: original, head: HEAD }),
        normalizationEvaluate: async () => {
          evaluatorCalls++;
          return decision;
        },
        safePostTiming: async (_issue, row) => effects.push(row),
        runMoveState: async () => {
          effects.push('transition');
          throw new Error('must not transition');
        },
      }),
      (error) => error.code === 4
    );
    assert.match(stderr, /2 incomplete checkbox/);
    assert.match(stderr, / {3}- \[ \] Step A\n {3}- \[ \] Step B/);
    assert.equal(evaluatorCalls, 1);
    assert.equal(effects.length, 1);
    assert.match(effects[0], /gate-refused/);
    assert.match(effects[0], /2 unticked checkbox/);
  } finally {
    process.exit = previousExit;
    process.stderr.write = previousWrite;
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// @story #1859
import { testExitReviewedScopeGuard } from '../../../../task-tracker/lib/test-exit-reviewed-scope-guard.mjs';
import {
  POLICY_MARKER,
  serializePointer,
  sha256,
  ReviewedScopeError,
} from '../../../../task-tracker/lib/reviewed-scope/model.mjs';
import { STATES } from '../../../../task-tracker/states/index.mjs';
for (const code of [
  'reviewed-scope-current-missing',
  'reviewed-scope-stale',
  'reviewed-scope-comment-invalid',
  'reviewed-scope-wrong-checkout',
  'reviewed-scope-read-unavailable',
]) {
  test(`real registry preserves ${code} without an unclassified fallback`, async () => {
    const registry = await import(
      `../../../../task-tracker/lib/guard-registry.mjs?reviewed=${code}`
    );
    registry.registerGuard('test', 'exit', testExitReviewedScopeGuard);
    const authority = {
      repository: 'owner/repo',
      issue: 1859,
      worktree: '/bound',
      branch: 'codex/1859',
      head: 'a'.repeat(40),
    };
    const pointer = serializePointer({
      commentId: '99',
      sha256: 'a'.repeat(64),
      lineage: 'b'.repeat(64),
    });
    const reviewed = {
      readEvidenceContext: async () => {
        if (code === 'reviewed-scope-wrong-checkout')
          throw new ReviewedScopeError('reviewed-scope-worktree', 'bound checkout: /bound');
        if (code === 'reviewed-scope-read-unavailable') throw new Error('rate limited');
        return authority;
      },
      readCurrentRecord: async () => {
        if (code === 'reviewed-scope-comment-invalid')
          throw new ReviewedScopeError('reviewed-scope-comment-digest');
        return { manifest: authority, targetDigest: sha256('Work') };
      },
      validateArtifacts: async () => {
        if (code === 'reviewed-scope-stale')
          throw new ReviewedScopeError('reviewed-scope-artifact-digest');
      },
    };
    const decision = await registry.runGuards('test', 'review', {
      body: `## Scope\n${POLICY_MARKER}\n- [x] Work${code === 'reviewed-scope-current-missing' ? '' : ' ' + pointer}\n`,
      issueNumber: 1859,
      cfg: { repo: 'owner/repo' },
      projectDir: '/bound',
      invokingDir: '/bound',
      deps: { reviewedScope: reviewed },
    });
    assert.equal(
      decision.status,
      code === 'reviewed-scope-read-unavailable' ? 'indeterminate' : 'blocked',
      JSON.stringify(decision)
    );
    assert.equal(decision.refusals[0].code, code, JSON.stringify(decision));
    assert.equal(decision.refusals[0].args.label, 'Work');
    assert.equal(typeof decision.refusals[0].args.reason, 'string');
    assert.equal(decision.humanDecision, null);
    assert.equal(Object.hasOwn(decision, 'typedRefusals'), false);
  });
}
test('reviewed Scope guard is registered only in Test exit', () => {
  const locations = Object.values(STATES).flatMap((s) =>
    ['entryGuards', 'exitGuards'].flatMap((slot) =>
      s[slot].filter((g) => g.id === 'test-exit-reviewed-scope').map(() => `${s.name}:${slot}`)
    )
  );
  assert.deepEqual(locations, ['test:exitGuards']);
});

test('read-only Review collector threads explicit execution and invoking directories', async () => {
  const item = fixture({
    runGuards: async (_from, _to, context) => {
      assert.equal(context.projectDir, process.cwd());
      assert.equal(context.invokingDir, process.cwd());
      return { ok: true, status: 'ready', refusals: [], humanDecision: null };
    },
  });
  assert.equal((await item.decision('review')).status, 'ready');
});

test('Review evaluator retains injected authoritative reviewed Scope ports', async () => {
  const { evaluateReviewReadiness } =
    await import('../../../../task-tracker/lib/action-decision/review.mjs');
  const registry =
    await import('../../../../task-tracker/lib/guard-registry.mjs?reviewed-context-1859');
  registry.registerGuard('test', 'exit', testExitReviewedScopeGuard);
  const body = bodyFor('test').replace(
    'Review readiness is explained without effects.',
    `${POLICY_MARKER}\n- [x] Work`
  );
  let contexts = 0;
  const decision = await evaluateReviewReadiness({
    issue: ISSUE,
    cfg: { repo: REPOSITORY },
    projectDir: '/bound',
    invokingDir: '/bound',
    now,
    deps: {
      readBody: async () => body,
      readHead: async () => HEAD,
      fetchBoard: async () => ({ state: 'test' }),
      readWorktree: async () => ({ matches: true, headSha: HEAD }),
      readSessionState: async () => ({ active: `#${ISSUE}` }),
      runPreflight: async () => ({
        ok: true,
        reasons: [],
        headSha: HEAD,
        bodyDigest: bodyDigest(body),
      }),
      resolveReviewEvidence: async () => ({ ok: true, mode: 'receipt-v1', reasons: [] }),
      loadWorkflowBoundary: async () => ({ status: 'policy-compatible', isWaived: () => false }),
      runGuards: registry.runGuards,
      reviewedScope: {
        readEvidenceContext: async () => {
          contexts++;
          return {
            repository: REPOSITORY,
            issue: ISSUE,
            worktree: '/bound',
            branch: 'codex/1859',
            head: HEAD,
          };
        },
      },
    },
  });
  assert.equal(contexts, 1, JSON.stringify(decision));
  assert.equal(decision.status, 'blocked');
  assert.equal(decision.blockers[0].code, 'reviewed-scope-current-missing');
});
