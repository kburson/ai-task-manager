// @story #1630
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_SCHEMA_VERSIONS,
  buildRuntimeCapability,
  validateRuntimeCapability,
} from '../../../../../task-tracker/lib/evidence-v2/runtime-capabilities.mjs';

const digest = (char) => `sha256:${char.repeat(64)}`;
const base = {
  authorityHostId: '11111111-1111-4111-8111-111111111111',
  providerMode: 'recorded',
  toolDigest: digest('a'),
  commandCatalogDigest: digest('b'),
  entries: ['approve', 'close', 'deliver', 'evidence', 'reopen', 'review', 'test', 'verify'],
};

test('runtime capability advertises the complete workflow-policy schema inventory', () => {
  assert.deepEqual(REQUIRED_SCHEMA_VERSIONS, [
    'aitm.evidence-record/v2',
    'aitm.workflow-exception/v1',
    'aitm.workflow-policy-evaluation/v1',
    'aitm.workflow-preflight-report/v1',
  ]);
  const capability = buildRuntimeCapability(base);
  assert.deepEqual(capability.schemaVersions, REQUIRED_SCHEMA_VERSIONS);
  assert.deepEqual(validateRuntimeCapability(capability), capability);
});

test('updated consumers reject a runtime missing one required workflow-policy schema', () => {
  const legacy = buildRuntimeCapability({
    ...base,
    schemaVersions: ['aitm.evidence-record/v2'],
  });
  assert.throws(
    () => validateRuntimeCapability(legacy),
    /evidence-v2:capability-workflow-policy-version/
  );
});
