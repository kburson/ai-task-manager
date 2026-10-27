import { publishFieldEstimateRevision } from '../../../../../task-tracker/lib/decomposition-field-writer.mjs';
import { currentIssueLockOwner } from '../../../../../task-tracker/issue-mutator-lock.mjs';
// @story #2091 — omitted rank, real snapshots and exact publication retry.
// @story #1988 — actual tether/refinement composition and provider recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runRefine } from '../../../../../task-tracker/verbs/refine.mjs';
import { verifyRefinementSnapshot } from '../../../../../task-tracker/lib/refinement-snapshot.mjs';
import { estimateOperationId } from '../../../../../task-tracker/lib/estimate-writer-publication.mjs';
import {
  estimationIssueBody,
  estimationPublicationFixture,
  estimationObservation,
} from '../../../../fixtures/estimation-publication.mjs';
import { parseIssueFieldDb } from '../../../../../task-tracker/issue-field-db.mjs';
import { readDecompositionRecords } from '../../../../../task-tracker/lib/decomposition-records.mjs';
export function registerTetherPublicationCases({ cfg, makeRunner, actualTether }) {
  test('unsized initial tether preserves an absent field cache and performs no numeric setters', async () => {
    const body = '## Scope\nUnestimated initial idea.\n';
    let numeric = 0;
    const fixture = estimationPublicationFixture({
      cfg,
      issueNumber: 1987,
      getBody: () => body,
      setBody: () => {
        throw new Error('no initial body effect');
      },
      getProject: () => ({ estimate: null, size: null }),
    });
    const base = makeRunner({ projectItemOnAttempt: 2 }).runGql;
    const result = await actualTether({
      cfg,
      issueNumber: 1987,
      status: 'backlog',
      initialValues: true,
      sleep: async () => {},
      runGql: async (q, v) => {
        if (
          q.includes('updateProjectV2ItemFieldValue') &&
          [cfg.fieldEstimate, cfg.sizeFieldId].includes(v.field)
        )
          numeric++;
        return base(q, v);
      },
      deps: {
        ...fixture,
        fetchIssueBody: async () => ({ body }),
        projectValuesForIssue: async () => ({ estimate: null, size: null }),
      },
    });
    assert.equal(result.itemId, 'VISIBLE_ITEM');
    assert.equal(numeric, 0);
    assert.equal(readDecompositionRecords(body).publication, null);
  });
  const tetherIssueToProject = actualTether;
  for (const estimate of [23, 24, 25])
    test(`real creator tether initial ${estimate} preserves initial fields without publication history`, async () => {
      let body = estimationIssueBody({ estimate, size: 'M' }),
        board = { estimate: null, size: null };
      const base = makeRunner({ projectItemOnAttempt: 2 }).runGql;
      const fixture = estimationPublicationFixture({
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
      const deps = {
        ...fixture,
        fetchIssueBody: async () => ({ body }),
        projectValuesForIssue: async () => ({ ...board }),
      };
      const runGql = async (q, v) => {
        if (q.includes('mutation')) {
          assert.ok(currentIssueLockOwner(1987));
          assert.equal(readDecompositionRecords(body).publication, null);
        }
        const result = await base(q, v);
        if (q.includes('updateProjectV2ItemFieldValue')) {
          if (v.field === cfg.fieldEstimate) board.estimate = v.val;
          if (v.field === cfg.sizeFieldId) board.size = 'M';
        }
        return result;
      };
      const result = await actualTether({
        cfg,
        issueNumber: 1987,
        estimate,
        size: 'M',
        initialValues: true,
        runGql,
        sleep: async () => {},
        deps,
      });
      assert.equal(result.itemId, 'VISIBLE_ITEM');
      assert.equal(board.estimate, estimate);
      assert.equal(parseIssueFieldDb(body).values.estimate, estimate);
      assert.equal(readDecompositionRecords(body).publication, null);
      assert.equal(readDecompositionRecords(body).assessment, null);
    });
  test('nested tether preserves a foreign Estimate arriving between grouped scalar effects', async () => {
    let body = estimationIssueBody({ estimate: 10, size: 'M' }),
      board = { estimate: 10, size: 'M' },
      estimateWrites = 0;
    const fixture = estimationPublicationFixture({
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
    const base = makeRunner({
      issueSideItems: [{ id: 'ITEM_1987', project: { id: cfg.projectId } }],
    }).runGql;
    const result = await publishFieldEstimateRevision({
      cfg,
      issueNumber: 1987,
      writerId: 'project-tether',
      key: { estimate: 25 },
      estimate: 25,
      size: 'M',
      deps: fixture,
      writeField: ({ context, effectId }) =>
        actualTether({
          cfg,
          issueNumber: 1987,
          status: 'develop',
          estimate: 25,
          size: 'M',
          context,
          effectId,
          deps: fixture,
          runGql: async (q, v) => {
            const result = await base(q, v);
            if (q.includes('updateProjectV2ItemFieldValue')) {
              if (v.field === cfg.kanbanFieldId) board.estimate = 99;
              if (v.field === cfg.fieldEstimate) {
                estimateWrites++;
                board.estimate = v.val;
              }
            }
            return result;
          },
        }),
    });
    assert.equal(result.status, 'partial');
    assert.equal(board.estimate, 99);
    assert.equal(estimateWrites, 0);
    assert.equal(readDecompositionRecords(body).publication.status, 'pending');
  });
  test('nested tether refuses a foreign configured project before any provider effect', async () => {
    let body = estimationIssueBody({ estimate: 10, size: 'M' }),
      board = { estimate: 10, size: 'M' },
      effects = 0;
    const fixture = estimationPublicationFixture({
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
    const base = makeRunner({
      issueSideItems: [{ id: 'ITEM_1987', project: { id: cfg.projectId } }],
    }).runGql;
    const result = await publishFieldEstimateRevision({
      cfg,
      issueNumber: 1987,
      writerId: 'project-tether',
      key: { estimate: 25 },
      estimate: 25,
      size: 'M',
      deps: fixture,
      writeField: async ({ field, value, context, effectId }) => {
        await assert.rejects(
          () =>
            actualTether({
              cfg: { ...cfg, projectId: 'PVT_foreign' },
              issueNumber: 1987,
              estimate: 25,
              context,
              effectId,
              runGql: async (q, v) => {
                if (q.includes('mutation')) effects++;
                return base(q, v);
              },
              deps: fixture,
            }),
          /foreign-context/
        );
        board[field] = value;
      },
    });
    assert.equal(result.status, 'recorded', result.reason);
    assert.equal(effects, 0);
  });

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

  // These cases retain the real publication owner and snapshot validator. Only
  // provider I/O is simulated, so omission cannot hide behind a snapshot stub.
  const rankCases = [
    { name: 'omitted rank in changed publication', supplied: undefined, want: 3 },
    { name: 'explicit rank in changed publication', supplied: 7, want: 7 },
    {
      name: 'omitted rank in unchanged publication',
      supplied: undefined,
      want: 3,
      unchanged: true,
    },
    { name: 'null rank is omission', supplied: null, want: 3 },
    { name: 'empty rank is omission', supplied: '', want: 3 },
    { name: 'fresh persisted rank', supplied: undefined, want: 5, freshRank: 5 },
    { name: 'exact pending retry', supplied: undefined, want: 3, interrupt: true },
    { name: 'genuinely absent rank', supplied: undefined, absent: true },
  ];
  for (const scenario of rankCases)
    test(`#2091: actual refine snapshot preserves ${scenario.name}`, async () => {
      const startingEstimate = scenario.unchanged ? 3 : 1;
      let body =
          estimationIssueBody({
            priority: 'P1',
            estimate: startingEstimate,
            size: 'S',
            rank: scenario.absent ? null : 3,
          }) + '<!-- aitm-last-known-state state="refine" ts="2026-10-23T12:00:00Z" -->\n',
        board = { estimate: startingEstimate, size: 'S', rank: scenario.absent ? null : 3 },
        promotions = 0,
        bodyAttempts = 0,
        numericWrites = 0;
      const base = makeRunner({
        issueSideItems: [{ id: 'ITEM_1987', project: { id: cfg.projectId } }],
      }).runGql;
      const runGql = async (query, variables) => {
        const result = await base(query, variables);
        if (query.includes('updateProjectV2ItemFieldValue')) {
          if (variables.field === cfg.fieldEstimate) {
            numericWrites++;
            board.estimate = variables.val;
          }
          if (variables.field === cfg.sizeFieldId) board.size = 'S';
          if (variables.field === cfg.fieldRank) board.rank = variables.val;
        }
        return result;
      };
      const fixture = estimationPublicationFixture({
        cfg,
        issueNumber: 1987,
        getBody: () => body,
        setBody: (next) => (body = next),
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
      const args = {
        issueNumber: 1987,
        size: 'S',
        estimate: 3,
        priority: 'p1',
        reason: 'preserve optional rank on exact refinement retry',
        ...(scenario.supplied === undefined ? {} : { rank: scenario.supplied }),
      };
      const deps = {
        ...fixture,
        assertBound: () => {},
        fetchBody: async () => body,
        fetchLabels: async () => ['bug'],
        tetherIssueToProject: (input) =>
          actualTether({ ...input, runGql, deps: input.deps ?? fixture }),
        mutateBody: async ({ mutate }) => {
          bodyAttempts++;
          if (scenario.interrupt && bodyAttempts === 1)
            throw new Error('interrupted before refinement body effect');
          if (scenario.freshRank) {
            body = body.replace('"rank":3', '"rank":5');
            board.rank = 5;
          }
          body = mutate(body);
        },
        verbPromote: async () => {
          promotions++;
        },
      };
      let pendingId;
      if (scenario.interrupt) {
        const first = await runRefine({ args, cfg, deps });
        assert.equal(first.status, 'partial');
        assert.equal(first.reason, 'interrupted before refinement body effect');
        const pending = readDecompositionRecords(body).publication;
        assert.equal(pending.status, 'pending');
        pendingId = pending.operationId;
        // Omission remains null in the sealed intent, even though rank 3 exists.
        const intentId = estimateOperationId('refine', {
          size: 'S',
          estimate: 3,
          priority: 'p1',
          rank: null,
          reason: args.reason,
        });
        assert.equal(
          pending.effects.find((effect) => effect.id === 'writer-before-values').targetIdentity,
          `${cfg.repo}#1987:estimate-before:${intentId}`
        );
        assert.equal(promotions, 0);
      }
      const result = await runRefine({ args, cfg, deps });
      if (scenario.absent) {
        assert.equal(result.status, 'partial');
        assert.equal(result.reason, 'refinement-snapshot:field-rank');
        assert.equal(promotions, 0);
        assert.equal(parseIssueFieldDb(body).values.rank, null);
        assert.equal(readDecompositionRecords(body).publication.status, 'pending');
        assert.equal(verifyRefinementSnapshot(body, { labels: ['bug'] }).ok, false);
        return;
      }
      assert.equal(result.status, 'refined', result.reason);
      assert.equal(promotions, 1);
      assert.equal(parseIssueFieldDb(body).values.rank, scenario.want);
      assert.equal(board.rank, scenario.want);
      const snapshot = verifyRefinementSnapshot(body, { labels: ['bug'] });
      assert.equal(snapshot.ok, true, snapshot.reason);
      assert.equal(snapshot.snapshot.fields.rank, scenario.want);
      const publication = readDecompositionRecords(body).publication;
      if (scenario.unchanged) {
        assert.equal(publication, null);
        assert.equal(numericWrites, 0);
      } else {
        assert.equal(publication.status, 'complete');
        assert.equal(publication.writerId, 'refine');
        assert.equal(numericWrites, 1);
        if (scenario.interrupt) assert.equal(publication.operationId, pendingId);
      }
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
