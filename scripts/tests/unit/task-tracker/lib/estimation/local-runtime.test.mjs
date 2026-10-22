// @story #2039 #2062
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  calculateLocalEstimate,
  LOCAL_ESTIMATION_MODEL,
} from '../../../../../task-tracker/lib/estimation/local-runtime.mjs';
import { parsePlanEstimationInput } from '../../../../../task-tracker/lib/estimation/plan-input.mjs';
import {
  bundle,
  envelope,
  outcome,
  id,
  bytes,
  hash,
  incompleteOutcome,
} from '../../../../helpers/local-estimation-evidence-fixture.mjs';

const input = parsePlanEstimationInput(
  JSON.parse(
    readFileSync(
      new URL('../../../../fixtures/estimation/plan-input.json', import.meta.url),
      'utf8'
    )
  )
);
function fixture({ outcomes = true } = {}) {
  const evidence = bundle([
    { record: envelope(), provenance: 'imported-local' },
    ...(outcomes
      ? [
          {
            record: envelope({ recordId: id(2), payload: outcome(1068), issue: 1068 }),
            provenance: 'imported-local',
          },
        ]
      : []),
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
  return {
    mode: { mode: 'local' },
    evidence,
    planInput: { selection: structuredClone(selection), input: structuredClone(input) },
  };
}
function noEstimate(result, status = 'unavailable') {
  assert.equal(result.status, status);
  assert.equal(result.estimate, undefined);
  assert.equal(result.forecast, undefined);
  assert.equal(result.localEvidence, undefined);
  assert.equal(typeof result.reason, 'string');
}
test('disabled calculation does not inspect evidence or invoke a model', () => {
  const args = {
    mode: { mode: 'disabled' },
    get evidence() {
      throw Error('must not inspect');
    },
    model() {
      throw Error('must not calculate');
    },
  };
  noEstimate(calculateLocalEstimate(args), 'disabled');
  assert.equal(calculateLocalEstimate(args).reason, 'rubric-disabled');
});
for (const mode of [
  undefined,
  null,
  {},
  { mode: 'unavailable', reason: 'config-invalid' },
  { mode: 'bogus' },
]) {
  test('invalid or unavailable mode cannot infer an estimate: ' + JSON.stringify(mode), () =>
    noEstimate(
      calculateLocalEstimate({
        mode,
        model() {
          throw Error('must not calculate');
        },
      })
    )
  );
}
test('missing evidence refuses before model calculation', () => {
  let calls = 0;
  noEstimate(
    calculateLocalEstimate({
      mode: { mode: 'local' },
      evidence: null,
      planInput: null,
      model() {
        calls++;
      },
    })
  );
  assert.equal(calls, 0);
});
test('retained plan and outcome produce deterministic half-hour estimates with explicit provenance', () => {
  const args = fixture();
  const before = bytes(args.planInput);
  const one = calculateLocalEstimate(args),
    two = calculateLocalEstimate(args);
  assert.equal(one.status, 'estimated');
  assert.deepEqual(one, two);
  assert.equal(one.estimate.hours, 44);
  assert.equal(one.estimate.size, 'XL');
  assert.deepEqual(one.forecast.ai.stages, { plan: 2, develop: 22.5, test: 4, review: 3.5 });
  assert.equal(one.forecast.ai.p50EngagedHours, 32);
  assert.equal(one.forecast.ai.p80EngagedHours, 47);
  assert.equal(one.localEvidence.rubric.provenance, 'imported-local');
  assert.equal(one.localEvidence.rubric.sourceCommentId, null);
  assert.equal(one.localEvidence.outcomes[0].issue, 1068);
  assert.equal(one.localEvidence.manifestDigest, hash(bytes(args.evidence.manifest)));
  assert.match(one.inputDigest, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(one.forecast.plan));
  assert.ok(before.equals(bytes(args.planInput)));
});
for (const [field, value] of [
  ['host', 'elsewhere.example'],
  ['repository', 'other/repo'],
  ['issue', 9999],
  ['configuration', { estimationRubricIssue: 55 }],
  [
    'refine',
    {
      size: 'M',
      humanHours: 3.5,
      source: { kind: 'local', id: 'different', digest: 'c'.repeat(64) },
    },
  ],
  ['modelPolicy', { modelVersion: 'other', policyVersion: 'other' }],
]) {
  test('current selection mismatch refuses before model: ' + field, () => {
    const args = fixture();
    args.planInput.selection[field] = value;
    let calls = 0;
    args.model = {
      ...LOCAL_ESTIMATION_MODEL,
      calculate() {
        calls++;
      },
    };
    noEstimate(calculateLocalEstimate(args));
    assert.equal(calls, 0);
  });
}
for (const [field, value] of [
  ['path', 'docs/other.md'],
  ['section', '### Other'],
  ['commit', 'b'.repeat(40)],
  ['digest', 'f'.repeat(64)],
]) {
  test('changed selected plan ' + field + ' refuses', () => {
    const args = fixture();
    args.planInput.selection.plan[field] = value;
    noEstimate(calculateLocalEstimate(args));
  });
}
test('changed retained plan bytes refuse even if current selection claims the old digest', () => {
  const args = fixture();
  args.evidence.planBytes = Buffer.from('changed');
  noEstimate(calculateLocalEstimate(args));
});
test('corrupt retained envelope bytes refuse', () => {
  const args = fixture();
  const key = args.evidence.payloads.keys().next().value;
  args.evidence.payloads.set(key, Buffer.from('{}'));
  noEstimate(calculateLocalEstimate(args));
});
test('complete lineage is mandatory, not just a latest valid rubric payload', () => {
  const args = fixture();
  args.evidence = bundle([
    {
      record: envelope({
        payload: { ...envelope().payload, version: 2, predecessorRecordId: id(80) },
        predecessor: id(80),
        supersedes: id(80),
      }),
      provenance: 'imported-local',
    },
  ]);
  noEstimate(calculateLocalEstimate(args));
});
test('incomplete retained timing never becomes a zero-hour estimate', async () => {
  const args = fixture();
  const record = envelope({ recordId: id(3), payload: await incompleteOutcome(1068), issue: 1068 });
  args.evidence = bundle([
    { record: envelope(), provenance: 'imported-local' },
    { record, provenance: 'imported-local' },
  ]);
  noEstimate(calculateLocalEstimate(args));
});
test('requested but missing comparable refuses rather than silently using a prior', () => {
  noEstimate(calculateLocalEstimate(fixture({ outcomes: false })));
});
test('the existing pure model explicitly supports an empty local cohort and records its limitation', () => {
  const args = fixture({ outcomes: false });
  args.planInput.input.comparableIssueIds = [];
  const result = calculateLocalEstimate(args);
  assert.equal(result.status, 'estimated');
  assert.deepEqual(result.forecast.comparableIssues, []);
  assert.ok(result.limitations.includes('no-retained-comparable-outcomes'));
});
test('an injected model must explicitly support empty comparables', () => {
  const args = fixture({ outcomes: false });
  args.planInput.input.comparableIssueIds = [];
  let calls = 0;
  args.model = {
    ...LOCAL_ESTIMATION_MODEL,
    supportsEmptyComparables: false,
    calculate() {
      calls++;
    },
  };
  noEstimate(calculateLocalEstimate(args));
  assert.equal(calls, 0);
});
test('model identity must match the retained policy', () => {
  const args = fixture();
  args.model = { ...LOCAL_ESTIMATION_MODEL, modelVersion: 'foreign-model' };
  noEstimate(calculateLocalEstimate(args));
});
test('model receives immutable detached local payloads only', () => {
  const args = fixture();
  let frozen = false;
  args.model = {
    ...LOCAL_ESTIMATION_MODEL,
    calculate(inputs) {
      assert.ok(Object.isFrozen(inputs.rubric.payload));
      assert.ok(Object.isFrozen(inputs.comparableOutcomes[0].payload));
      assert.throws(() => {
        inputs.refine.humanHours = 999;
      }, TypeError);
      frozen = true;
      return LOCAL_ESTIMATION_MODEL.calculate(inputs);
    },
  };
  assert.equal(calculateLocalEstimate(args).status, 'estimated');
  assert.equal(frozen, true);
});
for (const kind of [
  'throw',
  'empty',
  'foreign-rubric',
  'foreign-outcome',
  'wrong-refine',
  'off-grid',
  'promise',
]) {
  test('invalid model output fails closed: ' + kind, () => {
    const args = fixture();
    args.model = {
      ...LOCAL_ESTIMATION_MODEL,
      calculate(inputs) {
        if (kind === 'throw') throw Error('model failure');
        if (kind === 'empty') return {};
        const result = LOCAL_ESTIMATION_MODEL.calculate(inputs);
        if (kind === 'foreign-rubric') result.rubric.recordId = id(88);
        if (kind === 'foreign-outcome') result.comparableIssues[0].outcomeRecordId = id(88);
        if (kind === 'wrong-refine') result.refine.humanHours = 4;
        if (kind === 'off-grid') result.plan.humanHours = 44.1;
        if (kind === 'promise') return Promise.resolve(result);
        return result;
      },
    };
    noEstimate(calculateLocalEstimate(args));
  });
}

test('a freshly derived candidate cannot be referenced until genuine local persistence', () => {
  const args = fixture({ outcomes: false });
  const b = bundle();
  args.model = { ...LOCAL_ESTIMATION_MODEL, ...b.manifest.modelPolicy };
  args.evidence = b;
  const { inputs: _i, schema: _s, canonicalizationVersion: _c, ...selection } = b.manifest;
  args.planInput.selection = structuredClone(selection);
  args.planInput.input.comparableIssueIds = [];
  noEstimate(calculateLocalEstimate(args));
});

test('provenance lists only the explicitly selected retained comparables', () => {
  const args = fixture();
  const extra = envelope({ recordId: id(4), payload: outcome(1069), issue: 1069 });
  const raw = bytes(extra),
    digest = hash(raw),
    payloadPath = 'payloads/' + digest + '.json';
  args.evidence.payloads.set(payloadPath, raw);
  args.evidence.manifest.inputs.push({
    recordId: extra.recordId,
    recordType: extra.recordType,
    schema: extra.schema,
    payloadDigest: digest,
    payloadPath,
    predecessorRecordId: null,
    supersedesRecordId: null,
    provenance: 'imported-local',
    sourceCommentId: null,
    observedAt: null,
    importedAt: '2026-10-21T00:00:00.000Z',
  });
  const result = calculateLocalEstimate(args);
  assert.equal(result.status, 'estimated');
  assert.deepEqual(
    result.forecast.comparableIssues.map((x) => x.issue),
    [1068]
  );
  assert.deepEqual(
    result.localEvidence.outcomes.map((x) => x.issue),
    [1068]
  );
});
test('malformed unavailable reason is normalized to a concrete string', () => {
  const result = calculateLocalEstimate({
    mode: { mode: 'unavailable', reason: { bad: 'shape' } },
  });
  noEstimate(result);
});
