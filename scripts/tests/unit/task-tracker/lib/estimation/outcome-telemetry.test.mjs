// @story #1857
import { outcomeProofDigest } from '../../../../../task-tracker/lib/estimation/outcome-delivery-proof.mjs';
test('child outcome carries the real Test identity plus parent lineage, never a skipped receipt', () => {
  const lineage = {
    schema: 'aitm.lineage-delivery-evidence/v1',
    repository: 'owner/repo',
    issue: 1857,
    parentIssue: 1847,
    acceptedSha: 'a'.repeat(40),
    targetBranch: 'codex/1847',
    targetHead: 'b'.repeat(40),
    commits: ['c'.repeat(40)],
    children: [],
  };
  const outcome = buildEstimationOutcome({
    ...input,
    verificationProvenance: {
      ...input.verificationProvenance,
      mode: 'child-lineage',
      lineage,
      lineageDigest: outcomeProofDigest(lineage),
    },
  });
  assert.equal(outcome.telemetry.verification.recordId, input.verificationProvenance.recordId);
  const missingTest = structuredClone(outcome);
  missingTest.actual.commands = [];
  assert.throws(() => validateEstimationOutcome(missingTest));
  const changed = structuredClone(outcome);
  changed.telemetry.verification.lineage.parentIssue = 1857;
  changed.telemetry.verification.lineageDigest = outcomeProofDigest(
    changed.telemetry.verification.lineage
  );
  assert.throws(() => validateEstimationOutcome(changed));
});
test('root epic incomplete telemetry uses actual merged delivery identity without invented parent commands', () => {
  const outcome = buildEstimationOutcome({
    ...input,
    forecast: null,
    kind: 'epic-orchestration',
    verification: [],
    childOutcomeRecordIds: ['01J00000000000000000000842'],
    verificationProvenance: {
      ...input.verificationProvenance,
      mode: 'merged-pr-delivery',
      issueKind: 'epic',
    },
  });
  assert.equal(outcome.telemetry.forecastStatus, 'epic-not-applicable');
  assert.deepEqual(outcome.actual.commands, []);
  for (const mutate of [
    (value) => {
      value.telemetry.verification.mode = 'issue-resident-delivery';
    },
    (value) => {
      value.telemetry.verification.issueKind = 'code';
    },
    (value) => {
      value.telemetry.verification.recordId = '';
    },
    (value) => {
      value.telemetry.verification.acceptedSha = 'b'.repeat(40);
    },
  ]) {
    const bad = structuredClone(outcome);
    mutate(bad);
    assert.throws(() => validateEstimationOutcome(bad));
  }
});
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimationOutcome } from '../../../../../task-tracker/lib/estimation/outcome-builder.mjs';
import { validateEstimationOutcome } from '../../../../../task-tracker/lib/estimation/outcome-record.mjs';
import {
  timingActorKey,
  timingActorMarker,
} from '../../../../../task-tracker/lib/timing-actor.mjs';
const key = timingActorKey({ provider: 'codex', sid: 'outcome-author' });
const snapshot =
  [
    '| 2026-10-01 00:00:00 +00:00 | develop:started | | | | 0 | phase |',
    '| 2026-10-01 00:00:01 +00:00 | start | | | | 0 | legacy |',
    '| 2026-10-01 00:01:00 +00:00 | pause | Unknown | Unknown | 12 | 112 | work | 1020 |' +
      timingActorMarker(key) +
      ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=100 wend=112 fstart=1000 fend=1020 -->',
  ].join('\n') + '\n';
const source = { repository: 'owner/repo', commentNodeId: 'IC_timing', snapshot };
const forecast = {
  recordId: '01J00000000000000000000800',
  payload: { issue: 1857, plan: { humanHours: 4 }, ai: { p50EngagedHours: 4, p80EngagedHours: 6 } },
};
const input = {
  issue: 1857,
  forecast,
  timing: { source },
  verificationSha: 'a'.repeat(40),
  verificationProvenance: {
    mode: 'exact-test',
    issueKind: 'code',
    recordId: '01J00000000000000000000810',
    recordDigest: '1'.repeat(64),
    acceptedSha: 'a'.repeat(40),
  },
  verification: [
    {
      classification: 'test-unit',
      durationMs: 100,
      attempts: 1,
      executions: [
        {
          receiptId: '01J00000000000000000000810',
          stage: 'test',
          commitSha: 'a'.repeat(40),
          command: 'node',
          args: ['--test'],
          exitCode: 0,
          durationMs: 100,
          reusedFrom: null,
        },
      ],
    },
  ],
  diff: { filesChanged: 1, modules: ['timing'], lanes: ['unit'], dependencyBreadth: 0 },
  review: { fixCycles: 0 },
};
test('incomplete outcome derives known subtotal from immutable timing source without numeric fabrication', () => {
  const outcome = buildEstimationOutcome(input);
  assert.equal(outcome.schema, 'aitm.estimation-outcome/v3');
  assert.equal(outcome.actual.engagedHours, null);
  assert.equal(outcome.actual.stages.develop, null);
  assert.equal(outcome.variance, null);
  assert.equal(outcome.costClassification.necessaryHours, null);
  assert.equal(outcome.telemetry.knownEngagedMs, 60000);
  assert.equal(outcome.telemetry.status, 'incomplete');
  assert.deepEqual(outcome.telemetry.reasons, ['legacy-attribution-unknown']);
  assert.equal(outcome.telemetry.source.snapshot, snapshot);
  assert.equal(outcome.telemetry.verificationSha, 'a'.repeat(40));
  assert.doesNotThrow(() => validateEstimationOutcome(outcome, { expectedIssue: 1857 }));
});
test('incomplete record refuses forged subtotal, changed source, wrong linkage and missing actual receipt', () => {
  const outcome = buildEstimationOutcome(input);
  for (const change of [
    (value) => {
      value.telemetry.knownEngagedMs = 0;
    },
    (value) => {
      value.telemetry.source.snapshot += 'changed';
    },
    (value) => {
      value.telemetry.verificationSha = 'b'.repeat(40);
    },
    (value) => {
      value.actual.commands = [];
    },
    (value) => {
      value.actual.engagedHours = 0;
    },
    (value) => {
      value.telemetry.reasons = [];
    },
  ]) {
    const bad = structuredClone(outcome);
    change(bad);
    assert.throws(() => validateEstimationOutcome(bad));
  }
  assert.throws(() => validateEstimationOutcome(outcome, { expectedIssue: 1847 }));
  assert.throws(() => buildEstimationOutcome({ ...input, timing: { unavailable: true } }));
});

import { renderEstimationOutcome } from '../../../../../task-tracker/lib/estimation/renderers.mjs';
import {
  createBootstrapRubric,
  updateEstimationRubric,
} from '../../../../../task-tracker/lib/estimation/rubric-model.mjs';
test('incomplete rendering names unknown remainder and calibration excludes incomplete evidence', () => {
  const payload = buildEstimationOutcome(input);
  const text = renderEstimationOutcome(payload);
  assert.ok(text.includes('Unknown'));
  assert.ok(text.includes('60 seconds'));
  assert.ok(text.includes('legacy-attribution-unknown'));
});
test('incomplete outcomes never enter quantitative calibration', () => {
  const payload = buildEstimationOutcome(input);
  const previous = createBootstrapRubric({ generatedAt: '2026-10-01T00:00:00.000Z' });
  const next = updateEstimationRubric({
    previous,
    outcomes: [
      {
        recordId: '01J00000000000000000000820',
        createdAt: '2026-10-01T01:00:00.000Z',
        payload,
      },
    ],
    generatedAt: '2026-10-01T02:00:00.000Z',
  });
  assert.deepEqual(next, previous);
});

import { ensureEstimationOutcome } from '../../../../../task-tracker/lib/estimation/outcome-writer.mjs';
test('incomplete writer rejects changed write payload and missing or conflicting fresh readback', async () => {
  const payload = buildEstimationOutcome(input);
  for (const mode of ['changed', 'missing', 'duplicate', 'wrong-repository']) {
    let reads = 0;
    let stored;
    await assert.rejects(
      () =>
        ensureEstimationOutcome({
          issue: 1857,
          forecast,
          outcomePayload: payload,
          deps: {
            listOutcomeRecords: async () => {
              reads++;
              return reads === 1 || mode === 'missing'
                ? []
                : mode === 'duplicate'
                  ? [
                      stored,
                      {
                        ...stored,
                        envelope: { ...stored.envelope, recordId: '01J00000000000000000000822' },
                      },
                    ]
                  : [stored];
            },
            createOutcomeEnvelope: ({ payload }) => ({
              recordId: '01J00000000000000000000821',
              recordType: 'estimation-outcome',
              repository: 'owner/repo',
              issue: 1857,
              payload,
            }),
            writeOutcome: async ({ envelope }) => {
              stored = { commentNodeId: 'IC_outcome', envelope: structuredClone(envelope) };
              if (mode === 'changed') stored.envelope.payload.telemetry.knownEngagedMs = 0;
              if (mode === 'wrong-repository') stored.envelope.repository = 'other/repo';
              return stored;
            },
          },
        }),
      new RegExp('estimation-')
    );
  }
});
test('incomplete writer returns full unique canonical evidence only after fresh readback', async () => {
  const payload = buildEstimationOutcome(input);
  const records = [];
  let reads = 0;
  const result = await ensureEstimationOutcome({
    issue: 1857,
    forecast,
    outcomePayload: payload,
    deps: {
      listOutcomeRecords: async () => {
        reads++;
        return records;
      },
      createOutcomeEnvelope: ({ payload }) => ({
        recordId: '01J00000000000000000000821',
        recordType: 'estimation-outcome',
        repository: 'owner/repo',
        issue: 1857,
        payload,
      }),
      writeOutcome: async ({ envelope }) => {
        const record = { commentNodeId: 'IC_outcome', envelope };
        records.push(record);
        return record;
      },
    },
  });
  assert.equal(result.status, 'written');
  assert.ok(reads >= 2);
  assert.deepEqual(result.record, records[0]);
});

test('immutable outcome timing source permits append-only close tail and refuses mutation or linkage drift', async () => {
  const { validateOutcomeTimingSource } =
    await import('../../../../../task-tracker/lib/estimation/outcome-record.mjs');
  const payload = buildEstimationOutcome(input);
  const context = {
    repository: 'owner/repo',
    issue: 1857,
    commentNodeId: 'IC_timing',
    body: snapshot,
    verificationSha: 'a'.repeat(40),
    forecastRecordId: forecast.recordId,
  };
  assert.equal(validateOutcomeTimingSource(payload, context).status, 'matched');
  const tail =
    '| 2026-10-01 00:02:00 +00:00 | review:approved | | | | 112 | canonical approval |\n';
  assert.equal(
    validateOutcomeTimingSource(payload, { ...context, body: snapshot + tail }).status,
    'matched'
  );
  for (const change of [
    { body: snapshot.replace('legacy', 'changed') },
    { body: snapshot.slice(0, -30) },
    { body: snapshot + 'arbitrary prose\n' },
    { body: snapshot + tail.replace('00:02:00', '00:00:00') },
    { body: snapshot + tail.replace('review:approved', 'pause') },
    { repository: 'other/repo' },
    { issue: 1847 },
    { commentNodeId: 'IC_other' },
    { verificationSha: 'b'.repeat(40) },
    { forecastRecordId: '01J00000000000000000000899' },
  ])
    assert.throws(() => validateOutcomeTimingSource(payload, { ...context, ...change }));
});

test('source successor verifies complete appended actor evidence and preserved footer', async () => {
  const { validateOutcomeTimingSource } =
    await import('../../../../../task-tracker/lib/estimation/outcome-record.mjs');
  const { appendRow } = await import('../../../../../task-tracker/gh-timing-comment.internals.mjs');
  const footer = '\nRetained canonical footer.\n';
  const canonical = appendRow(snapshot, snapshot.split('\n').at(-2));
  const payload = buildEstimationOutcome({
    ...input,
    timing: { source: { ...source, snapshot: canonical + footer } },
  });
  const tail = '| 2026-10-01 00:02:00 +00:00 | review:approved | | | | 112 | canonical approval |';
  const appended = appendRow(canonical + footer, tail);
  const context = {
    repository: 'owner/repo',
    issue: 1857,
    commentNodeId: 'IC_timing',
    body: appended,
    verificationSha: 'a'.repeat(40),
    forecastRecordId: forecast.recordId,
  };
  assert.equal(validateOutcomeTimingSource(payload, context).status, 'matched');
  assert.throws(() =>
    validateOutcomeTimingSource(payload, {
      ...context,
      body: appended.replace('Retained', 'Changed'),
    })
  );
  const conflict = snapshot
    .split('\n')
    .at(-2)
    .replace('wend=112', 'wend=113')
    .replace('| 112 |', '| 113 |');
  assert.throws(() =>
    validateOutcomeTimingSource(buildEstimationOutcome(input), {
      ...context,
      body: snapshot + conflict + '\n',
    })
  );
});

test('original timing snapshot cannot silently discard malformed work rows', () => {
  for (const row of [
    '| not-a-timestamp | pause | 2 | 0 | 1 | 1 | unknown work |',
    '| 2026-99-01 00:00:01 +00:00 | develop:completed | 2 | 0 | 1 | 1 | invalid lifecycle |',
    '| broken | pause | Unknown | Unknown | 12 | 112 | actor | 1020 |' + timingActorMarker(key),
  ]) {
    assert.throws(() =>
      buildEstimationOutcome({
        ...input,
        timing: { source: { ...source, snapshot: source.snapshot + row + '\n' } },
      })
    );
  }
});
test('supported ISO fractional historical timing rows remain represented', () => {
  const iso = source.snapshot.replace('2026-10-01 00:00:01 +00:00', '2026-10-01T00:00:01.125Z');
  const value = buildEstimationOutcome({
    ...input,
    timing: { source: { ...source, snapshot: iso } },
  });
  assert.equal(value.telemetry.status, 'incomplete');
  assert.ok(value.telemetry.reasons.includes('legacy-attribution-unknown'));
  assert.equal(value.telemetry.source.snapshot, iso);
});

test('incomplete source proof carries closed exact Test provenance and refuses omitted or forged modes', () => {
  const value = buildEstimationOutcome(input);
  assert.deepEqual(value.telemetry.verification, input.verificationProvenance);
  assert.throws(() => buildEstimationOutcome({ ...input, verificationProvenance: undefined }));
  for (const change of [
    { mode: 'anything' },
    { issueKind: 'epic' },
    { acceptedSha: 'b'.repeat(40) },
    { recordId: '01J00000000000000000000999' },
    { recordDigest: 'invalid' },
  ]) {
    assert.throws(() =>
      buildEstimationOutcome({
        ...input,
        verificationProvenance: { ...input.verificationProvenance, ...change },
      })
    );
  }
});

test('calendar-normalized impossible original timing dates are refused', () => {
  for (const invalid of ['2026-02-31T00:00:01+00:00', '2026-10-01T24:00:00+00:00']) {
    const badSnapshot = source.snapshot.replace('2026-10-01 00:00:01 +00:00', invalid);
    assert.throws(
      () =>
        buildEstimationOutcome({
          ...input,
          timing: { source: { ...source, snapshot: badSnapshot } },
        }),
      new RegExp('estimation-')
    );
  }
});

test('persisted predecessor v2 remains readable without invented proof fields', () => {
  const predecessor = buildEstimationOutcome(input);
  predecessor.schema = 'aitm.estimation-outcome/v2';
  delete predecessor.telemetry.verification;
  delete predecessor.telemetry.forecastStatus;
  assert.doesNotThrow(() => validateEstimationOutcome(predecessor));
  assert.equal(predecessor.telemetry.verification, undefined);
});
test('new provenance uses an explicit schema generation', () => {
  assert.equal(buildEstimationOutcome(input).schema, 'aitm.estimation-outcome/v3');
});
