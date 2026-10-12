// @story #1988 — actual tether/refinement composition and provider recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runRefine } from '../../../../../task-tracker/verbs/refine.mjs';
import {
  estimationIssueBody,
  estimationPublicationFixture,
  estimationObservation,
} from '../../../../fixtures/estimation-publication.mjs';
import { parseIssueFieldDb } from '../../../../../task-tracker/issue-field-db.mjs';
import { readDecompositionRecords } from '../../../../../task-tracker/lib/decomposition-records.mjs';
export function registerTetherPublicationCases({ cfg, makeRunner, actualTether }) {
  const tetherIssueToProject = actualTether;
  for (const state of ['backlog', 'refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review'])
    for (const hours of [23, 24, 25])
      test(`actual tether ${state} 10→${hours} records intent before every existing-issue Estimate effect`, async () => {
        let body = estimationIssueBody({ estimate: 10, size: 'M' }),
          board = { estimate: 10, size: 'M' },
          writes = 0;
        body += `<!-- aitm-last-known-state state="${state}" ts="2026-10-11T12:00:00Z" -->\n`;
        const base = makeRunner({
          issueSideItems: [{ id: 'ITEM_1987', project: { id: cfg.projectId, title: 'Board' } }],
        }).runGql;
        const runGql = async (q, v) => {
          if (q.includes('updateProjectV2ItemFieldValue')) {
            assert.equal(
              readDecompositionRecords(body).publication?.status,
              'pending',
              'intent before provider mutation'
            );
            if (v.field === cfg.fieldEstimate || v.fieldId === cfg.fieldEstimate)
              board.estimate = v.val;
            if (v.field === cfg.sizeFieldId || v.fieldId === cfg.sizeFieldId) board.size = 'M';
            writes++;
          }
          return base(q, v);
        };
        const deps = estimationPublicationFixture({
          cfg,
          issueNumber: 1987,
          getBody: () => body,
          setBody: (b) => (body = b),
          getProject: () => board,
          getForecast: () =>
            estimationObservation({
              estimate: null,
              size: null,
              recordId: null,
              proposals: [],
              observedProjections: [],
            }),
        });
        const result = await tetherIssueToProject({
          cfg,
          issueNumber: 1987,
          estimate: hours,
          size: 'M',
          runGql,
          deps,
        });
        assert.equal(result.itemId, 'ITEM_1987');
        assert.equal(board.estimate, hours);
        assert.equal(parseIssueFieldDb(body).values.estimate, hours);
        const r = readDecompositionRecords(body);
        assert.equal(r.publication.status, 'complete');
        assert.equal(r.publication.writerId, 'project-tether');
        assert.equal(r.assessment.estimate.hours, hours);
        assert.match(body, new RegExp(`state="${state}"`));
        assert.equal(writes, 1);
      });

  for (const fail of ['estimate', 'size', 'fields'])
    test(`actual tether reconciles unknown ${fail} effect on exact retry without duplicating confirmed writes`, async () => {
      let body = estimationIssueBody({ estimate: 10, size: 'S' }),
        board = { estimate: 10, size: 'S' },
        failed = false,
        counts = { estimate: 0, size: 0, fields: 0 };
      const base = makeRunner({
        issueSideItems: [{ id: 'ITEM_1987', project: { id: cfg.projectId } }],
      }).runGql;
      const runGql = async (q, v) => {
        const result = await base(q, v);
        if (q.includes('updateProjectV2ItemFieldValue')) {
          const field =
            v.field === cfg.fieldEstimate
              ? 'estimate'
              : v.field === cfg.sizeFieldId
                ? 'size'
                : null;
          if (field) {
            board[field] = field === 'estimate' ? v.val : 'M';
            counts[field]++;
            if (field === fail && !failed) {
              failed = true;
              throw new Error('unknown provider outcome');
            }
          }
        }
        return result;
      };
      const deps = estimationPublicationFixture({
        cfg,
        issueNumber: 1987,
        getBody: () => body,
        setBody: (b) => {
          const changed =
            parseIssueFieldDb(b).values.estimate !== parseIssueFieldDb(body).values.estimate;
          body = b;
          if (changed) {
            counts.fields++;
            if (fail === 'fields' && !failed) {
              failed = true;
              throw new Error('unknown body outcome');
            }
          }
        },
        getProject: () => board,
        getForecast: () =>
          estimationObservation({
            estimate: null,
            size: null,
            recordId: null,
            proposals: [],
            observedProjections: [],
          }),
      });
      const args = { cfg, issueNumber: 1987, estimate: 25, size: 'M', runGql, deps };
      await assert.rejects(() => tetherIssueToProject(args), /estimate-partial/);
      assert.equal(readDecompositionRecords(body).publication.status, 'pending');
      await tetherIssueToProject(args);
      assert.equal(readDecompositionRecords(body).publication.status, 'complete');
      assert.deepEqual(counts, { estimate: 1, size: 1, fields: 1 });
    });

  for (const state of ['backlog', 'refine'])
    for (const hours of [23, 24, 25])
      test(`actual refine ${state} 10→${hours} owns field and rationale effects and retains its one legal edge`, async () => {
        let body =
            estimationIssueBody({ priority: 'P1', estimate: 10, size: 'M', rank: 3 }) +
            `<!-- aitm-last-known-state state="${state}" ts="2026-10-11T12:00:00Z" -->\n`,
          board = { estimate: 10, size: 'M' },
          promotions = 0;
        const base = makeRunner({
          issueSideItems: [{ id: 'ITEM_1987', project: { id: cfg.projectId } }],
        }).runGql;
        const runGql = async (q, v) => {
          const result = await base(q, v);
          if (q.includes('updateProjectV2ItemFieldValue')) {
            assert.equal(readDecompositionRecords(body).publication.status, 'pending');
            if (v.field === cfg.fieldEstimate) board.estimate = v.val;
            if (v.field === cfg.sizeFieldId) board.size = 'M';
          }
          return result;
        };
        const deps = estimationPublicationFixture({
          cfg,
          issueNumber: 1987,
          getBody: () => body,
          setBody: (b) => (body = b),
          getProject: () => board,
          getForecast: () =>
            estimationObservation({
              estimate: null,
              size: null,
              recordId: null,
              proposals: [],
              observedProjections: [],
            }),
        });
        const result = await runRefine({
          cfg,
          args: {
            issueNumber: 1987,
            size: 'M',
            estimate: String(hours),
            priority: 'p1',
            reason: 'current architecture',
            rank: 3,
          },
          deps: {
            ...deps,
            assertBound: () => {},
            fetchBody: async () => body,
            tetherIssueToProject: (args) =>
              actualTether({ ...args, runGql, deps: args.deps ?? deps }),
            mutateBody: async ({ mutate }) => {
              assert.equal(
                readDecompositionRecords(body).publication?.status,
                'pending',
                'refinement body remains under its owner'
              );
              body = mutate(body);
            },
            verbPromote: async () => {
              promotions++;
            },
          },
        });
        assert.equal(result.status, 'refined');
        assert.equal(promotions, 1);
        const r = readDecompositionRecords(body);
        assert.equal(r.publication.status, 'complete');
        assert.equal(r.publication.writerId, 'refine');
        assert.equal(r.assessment.estimate.hours, hours);
        assert.match(body, /aitm-refinement-rationale/);
      });

  test('tether refuses an unsupported estimate edit observed after pending intent and preserves it', async () => {
    let body = estimationIssueBody({ estimate: 10, size: 'M' }),
      board = { estimate: 10, size: 'M' },
      edited = false,
      writes = 0;
    const base = makeRunner({
      issueSideItems: [{ id: 'ITEM_1987', project: { id: cfg.projectId } }],
    }).runGql;
    const runGql = async (q, v) => {
      if (q.includes('updateProjectV2ItemFieldValue')) {
        writes++;
        if (v.field === cfg.fieldEstimate) board.estimate = v.val;
      }
      return base(q, v);
    };
    const deps = estimationPublicationFixture({
      cfg,
      issueNumber: 1987,
      getBody: () => body,
      setBody: (b) => {
        body = b;
        if (!edited && readDecompositionRecords(body).publication?.status === 'pending') {
          board.estimate = 99;
          edited = true;
        }
      },
      getProject: () => board,
      getForecast: () =>
        estimationObservation({
          estimate: null,
          size: null,
          recordId: null,
          proposals: [],
          observedProjections: [],
        }),
    });
    await assert.rejects(
      () => actualTether({ cfg, issueNumber: 1987, estimate: 25, size: 'M', runGql, deps }),
      /drift/
    );
    assert.equal(board.estimate, 99);
    assert.equal(writes, 0);
    assert.equal(parseIssueFieldDb(body).values.estimate, 10);
    assert.equal(readDecompositionRecords(body).publication.status, 'pending');
  });
}
