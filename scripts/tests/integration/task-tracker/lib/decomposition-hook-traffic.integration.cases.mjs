// @story #2073 — genuine leaf admission must not select nested child authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTrafficBudget } from '../../../helpers/refinement-traffic-provider.mjs';
import { trafficBudgets } from '../../../fixtures/refinement-traffic-cases.mjs';
import { runSourceBoundary } from '../../../fixtures/refinement-traffic-runner.mjs';

export function registerHookTrafficCases() {
  test('a legitimate complete empty leaf admits in one shallow request', () => {
    const result = runSourceBoundary({
      sourceRoot: process.cwd(),
      fixtureId: 'empty-leaf',
      boundary: 'hook',
    });
    assert.equal(result.outcome.decision, 'allow', JSON.stringify(result.outcome));
    assert.equal(result.ledger.length, 1);
    assert.equal(result.ledger[0].selectedChildProjectFields, false);
  });
  for (const fixtureId of ['empty-unmarked-leaf', 'two-page-comments-leaf'])
    test('complete leaf admits: ' + fixtureId, () => {
      const result = runSourceBoundary({ sourceRoot: process.cwd(), fixtureId, boundary: 'hook' });
      assert.equal(result.outcome.decision, 'allow', JSON.stringify(result.outcome));
      assert.equal(result.ledger.length, fixtureId.includes('comments') ? 3 : 1);
      assert.ok(result.ledger.every((entry) => !entry.selectedChildProjectFields));
    });
  for (const fixtureId of [
    'unknown-kind',
    'duplicate-kind',
    'misplaced-kind',
    'non-epic-child',
    'four-page-comments',
    'drift-body',
    'drift-owner',
    'drift-item',
    'drift-field',
    'drift-children',
    'empty-epic',
    'unready-epic',
  ])
    test('unsafe hook snapshot refuses: ' + fixtureId, () => {
      const result = runSourceBoundary({ sourceRoot: process.cwd(), fixtureId, boundary: 'hook' });
      assert.equal(result.outcome.decision, 'block', JSON.stringify(result.outcome));
      assert.ok(!result.ledger.some((entry) => entry.family.includes('write')));
    });
  for (const [fixtureId, count] of [
    ['two-child-ready-epic', 3],
    ['51-child-ready-epic', 5],
  ])
    test('ready parent observes graph and complete fence: ' + fixtureId, () => {
      const result = runSourceBoundary({ sourceRoot: process.cwd(), fixtureId, boundary: 'hook' });
      assert.equal(
        result.outcome.decision,
        fixtureId.startsWith('51-') ? 'block' : 'allow',
        JSON.stringify(result.outcome)
      );
      if (fixtureId.startsWith('51-')) assert.match(result.outcome.reason, /readiness-children/);
      assert.equal(result.ledger.length, count);
      assert.ok(result.ledger.some((entry) => entry.selectedChildProjectFields));
      assert.equal(result.ledger[0].selectedChildProjectFields, false);
    });

  // These fail if valid selected continuations are rejected or observed inventory drift is forgotten.
  for (const side of ['root', 'child'])
    for (const variant of ['valid', 'wrong-item', 'wrong-project', 'wrong-content'])
      test('selected item pagination: ' + side + ' ' + variant, () => {
        const fixtureId = side + '-fields-' + variant + (side === 'child' ? '-epic' : '-leaf');
        const result = runSourceBoundary({
          sourceRoot: process.cwd(),
          fixtureId,
          boundary: 'hook',
        });
        assertTrafficBudget(result.ledger, trafficBudgets.hookMaximum);
        assert.equal(
          result.outcome.decision,
          variant === 'valid' ? 'allow' : 'block',
          JSON.stringify(result.outcome)
        );
        if (variant === 'valid') assert.equal(result.ledger.length, 4);
        else assert.ok(!result.ledger.some((row) => row.family.includes('write')));
      });
  for (const change of ['addition', 'removal', 'replacement'])
    test('complete initial inventory refuses observed ' + change, () => {
      const result = runSourceBoundary({
        sourceRoot: process.cwd(),
        fixtureId: 'inventory-' + change + '-epic',
        boundary: 'hook',
      });
      assert.equal(result.outcome.decision, 'block', JSON.stringify(result.outcome));
      assertTrafficBudget(result.ledger, trafficBudgets.hookMaximum);
      assert.match(result.outcome.reason, /child.*drift/);
      assert.equal(result.ledger.length, 2);
    });

  test('shared kind grammar preserves absent and fenced markers while rejecting malformed declarations', async () => {
    const { classifyDecompositionKind } =
      await import('../../../../task-tracker/lib/decomposition-kind.mjs');
    for (const body of [
      'legitimate unmarked issue',
      '```md\n<!-- aitm-issue-kind kind="unknown" -->\n```',
    ])
      assert.deepEqual(classifyDecompositionKind(body), { kind: 'code', reasons: [] });
    for (const body of [
      '<!-- aitm-issue-kind kind="epic" -->',
      '## AITM Progress Markers\n<!-- aitm-issue-kind kind=code -->',
      '## AITM Progress Markers\n<!-- aitm-issue-kind kind="unknown" -->',
    ])
      assert.deepEqual(classifyDecompositionKind(body), {
        kind: 'code',
        reasons: ['kind-invalid'],
      });
    assert.deepEqual(
      classifyDecompositionKind(
        '## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->\n<!-- aitm-issue-kind kind="code" -->'
      ),
      { kind: 'code', reasons: ['kind-duplicate'] }
    );
  });

  for (const surface of ['activity-guard', 'source-edit-gate'])
    for (const drift of [false, true])
      test(
        'native ' +
          surface +
          ' uses selected transport with ' +
          (drift ? 'root drift refusal' : 'leaf admission'),
        async () => {
          const { hookFixture, snapshotFor } = await import('./decomposition-hook.cases.mjs');
          const { installMeasuredHookProvider } =
            await import('../../../helpers/refinement-native-hook-provider.mjs');
          const { runNativeHookFixture } =
            await import('../../../helpers/native-decomposition-hook-fixture.mjs');
          const { readFileSync, writeFileSync } = await import('node:fs');
          const evidenceRoot = process.env.AITM_2073_EVIDENCE_DIR;
          const { fileURLToPath } = await import('node:url');
          const f = await hookFixture(7);
          try {
            const provider = installMeasuredHookProvider(f.native.root, snapshotFor(f), f.cfg, {
              drift,
            });
            const result = runNativeHookFixture({
              cwd: f.native.root,
              payload: f.payload('src/product.mjs'),
              env: provider.env,
              guardPath: fileURLToPath(
                new URL('../../../../task-tracker/' + surface + '.mjs', import.meta.url)
              ),
            });
            assert.equal(result.code, 0, result.stderr);
            assert.equal(
              result.decision?.decision ?? (result.stdout === '' ? 'allow' : null),
              drift ? 'block' : 'allow',
              JSON.stringify(result)
            );
            const rows = readFileSync(provider.ledgerFile, 'utf8')
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line));
            assert.equal(rows.length, drift ? 3 : 1);
            assert.ok(
              rows.every((row) => row.outcome === 'success' && !row.selectedChildProjectFields)
            );
            if (evidenceRoot) {
              const path = await import('node:path');
              writeFileSync(
                path.join(
                  evidenceRoot,
                  'native-' + surface + '-' + (drift ? 'drift' : 'leaf') + '.md'
                ),
                '# Native hook selected-transport proof\n\nAllow uses the native silent-success contract (exit zero, no JSON); all cases require a nonempty successful provider ledger.\n\n```json\n' +
                  JSON.stringify({ surface, drift, result, ledger: rows }, null, 2) +
                  '\n```\n'
              );
            }
          } finally {
            f.native.close();
          }
        }
      );

  for (const drift of [false, true])
    test(
      'Plan exit reaches selected collector and ' +
        (drift ? 'refuses drift' : 'allows current leaf'),
      async () => {
        const { hookFixture, snapshotFor } = await import('./decomposition-hook.cases.mjs');
        const { installMeasuredHookProvider } =
          await import('../../../helpers/refinement-native-hook-provider.mjs');
        const { decompositionPlanExitGuard } =
          await import('../../../../task-tracker/lib/decomposition-plan-exit-guard.mjs');
        const { execFileSync } = await import('node:child_process');
        const path = await import('node:path');
        const f = await hookFixture(7);
        try {
          const provider = installMeasuredHookProvider(f.native.root, snapshotFor(f), f.cfg, {
            drift,
          });
          const result = await decompositionPlanExitGuard.run({
            issueNumber: 107,
            cfg: f.cfg,
            projectDir: f.native.root,
            body: f.authority.body,
            toState: 'develop',
            deps: {
              graphql: async ({ query }) =>
                JSON.parse(
                  execFileSync(
                    path.join(provider.env.AITM_GH_TEST_DOUBLE_BIN, 'gh'),
                    ['api', 'graphql', '-f', 'query=' + query],
                    { encoding: 'utf8', env: provider.env }
                  )
                ),
            },
          });
          assert.equal(result.ok, !drift, JSON.stringify(result));
        } finally {
          f.native.close();
        }
      }
    );

  test('incomplete initial epic presence refuses before a replacement graph can hide it', async () => {
    const { readyEpic } = await import('./decomposition-remote.cases.mjs');
    const { collectHookDecompositionSnapshot } =
      await import('../../../../task-tracker/lib/decomposition-hook-authority.mjs');
    const f = await readyEpic(false);
    try {
      const first = structuredClone(f.response);
      first.data.repository.issue.subIssues.pageInfo = { hasNextPage: true, endCursor: null };
      let calls = 0;
      await assert.rejects(
        collectHookDecompositionSnapshot({
          issue: 107,
          cfg: f.cfg,
          projectDir: f.native.root,
          deps: {
            graphql: async () => (++calls === 1 ? first : f.response),
            readPlanAtCommit: async () => f.content,
          },
        }),
        /presence/
      );
      assert.equal(calls, 1);
    } finally {
      f.native.close();
    }
  });
}
