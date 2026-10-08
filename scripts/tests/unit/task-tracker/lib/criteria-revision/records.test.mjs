// @story #1853 #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeLegacyRevisionFixture,
  makeCanonicalRevisionFixture,
} from '../../../../fixtures/criteria-revision.mjs';
import {
  deriveProposal,
  deriveResourceVector,
} from '../../../../../task-tracker/lib/criteria-revision/proposal.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { hashBytes } from '../../../../../task-tracker/lib/criteria-revision/schema.mjs';
const api = await import('../../../../../task-tracker/lib/criteria-revision/records.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
function event() {
  assert.equal(typeof api.createRevisionEvent, 'function');
  const f = makeLegacyRevisionFixture();
  return api.createRevisionEvent({ request: f.request, predecessorEventId: null });
}
test('complete prepared record round trips original proof and body bytes', () => {
  const e = event(),
    body = api.renderRevisionEvent(e),
    read = api.parseRevisionEvent(body);
  assert.deepEqual(read, e);
  assert.equal(
    read.proposal.archive.observation.body.bytes,
    makeLegacyRevisionFixture().observation.body.bytes
  );
  assert.ok(body.includes('Independent requirement'));
  assert.equal(api.renderRevisionEvent(read), body);
});
test('rendered Unicode event enforces the exact 60000 byte boundary without truncation', () => {
  const f = makeLegacyRevisionFixture();
  assert.equal(typeof api.createRevisionEvent, 'function');
  // A reason is required archive data. Change it through proposal derivation, never trim archives.
  const make = (reason) =>
    api.createRevisionEvent({
      request: { ...f.request, proposal: deriveProposal({ ...f.context, reason }) },
      predecessorEventId: null,
    });
  const initial = make('界');
  const overhead = Buffer.byteLength(api.renderRevisionEvent(initial)) - Buffer.byteLength('界');
  const exact = make('界' + 'x'.repeat(60000 - overhead - 3));
  assert.equal(Buffer.byteLength(api.renderRevisionEvent(exact)), 60000);
  assert.throws(
    () => api.renderRevisionEvent(make('界' + 'x'.repeat(60000 - overhead - 2))),
    /archive-too-large/
  );
});
test('incomplete archive and independently edited sealed write bytes refuse', () => {
  const e = event();
  const c = structuredClone(e);
  c.proposal.archive.observation.body.bytes = 'lost';
  assert.throws(() => api.renderRevisionEvent(c), /revision/);
  const d = structuredClone(e);
  d.proposal.writeSet[0].afterBytes += 'forged';
  d.proposal.writeSet[0].afterHash = hashBytes(d.proposal.writeSet[0].afterBytes);
  assert.throws(() => api.renderRevisionEvent(d), /revision/);
});
test('event envelope is closed and rejects malformed or noncanonical revision comments', () => {
  const e = event();
  assert.throws(() => api.renderRevisionEvent({ ...e, extra: true }));
  assert.throws(() => api.parseRevisionEvent('<!-- aitm.criteria-revision-event/v1 -->broken'));
  assert.equal(api.parseRevisionEvent('Ordinary comment'), null);
  const bytes = api.renderRevisionEvent(e);
  assert.throws(() => api.parseRevisionEvent(bytes + ' '));
});
test('durable recovery references hydrate exact predecessor bytes without duplicating its archive', () => {
  const f = makeLegacyRevisionFixture();
  const root = api.createRevisionEvent({ request: f.request, predecessorEventId: null });
  const rootBytes = api.renderRevisionEvent(root);
  const next = api.createRevisionEvent({
    request: f.resumeRequest,
    predecessorEventId: root.eventId,
    rootEventId: root.eventId,
    rootProposalDigest: root.proposalDigest,
  });
  const bytes = api.renderRevisionEvent(next);
  assert.ok(Buffer.byteLength(bytes) < 60000);
  assert.ok(bytes.includes('aitm.criteria-revision-event-reference/v1'));
  assert.deepEqual(
    api.parseRevisionEvent(bytes, { records: [{ eventId: root.eventId, bytes: rootBytes }] }),
    next
  );
  assert.throws(() => api.parseRevisionEvent(bytes), /reference/);
  assert.throws(
    () =>
      api.parseRevisionEvent(bytes, {
        records: [{ eventId: root.eventId, bytes: rootBytes + ' ' }],
      }),
    /reference|event/
  );
});
test('published authorizer is bound to the complete exact statement and original source identity', () => {
  const e = event();
  e.authorizer = {
    reference: 'codex://sessions/foreign/messages/foreign',
    statement: 'forged',
    statementHash: e.authorizationSource.statementHash,
    principal: null,
    executingSession: e.executor.sessionId,
    origin: 'codex-session-transcript',
    verificationLevel: 'host-verified-user-message',
  };
  assert.throws(() => api.renderRevisionEvent(e), /authorizer/);
});
test('required original credential-bearing bytes refuse publication rather than being redacted', () => {
  const f = makeLegacyRevisionFixture();
  const proposal = deriveProposal({
    ...f.context,
    reason: 'Authorization: Bearer synthetic-credential-value',
  });
  const e = api.createRevisionEvent({
    request: { ...f.request, proposal },
    predecessorEventId: null,
  });
  assert.throws(() => api.renderRevisionEvent(e), /secret/);
  assert.equal(proposal.reason, 'Authorization: Bearer synthetic-credential-value');
});

test('resource vector seals proof semantics, delivery identity and capsule bytes with deterministic identities', () => {
  const o = makeCanonicalRevisionFixture().observation;
  o.delivery.records = [{ identity: 'delivery-1', bytes: 'original delivery' }];
  const base = deriveResourceVector(o);
  for (const mutate of [
    (x) => (x.proofRecords[0].bytes += ' drift'),
    (x) => (x.proofRecords[0].identity += '-drift'),
    (x) => (x.proofRecords[0].kind = 'test'),
    (x) => (x.proofRecords[0].criterionIdentity = 'other-criterion'),
    (x) => (x.delivery.records[0].bytes += ' drift'),
    (x) => (x.delivery.records[0].identity += '-drift'),
    (x) => (x.capsule.bytes += ' drift'),
    (x) => (x.capsule.head += '-drift'),
  ]) {
    const changed = structuredClone(o);
    mutate(changed);
    assert.notDeepEqual(deriveResourceVector(changed), base);
  }
  const reorder = structuredClone(o);
  reorder.proofRecords.reverse();
  assert.deepEqual(deriveResourceVector(reorder), base);
  for (const name of ['proofRecords', 'delivery']) {
    const duplicate = structuredClone(o);
    const rows = name === 'delivery' ? duplicate.delivery.records : duplicate.proofRecords;
    rows.push({ ...rows[0] });
    assert.throws(() => deriveResourceVector(duplicate), /duplicate/);
  }
});

test('a durable self-reference refuses as a cycle before hydration', () => {
  const f = makeLegacyRevisionFixture();
  const next = api.createRevisionEvent({
    request: f.resumeRequest,
    predecessorEventId: f.resumeRequest.proposal.priorTransaction.eventId,
  });
  const wire = api.readRevisionEnvelope(api.renderRevisionEvent(next));
  const record = wire.proposal.archive.observation.revisionRecords.records[0];
  record.eventId = wire.eventId;
  record.reference.eventId = wire.eventId;
  const bytes =
    '<!-- aitm.criteria-revision-event/v1 -->\n```json\n' + canonicalRecordJson(wire) + '\n```\n';
  assert.throws(
    () => api.parseRevisionEvent(bytes, { records: [{ eventId: wire.eventId, bytes }] }),
    /reference-cycle/
  );
});
test('verified graph scope cannot hide unavailable, duplicate, tampered or mutated predecessor authority', () => {
  const f = makeLegacyRevisionFixture(),
    root = event(),
    rootBytes = api.renderRevisionEvent(root);
  const recovery = api.createRevisionEvent({
    request: f.resumeRequest,
    predecessorEventId: root.eventId,
    rootEventId: root.eventId,
    rootProposalDigest: root.proposalDigest,
  });
  const bytes = api.renderRevisionEvent(recovery),
    records = [{ eventId: root.eventId, bytes: rootBytes }];
  api.withRevisionValidation(() => {
    const read = api.parseRevisionEvent(bytes, { records });
    read.proposal.archive.observation.body.bytes += 'caller mutation';
    assert.deepEqual(api.parseRevisionEvent(bytes, { records }), recovery);
    assert.throws(() => api.parseRevisionEvent(bytes), /reference-unavailable/);
    assert.throws(
      () => api.parseRevisionEvent(bytes, { records: [...records, ...records] }),
      /duplicate/
    );
    assert.throws(
      () => api.parseRevisionEvent(bytes, { records: [{ ...records[0], bytes: rootBytes + ' ' }] }),
      /reference/
    );
    const forged = structuredClone(recovery);
    forged.proposal.writeSet[0].afterBytes += ' forged';
    assert.throws(() => api.renderRevisionEvent(forged), /revision/);
  });
  assert.throws(
    () =>
      api.withRevisionValidation(() => {
        api.parseRevisionEvent(rootBytes);
        throw new Error('scope interruption');
      }),
    /scope interruption/
  );
  assert.throws(
    () => api.withRevisionValidation(() => Promise.resolve()),
    /async-validation-scope/
  );
  assert.deepEqual(api.parseRevisionEvent(bytes, { records }), recovery);
});

test('one synchronous graph validation decodes each identical envelope once', () => {
  const f = makeLegacyRevisionFixture();
  const root = api.createRevisionEvent({ request: f.request, predecessorEventId: null });
  const rootBytes = api.renderRevisionEvent(root);
  const recovery = api.createRevisionEvent({
    request: f.resumeRequest,
    predecessorEventId: root.eventId,
    rootEventId: root.eventId,
    rootProposalDigest: root.proposalDigest,
  });
  const bytes = api.renderRevisionEvent(recovery);
  const records = [{ eventId: root.eventId, bytes: rootBytes }];
  const prefix = '<!-- aitm.criteria-revision-event/v1 -->\n```json\n';
  const payload = rootBytes.slice(prefix.length, -5);
  const original = JSON.parse;
  let decodes = 0;
  try {
    JSON.parse = function (...args) {
      if (args[0] === payload) decodes++;
      return Reflect.apply(original, this, args);
    };
    api.withRevisionValidation(() => {
      assert.deepEqual(api.parseRevisionEvent(bytes, { records }), recovery);
      assert.deepEqual(api.parseRevisionEvent(bytes, { records }), recovery);
    });
  } finally {
    JSON.parse = original;
  }
  assert.equal(JSON.parse, original);
  assert.equal(decodes, 1);
});

test('decoded envelope reuse keeps public results mutable and scopes independent', () => {
  const root = event();
  const bytes = api.renderRevisionEvent(root);
  const prefix = '<!-- aitm.criteria-revision-event/v1 -->\n```json\n';
  const payload = bytes.slice(prefix.length, -5);
  const original = JSON.parse;
  let decodes = 0;
  const counts = [];
  const sentinel = new Error('scope cleanup');
  try {
    JSON.parse = function (...args) {
      if (args[0] === payload) decodes++;
      return Reflect.apply(original, this, args);
    };
    api.withRevisionValidation(() => {
      assert.deepEqual(api.parseRevisionEvent(bytes), root);
      assert.deepEqual(api.parseRevisionEvent(bytes), root);
    });
    counts.push(decodes);
    assert.throws(
      () =>
        api.withRevisionValidation(() => {
          assert.deepEqual(api.parseRevisionEvent(bytes), root);
          throw sentinel;
        }),
      (error) => error === sentinel
    );
    counts.push(decodes);
    assert.deepEqual(api.parseRevisionEvent(bytes), root);
    counts.push(decodes);
  } finally {
    JSON.parse = original;
  }
  assert.deepEqual(counts, [1, 2, 3]);
  api.withRevisionValidation(() => {
    const parsed = api.parseRevisionEvent(bytes);
    const wire = api.readRevisionEnvelope(bytes);
    assert.equal(Object.isFrozen(parsed), false);
    assert.equal(Object.isFrozen(wire), false);
    assert.equal(Object.isFrozen(wire.proposal.archive.observation.body), false);
    parsed.proposal.archive.observation.body.bytes += ' parsed mutation';
    wire.proposal.archive.observation.body.bytes += ' public mutation';
    assert.deepEqual(api.parseRevisionEvent(bytes), root);
    assert.deepEqual(api.readRevisionEnvelope(bytes), root);
  });
});

test('warm envelope DATA preserves fresh graph and exact refusal semantics', () => {
  const f = makeLegacyRevisionFixture();
  const root = api.createRevisionEvent({ request: f.request, predecessorEventId: null });
  const rootBytes = api.renderRevisionEvent(root);
  const recovery = api.createRevisionEvent({
    request: f.resumeRequest,
    predecessorEventId: root.eventId,
    rootEventId: root.eventId,
    rootProposalDigest: root.proposalDigest,
  });
  const bytes = api.renderRevisionEvent(recovery);
  const records = [{ eventId: root.eventId, bytes: rootBytes }];
  const prefix = '<!-- aitm.criteria-revision-event/v1 -->\n```json\n';
  const wireBytes = (value) => prefix + canonicalRecordJson(value) + '\n```\n';
  const mismatched = api.readRevisionEnvelope(bytes);
  mismatched.proposal.archive.observation.revisionRecords.records[0].operationId += '-foreign';
  const cyclic = api.readRevisionEnvelope(bytes);
  const self = cyclic.proposal.archive.observation.revisionRecords.records[0];
  self.eventId = cyclic.eventId;
  self.reference.eventId = cyclic.eventId;
  const cyclicBytes = wireBytes(cyclic);
  const forged = api.readRevisionEnvelope(bytes);
  forged.proposal.writeSet[0].afterBytes += ' forged';
  const cases = [
    { name: 'complete', bytes, records },
    { name: 'missing', bytes, records: [] },
    { name: 'duplicate', bytes, records: [...records, ...records] },
    { name: 'changed raw bytes', bytes, records: [{ ...records[0], bytes: rootBytes + ' ' }] },
    { name: 'foreign reference identity', bytes: wireBytes(mismatched), records },
    {
      name: 'cycle',
      bytes: cyclicBytes,
      records: [{ eventId: cyclic.eventId, bytes: cyclicBytes }],
    },
    { name: 'forged write', bytes: wireBytes(forged), records },
    { name: 'noncanonical', bytes: bytes + ' ', records },
    { name: 'invalid json', bytes: prefix + '{broken}\n```\n', records },
    { name: 'foreign type', bytes: {}, records },
    { name: 'ordinary comment', bytes: 'ordinary comment', records },
  ];
  const observe = (input) => {
    try {
      return { value: api.parseRevisionEvent(input.bytes, { records: input.records }) };
    } catch (error) {
      return { constructor: error.constructor, message: error.message, code: error.code };
    }
  };
  const standalone = cases.map(observe);
  assert.deepEqual(standalone[0].value, recovery);
  assert.equal(standalone.at(-1).value, null);
  const categories = [
    'event-reference-unavailable',
    'duplicate-event-reference',
    'event-reference-unavailable',
    'event-reference-binding',
    'event-reference-cycle',
    'write-set-bytes',
    'event-envelope',
    'event-json',
    'event-bytes',
  ];
  standalone.slice(1, -1).forEach((result, index) => {
    assert.equal(Object.hasOwn(result, 'constructor'), true, cases[index + 1].name);
    assert.equal(result.constructor, TypeError, cases[index + 1].name);
    assert.equal(result.message, `criteria-revision:${categories[index]}`, cases[index + 1].name);
    assert.equal(result.code, undefined, cases[index + 1].name);
  });
  api.withRevisionValidation(() => {
    assert.deepEqual(api.parseRevisionEvent(bytes, { records }), recovery);
    cases.forEach((input, i) => assert.deepEqual(observe(input), standalone[i], input.name));
    const changed = structuredClone(records);
    assert.deepEqual(api.parseRevisionEvent(bytes, { records: changed }), recovery);
    changed[0].bytes += ' changed after read';
    assert.throws(() => api.parseRevisionEvent(bytes, { records: changed }), /reference/);
    assert.deepEqual(api.parseRevisionEvent(bytes, { records }), recovery);
  });
});
