// @story #1988 — actual compatibility comment ownership and exact retries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { runPlanEstimate } from '../../../../task-tracker/verbs/plan-estimate.mjs';
import {
  appendPlannedEstimate,
  upsertPlannedEstimate,
  clearPlannedEstimate,
  restorePlannedEstimate,
  repopulateEmptyPlannedAppendix,
  buildPlannedAppendix,
} from '../../../../task-tracker/lib/refine-estimate-comment.mjs';
import { publicationCommentDeps } from './refine-comment-publication-fixtures.mjs';
export function registerRefineCommentPublicationCases({ cfg, baseComment, emptyAppendixComment }) {
  test('exact append retry reconciles an already patched proposal before claiming duplicate success', async () => {
    let patches = 0,
      unreadable = false;
    const deps = publicationCommentDeps({
      cfg,
      issueNumber: 1987,
      current: { size: 'M', estimate: 10 },
      deps: {
        listComments: async () => [{ id: 99, body: baseComment(1987) }],
        patchComment: async () => {
          patches++;
        },
      },
    });
    const patch = deps.patchComment,
      list = deps.listComments;
    deps.patchComment = async (args) => {
      const result = await patch(args);
      unreadable = true;
      return result;
    };
    deps.listComments = async () => {
      if (unreadable) {
        unreadable = false;
        throw new Error('readback interrupted');
      }
      return list();
    };
    const args = {
      cfg,
      issueNumber: 1987,
      planned: { size: 'M', estimate: 25 },
      current: { size: 'M', estimate: 10 },
      rationale: 'larger scope',
      deps,
    };
    assert.equal((await appendPlannedEstimate(args)).status, 'partial');
    assert.equal(
      readDecompositionRecords((await deps.decomposition.readIssue()).value.body).publication
        .status,
      'pending'
    );
    const second = await appendPlannedEstimate(args);
    assert.equal(second.status, 'appended', second.reason ?? 'retry did not complete');
    assert.equal(
      readDecompositionRecords((await deps.decomposition.readIssue()).value.body).publication
        .status,
      'complete'
    );
    assert.equal(patches, 1);
  });

  for (const mode of ['upsert', 'clear'])
    test(
      mode + ' preserves later inflation and review history after the planned appendix',
      async () => {
        const history = '\n### Discovered work — estimate inflation\nHistorical verified work.\n';
        let original =
          baseComment(1987) +
          buildPlannedAppendix({
            current: { size: 'M', estimate: 10 },
            planned: { size: 'M', estimate: 25 },
            rationale: 'old proposal',
          }) +
          '\n' +
          history;
        const deps = publicationCommentDeps({
          cfg,
          issueNumber: 1987,
          current: { size: 'M', estimate: 10 },
          deps: {
            listComments: async () => [{ id: 99, body: original }],
            patchComment: async () => {},
          },
        });
        if (mode === 'upsert')
          await upsertPlannedEstimate({
            cfg,
            issueNumber: 1987,
            refine: { size: 'M', estimate: 10 },
            plan: { size: 'M', estimate: 23 },
            rationale: 'updated proposal',
            deps,
          });
        else await clearPlannedEstimate({ cfg, issueNumber: 1987, deps });
        const current = (await deps.listComments())[0].body;
        assert.ok(current.endsWith(history), 'unrelated later history must retain exact bytes');
      }
    );

  for (const mode of ['upsert', 'repopulate'])
    test(
      mode + ' declares and confirms its real proposal effect before touching the comment',
      async () => {
        const initial =
          mode === 'upsert'
            ? baseComment(1987) +
              buildPlannedAppendix({
                current: { size: 'M', estimate: 10 },
                planned: { size: 'M', estimate: 25 },
                rationale: 'older proposal',
              }) +
              '\n'
            : emptyAppendixComment(1987);
        let deps;
        deps = publicationCommentDeps({
          cfg,
          issueNumber: 1987,
          current: { size: 'M', estimate: 10 },
          deps: {
            listComments: async () => [{ id: 99, body: initial }],
            patchComment: async () => {
              assert.equal(
                readDecompositionRecords((await deps.decomposition.readIssue()).value.body)
                  .publication?.status,
                'pending',
                'intent before real patch'
              );
            },
          },
        });
        const args = {
          cfg,
          issueNumber: 1987,
          planned: { size: 'M', estimate: 23 },
          plan: { size: 'M', estimate: 23 },
          current: { size: 'M', estimate: 10 },
          refine: { size: 'M', estimate: 10 },
          rationale: 'current proposal',
          deps,
        };
        const result = await (
          mode === 'upsert' ? upsertPlannedEstimate : repopulateEmptyPlannedAppendix
        )(args);
        assert.equal(
          result.status,
          mode === 'upsert' ? 'updated' : 'repopulated',
          result.reason ?? 'proposal failed'
        );
        const current = readDecompositionRecords((await deps.decomposition.readIssue()).value.body);
        assert.equal(current.publication.status, 'complete');
        assert.equal(current.assessment.estimate.hours, 23);
        assert.equal(current.assessment.estimate.basis, 'proposed');
      }
    );

  test('a forged nested upsert context cannot patch a proposal or adopt the caller owner', async () => {
    let patches = 0;
    const deps = publicationCommentDeps({
      cfg,
      issueNumber: 1987,
      current: { size: 'M', estimate: 10 },
      deps: {
        listComments: async () => [{ id: 99, body: baseComment(1987) }],
        patchComment: async () => {
          patches++;
        },
      },
    });
    await assert.rejects(
      () =>
        upsertPlannedEstimate({
          cfg,
          issueNumber: 1987,
          refine: { size: 'M', estimate: 10 },
          plan: { size: 'M', estimate: 25 },
          context: { role: 'owner' },
          effectId: 'appendix',
          deps,
        }),
      /owner-context|foreign-context/
    );
    assert.equal(patches, 0);
  });

  test('size-only compatibility proposal stays separate from the unchanged published estimate and size', async () => {
    const deps = publicationCommentDeps({
      cfg,
      issueNumber: 1987,
      current: { size: 'M', estimate: 10 },
      deps: {
        listComments: async () => [{ id: 99, body: baseComment(1987) }],
        patchComment: async () => {},
      },
    });
    const result = await appendPlannedEstimate({
      cfg,
      issueNumber: 1987,
      planned: { size: 'L' },
      current: { size: 'M', estimate: 10 },
      rationale: 'larger integration surface',
      deps,
    });
    assert.equal(result.status, 'appended', result.reason ?? 'size proposal failed');
    const body = (await deps.decomposition.readIssue()).value.body,
      r = readDecompositionRecords(body);
    assert.equal(r.publication.status, 'complete');
    assert.equal(r.assessment.estimate.basis, 'published');
    assert.equal(r.assessment.estimate.hours, 10);
    assert.equal(r.assessment.size, 'L');
    assert.match(body, /"size":"M"/);
    assert.match(body, /"estimate":10/);
  });

  for (const mode of ['upsert', 'repopulate'])
    test(
      mode + ' reconciles a patched pending proposal on exact retry without a second patch',
      async () => {
        let patches = 0,
          unreadable = false;
        const deps = publicationCommentDeps({
          cfg,
          issueNumber: 1987,
          current: { size: 'M', estimate: 10 },
          deps: {
            listComments: async () => [
              { id: 99, body: mode === 'upsert' ? baseComment(1987) : emptyAppendixComment(1987) },
            ],
            patchComment: async () => {
              patches++;
            },
          },
        });
        const patch = deps.patchComment,
          list = deps.listComments;
        deps.patchComment = async (args) => {
          await patch(args);
          unreadable = true;
        };
        deps.listComments = async () => {
          if (unreadable) {
            unreadable = false;
            throw new Error('readback interrupted');
          }
          return list();
        };
        const args = {
          cfg,
          issueNumber: 1987,
          planned: { size: 'M', estimate: 25 },
          plan: { size: 'M', estimate: 25 },
          current: { size: 'M', estimate: 10 },
          refine: { size: 'M', estimate: 10 },
          rationale: 'larger scope',
          deps,
        };
        const writer = mode === 'upsert' ? upsertPlannedEstimate : repopulateEmptyPlannedAppendix;
        assert.equal((await writer(args)).status, 'partial');
        assert.equal(
          readDecompositionRecords((await deps.decomposition.readIssue()).value.body).publication
            .status,
          'pending'
        );
        const retry = await writer(args);
        assert.equal(
          retry.status,
          mode === 'upsert' ? 'updated' : 'repopulated',
          retry.reason ?? 'pending retry did not reconcile'
        );
        assert.equal(
          readDecompositionRecords((await deps.decomposition.readIssue()).value.body).publication
            .status,
          'complete'
        );
        assert.equal(patches, 1);
      }
    );

  for (const mode of ['clear', 'restore'])
    test(
      mode + ' publishes proposal retirement or restoration before its first comment effect',
      async () => {
        const proposal =
          baseComment(1987) +
          buildPlannedAppendix({
            current: { size: 'M', estimate: 10 },
            planned: { size: 'M', estimate: 25 },
            rationale: 'saved plan',
          });
        let deps;
        deps = publicationCommentDeps({
          cfg,
          issueNumber: 1987,
          current: { size: 'M', estimate: 10 },
          deps: {
            listComments: async () => [
              { id: 99, body: mode === 'clear' ? proposal : baseComment(1987) },
            ],
            patchComment: async () => {
              assert.equal(
                readDecompositionRecords((await deps.decomposition.readIssue()).value.body)
                  .publication?.status,
                'pending',
                'owner intent before retirement/restoration'
              );
            },
          },
        });
        const result =
          mode === 'clear'
            ? await clearPlannedEstimate({ cfg, issueNumber: 1987, deps })
            : await restorePlannedEstimate({
                cfg,
                issueNumber: 1987,
                record: { commentId: 99, originalBody: proposal },
                deps,
              });
        assert.equal(
          result.status,
          mode === 'clear' ? 'cleared' : 'restored',
          result.reason ?? result.error
        );
        const r = readDecompositionRecords((await deps.decomposition.readIssue()).value.body);
        assert.equal(r.publication.status, 'complete');
        assert.equal(r.assessment.estimate.hours, mode === 'clear' ? 10 : 25);
        assert.equal(r.assessment.estimate.basis, mode === 'clear' ? 'published' : 'proposed');
      }
    );

  test('real compatibility Plan verb forwards provider and ownership dependencies to its appendix writer', async () => {
    const deps = publicationCommentDeps({
      cfg,
      issueNumber: 1987,
      current: { size: 'M', estimate: 10 },
      deps: {
        listComments: async () => [{ id: 99, body: baseComment(1987) }],
        patchComment: async () => {},
      },
    });
    const result = await runPlanEstimate({
      target: 1987,
      cfg,
      compatibilityMode: true,
      planned: { size: 'M', estimate: 25 },
      current: { size: 'M', estimate: 10 },
      rationale: 'scope grew',
      deps,
    });
    assert.equal(result.status, 'appended', result.reason ?? result.error);
    assert.equal(
      readDecompositionRecords((await deps.decomposition.readIssue()).value.body).publication
        .status,
      'complete'
    );
  });

  test('exact clear retry reconciles retirement already applied before an interrupted read-back', async () => {
    let unreadable = false,
      patches = 0;
    const deps = publicationCommentDeps({
      cfg,
      issueNumber: 1987,
      current: { size: 'M', estimate: 10 },
      deps: {
        listComments: async () => [
          {
            id: 99,
            body:
              baseComment(1987) +
              buildPlannedAppendix({
                current: { size: 'M', estimate: 10 },
                planned: { size: 'M', estimate: 25 },
                rationale: 'old Plan',
              }),
          },
        ],
        patchComment: async () => {
          patches++;
        },
      },
    });
    const patch = deps.patchComment,
      list = deps.listComments;
    deps.patchComment = async (args) => {
      await patch(args);
      unreadable = true;
    };
    deps.listComments = async () => {
      if (unreadable) {
        unreadable = false;
        throw new Error('read-back interrupted');
      }
      return list();
    };
    const args = { cfg, issueNumber: 1987, deps };
    assert.equal((await clearPlannedEstimate(args)).status, 'partial');
    assert.equal(
      readDecompositionRecords((await deps.decomposition.readIssue()).value.body).publication
        .status,
      'pending'
    );
    const retry = await clearPlannedEstimate(args);
    assert.equal(retry.status, 'cleared', retry.reason ?? 'pending clear did not reconcile');
    assert.equal(
      readDecompositionRecords((await deps.decomposition.readIssue()).value.body).publication
        .status,
      'complete'
    );
    assert.equal(patches, 1);
  });
}
