// @story #1992 — catches excluded timing/heal/encoding callers erasing pending Estimate intent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import {
  fixture,
  subject,
  publication,
  freshUnitDir,
} from './decomposition-authority-fixtures.mjs';
import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import {
  readDecompositionRecords,
  replaceDecompositionRecords,
} from '../../../../task-tracker/lib/decomposition-records.mjs';
import {
  parseIssueFieldDb,
  stripIssueFieldDb,
  FIELD_DB_START,
  FIELD_DB_END,
} from '../../../../task-tracker/issue-field-db.mjs';
import { migrateOne } from '../../../../task-tracker/migrate-fields-encoding.mjs';
import { healIssue } from '../../../../task-tracker/heal-backlog.mjs';
import { publishTimingBoardFields } from '../../../../gh/log-issue-time.mjs';
import { loadProjectFieldDefs } from '../../../../task-tracker/project-fields.mjs';
async function pendingCase() {
  const f = fixture(10),
    dir = freshUnitDir('composition-preservation-');
  f.values.forecast = { estimate: null, size: null, recordId: null, proposals: [] };
  const cfg = {
    repo: 'o/r',
    projectId: 'PVT_a',
    fieldIds: {
      estimate: 'EST',
      size: 'SIZE',
      disposition: 'DISP',
      engagedTime: 'ENG',
      sessionTime: 'SES',
      reviewTime: 'REV',
      planTime: 'PLAN',
    },
  };
  const runtime = createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps });
  const before = await runtime.collect(subject);
  f.body = replaceDecompositionRecords(f.body, {
    assessment: null,
    publication: publication(before.inputDigest),
  });
  await runtime.refresh(subject);
  return { f, dir, cfg, runtime, records: readDecompositionRecords(f.body) };
}
export function registerDecompositionPreservationCases() {
  test('real encoding migration preserves pending intent and exact Estimate through a genuine legacy block', async () => {
    const c = await pendingCase();
    try {
      const fields = parseIssueFieldDb(c.f.body).values;
      c.f.body =
        stripIssueFieldDb(c.f.body) +
        '\n' +
        [
          FIELD_DB_START,
          String.fromCharCode(96).repeat(3) + 'json',
          JSON.stringify({ schema: 1, values: fields }),
          String.fromCharCode(96).repeat(3),
          FIELD_DB_END,
        ].join('\n');
      let writes = 0;
      await migrateOne(
        { repo: 'o/r', issueNumber: 1987, dry: false },
        {
          fetchBody: async () => c.f.body,
          writeBody: async ({ body }) => {
            writes++;
            c.f.body = body;
          },
          out() {},
        }
      );
      assert.equal(writes, 1);
      assert.equal(parseIssueFieldDb(c.f.body).values.estimate, 10);
      assert.deepEqual(readDecompositionRecords(c.f.body), c.records);
      assert.equal((await c.runtime.collect(subject)).assessment.status, 'pending');
      await migrateOne(
        { repo: 'o/r', issueNumber: 1987, dry: false },
        {
          fetchBody: async () => c.f.body,
          writeBody: async () => {
            writes++;
          },
          out() {},
        }
      );
      assert.equal(writes, 1);
    } finally {
      rmSync(c.dir, { recursive: true, force: true });
    }
  });
  test('real backlog heal changes timing without changing static Estimate or pending admission', async () => {
    const c = await pendingCase();
    try {
      const result = healIssue({
        body: c.f.body,
        timingCommentBody:
          '| Timestamp | Event | Active | Idle | Words | Marker | Description |\n|---|---|---|---|---|---|---|\n| 2026-10-12 12:00 -05:00 | start | 0 | 0 | 0 | 0 | fixture |\n| 2026-10-12 12:01 -05:00 | update | 1 | 0 | 0 | 0 | checkpoint |',
        fieldDefs: loadProjectFieldDefs(),
        now: () => '2026-10-12T22:00:00Z',
      });
      assert.equal(result.skipped, false);
      assert.equal(result.values.estimate, 10);
      assert.deepEqual(readDecompositionRecords(result.body), c.records);
      c.f.body = result.body;
      assert.equal((await c.runtime.collect(subject)).assessment.status, 'pending');
    } finally {
      rmSync(c.dir, { recursive: true, force: true });
    }
  });
  test('actual timing board projection ignores stale Estimate and unknown non-timing fields beside real pending intent', async () => {
    const c = await pendingCase();
    try {
      const writes = [];
      const board = { estimate: 25, disposition: 'Delivered', sessionTime: 9 };
      await publishTimingBoardFields({
        cfg: c.cfg,
        itemId: 'PVTI_a',
        fieldDefs: loadProjectFieldDefs(),
        values: {
          estimate: 10,
          disposition: 'BLOCKED',
          engagedTime: 0,
          sessionTime: null,
          reviewTime: 0,
          planTime: 0,
        },
        projection: {
          secondsByKey: { engagedTime: 0, sessionTime: null, reviewTime: 0, planTime: 0 },
          unknownFields: ['estimate', 'disposition', 'sessionTime'],
        },
        write: async (effect) => {
          writes.push(effect);
          if (effect.fieldId === 'EST') board.estimate = effect.value.number ?? effect.value.text;
          if (effect.fieldId === 'DISP')
            board.disposition = effect.value.singleSelectOptionName ?? effect.value.text;
        },
      });
      assert.deepEqual(writes.map((effect) => effect.fieldId).sort(), [
        'ENG',
        'PLAN',
        'REV',
        'SES',
      ]);
      assert.deepEqual(board, { estimate: 25, disposition: 'Delivered', sessionTime: 9 });
      assert.deepEqual(readDecompositionRecords(c.f.body), c.records);
      assert.equal((await c.runtime.collect(subject)).assessment.status, 'pending');
    } finally {
      rmSync(c.dir, { recursive: true, force: true });
    }
  });
}
