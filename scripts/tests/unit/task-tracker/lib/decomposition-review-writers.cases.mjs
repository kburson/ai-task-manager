// @story #2006
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  unchangedWriterFixture,
  writerCfg as cfg,
  writerDefs as fieldDefs,
} from './decomposition-review-writers.fixtures.mjs';
import { tetherIssueToProject } from '../../../../gh/lib/project-tether.mjs';
import { publishMigrationFields } from '../../../../task-tracker/lib/decomposition-migration-writer.mjs';
import { runRefine } from '../../../../task-tracker/verbs/refine.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { parseIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';

test('real unchanged tether omits estimate and size effects after ordinary metadata sees foreign 25h/L', async () => {
  const f = unchangedWriterFixture();
  f.afterOrdinary(() => f.revise());
  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 1987,
    priority: 'P1',
    estimate: 10,
    size: 'M',
    runGql: f.runGql,
    sleep: async () => {},
    deps: f.deps,
  });
  assert.equal(result.itemId, 'ITEM_1987');
  assert.equal(f.effects.filter((field) => field === 'EST' || field === 'SIZE').length, 0);
  assert.equal(f.board.estimate, 25);
  assert.equal(f.board.size, 'L');
  assert.equal(parseIssueFieldDb(f.body).values.estimate, 25);
  assert.equal(readDecompositionRecords(f.body).publication, null);
});
for (const drift of ['ordinary-effect', 'fresh-body'])
  test('real unchanged migration refuses ' + drift + ' drift without replacing 25h/L', async () => {
    const f = unchangedWriterFixture();
    const deps = {
      ...f.deps,
      writeProjectFieldValue: async () => {
        if (drift === 'ordinary-effect') f.revise();
        return true;
      },
      mutateIssueBody: async (options) => {
        if (drift === 'fresh-body') f.revise(false);
        return mutateIssueBody({ ...options, deps: f.decomposition });
      },
    };
    const error = await publishMigrationFields({
      cfg,
      issueNumber: 1987,
      itemId: 'ITEM_1987',
      fieldDefs,
      optionMap: {},
      values: { estimate: 10, size: 'M', priority: 'P1' },
      deps,
    }).then(
      () => null,
      (e) => e
    );
    assert.equal(parseIssueFieldDb(f.body).values.estimate, 25);
    assert.equal(parseIssueFieldDb(f.body).values.size, 'L');
    assert.match(error?.message ?? 'no refusal', /project-migration:estimate-authority-changed/);
    assert.equal(readDecompositionRecords(f.body).publication, null);
  });
for (const drift of ['ordinary-effect', 'fresh-body'])
  test(
    'real unchanged Refine refuses ' +
      drift +
      ' drift before completion/snapshot and preserves 25h/L',
    async () => {
      const f = unchangedWriterFixture();
      let promotions = 0;
      if (drift === 'ordinary-effect') f.afterOrdinary(() => f.revise());
      const deps = {
        ...f.deps,
        assertBound: (issue) => assert.equal(issue, 1987),
        fetchBody: async () => f.body,
        loadProjectFieldDefs: () => fieldDefs,
        fetchLabels: async () => ['bug'],
        tetherIssueToProject: (args) =>
          tetherIssueToProject({ ...args, runGql: f.runGql, sleep: async () => {}, deps: f.deps }),
        mutateBody: async (options) => {
          if (drift === 'fresh-body') f.revise(false);
          return mutateIssueBody({ ...options, deps: f.decomposition });
        },
        verbPromote: async () => {
          promotions++;
        },
      };
      const error = await runRefine({
        cfg,
        args: {
          issueNumber: 1987,
          size: 'M',
          estimate: 10,
          priority: 'p1',
          rank: 1,
          reason: 'Refresh ordinary metadata with unchanged original fields',
          labels: null,
        },
        deps,
      }).then(
        () => null,
        (e) => e
      );
      assert.equal(parseIssueFieldDb(f.body).values.estimate, 25);
      assert.equal(parseIssueFieldDb(f.body).values.size, 'L');
      assert.match(error?.message ?? 'no refusal', /refine:estimate-authority-changed/);
      assert.equal(promotions, 0);
      assert.doesNotMatch(f.body, /aitm-refine-complete|aitm-refinement-snapshot/);
      assert.equal(f.effects.filter((field) => field === 'EST' || field === 'SIZE').length, 0);
    }
  );
