// @story #1992 — catches missing publication fences and cross-entrypoint stale admission.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composedPublication,
  explainComposedBind,
  previewComposedSplit,
  sevenChildEpic,
} from './decomposition-composition-fixtures.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { verbResume } from '../../../../task-tracker/verbs/resume.mjs';
import { runHook } from '../../../../task-tracker/source-edit-gate.mjs';
import { runCommentVerb } from '../../../../task-tracker/verbs/comment.mjs';
import { verbEpicReconcile } from '../../../../task-tracker/verbs/epic-reconcile.mjs';
import { assertScopedDecompositionEffect } from '../../../../task-tracker/lib/decomposition-effect-admission.mjs';
import { evaluateIssueDecomposition } from '../../../../task-tracker/lib/decomposition-plan-exit-guard.mjs';
export function registerDecompositionCompositionCases() {
  for (const kind of ['code', 'audit', 'research', 'spike'])
    for (const state of ['plan', 'develop', 'review'])
      for (const [hours, status] of [
        [23, 'needs-decomposition-review'],
        [24, 'must-decompose'],
        [25, 'must-decompose'],
      ])
        test(
          'composed real inflation ' +
            kind +
            '/' +
            state +
            '/' +
            hours +
            ' records truth without lifecycle conversion',
          async () => {
            const f = await composedPublication({ kind, state, hours });
            try {
              const result = await f.publish();
              assert.equal(result.status, 'recorded', result.reason);
              const current = await f.runtime.collect(f.subject);
              assert.equal(current.assessment.status, status);
              assert.equal(current.input.kind, kind);
              assert.equal(
                current.assessment.capabilities.includes('scoped-implementation'),
                hours === 23
              );
              assert.equal(f.authority.values.project.estimate, hours);
              assert.match(f.authority.body, new RegExp('state="' + state + '"'));
              assert.deepEqual(f.counts, { audit: 1, size: 1, estimate: 1, fields: 1 });
              assert.equal((await f.publish()).status, 'recorded');
              assert.deepEqual(f.counts, { audit: 1, size: 1, estimate: 1, fields: 1 });
            } finally {
              f.native.close();
            }
          }
        );
  for (const failure of ['audit', 'size', 'estimate', 'fields'])
    for (const outcome of ['before', 'after'])
      test(
        'publication ' +
          outcome +
          '/' +
          failure +
          ' remains fenced through resume, Explain, hook and split before exact retry',
        async () => {
          const f = await composedPublication({ failure, outcome });
          try {
            assert.equal((await f.publish()).status, 'partial');
            const operation = readDecompositionRecords(f.authority.body).publication.operationId;
            const resumed = await verbResume({
              ...f.native.ctx,
              cfg: f.cfg,
              rest: ['107'],
              decomposition: { subject: f.subject, runtime: f.runtime },
            });
            assert.equal(resumed.decomposition.assessment.status, 'pending');
            const before = f.authority.writes.length;
            const explanation = await explainComposedBind(f);
            assert.equal(explanation.result.status, 'ready');
            assert.ok(
              explanation.result.warnings.some(
                (warning) => warning.code === 'decomposition-bind-restricted'
              )
            );
            assert.equal(f.authority.writes.length, before, 'read-only Explain cannot publish');
            const hook = await runHook(f.payload('src/product.mjs'), f.deps);
            assert.equal(hook.decision, 'block');
            assert.equal(hook.code, 'decomposition-assessment-pending');
            let remoteEffects = 0;
            await assert.rejects(
              () =>
                runCommentVerb(
                  {
                    ...f.native.ctx,
                    cfg: f.cfg,
                    rest: ['107', '--key', 'result.composition', '--body-file', 'result.md'],
                  },
                  {
                    decomposition: { subject: f.subject, runtime: f.runtime },
                    readFile: () => '### Findings\nNew completed work.',
                    listComments: async () => ({ issueId: 'ISSUE_107', comments: [] }),
                    createComment: async () => {
                      remoteEffects++;
                    },
                  }
                ),
              (error) => error.code === 'decomposition-assessment-pending'
            );
            assert.equal(remoteEffects, 0);
            const preview = await previewComposedSplit(f);
            assert.equal(preview.result.status, 'dry-run');
            assert.equal(preview.result.proposals.length, 4);
            assert.equal(preview.creatorCalls, 4);
            assert.equal(
              readDecompositionRecords(f.authority.body).publication.operationId,
              operation
            );
            assert.equal(readDecompositionRecords(f.authority.body).publication.status, 'pending');
            assert.equal((await f.publish()).status, 'recorded');
            assert.deepEqual(f.counts, { audit: 1, size: 1, estimate: 1, fields: 1 });
            assert.equal(
              (await runHook(f.payload('src/product.mjs'), f.deps)).code,
              'decomposition-required'
            );
          } finally {
            f.native.close();
          }
        }
      );
  for (const terminal of [false, true])
    test(
      'seven reviewed children make converted 52h epic ' +
        (terminal ? 'completion-ready' : 'planning-ready only'),
      async () => {
        const f = await sevenChildEpic(terminal);
        try {
          const current = await f.runtime.collect(f.subject);
          assert.equal(
            current.input.availability.status,
            'complete',
            current.input.availability.reasons.join(',')
          );
          assert.equal(current.input.epicReadiness.children.length, 7);
          assert.equal(current.input.epicReadiness.planning, true);
          assert.equal(current.input.epicReadiness.completion, terminal);
          assert.equal(current.assessment.status, 'epic-readiness-required');
          assert.equal(current.assessment.capabilities.includes('scoped-implementation'), false);
          assert.equal(current.assessment.capabilities.includes('scoped-completion'), terminal);
          const planExit = await evaluateIssueDecomposition({
            issueNumber: 107,
            cfg: f.cfg,
            body: f.authority.body,
            projectDir: f.native.root,
            deps: { decomposition: { subject: f.subject, runtime: f.runtime } },
          });
          assert.equal(planExit.input.epicReadiness.planning, true);
          let writes = 0;
          const reconcile = () =>
            verbEpicReconcile({
              cfg: f.cfg,
              projectDir: f.native.root,
              rest: ['107', '--deliverable-comment', '700'],
              deps: {
                decomposition: { subject: f.subject, runtime: f.runtime },
                fetchDeliverableComment: async () => ({
                  body: 'Seven bounded children delivered; parent remains coordination.',
                  html_url: 'https://github.com/o/r/issues/107#issuecomment-700',
                }),
                mutateIssueBody: async ({ mutate }) => {
                  const next = await mutate(f.authority.body);
                  if (next !== f.authority.body) writes++;
                  f.authority.body = next;
                },
                fetchEpicChildren: async () => f.authority.values.project.children,
              },
            });
          if (terminal) {
            await reconcile();
            assert.equal(writes, 1);
            assert.match(f.authority.body, /aitm-deliverable-posted/);
          } else {
            await assert.rejects(reconcile, (error) => error.code === 'decomposition-required');
            assert.equal(writes, 0);
          }
          // Combined provider snapshot recomputes real completion; no final allow double.
          f.response.data.repository.issue.body = f.authority.body;
          const completion = () =>
            assertScopedDecompositionEffect({
              issue: 107,
              cfg: f.cfg,
              projectDir: f.native.root,
              activity: 'scoped-completion',
              deps: { graphql: async () => f.response, readPlanAtCommit: async () => f.content },
            });
          if (terminal) assert.equal((await completion()).decision, 'allow');
          else await assert.rejects(completion, (error) => error.code === 'decomposition-required');
        } finally {
          f.native.close();
        }
      }
    );
}
