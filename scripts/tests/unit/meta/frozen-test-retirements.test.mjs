// @chore
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  FROZEN_RETIREMENT_ROOT,
  loadActiveFrozenRetirements,
  retirementReceiptPathForTestPath,
  TEMPORARY_RETIREMENT_EVIDENCE_ROOT,
} from '../../lib/frozen-test-retirements.mjs';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const SHA256 = 'a'.repeat(64);

function writeFixture(projectRoot, repositoryPath, value) {
  const absolutePath = path.join(projectRoot, repositoryPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(
    absolutePath,
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
  );
}

function receiptFor(testPath, overrides = {}) {
  return {
    schema: 1,
    path: testPath,
    reason: 'The extracted subsystem no longer belongs to this package.',
    lastLiveSha256: SHA256,
    evidence: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/2026-08-25-extraction.md`,
    ...overrides,
  };
}

function load(
  projectRoot,
  { finalizedFrozenPaths = [], postSnapshotRecordPaths = [], liveDiscoveredPaths = [] } = {}
) {
  return loadActiveFrozenRetirements({
    projectRoot,
    finalizedFrozenPaths,
    postSnapshotRecordPaths,
    liveDiscoveredPaths,
  });
}

function writeReceipt(projectRoot, testPath, receipt = receiptFor(testPath), receiptFile) {
  const file = receiptFile || retirementReceiptPathForTestPath(testPath);
  writeFixture(projectRoot, file, receipt);
  return file;
}

function writeEvidence(projectRoot, evidence) {
  writeFixture(projectRoot, evidence, '# Temporary retirement evidence\n');
}

test('maps canonical frozen test paths to deterministic retirement receipts', () => {
  assert.equal(
    retirementReceiptPathForTestPath('scripts/tests/unit/articles/publish-articles.test.mjs'),
    'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/articles/publish-articles.test.mjs.json'
  );
  assert.throws(
    () => retirementReceiptPathForTestPath('scripts/tests/unit/articles/../publish.test.mjs'),
    /noncanonical test path/
  );
  assert.throws(
    () => retirementReceiptPathForTestPath('scripts/gh/not-a-test.test.mjs'),
    /noncanonical test path/
  );
});

test('loads one complete frozen receipt from its deterministic location', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-valid-');
  const testPath = 'scripts/tests/unit/articles/publish-articles.test.mjs';
  const receipt = receiptFor(testPath);
  const receiptFile = writeReceipt(projectRoot, testPath, receipt);
  writeEvidence(projectRoot, receipt.evidence);

  assert.deepEqual(load(projectRoot, { finalizedFrozenPaths: [testPath] }), {
    retirements: [
      {
        receiptFile,
        evidenceFile: receipt.evidence,
        source: 'active',
        ...receipt,
      },
    ],
    errors: [],
    misplacedReceipts: [],
    rootPresent: true,
  });
});

test('accepts only exact receipt keys, schema, digest, and a non-empty sentence reason', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-schema-');
  const frozenPaths = [
    'scripts/tests/unit/articles/extra.test.mjs',
    'scripts/tests/unit/articles/missing.test.mjs',
    'scripts/tests/unit/articles/schema.test.mjs',
    'scripts/tests/unit/articles/digest.test.mjs',
    'scripts/tests/unit/articles/reason.test.mjs',
    'scripts/tests/unit/articles/fragment.test.mjs',
  ];
  const extraPath = frozenPaths[0];
  const missingPath = frozenPaths[1];
  const schemaPath = frozenPaths[2];
  const digestPath = frozenPaths[3];
  const reasonPath = frozenPaths[4];
  const fragmentPath = frozenPaths[5];
  const receipts = [
    receiptFor(extraPath, { extra: true }),
    (() => {
      const { evidence, ...missingEvidence } = receiptFor(missingPath);
      return missingEvidence;
    })(),
    receiptFor(schemaPath, { schema: '1' }),
    receiptFor(digestPath, { lastLiveSha256: 'A'.repeat(64) }),
    receiptFor(reasonPath, { reason: '   ' }),
    receiptFor(fragmentPath, {
      reason: 'The extracted subsystem no longer belongs to this package',
    }),
  ];
  for (const receipt of receipts) {
    writeReceipt(projectRoot, receipt.path, receipt);
  }
  writeEvidence(projectRoot, receiptFor(extraPath).evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: frozenPaths });
  assert.deepEqual(loaded.retirements, []);
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    frozenPaths.map(retirementReceiptPathForTestPath).sort()
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('extra.')).error,
    /keys/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('missing.')).error,
    /keys/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('schema.')).error,
    /schema/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('digest.')).error,
    /SHA-256/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('reason.')).error,
    /reason/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('fragment.')).error,
    /reason/
  );
});

test('reports malformed JSON and continues loading later valid receipts', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-json-');
  const badPath = 'scripts/tests/unit/articles/bad-json.test.mjs';
  const validPath = 'scripts/tests/unit/articles/valid.test.mjs';
  writeFixture(projectRoot, retirementReceiptPathForTestPath(badPath), '{ invalid json\n');
  const validReceipt = receiptFor(validPath);
  writeReceipt(projectRoot, validPath, validReceipt);
  writeEvidence(projectRoot, validReceipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [badPath, validPath] });
  assert.deepEqual(
    loaded.retirements.map(({ path: testPath }) => testPath),
    [validPath]
  );
  assert.equal(loaded.errors.length, 1);
  assert.match(loaded.errors[0].error, /invalid JSON/);
});

test('reports malformed field types without stopping the scan', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-field-type-');
  const validPath = 'scripts/tests/unit/articles/type-valid.test.mjs';
  const malformedFile = `${FROZEN_RETIREMENT_ROOT}/unit/articles/type-invalid.test.mjs.json`;
  writeFixture(projectRoot, malformedFile, receiptFor(validPath, { path: 7 }));
  const validReceipt = receiptFor(validPath);
  writeReceipt(projectRoot, validPath, validReceipt);
  writeEvidence(projectRoot, validReceipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [validPath] });
  assert.deepEqual(
    loaded.retirements.map(({ path: testPath }) => testPath),
    [validPath]
  );
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    [malformedFile]
  );
  assert.match(loaded.errors[0].error, /noncanonical test path/);
});

test('rejects non-frozen paths and post-snapshot overlap', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-membership-');
  const nonFrozenPath = 'scripts/tests/unit/articles/non-frozen.test.mjs';
  const overlapPath = 'scripts/tests/unit/articles/post-snapshot.test.mjs';
  for (const testPath of [nonFrozenPath, overlapPath]) {
    const receipt = receiptFor(testPath);
    writeReceipt(projectRoot, testPath, receipt);
    writeEvidence(projectRoot, receipt.evidence);
  }

  const loaded = load(projectRoot, {
    finalizedFrozenPaths: [overlapPath],
    postSnapshotRecordPaths: [overlapPath],
  });
  assert.deepEqual(loaded.retirements, []);
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('non-frozen.')).error,
    /not a finalized frozen path/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('post-snapshot.')).error,
    /post-snapshot/
  );
});

test('rejects missing and escaping evidence paths', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-evidence-');
  const missingPath = 'scripts/tests/unit/articles/missing-evidence.test.mjs';
  const escapingPath = 'scripts/tests/unit/articles/escaping-evidence.test.mjs';
  const absolutePath = 'scripts/tests/unit/articles/absolute-evidence.test.mjs';
  writeReceipt(projectRoot, missingPath, receiptFor(missingPath));
  writeReceipt(
    projectRoot,
    escapingPath,
    receiptFor(escapingPath, { evidence: `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/../escape.md` })
  );
  writeReceipt(projectRoot, absolutePath, receiptFor(absolutePath, { evidence: '/tmp/escape.md' }));

  const loaded = load(projectRoot, {
    finalizedFrozenPaths: [missingPath, escapingPath, absolutePath],
  });
  assert.deepEqual(loaded.retirements, []);
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('missing-evidence.')).error,
    /evidence file is missing/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('escaping-evidence.')).error,
    /evidence path/
  );
  assert.match(
    loaded.errors.find(({ receiptFile }) => receiptFile.includes('absolute-evidence.')).error,
    /evidence path/
  );
});

test('reports duplicate declarations without authorizing either receipt', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-duplicate-');
  const testPath = 'scripts/tests/unit/articles/duplicate.test.mjs';
  const receipt = receiptFor(testPath);
  const first = writeReceipt(projectRoot, testPath, receipt);
  const second = `${FROZEN_RETIREMENT_ROOT}/unit/articles/z-duplicate.test.mjs.json`;
  writeFixture(projectRoot, second, receipt);
  writeEvidence(projectRoot, receipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [testPath] });
  assert.deepEqual(loaded.retirements, []);
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    [second]
  );
  assert.match(loaded.errors[0].error, /duplicate declared path/);
  assert.deepEqual(loaded.misplacedReceipts, [
    { receiptFile: second, expectedReceiptFile: first, path: testPath },
  ]);
});

test('reports a receipt at the wrong deterministic location without authorizing it', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-misplaced-');
  const testPath = 'scripts/tests/integration/articles/misplaced.test.mjs';
  const receipt = receiptFor(testPath);
  const receiptFile = `${FROZEN_RETIREMENT_ROOT}/unit/articles/misplaced.test.mjs.json`;
  writeReceipt(projectRoot, testPath, receipt, receiptFile);
  writeEvidence(projectRoot, receipt.evidence);

  const loaded = load(projectRoot, { finalizedFrozenPaths: [testPath] });
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.retirements, []);
  assert.deepEqual(loaded.misplacedReceipts, [
    {
      receiptFile,
      expectedReceiptFile: retirementReceiptPathForTestPath(testPath),
      path: testPath,
    },
  ]);
});

test('reports receipt and live-test overlap without authorizing the retirement', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-live-overlap-');
  const testPath = 'scripts/tests/slow/articles/live.test.mjs';
  const receipt = receiptFor(testPath);
  const receiptFile = writeReceipt(projectRoot, testPath, receipt);
  writeEvidence(projectRoot, receipt.evidence);
  writeFixture(projectRoot, testPath, '// live test\n');

  const loaded = load(projectRoot, {
    finalizedFrozenPaths: [testPath],
    liveDiscoveredPaths: [testPath],
  });
  assert.deepEqual(loaded.retirements, []);
  assert.match(loaded.errors[0].error, /live discovered test/);
});

test('permits shared evidence and sorts diagnostics by receipt path', () => {
  const projectRoot = mkdtempProjectIsolated('frozen-retirements-sorted-');
  const firstPath = 'scripts/tests/unit/articles/a-valid.test.mjs';
  const secondPath = 'scripts/tests/unit/articles/z-valid.test.mjs';
  const sharedEvidence = `${TEMPORARY_RETIREMENT_EVIDENCE_ROOT}/shared.md`;
  const invalidA = 'scripts/tests/unit/articles/a-invalid.test.mjs';
  const invalidZ = 'scripts/tests/unit/articles/z-invalid.test.mjs';
  for (const testPath of [firstPath, secondPath]) {
    writeReceipt(projectRoot, testPath, receiptFor(testPath, { evidence: sharedEvidence }));
  }
  writeEvidence(projectRoot, sharedEvidence);
  writeReceipt(projectRoot, invalidZ, receiptFor(invalidZ, { reason: '' }));
  writeReceipt(projectRoot, invalidA, receiptFor(invalidA, { reason: '' }));

  const loaded = load(projectRoot, {
    finalizedFrozenPaths: [firstPath, secondPath, invalidA, invalidZ],
  });
  assert.deepEqual(
    loaded.retirements.map(({ path: testPath }) => testPath),
    [firstPath, secondPath]
  );
  assert.deepEqual(
    loaded.errors.map(({ receiptFile }) => receiptFile),
    [invalidA, invalidZ].map(retirementReceiptPathForTestPath)
  );
});

test('returns an absent receipt root without errors and recognizes an existing root', () => {
  const absentRoot = mkdtempProjectIsolated('frozen-retirements-no-root-');
  assert.deepEqual(load(absentRoot), {
    retirements: [],
    errors: [],
    misplacedReceipts: [],
    rootPresent: false,
  });

  const presentRoot = mkdtempProjectIsolated('frozen-retirements-root-present-');
  mkdirSync(path.join(presentRoot, FROZEN_RETIREMENT_ROOT), { recursive: true });
  const loaded = load(presentRoot);
  assert.equal(loaded.rootPresent, true);
  assert.equal(existsSync(path.join(presentRoot, FROZEN_RETIREMENT_ROOT)), true);
});
