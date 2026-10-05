// @story #1853
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
