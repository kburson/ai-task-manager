import { migrateProjectIssue } from '../../../../gh/migrate-project.mjs';
import { bindProjectIssue } from '../../../../maintenance/bind-issues-to-new-project.mjs';
// @story #1988 — real bulk-migration field adapter and truthful transport recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publishMigrationFields,
  withMigrationIssueOwner,
  copyInitialMigrationFields,
} from '../../../../task-tracker/lib/decomposition-migration-writer.mjs';
import {
  estimationPublicationFixture,
  estimationIssueBody,
  estimationObservation,
} from '../../../fixtures/estimation-publication.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { parseIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
const cfg = {
  repo: 'o/r',
  projectId: 'PVT_a',
  kanbanFieldId: 'STATUS',
  fieldIds: { estimate: 'EST', size: 'SIZE', priority: 'PRIORITY' },
};
const fieldDefs = [
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'priority', name: 'Priority', type: 'single_select' },
];
function fixture({ state = 'develop', fail = null, bodyEstimate = 10 } = {}) {
  let body =
    estimationIssueBody({ estimate: bodyEstimate, size: 'M', priority: 'P1' }) +
    `<!-- aitm-last-known-state state="${state}" ts="2026-10-11T12:00:00Z" -->\n`;
  const board = { estimate: 10, size: 'M', priority: 'P1' },
    calls = [];
  const publication = estimationPublicationFixture({
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
  let failed = false;
  return {
    get body() {
      return body;
    },
    board,
    calls,
    args: {
      cfg,
      issueNumber: 1987,
      itemId: 'ITEM_1987',
      fieldDefs,
      optionMap: {},
      values: { estimate: 25, size: 'L', priority: 'P1' },
      deps: {
        ...publication,
        writeProjectFieldValue: async ({ fieldId, value }) => {
          assert.equal(readDecompositionRecords(body).publication?.status, 'pending');
          const field = fieldDefs.find((f) => cfg.fieldIds[f.key] === fieldId).key;
          board[field] = value.number ?? value.singleSelectOptionName;
          calls.push(field);
          if (fail === field && !failed) {
            failed = true;
            throw new Error('outcome unknown');
          }
        },
      },
    },
  };
}
export function registerMigrationPublicationCases() {
  test('migration explicit null Estimate is a confirmed clear rather than an encoding-only write', async () => {
    const f = fixture();
    f.args.values = { estimate: null, size: 'M' };
    let clears = 0;
    f.args.deps.clearProjectFieldValue = async ({ fieldId }) => {
      assert.equal(readDecompositionRecords(f.body).publication?.status, 'pending');
      assert.equal(fieldId, 'EST');
      clears++;
      f.board.estimate = null;
      return true;
    };
    const result = await publishMigrationFields(f.args);
    assert.equal(result.status, 'recorded', result.reason ?? 'explicit clear was not published');
    assert.equal(clears, 1);
    assert.equal(f.board.estimate, null);
    assert.equal(parseIssueFieldDb(f.body).values.estimate, null);
    assert.equal(readDecompositionRecords(f.body).assessment.estimate.basis, 'unset');
    assert.equal(
      readDecompositionRecords(f.body).assessment.capabilities.includes('scoped-implementation'),
      false
    );
  });
  for (const [writer, run] of [
    ['migrate-project', migrateProjectIssue],
    ['bind-issues-to-new-project', bindProjectIssue],
  ])
    for (const state of ['backlog', 'ready-for-plan', 'develop', 'review'])
      for (const estimate of [23, 24, 25])
        test(`real ${writer} entry adapter ${state} confirms canonical body ${estimate} against old board 10`, async () => {
          const f = fixture({ state, bodyEstimate: estimate }),
            write = f.args.deps.writeProjectFieldValue;
          let status = state;
          const deps = {
            ...f.args.deps,
            fetchIssueBody: async () => ({ body: f.body }),
            projectValuesForIssue: async () => ({ ...f.board }),
            writeProjectFieldValue: async (args) => {
              if (args.fieldId === 'STATUS') {
                assert.equal(readDecompositionRecords(f.body).publication?.status, 'pending');
                status =
                  args.value.singleSelectOptionName === 'Ready for Planning'
                    ? 'ready-for-plan'
                    : args.value.singleSelectOptionName.toLowerCase();
                return true;
              }
              return write(args);
            },
          };
          const result = await run({
            cfg,
            oldCfg: cfg,
            issue: { number: 1987, id: 'I_1987', state: 'open' },
            fieldDefs,
            optionMap: {},
            deps,
          });
          assert.equal(result.status, 'recorded', result.reason ?? result.error);
          assert.equal(f.board.estimate, estimate);
          assert.equal(status, state);
          assert.equal(readDecompositionRecords(f.body).publication.writerId, writer);
          assert.equal(readDecompositionRecords(f.body).publication.status, 'complete');
        });
  test('initial migration copy preserves an older pending publication without creating history or admission', async () => {
    const f = fixture();
    const interrupted = await publishMigrationFields({
      ...f.args,
      beforeEffects: () => {
        throw new Error('interrupted');
      },
    });
    assert.equal(interrupted.status, 'partial');
    const before = readDecompositionRecords(f.body);
    let added = 0,
      itemId = null;
    const target = { ...cfg, projectId: 'PVT_new' };
    const deps = {
      ...f.args.deps,
      addIssueToProject: async () => {
        added++;
        itemId = 'ITEM_new';
        return itemId;
      },
      projectItemForIssue: async () => ({ itemId }),
      projectValuesForIssue: async () => f.board,
    };
    const copy = await withMigrationIssueOwner({ issueNumber: 1987, deps }, () =>
      copyInitialMigrationFields({
        cfg: target,
        issueNumber: 1987,
        issueId: 'I_1987',
        body: f.body,
        values: { estimate: 10, size: 'M', priority: 'P1' },
        fieldDefs,
        optionMap: {},
        deps,
      })
    );
    assert.equal(copy.status, 'copied', copy.reason);
    assert.equal(added, 1);
    assert.deepEqual(readDecompositionRecords(f.body), before);
    assert.equal(parseIssueFieldDb(f.body).values.estimate, 10);
  });
  test('initial migration copy refuses a changed Estimate before adding membership', async () => {
    const f = fixture();
    let added = 0;
    const deps = {
      ...f.args.deps,
      addIssueToProject: async () => {
        added++;
        return 'ITEM_new';
      },
    };
    const result = await withMigrationIssueOwner({ issueNumber: 1987, deps }, () =>
      copyInitialMigrationFields({
        cfg,
        issueNumber: 1987,
        issueId: 'I_1987',
        body: f.body,
        values: f.args.values,
        fieldDefs,
        optionMap: {},
        deps,
      })
    );
    assert.equal(result.status, 'refused');
    assert.equal(added, 0);
    assert.equal(f.calls.length, 0);
  });
  test('actual migration reconciles its canonical body value without granting authority to the conflicting initial projection', async () => {
    const f = fixture({ bodyEstimate: 25 });
    f.args.values.size = 'M';
    const result = await publishMigrationFields(f.args);
    assert.equal(result.status, 'recorded', result.reason);
    assert.equal(f.board.estimate, 25);
    assert.equal(readDecompositionRecords(f.body).publication.status, 'complete');
    assert.equal(readDecompositionRecords(f.body).assessment.status, 'must-decompose');
  });
  for (const state of [
    'backlog',
    'refine',
    'ready-for-plan',
    'plan',
    'develop',
    'test',
    'review',
    'done',
  ])
    for (const estimate of [23, 24, 25])
      test(`actual project-migration ${state} 10→${estimate} owns Estimate before field-sync effects`, async () => {
        const f = fixture({ state });
        f.args.values.estimate = estimate;
        const result = await publishMigrationFields(f.args);
        assert.equal(result.status, 'recorded', result.reason);
        assert.equal(f.board.estimate, estimate);
        assert.equal(parseIssueFieldDb(f.body).values.estimate, estimate);
        assert.equal(readDecompositionRecords(f.body).publication.writerId, 'migrate-project');
        assert.equal(readDecompositionRecords(f.body).publication.status, 'complete');
        assert.match(f.body, new RegExp(`state="${state}"`));
      });
  for (const effect of ['estimate', 'size'])
    test(`actual project-migration resumes unknown ${effect} without duplicate confirmed writes`, async () => {
      const f = fixture({ fail: effect });
      assert.equal((await publishMigrationFields(f.args)).status, 'partial');
      const result = await publishMigrationFields(f.args);
      assert.equal(result.status, 'recorded', result.reason);
      assert.equal(f.calls.filter((c) => c === effect).length, 1);
      assert.equal(f.board.estimate, 25);
    });
}
