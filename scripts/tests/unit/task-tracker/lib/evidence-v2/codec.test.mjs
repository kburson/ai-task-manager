// @story #1497
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createRecord,
  encodeRecord,
  decodeRecord,
  recordDigest,
} from '../../../../../task-tracker/lib/evidence-v2/codec.mjs';
import {
  selectEvidenceProtocol,
  renderProtocolMarker,
} from '../../../../../task-tracker/lib/evidence-v2/protocol.mjs';
import {
  findLostMarkers,
  validateMarkerAdvances,
} from '../../../../../task-tracker/lib/body-invariants.mjs';
const repo = { nodeId: 'R_rehearsal_fixture', nameWithOwner: 'aitm-rehearsal/fixture' };
const make = (overrides = {}) =>
  createRecord({
    schema: 'aitm.evidence-record/v2',
    recordType: 'cycle-opened',
    repositoryId: repo,
    issueNumber: 1000001,
    cycleId: randomUUID(),
    operationId: randomUUID(),
    predecessorId: null,
    actor: { id: 'rehearsal-author', kind: 'user' },
    recordedAt: '2026-09-03T16:00:00.000Z',
    payload: { previousCycleId: null, authorityHostId: randomUUID(), reason: 'initial' },
    ...overrides,
  });
test('canonical record bytes roundtrip and reject changed bytes, fields and identities', () => {
  const record = make();
  const encoded = encodeRecord(record);
  assert.deepEqual(decodeRecord(encoded, { repositoryId: repo, issueNumber: 1000001 }), record);
  assert.equal(recordDigest(record), record.recordId);
  assert.ok(Object.isFrozen(record.payload));
  assert.throws(
    () => encodeRecord({ ...record, payload: { ...record.payload, reason: 'edited' } }),
    /digest/
  );
  assert.throws(() => make({ extra: true }), /keys/);
  assert.throws(() => make({ recordType: 'unknown' }), /record-type/);
  assert.throws(() => make({ operationId: 'clock-123' }), /operation/);
  assert.throws(() => make({ recordedAt: 'yesterday' }), /timestamp/);
  assert.throws(() => decodeRecord(encoded, { repositoryId: repo, issueNumber: 1000002 }), /issue/);
  assert.throws(
    () => decodeRecord(encoded, { repositoryId: { ...repo, nodeId: 'R_wrong' } }),
    /repository/
  );
  assert.throws(() => decodeRecord(encoded + '\n' + encoded), /record-marker/);
  assert.throws(
    () =>
      make({
        payload: {
          previousCycleId: null,
          authorityHostId: randomUUID(),
          reason: 'initial',
          verified: true,
        },
      }),
    /keys/
  );
});
test('canonical JSON rejects values erased or coerced by ordinary JSON', () => {
  for (const value of [
    undefined,
    NaN,
    -0,
    new Date(),
    {
      get value() {
        return 1;
      },
    },
  ]) {
    assert.throws(() =>
      make({ payload: { previousCycleId: null, authorityHostId: randomUUID(), reason: value } })
    );
  }
});

test('strict protocol projections preserve identity and reject unsupported mutation', () => {
  const projection = {
    schema: 'aitm.evidence-projection/v2',
    repositoryId: repo,
    issueNumber: 1000001,
    cycleId: randomUUID(),
    headId: 'sha256:' + 'a'.repeat(64),
    authorityHostId: randomUUID(),
  };
  const marker = renderProtocolMarker(projection);
  assert.equal(selectEvidenceProtocol({ body: 'ordinary' }).protocol, 'v1');
  assert.throws(() => selectEvidenceProtocol({ body: marker }), /context/);
  assert.throws(
    () => selectEvidenceProtocol({ body: '<!-- aitm-evidence-v2 broken -->' }),
    /projection/
  );
  assert.throws(() => selectEvidenceProtocol({ body: marker + '\n' + marker }), /projection/);
  assert.deepEqual(findLostMarkers(marker, ''), ['aitm-evidence-v2']);
  assert.throws(
    () => validateMarkerAdvances(marker, marker.replace('data="', 'data="x')),
    /unauthorized/
  );
});
