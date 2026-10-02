// @story #1859
import assert from 'node:assert/strict';
import { test } from 'node:test';

// @story #1859
for (const mode of ['initial', 'retry', 'readback', 'unmapped']) {
  test(`Test Promote preserves the ${mode} normalization refusal before delegation`, async () => {
    const { runPromote } = await import('../../../../task-tracker/verbs/promote.mjs');
    const { runGuards } = await import('../../../../task-tracker/lib/guard-registry.mjs');
    const head = 'a'.repeat(40);
    let liveBody = `## Acceptance Criteria
- [x] Required behavior
## Definition of Done
### Functional (verified at Test)
- [ ] Acceptance criteria met <!-- dod:functional:acs -->
<!-- aitm-last-known-state state="test" ts="2026-10-01T00:00:00Z" -->`;
    const original = liveBody;
    const refusal = await runGuards('test', 'review', {
      issueNumber: 1859,
      body:
        mode === 'unmapped'
          ? '## Scope\n- [x] Dependency Map\n<!-- aitm-dod-verified sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ts="2026-10-01T00:00:00Z" -->'
          : '## Scope\n- [ ] Step A',
      toState: 'review',
      cfg: { repo: 'example/project' },
      deps: {
        observeDependencyReadiness: async () => ({ status: 'ready', unfinished: [] }),
        reconcileDependencyDisposition: async () => {},
        fetchParentIssue: async () => null,
        resolveDocsOnlyLaneSkipProof: async () => false,
      },
    });
    assert.equal(refusal.status, 'blocked');
    if (mode === 'unmapped')
      assert.deepEqual(
        refusal.refusals.map((r) => r.id),
        ['body-gates-entry-review']
      );
    const effects = [];
    let evaluations = 0;
    const result = await runPromote({
      issueNumber: 1859,
      cfg: { repo: 'example/project' },
      deps: {
        assertBound: () => {},
        migrationFreezeActive: () => false,
        fetchIssueBody: async () => ({ body: liveBody }),
        getLiveState: async () => 'test',
        resolveProjectDir: () => '/authoritative/project',
        loadSession: () => null,
        currentSessionId: () => 'task5',
        pexec: async (bin, args, options) => {
          if (bin === 'git') {
            assert.equal(options.cwd, '/authoritative/project');
            return { stdout: head };
          }
          return { stdout: liveBody };
        },
        runGuards: async () => {
          evaluations++;
          return evaluations >= { initial: 1, retry: 2, readback: 3, unmapped: 1 }[mode]
            ? refusal
            : runGuards('done', 'done', {});
        },
        loadWorkflowBoundary: async () => ({ status: 'policy-compatible', isWaived: () => false }),
        normalizationMutateBody: async ({ mutate, validateFreshBaseAsync }) => {
          const next = mutate(liveBody);
          await validateFreshBaseAsync(liveBody, next);
          effects.push('normalization');
          liveBody = next;
          return { status: 'ok' };
        },
        spawnVerb: async () => {
          effects.push('delegate');
          throw new Error('must not delegate');
        },
        runMoveState: async () => {
          effects.push('transition');
          throw new Error('must not transition');
        },
      },
    });
    assert.ok(
      ['completeness-refused', 'dod-verified-missing', 'guard-refused'].includes(result.status),
      JSON.stringify(result)
    );
    assert.deepEqual(result.decision, refusal);
    assert.equal(result.normalizationPersisted, mode === 'readback');
    assert.deepEqual(effects, mode === 'readback' ? ['normalization'] : []);
    assert.equal(evaluations, { initial: 1, retry: 2, readback: 3, unmapped: 2 }[mode]);
    if (mode !== 'readback') assert.equal(liveBody, original);
  });
}

// @story #1859
for (const code of [
  'reviewed-scope-current-missing',
  'reviewed-scope-stale',
  'reviewed-scope-read-unavailable',
]) {
  test(`Test Promote refuses ${code} before normalization or delegation`, async () => {
    const { runPromote } = await import('../../../../task-tracker/verbs/promote.mjs');
    const { testExitReviewedScopeGuard } =
      await import('../../../../task-tracker/lib/test-exit-reviewed-scope-guard.mjs');
    const { POLICY_MARKER, serializePointer, sha256, ReviewedScopeError } =
      await import('../../../../task-tracker/lib/reviewed-scope/model.mjs');
    const registry = await import(
      `../../../../task-tracker/lib/guard-registry.mjs?promote1859=${code}`
    );
    registry.registerGuard('test', 'exit', testExitReviewedScopeGuard);
    const head = 'a'.repeat(40),
      pointer = serializePointer({
        commentId: '99',
        sha256: 'b'.repeat(64),
        lineage: 'c'.repeat(64),
      });
    const liveBody = `## Scope\n${POLICY_MARKER}\n- [x] Work${code === 'reviewed-scope-current-missing' ? '' : ' ' + pointer}\n## Acceptance Criteria\n- [x] Behavior\n## Definition of Done\n### Functional (verified at Test)\n- [ ] Acceptance criteria met <!-- dod:functional:acs -->\n<!-- aitm-last-known-state state="test" ts="2026-10-01T00:00:00Z" -->`;
    const effects = [];
    const result = await runPromote({
      issueNumber: 1859,
      cfg: { repo: 'owner/repo' },
      deps: {
        assertBound: () => {},
        migrationFreezeActive: () => false,
        fetchIssueBody: async () => ({ body: liveBody }),
        getLiveState: async () => 'test',
        resolveProjectDir: () => '/bound',
        invokingDir: '/bound',
        loadSession: () => null,
        currentSessionId: () => 'task1859',
        pexec: async (bin, _args, options) => {
          if (bin === 'git') {
            assert.equal(options.cwd, '/bound');
            return { stdout: head };
          }
          return { stdout: liveBody };
        },
        reviewedScope: {
          readEvidenceContext: async () => {
            if (code === 'reviewed-scope-read-unavailable') throw new Error('rate limited');
            return {
              repository: 'owner/repo',
              issue: 1859,
              worktree: '/bound',
              branch: 'codex/1859',
              head,
            };
          },
          readCurrentRecord: async () => ({
            manifest: {
              repository: 'owner/repo',
              issue: 1859,
              worktree: '/bound',
              branch: 'codex/1859',
              head,
              label: 'Work',
            },
            targetDigest: sha256('Work'),
          }),
          validateArtifacts: async () => {
            throw new ReviewedScopeError('reviewed-scope-artifact-digest');
          },
        },
        runGuards: registry.runGuards,
        loadWorkflowBoundary: async () => ({ status: 'policy-compatible', isWaived: () => false }),
        normalizationMutateBody: async () => {
          effects.push('normalize');
          throw new Error('must not write');
        },
        spawnVerb: async () => {
          effects.push('delegate');
        },
        runMoveState: async () => {
          effects.push('transition');
        },
      },
    });
    assert.equal(result.status, 'reviewed-scope-refused', JSON.stringify(result));
    assert.equal(result.decision.refusals[0].code, code);
    assert.equal(result.normalizationPersisted, false);
    assert.deepEqual(effects, []);
  });
}
