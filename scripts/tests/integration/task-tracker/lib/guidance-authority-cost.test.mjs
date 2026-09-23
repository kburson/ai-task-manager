// @story #1770
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import prettier from 'prettier';

import { buildAuthorityAfterReport } from '../../../helpers/guidance-authority-after.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const FIXTURES = path.join(ROOT, 'scripts/tests/fixtures/1558');
const source = (name) => readFileSync(path.join(FIXTURES, name));
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('pairs separate Explain and executor attempts with equal physical authority reads', async () => {
  const timingBytes = source('authority-after-timing.json');
  const report = await buildAuthorityAfterReport({ timingBytes });
  assert.equal(report.schema, 'aitm.guidance-authority-after/v1');
  assert.equal(report.classification, 'fixed-stub-collection-and-controlled-live-timing');
  assert.deepEqual(
    report.deterministic.actions.map(({ id }) => id),
    ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close']
  );
  for (const action of report.deterministic.actions) {
    assert.equal(action.pairedEqual, true, action.id);
    assert.ok(action.explain.physicalReads > 0, action.id);
    assert.deepEqual(action.explain, action.executor, action.id);
    assert.equal(action.explain.requestKeys.length, action.explain.physicalReads, action.id);
    assert.equal(new Set(action.explain.requestKeys).size, action.explain.physicalReads, action.id);
    assert.equal(
      Object.values(action.explain.perResource).reduce((sum, count) => sum + count, 0),
      action.explain.physicalReads,
      action.id
    );
    assert.equal(action.explain.retryCount, 0, action.id);
    assert.equal(action.explain.additionalPageCount, 0, action.id);
    assert.equal(
      action.explain.requestKeys.some((key) => key.startsWith('workflow-policy:')),
      false
    );
    assert.ok(action.explain.physicalReads * 5 <= action.ciRequestCeiling * 4, action.id);
  }
  assert.equal(
    report.deterministic.totals.explainPhysicalReads,
    report.deterministic.totals.executorPhysicalReads
  );
  assert.equal(report.deterministic.separateInvocations.collectionCount, 2);
  assert.equal(report.deterministic.sameInvocationDiagnostic.extraPhysicalReads, 0);
});

test('isolates named refresh, waivable policy enrichment, and post-success annotation effects', async () => {
  const report = await buildAuthorityAfterReport({
    timingBytes: source('authority-after-timing.json'),
  });
  assert.deepEqual(report.deterministic.namedRefresh, {
    resource: 'issue-body',
    physicalReadsBefore: 1,
    physicalReadsAfter: 2,
    reason: 'explicit-refresh-request',
  });
  assert.deepEqual(report.deterministic.workflowPolicy, {
    readyBaselinePhysicalReads: 0,
    waivableFailurePhysicalReads: 1,
    requirementIds: ['approval.plan'],
    unrelatedRequirementReads: 0,
  });
  assert.deepEqual(report.deterministic.postSuccessAnnotation, {
    ordinarySuccess: { lookups: 0, writes: 0 },
    divergedExisting: { lookups: 1, writes: 0 },
    divergedAbsent: { lookups: 1, writes: 1 },
    phase: 'after-durable-success',
  });
});

test('seals timing provenance and regenerates the committed authority artifact', async () => {
  const timingBytes = source('authority-after-timing.json');
  const report = await buildAuthorityAfterReport({ timingBytes });
  assert.equal(report.sources.timingSha256, digest(timingBytes));
  assert.equal(report.timing.localCache.kind, 'local-cache');
  assert.equal(report.timing.localStub.kind, 'local-stub');
  assert.equal(report.timing.controlledLive.kind, 'controlled-read-only');
  for (const timing of [
    report.timing.localCache,
    report.timing.localStub,
    report.timing.controlledLive,
  ]) {
    assert.ok(timing.sampleCount >= 5);
    assert.equal(timing.samplesMs.length, timing.sampleCount);
    assert.ok(timing.medianMs > 0 && timing.p95Ms >= timing.medianMs);
    assert.ok(timing.p95Ms * 5 <= timing.ciCeilingMs * 4);
  }
  assert.equal(
    source('authority-after.json').toString(),
    await prettier.format(JSON.stringify(report), { parser: 'json', printWidth: 100 })
  );
});
