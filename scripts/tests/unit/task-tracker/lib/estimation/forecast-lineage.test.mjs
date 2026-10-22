// @story #2039 #2064
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { resolveLocalForecast } from '../../../../../task-tracker/lib/estimation/forecast-lineage.mjs';
import { readLocalForecastEvidence } from '../../../../../task-tracker/lib/estimation/forecast-reader.mjs';
import { calculateLocalEstimate } from '../../../../../task-tracker/lib/estimation/local-runtime.mjs';
import { validateLocalEvidence } from '../../../../../task-tracker/lib/estimation/local-evidence.mjs';
import {
  bundle,
  envelope,
  outcome,
  id,
  rubric,
  incompleteOutcome,
} from '../../../../helpers/local-estimation-evidence-fixture.mjs';

const identity = { host: 'github.com', repository: 'owner/repo', issue: 2045 };
function fixture(
  records = [envelope(), envelope({ recordId: id(10), payload: outcome(1068), issue: 1068 })]
) {
  const evidence = bundle(records.map((record) => ({ record, provenance: 'imported-local' })));
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
    fs.readFileSync(new URL('../../../../fixtures/estimation/plan-input.json', import.meta.url))
  );
  const calculated = calculateLocalEstimate({
    mode: { mode: 'local' },
    evidence,
    planInput: { selection, input },
  });
  assert.equal(calculated.status, 'estimated');
  const forecast = {
    ...structuredClone(calculated.forecast),
    schema: 'aitm.estimation-forecast/v3',
    localEvidence: structuredClone(calculated.localEvidence),
  };
  const requests = [];
  const evidenceStore = {
    read(digest) {
      requests.push(digest);
      return validateLocalEvidence(evidence);
    },
  };
  return { forecast, evidence, evidenceStore, requests };
}

test('resolves a v3 forecast from exact retained local bytes with no cloud dependency', async () => {
  const f = fixture();
  const result = resolveLocalForecast({ ...f, identity });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.forecast, f.forecast);
  assert.deepEqual(f.requests, [f.forecast.localEvidence.manifestDigest]);
  assert.equal(result.evidence.activeRubric.record.recordId, id(1));
  assert.deepEqual(
    result.evidence.activeOutcomes.map(({ record }) => record.recordId),
    [id(10)]
  );
});

for (const wrong of [
  { ...identity, host: 'other.example' },
  { ...identity, repository: 'other/repo' },
  { ...identity, issue: 2046 },
  undefined,
  { host: identity.host, repository: identity.repository },
]) {
  test('refuses missing or mismatched requested identity: ' + JSON.stringify(wrong), () => {
    const f = fixture();
    assert.equal(resolveLocalForecast({ ...f, identity: wrong }).status, 'unavailable');
  });
}

test('reader validates requested identity against the retained manifest', () => {
  const f = fixture();
  assert.throws(() =>
    readLocalForecastEvidence({
      evidenceStore: f.evidenceStore,
      manifestDigest: f.forecast.localEvidence.manifestDigest,
      identity: { ...identity, host: 'other.example' },
    })
  );
});

test('regenerates active projections from bytes and detaches its forecast snapshot', () => {
  const f = fixture();
  const read = validateLocalEvidence(f.evidence);
  const result = resolveLocalForecast({
    ...f,
    identity,
    evidenceStore: {
      read: () => ({ ...read, records: [], activeRubric: null, activeOutcomes: [] }),
    },
  });
  assert.equal(result.status, 'resolved');
  assert.equal(result.evidence.records.length, 2);
  assert.equal(result.evidence.activeRubric.record.recordId, id(1));
  result.forecast.localEvidence.plan.path = 'changed';
  assert.equal(f.forecast.localEvidence.plan.path, 'docs/selected-plan.md');
});

for (const [name, mutate] of [
  [
    'plan',
    (f) => {
      f.localEvidence.plan.commit = 'f'.repeat(40);
    },
  ],
  [
    'refine source',
    (f) => {
      f.localEvidence.refine.source.id = 'other';
    },
  ],
  [
    'model policy',
    (f) => {
      f.localEvidence.modelPolicy.policyVersion = 'other/v1';
    },
  ],
  [
    'rubric origin',
    (f) => {
      f.localEvidence.rubric.provenance = 'derived-local';
    },
  ],
  [
    'rubric bytes',
    (f) => {
      f.localEvidence.rubric.payloadDigest = 'f'.repeat(64);
    },
  ],
  [
    'outcome bytes',
    (f) => {
      f.localEvidence.outcomes[0].payloadDigest = 'f'.repeat(64);
    },
  ],
  [
    'source comment',
    (f) => {
      f.localEvidence.outcomes[0].sourceCommentId = 'IC_invented';
    },
  ],
  [
    'manifest digest',
    (f) => {
      f.localEvidence.manifestDigest = 'f'.repeat(64);
    },
  ],
]) {
  test('refuses mismatched forecast ' + name, () => {
    const f = fixture();
    mutate(f.forecast);
    assert.equal(resolveLocalForecast({ ...f, identity }).status, 'unavailable');
  });
}

function withBundle(f, evidence) {
  return resolveLocalForecast({ ...f, identity, evidenceStore: { read: () => evidence } });
}
const nextRubric = () =>
  envelope({
    recordId: id(2),
    payload: rubric({ version: 2, predecessor: id(1) }),
    predecessor: id(1),
    supersedes: id(1),
  });
const imported = (records) =>
  bundle(records.map((record) => ({ record, provenance: 'imported-local' })));

test('resolves every retained ancestor in arbitrary input order and selects only active records', () => {
  const previous = envelope({ recordId: id(10), payload: outcome(1068), issue: 1068 });
  const current = envelope({
    recordId: id(11),
    payload: outcome(1068),
    issue: 1068,
    supersedes: id(10),
  });
  const f = fixture([nextRubric(), current, envelope(), previous]);
  const result = resolveLocalForecast({ ...f, identity });
  assert.equal(result.status, 'resolved');
  assert.equal(result.evidence.records.length, 4);
  assert.equal(result.evidence.activeRubric.record.recordId, id(2));
  assert.deepEqual(
    result.evidence.activeOutcomes.map(({ record }) => record.recordId),
    [id(11)]
  );
});

for (const [name, records, reason] of [
  ['missing ancestor', () => [nextRubric()], 'missing-or-mismatched-ancestor'],
  ['forked rubric', () => [envelope(), nextRubric(), { ...nextRubric(), recordId: id(3) }], 'fork'],
  [
    'disconnected active rubrics',
    () => [envelope(), envelope({ recordId: id(2) })],
    'active-rubric',
  ],
  [
    'ambiguous outcome',
    () => [
      envelope(),
      envelope({ recordId: id(10), payload: outcome(1068), issue: 1068 }),
      envelope({ recordId: id(11), payload: outcome(1068), issue: 1068 }),
    ],
    'ambiguous-outcome',
  ],
  [
    'conflicting record bytes',
    () => [envelope(), envelope({ payload: { ...rubric(), review: { reworkProbability: 0.4 } } })],
    'conflicting-record-id',
  ],
]) {
  test('refuses retained ' + name, () => {
    const result = withBundle(fixture(), imported(records()));
    assert.equal(result.status, 'unavailable');
    assert.ok(result.reason.includes(reason), result.reason);
  });
}

for (const [name, mutate, reason] of [
  ['missing payload', (b) => b.payloads.delete(b.manifest.inputs[0].payloadPath), 'bytes'],
  [
    'corrupt ancestor bytes',
    (b) => {
      b.payloads.get(b.manifest.inputs[0].payloadPath)[0] = 0;
    },
    'input-hash',
  ],
  [
    'corrupt plan bytes',
    (b) => {
      b.planBytes[0] = 0;
    },
    'plan',
  ],
  [
    'mismatched origin',
    (b) => {
      b.manifest.inputs[0].provenance = 'observed-cloud';
    },
    'observed-source',
  ],
  [
    'unreferenced payload',
    (b) => {
      b.payloads.set('payloads/unreferenced.json', Buffer.from('{}'));
    },
    'unreferenced-payload',
  ],
]) {
  test('refuses ' + name + ' without trusting cached projections', () => {
    const f = fixture([
      envelope(),
      nextRubric(),
      envelope({ recordId: id(10), payload: outcome(1068), issue: 1068 }),
    ]);
    mutate(f.evidence);
    const result = withBundle(f, f.evidence);
    assert.equal(result.status, 'unavailable');
    assert.ok(result.reason.includes(reason), result.reason);
  });
}

test('missing storage stays unavailable after exactly one local read', () => {
  const f = fixture();
  let calls = 0;
  const result = resolveLocalForecast({
    ...f,
    identity,
    evidenceStore: {
      read() {
        calls++;
        throw Object.assign(new Error('manifest missing'), { reason: 'manifest-missing' });
      },
    },
  });
  assert.deepEqual(result, { status: 'unavailable', reason: 'manifest-missing' });
  assert.equal(calls, 1);
});

test('arbitrary thrown storage values still produce a usable unavailable result', () => {
  const f = fixture();
  const error = Object.create(null, {
    reason: {
      get() {
        throw null;
      },
    },
    message: {
      get() {
        throw null;
      },
    },
  });
  const result = resolveLocalForecast({
    ...f,
    identity,
    evidenceStore: {
      read() {
        throw error;
      },
    },
  });
  assert.deepEqual(result, { status: 'unavailable', reason: 'local-forecast-invalid' });
});

test('rejects executable snapshot properties without evaluating them', () => {
  const f = fixture();
  let calls = 0;
  Object.defineProperty(f.forecast.localEvidence, 'manifestDigest', {
    enumerable: true,
    get() {
      calls++;
      return 'f'.repeat(64);
    },
  });
  assert.equal(resolveLocalForecast({ ...f, identity }).status, 'unavailable');
  assert.equal(calls, 0);
  assert.equal(f.requests.length, 0);
});

test('Unknown timing remains unavailable while an inactive Unknown ancestor is retained intact', async () => {
  const unknown = await incompleteOutcome(1068);
  const old = envelope({ recordId: id(10), payload: unknown, issue: 1068 });
  const bad = withBundle(fixture(), imported([envelope(), old]));
  assert.deepEqual(bad, { status: 'unavailable', reason: 'outcome-timing-incomplete' });
  assert.equal(unknown.actual.engagedHours, null);
  const current = envelope({
    recordId: id(11),
    payload: outcome(1068),
    issue: 1068,
    supersedes: id(10),
  });
  const f = fixture([envelope(), old, current]);
  const good = resolveLocalForecast({ ...f, identity });
  assert.equal(good.status, 'resolved');
  assert.equal(
    good.evidence.records.find(({ record }) => record.recordId === id(10)).record.payload.actual
      .engagedHours,
    null
  );
  assert.deepEqual(
    good.evidence.activeOutcomes.map(({ record }) => record.recordId),
    [id(11)]
  );
});

for (const resource of ['rubric', 'outcome']) {
  test('refuses an inactive ' + resource + ' even when its bytes remain retained', () => {
    const f = fixture();
    const current =
      resource === 'rubric'
        ? nextRubric()
        : envelope({ recordId: id(11), payload: outcome(1068), issue: 1068, supersedes: id(10) });
    const records = [
      envelope(),
      envelope({ recordId: id(10), payload: outcome(1068), issue: 1068 }),
      current,
    ];
    const evidence = imported(records);
    evidence.manifest.modelPolicy = f.evidence.manifest.modelPolicy;
    f.forecast.localEvidence.manifestDigest = validateLocalEvidence(evidence).manifestDigest;
    const result = withBundle(f, evidence);
    assert.equal(result.status, 'unavailable');
    assert.ok(result.reason.includes('retained-' + resource), result.reason);
  });
}

test('refuses a retained ancestry cycle rather than selecting by input order', () => {
  const first = envelope({
    recordId: id(10),
    payload: outcome(1068),
    issue: 1068,
    supersedes: id(11),
  });
  const next = envelope({
    recordId: id(11),
    payload: outcome(1068),
    issue: 1068,
    supersedes: id(10),
  });
  const result = withBundle(fixture(), imported([envelope(), first, next]));
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'cycle');
});
