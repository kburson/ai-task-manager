// @story #1500
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  inspectEnrollment,
  enrollIssue,
} from '../../../../../task-tracker/lib/evidence-v2/enrollment.mjs';
import { buildRuntimeCapability } from '../../../../../task-tracker/lib/evidence-v2/runtime-capabilities.mjs';

const repositoryId = { nodeId: 'R_rehearsal_fixture', nameWithOwner: 'aitm-rehearsal/fixture' };
const authorityHostId = randomUUID();
const entries = ['approve', 'close', 'deliver', 'evidence', 'reopen', 'review', 'test', 'verify'];
const capability = buildRuntimeCapability({
  authorityHostId,
  providerMode: 'recorded',
  toolDigest: 'sha256:' + '1'.repeat(64),
  commandCatalogDigest: 'sha256:' + '2'.repeat(64),
  entries,
});

function fixture() {
  let issue = {
    number: 1000001,
    repositoryId,
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    body: '<!-- aitm-delivered-close data="legacy" -->\n<!-- aitm-test-receipt id="receipt" -->',
    comments: [{ id: 'IC_1', body: 'historical acceptance' }],
  };
  const writes = [];
  const ports = {
    readIssue: async () => structuredClone(issue),
    readSourceFacts: async () => ({
      sourceSha: 'a'.repeat(40),
      treeOid: 'b'.repeat(40),
      manifestDigest: 'sha256:' + '3'.repeat(64),
    }),
    readRuntimeCapability: async () => capability,
    listResidentEntries: async () => entries,
    withAuthorityLock: async (_claim, fn) => fn(),
    appendImportRecords: async (records) => {
      writes.push(['imports', records]);
      return records;
    },
    readImportRecords: async () => writes.find(([kind]) => kind === 'imports')?.[1] || [],
    writeProjection: async (marker) => {
      writes.push(['projection', marker]);
    },
  };
  return {
    ports,
    writes,
    change: (next) => {
      issue = { ...issue, ...next };
    },
  };
}

test('inspection is read-only and reports predicate sources and preserved raw imports', async () => {
  const f = fixture();
  const preview = await inspectEnrollment({ repositoryId, issueNumber: 1000001, ports: f.ports });
  assert.equal(f.writes.length, 0);
  assert.deepEqual(
    preview.predicateSources.map((p) => p.source),
    ['issue', 'source', 'runtime', 'resident-entries']
  );
  assert.equal(preview.imports[0].schema, 'aitm.legacy-import/v2');
  assert.match(preview.imports[0].rawDigest, /^sha256:/);
  assert.deepEqual(preview.missingEvidence, ['review-acceptance']);
});

test('enrollment reinspects under authority and refuses stale plans before its first write', async () => {
  const f = fixture();
  const preview = await inspectEnrollment({ repositoryId, issueNumber: 1000001, ports: f.ports });
  f.change({ stateReason: 'REOPENED' });
  await assert.rejects(
    () =>
      enrollIssue({
        repositoryId,
        issueNumber: 1000001,
        planDigest: preview.digest,
        operationId: randomUUID(),
        authorityHostId,
        ports: f.ports,
      }),
    /migration-plan-stale/
  );
  assert.equal(f.writes.length, 0);
});

test('enrollment writes explicit imports before the protected projection without historic synthesis', async () => {
  const f = fixture();
  const preview = await inspectEnrollment({ repositoryId, issueNumber: 1000001, ports: f.ports });
  const result = await enrollIssue({
    repositoryId,
    issueNumber: 1000001,
    planDigest: preview.digest,
    operationId: randomUUID(),
    authorityHostId,
    ports: f.ports,
  });
  assert.deepEqual(
    f.writes.map(([kind]) => kind),
    ['imports', 'projection']
  );
  assert.ok(f.writes[0][1].every((record) => !('outcome' in record) && !('accepted' in record)));
  assert.match(result.marker, /aitm-evidence-v2/);
});

test('enrollment refuses a foreign authority host and incomplete resident inventory before writes', async () => {
  for (const mutate of [
    (f) => {
      f.ports.readRuntimeCapability = async () => ({
        ...capability,
        authorityHostId: randomUUID(),
      });
    },
    (f) => {
      f.ports.listResidentEntries = async () => entries.filter((entry) => entry !== 'close');
    },
  ]) {
    const f = fixture();
    mutate(f);
    const preview = await inspectEnrollment({ repositoryId, issueNumber: 1000001, ports: f.ports });
    await assert.rejects(() =>
      enrollIssue({
        repositoryId,
        issueNumber: 1000001,
        planDigest: preview.digest,
        operationId: randomUUID(),
        authorityHostId,
        ports: f.ports,
      })
    );
    assert.equal(f.writes.length, 0);
  }
});
