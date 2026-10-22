// @story #2039 #2046
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildEstimationForecast } from '../../../../../task-tracker/lib/estimation/forecast-model.mjs';
import { validateEstimationForecast } from '../../../../../task-tracker/lib/estimation/forecast-record.mjs';
import { calculateLocalEstimate } from '../../../../../task-tracker/lib/estimation/local-runtime.mjs';
import { validateForecastProvenance } from '../../../../../task-tracker/lib/estimation/forecast-v3.mjs';
import {
  bundle,
  envelope,
  outcome,
  id,
} from '../../../../helpers/local-estimation-evidence-fixture.mjs';

function fixture() {
  const evidence = bundle([
    { record: envelope(), provenance: 'imported-local' },
    {
      record: envelope({ recordId: id(2), payload: outcome(1068), issue: 1068 }),
      provenance: 'imported-local',
    },
  ]);
  evidence.manifest.modelPolicy = {
    modelVersion: 'aitm.forecast-model/v2',
    policyVersion: 'aitm.local-estimation/v1',
  };
  const {
    inputs: _inputs,
    schema: _schema,
    canonicalizationVersion: _canon,
    ...selection
  } = evidence.manifest;
  const input = JSON.parse(
    readFileSync(
      new URL('../../../../fixtures/estimation/plan-input.json', import.meta.url),
      'utf8'
    )
  );
  const result = calculateLocalEstimate({
    mode: { mode: 'local' },
    evidence,
    planInput: { selection, input },
  });
  assert.equal(result.status, 'estimated');
  const forecast = {
    ...structuredClone(result.forecast),
    schema: 'aitm.estimation-forecast/v3',
    localEvidence: structuredClone(result.localEvidence),
  };
  return { evidence, result, forecast, input };
}

test('v3 snapshot accepts exact accepted local calculation provenance and real retained bytes', () => {
  const { forecast, evidence } = fixture();
  assert.equal(validateForecastProvenance(forecast, { expectedIssue: 2045 }), forecast);
  assert.equal(
    validateForecastProvenance(forecast, {
      expectedIssue: 2045,
      repository: 'owner/repo',
      evidence,
    }),
    forecast
  );
});

test('model opt-in emits v3 while unchanged calls retain v2', () => {
  const { forecast, evidence, input } = fixture();
  const args = {
    issue: 2045,
    refine: { size: 'S', humanHours: 3.5 },
    planInput: input,
    rubric: { recordId: id(1), payload: envelope().payload },
    comparableOutcomes: [{ recordId: id(2), payload: outcome(1068) }],
  };
  assert.equal(buildEstimationForecast(args).schema, 'aitm.estimation-forecast/v2');
  const actual = buildEstimationForecast({
    ...args,
    localEvidence: forecast.localEvidence,
    evidence,
    repository: 'owner/repo',
  });
  assert.equal(actual.schema, 'aitm.estimation-forecast/v3');
  assert.deepEqual(actual.localEvidence, forecast.localEvidence);
  actual.localEvidence.plan.path = 'changed';
  assert.equal(forecast.localEvidence.plan.path, 'docs/selected-plan.md');
});

const mutations = [
  [
    'unknown root field',
    (f) => {
      f.invented = true;
    },
  ],
  [
    'missing local evidence',
    (f) => {
      delete f.localEvidence;
    },
  ],
  [
    'unknown evidence field',
    (f) => {
      f.localEvidence.invented = true;
    },
  ],
  [
    'unsupported evidence schema',
    (f) => {
      f.localEvidence.schema = 'future';
    },
  ],
  [
    'unsupported canonicalization',
    (f) => {
      f.localEvidence.canonicalizationVersion = 'future';
    },
  ],
  [
    'malformed manifest hash',
    (f) => {
      f.localEvidence.manifestDigest = 'bad';
    },
  ],
  [
    'unsafe plan path',
    (f) => {
      f.localEvidence.plan.path = '../foreign.md';
    },
  ],
  [
    'malformed plan commit',
    (f) => {
      f.localEvidence.plan.commit = 'a'.repeat(39);
    },
  ],
  [
    'malformed plan hash',
    (f) => {
      f.localEvidence.plan.digest = 'bad';
    },
  ],
  [
    'empty plan section',
    (f) => {
      f.localEvidence.plan.section = '';
    },
  ],
  [
    'refine hours mismatch',
    (f) => {
      f.localEvidence.refine.humanHours = 9;
    },
  ],
  [
    'refine size mismatch',
    (f) => {
      f.localEvidence.refine.size = 'XL';
    },
  ],
  [
    'refine source hash',
    (f) => {
      f.localEvidence.refine.source.digest = 'bad';
    },
  ],
  [
    'rubric identity mismatch',
    (f) => {
      f.localEvidence.rubric.recordId = id(3);
    },
  ],
  [
    'rubric version mismatch',
    (f) => {
      f.localEvidence.rubric.version = 2;
    },
  ],
  [
    'rubric payload hash',
    (f) => {
      f.localEvidence.rubric.payloadDigest = 'bad';
    },
  ],
  [
    'invented local comment',
    (f) => {
      f.localEvidence.rubric.sourceCommentId = 'IC_fake';
    },
  ],
  [
    'observed rubric missing comment',
    (f) => {
      f.localEvidence.rubric.provenance = 'observed-cloud';
    },
  ],
  [
    'unsupported origin',
    (f) => {
      f.localEvidence.rubric.provenance = 'unknown';
    },
  ],
  [
    'outcome identity mismatch',
    (f) => {
      f.localEvidence.outcomes[0].recordId = id(3);
    },
  ],
  [
    'outcome issue mismatch',
    (f) => {
      f.localEvidence.outcomes[0].issue = 999;
    },
  ],
  [
    'missing selected outcome',
    (f) => {
      f.localEvidence.outcomes = [];
    },
  ],
  [
    'duplicate outcome',
    (f) => {
      f.localEvidence.outcomes.push(structuredClone(f.localEvidence.outcomes[0]));
    },
  ],
  [
    'extra outcome',
    (f) => {
      f.localEvidence.outcomes.push({
        ...f.localEvidence.outcomes[0],
        recordId: id(4),
        issue: 2000,
      });
    },
  ],
  [
    'empty model identity',
    (f) => {
      f.localEvidence.modelPolicy.modelVersion = '';
    },
  ],
  [
    'off-grid AI estimate',
    (f) => {
      f.ai.p80EngagedHours = 99.1;
    },
  ],
];
for (const [name, mutate] of mutations)
  test('v3 refuses ' + name, () => {
    const { forecast } = fixture();
    mutate(forecast);
    assert.throws(() => validateForecastProvenance(forecast));
  });

test('retained validation refuses wrong identity, changed hashes, changed snapshots and payload bytes', () => {
  const { forecast, evidence } = fixture();
  assert.throws(() => validateForecastProvenance(forecast, { expectedIssue: 999 }));
  assert.throws(() =>
    validateForecastProvenance(forecast, { repository: 'foreign/repo', evidence })
  );
  assert.throws(() => validateForecastProvenance(forecast, { repository: 'owner/repo' }));
  for (const mutate of [
    (f) => {
      f.localEvidence.manifestDigest = 'c'.repeat(64);
    },
    (f) => {
      f.localEvidence.plan.digest = 'c'.repeat(64);
    },
    (f) => {
      f.localEvidence.rubric.payloadDigest = 'c'.repeat(64);
    },
    (f) => {
      f.localEvidence.outcomes[0].payloadDigest = 'c'.repeat(64);
    },
    (f) => {
      f.localEvidence.modelPolicy.policyVersion = 'foreign/v1';
    },
  ]) {
    const changed = structuredClone(forecast);
    mutate(changed);
    assert.throws(() => validateForecastProvenance(changed, { evidence }));
  }
  const corrupted = { ...evidence, planBytes: Buffer.from('corrupt') };
  assert.throws(() => validateForecastProvenance(forecast, { evidence: corrupted }));
});

test('legacy v1 arbitrary hours and v2 half-hour reads remain unchanged', () => {
  const { result } = fixture();
  const legacy = structuredClone(result.forecast);
  assert.doesNotThrow(() => validateEstimationForecast(legacy));
  legacy.ai.p80EngagedHours = 99.1;
  assert.throws(() => validateEstimationForecast(legacy));
  legacy.schema = 'aitm.estimation-forecast/v1';
  assert.doesNotThrow(() => validateEstimationForecast(legacy));
});

test('retained provenance correlates rubric confidence and cohort metadata', () => {
  const { forecast, evidence } = fixture();
  for (const change of [
    (f) => {
      f.rubric.confidence = 0.9;
    },
    (f) => {
      f.rubric.cohortSize = 100;
    },
  ]) {
    const changed = structuredClone(forecast);
    change(changed);
    assert.throws(() => validateForecastProvenance(changed, { evidence }));
  }
});
