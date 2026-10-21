// @story #2039 #2045
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateLocalEvidence,
  createLocalDerivedRecord,
  importLocalEvidence,
} from '../../../../../task-tracker/lib/estimation/local-evidence.mjs';
import {
  bundle,
  derived,
  envelope,
  rubric,
  outcome,
  id,
  time,
  bytes,
  hash,
} from '../../../../helpers/local-estimation-evidence-fixture.mjs';
const refuses = (fn) => assert.throws(fn, { code: 'LOCAL_EVIDENCE_UNAVAILABLE' });
for (const provenance of ['observed-cloud', 'imported-local', 'derived-local'])
  test(`valid ${provenance} evidence retains its exact envelope and provenance`, () => {
    const record = provenance === 'derived-local' ? derived() : envelope();
    const b = bundle([{ record, provenance }]);
    const before = Buffer.from([...b.payloads.values()][0]);
    const result = validateLocalEvidence(b);
    assert.equal(result.manifestDigest, hash(bytes(b.manifest)));
    assert.deepEqual(result.records[0].record, record);
    assert.deepEqual([...b.payloads.values()][0], before);
    assert.equal(result.records[0].descriptor.provenance, provenance);
    assert.equal(result.manifest.inputs[0].sourceCommentId, b.manifest.inputs[0].sourceCommentId);
    assert.equal(Object.isFrozen(result.manifest), true);
  });
test('a real local derived record ID and payload hash are allocated without a cloud grant', () => {
  const record = createLocalDerivedRecord({
    recordType: 'estimation-rubric',
    repository: 'owner/repo',
    issue: 1001,
    payload: rubric(),
    createdAt: time,
    modelPolicy: { modelVersion: 'fixture-model/v1', policyVersion: 'fixture-policy/v1' },
  });
  assert.match(record.recordId, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(record.schema, 'aitm.local-derived-record/v1');
  assert.equal(Object.hasOwn(record, 'authority'), false);
  assert.equal(Object.hasOwn(record, 'sourceCommentId'), false);
  assert.equal(record.payloadHash, 'sha256:' + hash(bytes(record.payload)));
  validateLocalEvidence(bundle([{ record, provenance: 'derived-local' }]));
});
for (const [field, value] of [
  ['schema', 'other'],
  ['canonicalizationVersion', 'unknown'],
  ['host', 'GitHub.com'],
  ['repository', 'Owner/Repo'],
  ['issue', 0],
  ['configuration', { estimationRubricIssue: -1 }],
  ['plan', {}],
  ['refine', {}],
  ['modelPolicy', {}],
  ['inputs', null],
])
  test(`malformed manifest ${field} refuses`, () => {
    const b = bundle();
    b.manifest[field] = value;
    refuses(() => validateLocalEvidence(b));
  });
test('unknown manifest fields cannot carry invented permission', () => {
  const b = bundle();
  b.manifest.verified = true;
  refuses(() => validateLocalEvidence(b));
});
for (const field of ['plan', 'payload', 'payload-hash', 'path', 'extra-payload'])
  test(`exact bytes and references refuse ${field}`, () => {
    const b = bundle();
    const entry = b.manifest.inputs[0];
    if (field === 'plan') b.planBytes = Buffer.from('changed plan');
    if (field === 'payload') b.payloads.set(entry.payloadPath, Buffer.from('{}'));
    if (field === 'payload-hash') entry.payloadDigest = '0'.repeat(64);
    if (field === 'path') entry.payloadPath = '../outside.json';
    if (field === 'extra-payload')
      b.payloads.set('payloads/' + 'f'.repeat(64) + '.json', Buffer.from('{}'));
    refuses(() => validateLocalEvidence(b));
  });
for (const provenance of ['imported-local', 'derived-local'])
  test(`${provenance} cannot claim a source cloud comment`, () => {
    const b = bundle([
      {
        record: provenance === 'derived-local' ? derived() : envelope(),
        provenance,
        sourceCommentId: 'IC_fake',
      },
    ]);
    refuses(() => validateLocalEvidence(b));
  });
test('observed evidence requires its genuine declared source identity and time', () => {
  for (const extra of [{ sourceCommentId: null }, { observedAt: null }]) {
    const b = bundle([{ record: envelope(), provenance: 'observed-cloud', ...extra }]);
    refuses(() => validateLocalEvidence(b));
  }
});
test('a derived wrapper cannot gain authority or verified fields', () => {
  for (const extra of [
    { authority: { grantId: id(99), epoch: 1, actor: 'fake' } },
    { verified: true },
    { sourceCommentId: 'IC_fake' },
  ])
    refuses(() =>
      validateLocalEvidence(
        bundle([{ record: { ...derived(), ...extra }, provenance: 'derived-local' }])
      )
    );
});
test('provenance must match the actual record wrapper', () => {
  refuses(() =>
    validateLocalEvidence(bundle([{ record: derived(), provenance: 'imported-local' }]))
  );
  refuses(() =>
    validateLocalEvidence(bundle([{ record: envelope(), provenance: 'derived-local' }]))
  );
});
test('record hash mismatch is rejected after the outer byte digest matches', () => {
  const record = { ...derived(), payloadHash: 'sha256:' + '0'.repeat(64) };
  refuses(() => validateLocalEvidence(bundle([{ record, provenance: 'derived-local' }])));
});
test('wrong repository is rejected inside an otherwise valid envelope', () => {
  const record = { ...envelope(), repository: 'other/repo' };
  refuses(() => validateLocalEvidence(bundle([{ record, provenance: 'imported-local' }])));
});
test('a complete rubric predecessor chain can be supplied in any retained input order', () => {
  const first = derived();
  const next = derived({
    recordId: id(2),
    payload: rubric({ version: 2, predecessor: id(1) }),
    predecessor: id(1),
    supersedes: id(1),
  });
  const result = validateLocalEvidence(bundle([{ record: next }, { record: first }]));
  assert.equal(result.activeRubric.record.recordId, id(2));
  assert.equal(result.records.length, 2);
});
test('missing ancestors and forked rubric successors refuse', () => {
  const next = derived({
    recordId: id(2),
    payload: rubric({ version: 2, predecessor: id(1) }),
    predecessor: id(1),
    supersedes: id(1),
  });
  refuses(() => validateLocalEvidence(bundle([{ record: next }])));
  const fork = { ...next, recordId: id(3) };
  refuses(() =>
    validateLocalEvidence(bundle([{ record: derived() }, { record: next }, { record: fork }]))
  );
});
test('duplicate IDs with conflicting bytes refuse; identical repeated inputs do not double count', () => {
  const first = derived();
  const changed = derived({ payload: { ...rubric(), review: { reworkProbability: 0.4 } } });
  refuses(() => validateLocalEvidence(bundle([{ record: first }, { record: changed }])));
  assert.equal(
    validateLocalEvidence(bundle([{ record: first }, { record: first }])).records.length,
    1
  );
});
test('native outcome correction with supersession and no predecessor remains supported', () => {
  const first = derived({ recordId: id(10), payload: outcome(), issue: 1002 });
  const next = derived({ recordId: id(11), payload: outcome(), issue: 1002, supersedes: id(10) });
  const result = validateLocalEvidence(
    bundle([{ record: derived() }, { record: first }, { record: next }])
  );
  assert.deepEqual(
    result.activeOutcomes.map((r) => r.record.recordId),
    [id(11)]
  );
});
test('outcome ancestry cycles refuse rather than choosing an active record by timestamp', () => {
  const first = derived({ recordId: id(10), payload: outcome(), issue: 1002, supersedes: id(11) });
  const next = derived({ recordId: id(11), payload: outcome(), issue: 1002, supersedes: id(10) });
  refuses(() =>
    validateLocalEvidence(bundle([{ record: derived() }, { record: first }, { record: next }]))
  );
});
test('a rubric cohort must have retained matching outcome evidence', () => {
  const payload = { ...rubric(), cohort: [{ issue: 1002, outcomeRecordId: id(10) }] };
  refuses(() => validateLocalEvidence(bundle([{ record: derived({ payload }) }])));
  validateLocalEvidence(
    bundle([
      { record: derived({ payload }) },
      { record: derived({ recordId: id(10), payload: outcome(), issue: 1002 }) },
    ])
  );
});
test('measured zero remains zero while Unknown is not defaulted into a usable outcome', () => {
  const p = outcome();
  p.actual = { ...p.actual, engagedHours: 0, stages: { plan: 0, develop: 0, test: 0, review: 0 } };
  p.costClassification = { ...p.costClassification, necessaryHours: 0 };
  p.variance = { vsAiP50Hours: -3, vsAiP80Hours: -4 };
  const b = bundle([
    { record: derived() },
    { record: derived({ recordId: id(10), payload: p, issue: 1002 }) },
  ]);
  assert.equal(validateLocalEvidence(b).activeOutcomes[0].record.payload.actual.engagedHours, 0);
  p.actual.engagedHours = null;
  refuses(() =>
    validateLocalEvidence(
      bundle([
        { record: derived() },
        { record: derived({ recordId: id(10), payload: p, issue: 1002 }) },
      ])
    )
  );
  assert.equal(p.actual.engagedHours, null);
});
test('disabled evidence can be retained without inventing a rubric or estimate', () => {
  const result = validateLocalEvidence(bundle([], { configuration: { estimationRubricIssue: 0 } }));
  assert.equal(result.activeRubric, null);
  assert.equal(Object.hasOwn(result, 'estimate'), false);
});
test('positive configuration without a retained rubric refuses', () =>
  refuses(() => validateLocalEvidence(bundle([]))));
test('an arbitrary object cannot impersonate the durable evidence store', async () => {
  await assert.rejects(importLocalEvidence({ evidenceStore: {}, bundle: bundle() }), {
    code: 'LOCAL_EVIDENCE_STORE_UNAVAILABLE',
  });
});

test('a semantically valid incomplete native outcome refuses active estimation without erasing Unknown', async () => {
  const { incompleteOutcome } =
    await import('../../../../helpers/local-estimation-evidence-fixture.mjs');
  const p = await incompleteOutcome();
  const { validateEstimationOutcome } =
    await import('../../../../../task-tracker/lib/estimation/outcome-record.mjs');
  validateEstimationOutcome(p, { expectedIssue: 1002 });
  const b = bundle([
    { record: derived() },
    { record: derived({ recordId: id(10), payload: p, issue: 1002 }) },
  ]);
  assert.throws(() => validateLocalEvidence(b), {
    code: 'LOCAL_EVIDENCE_UNAVAILABLE',
    reason: 'outcome-timing-incomplete',
  });
  assert.equal(p.actual.engagedHours, null);
});
test('an incomplete native ancestor stays intact after a complete superseding outcome', async () => {
  const { incompleteOutcome } =
    await import('../../../../helpers/local-estimation-evidence-fixture.mjs');
  const p = await incompleteOutcome();
  const first = derived({ recordId: id(10), payload: p, issue: 1002 });
  const next = derived({ recordId: id(11), payload: outcome(), issue: 1002, supersedes: id(10) });
  const result = validateLocalEvidence(
    bundle([{ record: derived() }, { record: first }, { record: next }])
  );
  assert.equal(
    result.records.find((r) => r.record.recordId === id(10)).record.payload.actual.engagedHours,
    null
  );
  assert.deepEqual(
    result.activeOutcomes.map((r) => r.record.recordId),
    [id(11)]
  );
});
