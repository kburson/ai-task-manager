// @story #1857
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalTestReceiptFixture } from '../../../fixtures/estimation-verification.mjs';
import { timingActorKey, timingActorMarker } from '../../../../task-tracker/lib/timing-actor.mjs';
import { assertFieldsPersisted } from '../../../../task-tracker/verbs/close.mjs';
import {
  requireDeliveryReceipt,
  verifyCloseDeliveryReceipt,
} from '../../../../task-tracker/lib/close-delivery-receipt.mjs';
import {
  issue,
  repository,
  sha,
  forecastId,
  harness,
  closeBody,
  residentGate,
} from '../../../helpers/1857-timing-outcome-harness.mjs';

test('runtime persists incomplete outcome with canonical Test proof then reuses it after valid close tail', async () => {
  const h = harness();
  const body = canonicalTestReceiptFixture({ issue }).body;
  const result = await h.runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body });
  assert.equal(result.status, 'written');
  assert.equal(result.record.envelope.payload.telemetry.status, 'incomplete');
  assert.equal(result.record.envelope.payload.telemetry.verification.mode, 'exact-test');
  assert.equal(
    result.record.envelope.payload.telemetry.verification.recordId,
    '01J00000000000000000000991'
  );
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
  assert.equal(h.records.at(-1).envelope.payload.schema, 'aitm.estimation-outcome/v3');
  assert.equal(result.record.envelope.payload.telemetry.knownEngagedMs, 90000);
  assert.ok(
    result.record.envelope.payload.telemetry.reasons.includes('engagement-outside-outcome-stages')
  );
});

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

test('forecast-free mixed actor history produces durable legacy-none evidence without inventing a forecast', async () => {
  const h = harness();
  h.records.length = 0;
  const body = canonicalTestReceiptFixture({ issue }).body;
  const result = await h.runtime.ensure({ issueNumber: issue, forecastRecordId: null, body });
  assert.equal(result.status, 'written');
  assert.equal(result.record.envelope.payload.telemetry.forecastStatus, 'legacy-none');
  assert.equal(result.record.envelope.payload.forecastRecordId, null);
  assert.equal(result.record.envelope.payload.aiForecast, null);
  assert.equal(result.record.envelope.payload.humanPlanHours, null);
  assert.equal(result.record.envelope.payload.telemetry.knownEngagedMs, 60000);
  const close = await assertFieldsPersisted({
    cfg: { repo: repository },
    issueNum: issue,
    acceptedSha: sha,
    estimationOutcomeWriter: h.runtime,
    pexec: async () => ({
      stdout: body + '\n<!-- aitm-fields: {"schema":1,"values":{"engagedTime":null}} -->\n',
    }),
  });
  assert.equal(close.status, 'incomplete-telemetry-accepted');
});

test('forecast-free eligibility refuses malformed or partial adaptive claims and absent Test proof', async () => {
  for (const claim of [
    '<!-- aitm-plan-approved forecast-record-id=broken -->',
    '<!-- aitm-estimation-forecast-ready broken -->',
    '<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="' +
      forecastId +
      '" -->',
  ]) {
    const h = harness();
    h.records.length = 0;
    await assert.rejects(() =>
      h.runtime.ensure({
        issueNumber: issue,
        forecastRecordId: null,
        body: canonicalTestReceiptFixture({ issue }).body + '\n' + claim,
      })
    );
  }
  const h = harness();
  h.records.length = 0;
  await assert.rejects(() =>
    h.runtime.ensure({ issueNumber: issue, forecastRecordId: null, body: '' })
  );
});

test('legacy Plan approval without any forecast claim remains eligible for legacy-none', async () => {
  const h = harness();
  h.records.length = 0;
  const body =
    canonicalTestReceiptFixture({ issue }).body +
    '\n<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" mode="full-auto" -->\n';
  const result = await h.runtime.ensure({ issueNumber: issue, forecastRecordId: null, body });
  assert.equal(result.record.envelope.payload.telemetry.forecastStatus, 'legacy-none');
});

test('genuine forecast-free issue-resident delivery carries no invented Test command', async () => {
  const gate = residentGate();
  let reads = 0;
  const h = harness({
    resolveDeliveryAuthority: async () => {
      reads++;
      await verifyCloseDeliveryReceipt({
        gateInput: gate.gateInput,
        receiptGate: gate.receipt,
        testReceiptSha: gate.testReceiptSha,
        acceptedReviewSha: gate.acceptedReviewSha,
      });
      return gate;
    },
  });
  h.records.length = 0;
  const result = await h.runtime.ensure({
    issueNumber: issue,
    forecastRecordId: null,
    body: gate.deliveryBody,
  });
  assert.equal(
    result.record.envelope.payload.telemetry.verification.mode,
    'issue-resident-delivery'
  );
  assert.equal(
    result.record.envelope.payload.telemetry.verification.recordId,
    gate.receipt.receipt.recordId
  );
  assert.deepEqual(result.record.envelope.payload.actual.commands, []);
  assert.equal(result.record.envelope.payload.telemetry.forecastStatus, 'legacy-none');
  assert.ok(reads > 0);
});

test('legacy-none refuses a concurrent forecast after immutable outcome publication', async () => {
  const h = harness({
    onWrite: (records) =>
      records.push({
        envelope: {
          recordType: 'estimation-forecast',
          recordId: forecastId,
          repository,
          issue,
          supersedes: null,
          payload: {
            issue,
            plan: { humanHours: 4 },
            ai: { p50EngagedHours: 4, p80EngagedHours: 6 },
          },
        },
      }),
  });
  h.records.length = 0;
  await assert.rejects(
    () =>
      h.runtime.ensure({
        issueNumber: issue,
        forecastRecordId: null,
        body: canonicalTestReceiptFixture({ issue }).body,
      }),
    new RegExp('forecast')
  );
  assert.equal(
    h.records.filter((record) => record.envelope.recordType === 'estimation-outcome').length,
    1
  );
});

test('resident delivery refuses wrong receipt identity or missing accepted heads', async () => {
  for (const mutate of [
    (gate) => {
      gate.testReceiptSha = null;
    },
    (gate) => {
      gate.acceptedReviewSha = null;
    },
    (gate) => {
      gate.gateInput.issueNumber = issue + 1;
    },
    (gate) => {
      gate.receipt.receipt = { ...gate.receipt.receipt, recordId: forecastId };
    },
  ]) {
    const gate = structuredClone(residentGate());
    mutate(gate);
    const h = harness({ resolveDeliveryAuthority: async () => gate });
    h.records.length = 0;
    await assert.rejects(() =>
      h.runtime.ensure({ issueNumber: issue, forecastRecordId: null, body: gate.deliveryBody })
    );
    assert.equal(h.records.length, 0);
  }
});

test('real Git issue-resident lanes prove zero issue commits without an invented sandbox', async () => {
  const root = createRuntimeRootFixture('1857-resident-');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  try {
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'fixture baseline'
    );
    const head = git('rev-parse', 'HEAD');
    for (const kind of ['research', 'audit', 'spike']) {
      for (const parentIssueNumber of [null, 1847]) {
        const gate = residentGate(kind, head);
        if (parentIssueNumber !== null) {
          gate.gateInput.lineage = { parentIssueNumber, deliveryTarget: 'epic/1847' };
          delete gate.gateInput.noCommitRecords;
          gate.receipt = requireDeliveryReceipt(gate.gateInput);
        }
        const h = harness({
          projectDir: root,
          acceptedSha: head,
          useDefaultDiff: true,
          resolveDeliveryAuthority: async () => gate,
        });
        h.records.length = 0;
        const result = await h.runtime.ensure({
          issueNumber: issue,
          forecastRecordId: null,
          body: gate.deliveryBody,
        });
        assert.equal(result.record.envelope.payload.landscape.filesChanged, 0);
        assert.deepEqual(result.record.envelope.payload.landscape.lanes, []);
        assert.deepEqual(result.record.envelope.payload.actual.commands, []);
        assert.equal(
          result.record.envelope.payload.telemetry.verification.mode,
          parentIssueNumber === null ? 'issue-resident-delivery' : 'child-resident-delivery'
        );
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
