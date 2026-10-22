// @story #2039 #2065
import { readFileSync } from 'node:fs';
import { buildEstimationForecast } from '../../../../../task-tracker/lib/estimation/forecast-model.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPlanEstimateAuthority,
  adoptLegacyPlanForecast,
  executeAdaptivePlanEstimate,
} from '../../../../../task-tracker/lib/estimation/plan-estimate-authority.mjs';

const legacyV2 = () => ({
  schema: 'aitm.estimation-forecast/v2',
  issue: 2065,
  lifecycleState: 'plan',
  refine: { size: 'S', humanHours: 1 },
  plan: { size: 'S', humanHours: 1, deltaHours: 0, rationale: 'One bounded change' },
  ai: {
    p50EngagedHours: 1,
    p80EngagedHours: 1.5,
    stages: { plan: 0.5, develop: 0.5, test: 0, review: 0 },
  },
  wbs: [{ id: 'change', description: 'Implement bounded change', humanHours: 1, signals: [] }],
  comparableIssues: [],
  rubric: { recordId: '01J00000000000000000000500', version: 1, cohortSize: 0, confidence: 0 },
  testPlan: { expectedMinutes: 1, impactedLanes: ['unit'], isolation: 'offline' },
  risks: [],
  recommendation: { action: 'proceed', reason: 'Bounded scope' },
  supersedesForecastRecordId: null,
});

test('current authority rejects legacy v2 before reading or publishing authority', async () => {
  const payload = legacyV2();
  let reads = 0;
  await assert.rejects(
    applyPlanEstimateAuthority({
      issueNumber: 2065,
      refine: payload.refine,
      forecastEnvelope: { recordType: 'estimation-forecast', payload },
      deps: {
        readProjection: async () => {
          reads++;
          throw new Error('authority was read');
        },
      },
    }),
    /forecast-current:schema/
  );
  assert.equal(reads, 0);
});

import {
  readForecastVersioned,
  requireCurrentSchema,
} from '../../../../../task-tracker/lib/estimation/forecast-legacy.mjs';
import {
  bundle,
  envelope,
  outcome,
  id,
} from '../../../../helpers/local-estimation-evidence-fixture.mjs';
import { validateLocalEvidence } from '../../../../../task-tracker/lib/estimation/local-evidence.mjs';
import { localCalculationProvenance } from '../../../../../task-tracker/lib/estimation/local-runtime.mjs';

function currentFixture(issue = 2065) {
  const evidence = bundle(
    [
      {
        record: envelope({ recordId: '01J00000000000000000000500' }),
        provenance: 'imported-local',
      },
    ],
    {
      issue,
      refine: {
        size: 'S',
        humanHours: 1,
        source: { kind: 'imported-local', id: 'refine', digest: 'b'.repeat(64) },
      },
    }
  );
  const retained = validateLocalEvidence(evidence);
  const {
    inputs: _inputs,
    schema: _schema,
    canonicalizationVersion: _canonical,
    ...selection
  } = evidence.manifest;
  return {
    value: {
      ...legacyV2(),
      issue,
      rubric: { ...legacyV2().rubric, confidence: 0.1 },
      schema: 'aitm.estimation-forecast/v3',
      localEvidence: structuredClone(localCalculationProvenance(retained)),
    },
    context: {
      expectedIssue: issue,
      identity: { host: 'github.com', repository: 'owner/repo', issue },
      evidenceStore: { read: () => validateLocalEvidence(evidence) },
      selection,
    },
  };
}

test('legacy readers return original v1 fractional hours and v2 half hours unchanged', () => {
  const v1 = legacyV2();
  v1.schema = 'aitm.estimation-forecast/v1';
  v1.ai.p80EngagedHours = 1.125;
  const v2 = legacyV2();
  assert.equal(readForecastVersioned(v1), v1);
  assert.equal(v1.ai.p80EngagedHours, 1.125);
  assert.equal(readForecastVersioned(v2), v2);
  assert.equal(v2.ai.p80EngagedHours, 1.5);
  assert.throws(() => requireCurrentSchema(v1), /forecast-current:schema/);
  assert.throws(() => requireCurrentSchema(v2), /forecast-current:schema/);
});

for (const field of ['refine', 'plan', 'p50', 'p80', 'stage', 'wbs']) {
  test('v2 rejects off-grid published hours: ' + field, () => {
    const value = legacyV2();
    if (field === 'refine' || field === 'plan') value[field].humanHours = 1.1;
    if (field === 'p50') value.ai.p50EngagedHours = 1.1;
    if (field === 'p80') value.ai.p80EngagedHours = 1.6;
    if (field === 'stage') value.ai.stages.plan = 0.1;
    if (field === 'wbs') value.wbs[0].humanHours = 1.1;
    assert.throws(() => readForecastVersioned(value), /grid/);
  });
}

test('versioned readers preserve strict legacy keys and issue correlation', () => {
  for (const schema of ['aitm.estimation-forecast/v1', 'aitm.estimation-forecast/v2']) {
    assert.throws(
      () => readForecastVersioned({ ...legacyV2(), schema, unknown: true }),
      /forecast-keys/
    );
    assert.throws(
      () => readForecastVersioned({ ...legacyV2(), schema }, { expectedIssue: 2064 }),
      /issue-correlation/
    );
  }
  assert.throws(
    () => readForecastVersioned({ ...legacyV2(), schema: 'aitm.estimation-forecast/v99' }),
    /forecast-schema/
  );
});

test('current v3 reads replay retained evidence and require its current selection', () => {
  const { value, context } = currentFixture();
  const original = structuredClone(value);
  assert.deepEqual(requireCurrentSchema(value, context), value);
  assert.deepEqual(readForecastVersioned(value, context), value);
  assert.deepEqual(value, original);
  assert.throws(() => requireCurrentSchema(value), /forecast-current:/);
  assert.throws(
    () => requireCurrentSchema(value, { ...context, selection: undefined }),
    /selection-missing/
  );
  assert.throws(
    () =>
      requireCurrentSchema(value, {
        ...context,
        selection: {
          ...context.selection,
          plan: { ...context.selection.plan, commit: 'c'.repeat(40) },
        },
      }),
    /selection-plan/
  );
});

for (const mutation of ['missing', 'manifest', 'plan', 'unknown']) {
  test('current v3 refuses missing or stale provenance: ' + mutation, () => {
    const { value, context } = currentFixture();
    if (mutation === 'missing') delete value.localEvidence;
    if (mutation === 'manifest') value.localEvidence.manifestDigest = 'f'.repeat(64);
    if (mutation === 'plan') value.localEvidence.plan.commit = 'c'.repeat(40);
    if (mutation === 'unknown') value.localEvidence.invented = true;
    assert.throws(() => readForecastVersioned(value, context));
  });
}

test('current v3 refuses unavailable bytes, wrong requested identity, and wrong issue', () => {
  const { value, context } = currentFixture();
  assert.throws(
    () =>
      requireCurrentSchema(value, {
        ...context,
        evidenceStore: {
          read() {
            throw new Error('local bytes missing');
          },
        },
      }),
    /local bytes missing/
  );
  assert.throws(
    () =>
      requireCurrentSchema(value, {
        ...context,
        identity: { ...context.identity, repository: 'other/repo' },
      }),
    /identity-repository/
  );
  assert.throws(
    () => requireCurrentSchema(value, { ...context, expectedIssue: 2064 }),
    /issue-correlation/
  );
});

test('current authority correlates its configured repository before reading projection', async () => {
  const { value, context } = currentFixture();
  let reads = 0;
  await assert.rejects(
    applyPlanEstimateAuthority({
      issueNumber: 2065,
      refine: value.refine,
      forecastEnvelope: { recordType: 'estimation-forecast', payload: value },
      deps: {
        cfg: { repo: 'different/repo' },
        localForecast: context,
        readProjection: async () => {
          reads++;
          throw new Error('authority was read');
        },
      },
    }),
    /forecast-current:repository/
  );
  assert.equal(reads, 0);
});

for (const entry of [applyPlanEstimateAuthority, adoptLegacyPlanForecast]) {
  for (const fault of ['missing context', 'missing bytes', 'stale selection']) {
    test(entry.name + ' refuses ' + fault + ' before authority reads or writes', async () => {
      const { value, context } = currentFixture();
      let reads = 0;
      const localForecast =
        fault === 'missing context'
          ? undefined
          : {
              ...context,
              ...(fault === 'missing bytes'
                ? {
                    evidenceStore: {
                      read() {
                        throw new Error('lost-local-evidence');
                      },
                    },
                  }
                : {}),
              ...(fault === 'stale selection'
                ? {
                    selection: {
                      ...context.selection,
                      plan: { ...context.selection.plan, commit: 'd'.repeat(40) },
                    },
                  }
                : {}),
            };
      await assert.rejects(
        entry({
          issueNumber: 2065,
          refine: value.refine,
          forecastEnvelope: { recordType: 'estimation-forecast', payload: value },
          deps: {
            localForecast,
            readProjection: async () => {
              reads++;
              throw new Error('authority was read');
            },
          },
        }),
        new RegExp('forecast-current:evidence-store-required|lost-local-evidence|selection-plan')
      );
      assert.equal(reads, 0);
    });
  }
}

test('current replay refuses accessor-based issue substitution', () => {
  const { value, context } = currentFixture(2064);
  let reads = 0;
  Object.defineProperty(value, 'issue', {
    enumerable: true,
    get: () => (++reads === 1 ? 2065 : 2064),
  });
  assert.throws(
    () => requireCurrentSchema(value, { ...context, expectedIssue: 2065 }),
    new RegExp('canonical-json:invalid:property')
  );
});

test('local generation includes only explicitly selected retained outcomes in current provenance', async () => {
  const evidence = bundle(
    [
      { record: envelope(), provenance: 'imported-local' },
      {
        record: envelope({ recordId: id(10), issue: 1002, payload: outcome(1002) }),
        provenance: 'imported-local',
      },
      {
        record: envelope({ recordId: id(11), issue: 1003, payload: outcome(1003) }),
        provenance: 'imported-local',
      },
    ],
    { issue: 2065 }
  );
  const retained = validateLocalEvidence(evidence);
  const {
    inputs: _inputs,
    schema: _schema,
    canonicalizationVersion: _canonical,
    ...selection
  } = evidence.manifest;
  const input = JSON.parse(
    readFileSync(new URL('../../../../fixtures/estimation/plan-input.json', import.meta.url))
  );
  input.comparableIssueIds = [1002];
  const localForecast = {
    evidenceStore: { read: () => validateLocalEvidence(evidence) },
    manifestDigest: retained.manifestDigest,
    identity: { host: 'github.com', repository: 'owner/repo', issue: 2065 },
    selection,
  };
  const result = await executeAdaptivePlanEstimate({
    issueNumber: 2065,
    planInput: input,
    cfg: { repo: 'owner/repo' },
    deps: {
      localForecast,
      buildForecast: buildEstimationForecast,
      createForecastEnvelope: ({ payload }) => ({ payload }),
      applyAuthority: ({ forecastEnvelope }) => forecastEnvelope.payload,
    },
  });
  assert.equal(result.schema, 'aitm.estimation-forecast/v3');
  assert.deepEqual(
    result.localEvidence.outcomes.map((item) => item.issue),
    [1002]
  );
});

import { renderEstimationForecast } from '../../../../../task-tracker/lib/estimation/renderers.mjs';
test('forecast presentation renders strict current v3 and unchanged legacy v1/v2 values', () => {
  const { value } = currentFixture();
  assert.match(renderEstimationForecast(value), new RegExp('Human Plan estimate: 1h'));
  const v2 = legacyV2();
  assert.match(renderEstimationForecast(v2), new RegExp('AI P80: 1.5h'));
  const v1 = { ...legacyV2(), schema: 'aitm.estimation-forecast/v1' };
  v1.ai.p80EngagedHours = 1.125;
  assert.match(renderEstimationForecast(v1), new RegExp('AI P80: 1.13h'));
  delete value.localEvidence;
  assert.throws(() => renderEstimationForecast(value));
});
