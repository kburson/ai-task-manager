// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTimingSingletonMarkdown } from '../../../../task-tracker/gh-timing-comment.mjs';
import { formatRollupSummaryLines, timingFieldProjection } from '../../../../gh/log-issue-time.mjs';
import * as timingCli from '../../../../gh/log-issue-time.mjs';
import { renderSingletonProjectionRecord } from '../../../../task-tracker/lib/github-records/singleton-projections.mjs';

const totals = {
  rowCount: 2,
  totalActiveSec: null,
  totalIdleSec: null,
  engagedSec: null,
  planMin: null,
  knownEngagedSec: 120,
  telemetry: { status: 'incomplete', reasons: ['legacy-attribution-unknown'] },
};
test('timing singleton renders Unknown totals and the known lower bound', () => {
  const text = renderTimingSingletonMarkdown({
    timingBody: 'Timing evidence',
    timingProjection: { schema: 'aitm.timing-projection/v1', revision: 1, totals },
  });
  assert.match(text, /Unknown/);
  assert.match(text, /120/);
  assert.match(text, /legacy-attribution-unknown/);
  assert.doesNotMatch(text, /null/);
});
test('operator timing summary never renders unavailable values as null or zero', () => {
  const text = formatRollupSummaryLines({
    engagedMin: null,
    totalActiveMin: null,
    reviewMin: null,
    planMin: null,
    thresholdMin: 5,
    knownEngagedSec: 120,
    telemetry: totals.telemetry,
  }).join(String.fromCharCode(10));
  assert.match(text, /Unknown/);
  assert.match(text, /120/);
  assert.doesNotMatch(text, /null/);
});
test('board projection keeps null authoritative totals and explicit Unknown display', () => {
  const projection = timingFieldProjection({
    ...totals,
    engagedMin: null,
    totalActiveMin: null,
    reviewMin: null,
    reviewSec: null,
  });
  assert.deepEqual(projection.values, {
    engagedTime: null,
    sessionTime: null,
    reviewTime: null,
    planTime: null,
  });
  assert.deepEqual(projection.unknownFields, [
    'engagedTime',
    'sessionTime',
    'reviewTime',
    'planTime',
  ]);
  assert.equal(projection.status, 'incomplete');
  assert.equal(projection.knownEngagedSec, 120);
  assert.equal(projection.secondsByKey.planTime, null);
});
test('complete actor engagement does not make unavailable review or idle estimates zero', () => {
  const projection = timingFieldProjection({
    ...totals,
    engagedMin: 2,
    totalActiveMin: 2,
    engagedSec: 120,
    totalActiveSec: 120,
    reviewMin: null,
    reviewSec: null,
    planMin: 0,
    telemetry: { status: 'complete', reasons: [] },
  });
  assert.equal(projection.values.engagedTime, 2);
  assert.deepEqual(projection.unknownFields, ['reviewTime']);
  assert.equal(projection.secondsByKey.planTime, 0);
});
test('board publication resolves fallback field IDs and writes Unknown once without clearing', async () => {
  const writes = [];
  const projection = timingFieldProjection({
    ...totals,
    engagedMin: null,
    totalActiveMin: null,
    reviewMin: null,
    reviewSec: null,
  });
  await timingCli.publishTimingBoardFields({
    cfg: { projectId: 'PVT_test' },
    itemId: 'PVTI_test',
    fieldDefs: [],
    values: projection.values,
    projection,
    resolvedFieldIds: {
      engagedTime: 'F_engaged',
      sessionTime: 'F_session',
      reviewTime: 'F_review',
      planTime: 'F_plan',
    },
    write: async (value) => writes.push(value),
  });
  assert.equal(writes.length, 4);
  assert.deepEqual(writes.map((entry) => entry.fieldId).sort(), [
    'F_engaged',
    'F_plan',
    'F_review',
    'F_session',
  ]);
  for (const entry of writes)
    assert.deepEqual(entry.value, { text: 'Unknown (canonical timing evidence incomplete)' });
});
test('board publication preserves transport failures instead of claiming telemetry success', async () => {
  const projection = timingFieldProjection({
    ...totals,
    engagedMin: null,
    totalActiveMin: null,
    reviewMin: null,
    reviewSec: null,
  });
  await assert.rejects(
    () =>
      timingCli.publishTimingBoardFields({
        cfg: { projectId: 'PVT_test' },
        itemId: 'PVTI_test',
        fieldDefs: [],
        values: projection.values,
        projection,
        resolvedFieldIds: { engagedTime: 'F_engaged' },
        write: async () => {
          throw new Error('provider unavailable');
        },
      }),
    /provider unavailable/
  );
});
test('canonical singleton visible projection preserves Unknown and lower-bound provenance', () => {
  const body = renderSingletonProjectionRecord({
    repository: 'owner/repo',
    issue: 1857,
    kind: 'timing',
    projection: { schema: 'aitm.timing-projection/v1', revision: 1, totals },
    actor: 'codex/test',
    grantId: '01J00000000000000000000001',
    epoch: 1,
    recordId: '01J00000000000000000000002',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  assert.match(body, /Active seconds: Unknown/);
  assert.match(body, /Engaged seconds: Unknown/);
  assert.match(body, /Known engagement lower bound: 120 seconds/);
  assert.match(body, /Unavailable: legacy-attribution-unknown/);
});
