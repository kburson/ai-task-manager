// @story #1692
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  INSTALL_MANIFEST_PATH,
  INSTALL_MANIFEST_SCHEMA,
  compareManifestContract,
  createInstallContract,
  createInstallManifest,
  normalizeInstallIntent,
  parseInstallManifest,
} from '../../../package/install-contract.mjs';
import { getProvider } from '../../../providers/index.mjs';

const inventory = Object.freeze({
  templates: [
    {
      id: 'template.pickup',
      path: '.ai-task-manager/templates/pickup.md',
      kind: 'file',
      ownership: 'generated',
      required: true,
      contract: 'exact',
      digest: 'a'.repeat(64),
    },
  ],
  references: [],
  configs: [
    {
      id: 'config.activity',
      path: '.ai-task-manager/activity-policy.json',
      kind: 'json-fragment',
      ownership: 'reference',
      required: true,
      contract: 'activity-policy',
    },
  ],
});

test('intent normalization and manifest output are deterministic', () => {
  const intent = normalizeInstallIntent({
    providers: ['codex', 'claude', 'codex'],
    linkMode: 'stub',
    features: { memoryIndex: false, codexSuperpowers: true, codexSuperpowersGlobal: false },
    memoryFiles: [],
  });
  assert.deepEqual(intent.providers, ['claude', 'codex']);
  assert.equal(INSTALL_MANIFEST_PATH, '.ai-task-manager/install-manifest.json');
  const contract = createInstallContract({
    intent,
    adapters: intent.providers.map(getProvider),
    inventory,
  });
  const manifest = createInstallManifest({
    packageName: '@kburson/ai-task-manager',
    packageVersion: '1.2.3',
    contract,
  });
  assert.equal(manifest.schema, INSTALL_MANIFEST_SCHEMA);
  assert.match(manifest.generatedBy.contractDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    manifest.artifacts.map(({ id }) => id),
    [...manifest.artifacts.map(({ id }) => id)].sort()
  );
  assert.deepEqual(parseInstallManifest(JSON.parse(JSON.stringify(manifest))), manifest);
  assert.deepEqual(compareManifestContract(manifest, contract), { compatible: true });
});

test('manifest validation rejects unsafe and ambiguous artifacts with stable codes', () => {
  const base = {
    schema: INSTALL_MANIFEST_SCHEMA,
    intent: { providers: ['codex'], linkMode: 'stub', features: {}, memoryFiles: [] },
    generatedBy: { packageName: 'x', packageVersion: '1', contractDigest: 'a'.repeat(64) },
    artifacts: [],
  };
  for (const [code, artifact] of [
    [
      'absolute-path',
      {
        id: 'x',
        path: '/etc/passwd',
        kind: 'file',
        ownership: 'generated',
        required: true,
        contract: 'exact',
      },
    ],
    [
      'path-traversal',
      {
        id: 'x',
        path: '../escape',
        kind: 'file',
        ownership: 'generated',
        required: true,
        contract: 'exact',
      },
    ],
  ]) {
    assert.throws(() => parseInstallManifest({ ...base, artifacts: [artifact] }), new RegExp(code));
  }
  const duplicate = {
    id: 'x',
    path: 'safe',
    kind: 'file',
    ownership: 'generated',
    required: true,
    contract: 'exact',
  };
  assert.throws(
    () => parseInstallManifest({ ...base, artifacts: [duplicate, duplicate] }),
    /duplicate-id/
  );
});
