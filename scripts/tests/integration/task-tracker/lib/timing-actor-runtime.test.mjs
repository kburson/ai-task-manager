// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEstimationOutcomeRuntime } from '../../../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { canonicalTestReceiptFixture } from '../../../fixtures/estimation-verification.mjs';
import { timingActorKey, timingActorMarker } from '../../../../task-tracker/lib/timing-actor.mjs';
const issue = 1857,
  repository = 'owner/repo',
  sha = 'a'.repeat(40),
  forecastId = '01J00000000000000000000800';
function harness() {
  const key = timingActorKey({ provider: 'codex', sid: 'runtime-author' });
  let timingBody =
    '⏱ Timing Log\n\n' +
    [
      '| 2026-10-01 00:00:00 +00:00 | develop:started | | | | 0 | phase |',
      '| 2026-10-01 00:00:01 +00:00 | start | | | | 0 | legacy |',
      '| 2026-10-01 00:01:00 +00:00 | pause | Unknown | Unknown | 12 | 112 | work | 1020 |' +
        timingActorMarker(key) +
        ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=100 wend=112 fstart=1000 fend=1020 -->',
    ].join('\n') +
    '\n';
  const records = [
    {
      commentNodeId: 'IC_forecast',
      envelope: {
        recordType: 'estimation-forecast',
        recordId: forecastId,
        repository,
        issue,
        supersedes: null,
        payload: { issue, plan: { humanHours: 4 }, ai: { p50EngagedHours: 4, p80EngagedHours: 6 } },
      },
    },
  ];
  let sourceReads = 0;
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: repository },
    projectDir: process.cwd(),
    resolveVerificationSha: () => sha,
    deps: {
      childOutcomeRecordIds: async () => ({ childCount: 0, recordIds: [] }),
      recordIo: {
        graphql: async () => {
          throw new Error('unexpected');
        },
        listIssueRecords: async () => structuredClone(records),
        write: async ({ envelope }) => {
          const record = { commentNodeId: 'IC_outcome', envelope };
          records.push(record);
          return record;
        },
      },
      readTimingCommentBody: async () => ({ status: 'found', body: timingBody }),
      readCanonicalTimingSource: async () => {
        sourceReads++;
        return {
          status: 'found',
          source: { repository, issue, commentNodeId: 'IC_timing', body: timingBody },
        };
      },
      readDiffEvidence: async () => ({
        verificationSha: sha,
        commitSha: sha,
        filesChanged: 1,
        modules: ['timing'],
        lanes: ['unit'],
        dependencyBreadth: 0,
      }),
    },
  });
  return {
    runtime,
    records,
    setTiming: (value) => {
      timingBody = value;
    },
    getTiming: () => timingBody,
    getSourceReads: () => sourceReads,
  };
}
test('runtime persists incomplete outcome with canonical Test proof then reuses it after valid close tail', async () => {
  const h = harness();
  const body = canonicalTestReceiptFixture({ issue }).body;
  const result = await h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body });
  assert.equal(result.status, 'written');
  assert.equal(result.record.envelope.payload.telemetry.status, 'incomplete');
  assert.ok(h.getSourceReads() >= 2);
  const original = result.record.envelope.payload;
  h.setTiming(
    h.getTiming() + '| 2026-10-01 00:02:00 +00:00 | review:approved | | | | 112 | canonical |\n'
  );
  const retry = await h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body });
  assert.equal(retry.status, 'existing');
  assert.equal(retry.recordId, result.recordId);
  assert.deepEqual(retry.record.envelope.payload, original);
  h.setTiming(h.getTiming().replace('legacy', 'changed'));
  await assert.rejects(() =>
    h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body })
  );
});
test('incomplete runtime refuses missing or wrong-head Test proof and wrong forecast', async () => {
  for (const body of ['', canonicalTestReceiptFixture({ issue, sha: 'b'.repeat(40) }).body]) {
    const h = harness();
    await assert.rejects(
      () => h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body }),
      new RegExp('verification-receipt')
    );
    assert.equal(h.records.length, 1);
  }
  const h = harness();
  await assert.rejects(() =>
    h.runtime.ensure({
      issueNumber: issue,
      forecastRecordId: '01J00000000000000000000899',
      body: canonicalTestReceiptFixture({ issue }).body,
    })
  );
  assert.equal(h.records.length, 1);
});

test('closed actor engagement before Develop is not dropped from completion totals', async () => {
  const h = harness();
  const actor = timingActorMarker(timingActorKey({ provider: 'codex', sid: 'early-author' }));
  h.setTiming(
    '⏱ Timing Log\n\n' +
      [
        '| 2026-10-01 00:00:00 +00:00 | refine:started | | | | 0 | phase |',
        '| 2026-10-01 00:00:30 +00:00 | pause | Unknown | Unknown | 5 | 5 | early work |' +
          actor +
          ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812830000 active=unknown wstart=0 wend=5 fstart=unknown fend=unknown -->',
        '| 2026-10-01 00:00:30 +00:00 | develop:started | | | | 0 | phase |',
        '| 2026-10-01 00:01:30 +00:00 | pause | Unknown | Unknown | 5 | 10 | later work |' +
          actor +
          ' <!-- aitm-engagement:v1 start=1790812830000 end=1790812890000 active=unknown wstart=5 wend=10 fstart=unknown fend=unknown -->',
      ].join('\n') +
      '\n'
  );
  const result = await h.runtime.ensure({
    issueNumber: issue,
    forecastRecordId: forecastId,
    body: canonicalTestReceiptFixture({ issue }).body,
  });
  assert.equal(h.records.at(-1).envelope.payload.schema, 'aitm.estimation-outcome/v2');
  assert.equal(result.record.envelope.payload.telemetry.knownEngagedMs, 90000);
  assert.ok(
    result.record.envelope.payload.telemetry.reasons.includes('engagement-outside-outcome-stages')
  );
});

// @story #1857
import { assertFieldsPersisted } from '../../../../task-tracker/verbs/close.mjs';
function closeBody(receiptSha = sha) {
  return (
    canonicalTestReceiptFixture({ issue, sha: receiptSha }).body +
    '\n<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="' +
    forecastId +
    '" -->\n<!-- aitm-fields: {"schema":1,"values":{"engagedTime":null}} -->\n'
  );
}
test('Close accepts unknown totals only through real canonical runtime verification', async () => {
  const h = harness();
  const result = await assertFieldsPersisted({
    cfg: { repo: repository },
    issueNum: issue,
    pexec: async () => ({ stdout: closeBody() }),
    estimationOutcomeWriter: h.runtime,
    acceptedSha: sha,
  });
  assert.equal(result.status, 'incomplete-telemetry-accepted');
  assert.equal(h.records.at(-1).envelope.payload.telemetry.knownEngagedMs, 60000);
  assert.ok(h.getSourceReads() >= 2);
});
test('Close refuses caller unavailable flags, wrong linkage and failed verification', async () => {
  for (const overrides of [
    { telemetryUnavailable: true, estimationOutcomeWriter: undefined },
    {
      estimationOutcomeWriter: {
        ensure: async () => ({ status: 'existing', telemetryUnavailable: true }),
      },
    },
    { acceptedSha: 'b'.repeat(40) },
    { pexec: async () => ({ stdout: closeBody('b'.repeat(40)) }) },
  ]) {
    const h = harness();
    await assert.rejects(() =>
      assertFieldsPersisted({
        cfg: { repo: repository },
        issueNum: issue,
        pexec: async () => ({ stdout: closeBody() }),
        estimationOutcomeWriter: h.runtime,
        acceptedSha: sha,
        ...overrides,
      })
    );
  }
});

test('Close rechecks explicit incomplete projection despite stale numeric fields and preserves marker failures', async () => {
  const h = harness();
  const numeric = closeBody().replace('"engagedTime":null', '"engagedTime":12');
  const result = await assertFieldsPersisted({
    cfg: { repo: repository },
    issueNum: issue,
    acceptedSha: sha,
    pexec: async () => ({ stdout: numeric }),
    estimationOutcomeWriter: h.runtime,
    timingProjection: { status: 'incomplete' },
  });
  assert.equal(result.status, 'incomplete-telemetry-accepted');
  for (const body of ['', '<!-- aitm-fields: {invalid} -->']) {
    const fresh = harness();
    await assert.rejects(() =>
      assertFieldsPersisted({
        cfg: { repo: repository },
        issueNum: issue,
        acceptedSha: sha,
        pexec: async () => ({ stdout: body }),
        estimationOutcomeWriter: fresh.runtime,
        timingProjection: { status: 'incomplete' },
      })
    );
    assert.equal(fresh.records.length, 1);
  }
});
test('Close rejects changed canonical source and ambiguous outcome records on retry', async () => {
  for (const corrupt of ['source', 'duplicate', 'repository']) {
    const h = harness();
    const args = {
      cfg: { repo: repository },
      issueNum: issue,
      acceptedSha: sha,
      pexec: async () => ({ stdout: closeBody() }),
      estimationOutcomeWriter: h.runtime,
    };
    await assertFieldsPersisted(args);
    if (corrupt === 'source') h.setTiming(h.getTiming().replace('legacy', 'altered'));
    if (corrupt === 'duplicate') {
      const duplicate = structuredClone(h.records.at(-1));
      duplicate.envelope.recordId = '01J00000000000000000000899';
      h.records.push(duplicate);
    }
    if (corrupt === 'repository') {
      const changed = structuredClone(h.records.at(-1));
      changed.envelope.repository = 'other/repo';
      h.records[h.records.length - 1] = changed;
    }
    await assert.rejects(() => assertFieldsPersisted(args));
  }
});
