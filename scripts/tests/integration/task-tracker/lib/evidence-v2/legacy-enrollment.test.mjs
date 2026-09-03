// @story #1500
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inspectEnrollment } from '../../../../../task-tracker/lib/evidence-v2/enrollment.mjs';
import {
  buildRuntimeCapability,
  REQUIRED_EVIDENCE_ENTRIES,
} from '../../../../../task-tracker/lib/evidence-v2/runtime-capabilities.mjs';

const repositoryId = { nodeId: 'R_fixture', nameWithOwner: 'fixture/repo' };
const authorityHostId = randomUUID();
const capability = buildRuntimeCapability({
  authorityHostId,
  providerMode: 'recorded',
  toolDigest: 'sha256:' + '1'.repeat(64),
  commandCatalogDigest: 'sha256:' + '2'.repeat(64),
  entries: REQUIRED_EVIDENCE_ENTRIES,
});

function ports(issue, overrides = {}) {
  return {
    readIssue: async () => structuredClone(issue),
    readSourceFacts: async () => ({
      sourceSha: 'a'.repeat(40),
      treeOid: 'b'.repeat(40),
      manifestDigest: 'sha256:' + '3'.repeat(64),
    }),
    readRuntimeCapability: async () => capability,
    listResidentEntries: async () => REQUIRED_EVIDENCE_ENTRIES,
    ...overrides,
  };
}

for (const fixture of [
  {
    name: '#1490 complete then reopened',
    state: 'OPEN',
    stateReason: 'REOPENED',
    body: '<!-- aitm-delivered-close data="legacy" -->',
  },
  {
    name: '#1490 later successful close',
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    body: '<!-- aitm-delivered-close data="legacy" -->\n<!-- aitm-test-receipt id="t" -->',
  },
  {
    name: '#1488 delivered without receipts',
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    body: '<!-- aitm-delivered-close data="legacy" -->',
  },
  {
    name: '#1485 incomplete verification',
    state: 'OPEN',
    stateReason: null,
    body: 'ordinary legacy body',
  },
])
  test(`inspects ${fixture.name} without manufacturing missing evidence`, async () => {
    const issue = { number: 1000001, repositoryId, comments: [], ...fixture };
    const proposal = await inspectEnrollment({
      repositoryId,
      issueNumber: 1000001,
      ports: ports(issue),
    });
    assert.ok(proposal.missingEvidence.length > 0);
    assert.ok(proposal.imports.every((record) => record.claims.length === 0));
  });

test('missing source objects and malformed v2 history refuse during read-only inspection', async () => {
  const issue = {
    number: 1000001,
    repositoryId,
    state: 'OPEN',
    stateReason: null,
    comments: [],
    body: 'legacy',
  };
  await assert.rejects(
    () =>
      inspectEnrollment({
        repositoryId,
        issueNumber: 1000001,
        ports: ports(issue, {
          readSourceFacts: async () => {
            throw new Error('missing-object');
          },
        }),
      }),
    /missing-object/
  );
  await assert.rejects(
    () =>
      inspectEnrollment({
        repositoryId,
        issueNumber: 1000001,
        ports: ports({ ...issue, body: '<!-- aitm-evidence-v2 broken -->' }),
      }),
    /projection-malformed/
  );
});
