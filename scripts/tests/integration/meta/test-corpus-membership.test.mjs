// @story #1263 #1406
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles } from '../../../task-tracker/lib/discover-test-files.mjs';
import {
  finalizedFrozenPaths,
  formatCorpusMembershipErrors,
  loadPostSnapshotRecords,
  POST_SNAPSHOT_REGISTRY_ROOT,
  reconcileCorpusMembership,
  recordPathForTestPath,
} from '../../lib/test-corpus-membership.mjs';
import { loadFrozenRetirements } from '../../lib/frozen-test-retirements.mjs';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function writeRecord(projectRoot, recordFile, value) {
  const absolute = path.join(projectRoot, recordFile);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function writeRawRecord(projectRoot, recordFile, value) {
  const absolute = path.join(projectRoot, recordFile);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, value);
}

test('live canonical discovery equals frozen destinations union post-snapshot records', () => {
  const discovered = discoverTestFiles({ projectRoot: PROJECT_ROOT });
  const frozenManifest = JSON.parse(
    readFileSync(
      path.join(PROJECT_ROOT, 'scripts/tests/fixtures/test-corpus-pre-move.json'),
      'utf8'
    )
  );
  const frozenPaths = finalizedFrozenPaths(frozenManifest);
  const loaded = loadPostSnapshotRecords({ projectRoot: PROJECT_ROOT });
  const retirementAuthority = loadFrozenRetirements({
    projectRoot: PROJECT_ROOT,
    finalizedFrozenPaths: frozenPaths,
    postSnapshotRecordPaths: loaded.records.map(({ path: recordPath }) => recordPath),
    liveDiscoveredPaths: discovered,
  });
  const result = reconcileCorpusMembership({
    discovered,
    frozenPaths,
    records: loaded.records,
    recordErrors: loaded.errors,
    misplacedRecords: loaded.misplacedRecords,
    retirements: retirementAuthority.retirements,
    retirementErrors: retirementAuthority.errors,
    misplacedRetirements: retirementAuthority.misplacedReceipts,
  });
  assert.equal(result.ok, true, formatCorpusMembershipErrors(result));
});

test('maps only canonical test paths to deterministic membership records', () => {
  assert.equal(
    recordPathForTestPath('scripts/tests/unit/task-tracker/lib/new-policy.test.mjs'),
    `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/task-tracker/lib/new-policy.test.mjs.json`
  );
  assert.throws(
    () => recordPathForTestPath('scripts/gh/misplaced.test.mjs'),
    /noncanonical test path/
  );
});

test('resolves frozen destinations before sorting them', () => {
  assert.deepEqual(
    finalizedFrozenPaths({
      tests: [{ newPath: 'scripts/tests/unit/lib/a.test.mjs' }],
      laneCorrections: [
        {
          migrationPath: 'scripts/tests/unit/lib/a.test.mjs',
          finalPath: 'scripts/tests/integration/lib/a.test.mjs',
        },
      ],
    }),
    ['scripts/tests/integration/lib/a.test.mjs']
  );
});

test('rejects duplicate finalized frozen paths', () => {
  assert.throws(
    () =>
      finalizedFrozenPaths({
        tests: [
          { newPath: 'scripts/tests/unit/lib/a.test.mjs' },
          { newPath: 'scripts/tests/integration/lib/a.test.mjs' },
        ],
        laneCorrections: [
          {
            migrationPath: 'scripts/tests/unit/lib/a.test.mjs',
            finalPath: 'scripts/tests/integration/lib/a.test.mjs',
          },
        ],
      }),
    /duplicate finalized frozen path/
  );
});

test('loads a valid record from its deterministic location', () => {
  const projectRoot = mkdtempProjectIsolated('test-corpus-membership-valid-');
  const testPath = 'scripts/tests/unit/lib/new-policy.test.mjs';
  const recordFile = recordPathForTestPath(testPath);
  writeRecord(projectRoot, recordFile, { schema: 1, path: testPath });

  assert.deepEqual(loadPostSnapshotRecords({ projectRoot }), {
    records: [{ recordFile, schema: 1, path: testPath }],
    errors: [],
    misplacedRecords: [],
    rootPresent: true,
  });
});

test('enumerates only JSON records in sorted POSIX order', () => {
  const projectRoot = mkdtempProjectIsolated('test-corpus-membership-order-');
  const posixFirstPath = 'scripts/tests/unit/lib/z.test.mjs';
  const posixSecondPath = 'scripts/tests/unit/lib/ä.test.mjs';
  writeRecord(projectRoot, recordPathForTestPath(posixSecondPath), {
    schema: 1,
    path: posixSecondPath,
  });
  writeRecord(projectRoot, recordPathForTestPath(posixFirstPath), {
    schema: 1,
    path: posixFirstPath,
  });
  writeRawRecord(projectRoot, `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/ignored.txt`, 'ignored\n');

  assert.deepEqual(
    loadPostSnapshotRecords({ projectRoot }).records.map(({ path: recordPath }) => recordPath),
    [posixFirstPath, posixSecondPath]
  );
});

test('reports each malformed record by its physical file without stopping the scan', () => {
  const projectRoot = mkdtempProjectIsolated('test-corpus-membership-malformed-');
  const validPath = 'scripts/tests/unit/lib/valid.test.mjs';
  const invalidJson = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/invalid-json.test.mjs.json`;
  const extraKey = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/extra-key.test.mjs.json`;
  const wrongSchema = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/wrong-schema.test.mjs.json`;
  const noncanonicalPath = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/noncanonical.test.mjs.json`;
  const duplicateFirst = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/duplicate.test.mjs.json`;
  const duplicateSecond = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/z-duplicate.test.mjs.json`;

  writeRecord(projectRoot, recordPathForTestPath(validPath), { schema: 1, path: validPath });
  writeRawRecord(projectRoot, invalidJson, '{ invalid json\n');
  writeRecord(projectRoot, extraKey, {
    schema: 1,
    path: 'scripts/tests/unit/lib/extra-key.test.mjs',
    extra: true,
  });
  writeRecord(projectRoot, wrongSchema, {
    schema: 2,
    path: 'scripts/tests/unit/lib/wrong-schema.test.mjs',
  });
  writeRecord(projectRoot, noncanonicalPath, {
    schema: 1,
    path: 'scripts/gh/noncanonical.test.mjs',
  });
  writeRecord(projectRoot, duplicateFirst, {
    schema: 1,
    path: 'scripts/tests/unit/lib/duplicate.test.mjs',
  });
  writeRecord(projectRoot, duplicateSecond, {
    schema: 1,
    path: 'scripts/tests/unit/lib/duplicate.test.mjs',
  });

  const loaded = loadPostSnapshotRecords({ projectRoot });
  assert.deepEqual(
    loaded.errors.map(({ recordFile }) => recordFile),
    [invalidJson, duplicateSecond, extraKey, noncanonicalPath, wrongSchema].sort()
  );
  assert.match(
    loaded.errors.find(({ recordFile }) => recordFile === invalidJson).error,
    /invalid JSON/
  );
  assert.match(loaded.errors.find(({ recordFile }) => recordFile === extraKey).error, /keys/);
  assert.match(loaded.errors.find(({ recordFile }) => recordFile === wrongSchema).error, /schema/);
  assert.match(
    loaded.errors.find(({ recordFile }) => recordFile === noncanonicalPath).error,
    /noncanonical test path/
  );
  assert.match(
    loaded.errors.find(({ recordFile }) => recordFile === duplicateSecond).error,
    /duplicate declared path/
  );
  assert.deepEqual(
    loaded.records.map(({ path: recordPath }) => recordPath),
    [
      'scripts/tests/unit/lib/duplicate.test.mjs',
      validPath,
      'scripts/tests/unit/lib/duplicate.test.mjs',
    ]
  );
  assert.deepEqual(loaded.misplacedRecords, [
    {
      recordFile: duplicateSecond,
      expectedRecordFile: recordPathForTestPath('scripts/tests/unit/lib/duplicate.test.mjs'),
      path: 'scripts/tests/unit/lib/duplicate.test.mjs',
    },
  ]);
});

test('retains valid duplicate loader records for duplicate, misplaced, and overlap diagnostics', () => {
  const projectRoot = mkdtempProjectIsolated('test-corpus-membership-duplicate-reconciliation-');
  const testPath = 'scripts/tests/unit/lib/duplicate.test.mjs';
  const firstRecordFile = recordPathForTestPath(testPath);
  const secondRecordFile = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/z-duplicate.test.mjs.json`;
  writeRecord(projectRoot, firstRecordFile, { schema: 1, path: testPath });
  writeRecord(projectRoot, secondRecordFile, { schema: 1, path: testPath });

  const loaded = loadPostSnapshotRecords({ projectRoot });
  assert.deepEqual(loaded.records, [
    { recordFile: firstRecordFile, schema: 1, path: testPath },
    { recordFile: secondRecordFile, schema: 1, path: testPath },
  ]);
  assert.deepEqual(
    loaded.errors.map(({ recordFile }) => recordFile),
    [secondRecordFile]
  );
  assert.deepEqual(loaded.misplacedRecords, [
    { recordFile: secondRecordFile, expectedRecordFile: firstRecordFile, path: testPath },
  ]);

  const result = reconcileCorpusMembership({
    discovered: [testPath],
    frozenPaths: [testPath],
    records: loaded.records,
    recordErrors: loaded.errors,
    misplacedRecords: loaded.misplacedRecords,
  });
  assert.deepEqual(result.duplicatePaths, [
    { path: testPath, recordFiles: [firstRecordFile, secondRecordFile] },
  ]);
  assert.deepEqual(result.overlapPaths, [
    { path: testPath, recordFiles: [firstRecordFile, secondRecordFile] },
  ]);
  assert.deepEqual(
    result.malformedRecords.map(({ recordFile }) => recordFile),
    [secondRecordFile]
  );
  assert.deepEqual(result.misplacedRecords, [
    { recordFile: secondRecordFile, expectedRecordFile: firstRecordFile, path: testPath },
  ]);
});

test('reports a present registry root that is not a directory as malformed', () => {
  const projectRoot = mkdtempProjectIsolated('test-corpus-membership-root-file-');
  writeRawRecord(projectRoot, POST_SNAPSHOT_REGISTRY_ROOT, '{}\n');

  const loaded = loadPostSnapshotRecords({ projectRoot });
  assert.equal(loaded.rootPresent, true);
  assert.deepEqual(loaded.records, []);
  assert.deepEqual(loaded.misplacedRecords, []);
  assert.equal(loaded.errors.length, 1);
  assert.equal(loaded.errors[0].recordFile, POST_SNAPSHOT_REGISTRY_ROOT);
  assert.match(loaded.errors[0].error, /registry root.*directory/);
});

test('returns an absent registry root without errors', () => {
  const projectRoot = mkdtempProjectIsolated('test-corpus-membership-no-root-');
  assert.deepEqual(loadPostSnapshotRecords({ projectRoot }), {
    records: [],
    errors: [],
    misplacedRecords: [],
    rootPresent: false,
  });
});

test('separates a valid record at the wrong location from malformed records', () => {
  const projectRoot = mkdtempProjectIsolated('test-corpus-membership-misplaced-');
  const testPath = 'scripts/tests/integration/lib/new-policy.test.mjs';
  const recordFile = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/new-policy.test.mjs.json`;
  const expectedRecordFile = recordPathForTestPath(testPath);
  writeRecord(projectRoot, recordFile, { schema: 1, path: testPath });

  const loaded = loadPostSnapshotRecords({ projectRoot });
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.misplacedRecords, [{ recordFile, expectedRecordFile, path: testPath }]);
  assert.deepEqual(loaded.records, [{ recordFile, schema: 1, path: testPath }]);
});

test('reconciles an exact canonical corpus and derives lane counts from discovery', () => {
  const exact = reconcileCorpusMembership({
    discovered: [
      'scripts/tests/unit/lib/frozen.test.mjs',
      'scripts/tests/integration/lib/new.test.mjs',
    ],
    frozenPaths: ['scripts/tests/unit/lib/frozen.test.mjs'],
    records: [
      {
        recordFile: `${POST_SNAPSHOT_REGISTRY_ROOT}/integration/lib/new.test.mjs.json`,
        schema: 1,
        path: 'scripts/tests/integration/lib/new.test.mjs',
      },
    ],
  });

  assert.equal(exact.ok, true);
  assert.deepEqual(exact.noncanonicalDiscoveredPaths, []);
  assert.deepEqual(exact.undeclaredPaths, []);
  assert.deepEqual(exact.missingPaths, []);
  assert.deepEqual(exact.duplicatePaths, []);
  assert.deepEqual(exact.overlapPaths, []);
  assert.deepEqual(exact.malformedRecords, []);
  assert.deepEqual(exact.misplacedRecords, []);
  assert.deepEqual(exact.counts, { all: 2, unit: 1, integration: 1, slow: 0 });
});

test('allows a validated retired frozen path to be absent from discovery', () => {
  const retiredPath = 'scripts/tests/unit/lib/retired.test.mjs';
  const receiptFile =
    'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/lib/retired.test.mjs.json';
  const result = reconcileCorpusMembership({
    discovered: [],
    frozenPaths: [retiredPath],
    records: [],
    retirements: [{ path: retiredPath, receiptFile, source: 'active' }],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missingPaths, []);
  assert.deepEqual(result.receiptTestOverlapPaths, []);
});

test('keeps a frozen path active when its retirement receipt overlaps live discovery', () => {
  const frozenPath = 'scripts/tests/unit/lib/retired.test.mjs';
  const receiptFile =
    'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/lib/retired.test.mjs.json';
  const result = reconcileCorpusMembership({
    discovered: [frozenPath],
    frozenPaths: [frozenPath],
    records: [],
    retirements: [{ path: frozenPath, receiptFile, source: 'active' }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.receiptTestOverlapPaths, [
    { path: frozenPath, receiptFiles: [receiptFile] },
  ]);
  assert.match(formatCorpusMembershipErrors(result), /receipt overlaps a live discovered test/);
});

test('rejects retirement authority that is non-frozen or overlaps a post-snapshot record', () => {
  const frozenPath = 'scripts/tests/unit/lib/frozen.test.mjs';
  const postSnapshotPath = 'scripts/tests/integration/lib/new.test.mjs';
  const nonFrozenPath = 'scripts/tests/slow/lib/non-frozen.test.mjs';
  const postSnapshotReceipt =
    'scripts/tests/fixtures/test-corpus-frozen-retirements/integration/lib/new.test.mjs.json';
  const nonFrozenReceipt =
    'scripts/tests/fixtures/test-corpus-frozen-retirements/slow/lib/non-frozen.test.mjs.json';
  const result = reconcileCorpusMembership({
    discovered: [frozenPath, postSnapshotPath],
    frozenPaths: [frozenPath, postSnapshotPath],
    records: [
      { recordFile: recordPathForTestPath(postSnapshotPath), schema: 1, path: postSnapshotPath },
    ],
    retirements: [
      { path: postSnapshotPath, receiptFile: postSnapshotReceipt, source: 'active' },
      { path: nonFrozenPath, receiptFile: nonFrozenReceipt, source: 'active' },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalidRetirementAuthorityPaths, [
    {
      path: postSnapshotPath,
      receiptFiles: [postSnapshotReceipt],
      reason: 'overlaps a post-snapshot membership record',
    },
    {
      path: nonFrozenPath,
      receiptFiles: [nonFrozenReceipt],
      reason: 'is not a finalized frozen path',
    },
  ]);
  assert.match(formatCorpusMembershipErrors(result), /Invalid retirement authority overlap/);
});

test('reports duplicate retirement authority deterministically without subtracting membership', () => {
  const frozenPath = 'scripts/tests/unit/lib/retired.test.mjs';
  const firstReceipt =
    'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/lib/a-retired.test.mjs.json';
  const secondReceipt =
    'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/lib/z-retired.test.mjs.json';
  const result = reconcileCorpusMembership({
    discovered: [],
    frozenPaths: [frozenPath],
    records: [],
    retirements: [
      { path: frozenPath, receiptFile: secondReceipt, source: 'active' },
      { path: frozenPath, receiptFile: firstReceipt, source: 'active' },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicateRetirementPaths, [
    { path: frozenPath, receiptFiles: [firstReceipt, secondReceipt] },
  ]);
  assert.deepEqual(result.missingPaths, [
    { path: frozenPath, authority: 'frozen', recordFile: null },
  ]);
  const diagnostics = formatCorpusMembershipErrors(result);
  assert.ok(diagnostics.indexOf(firstReceipt) < diagnostics.indexOf(secondReceipt));
});

test('formats malformed and misplaced retirement authority without subtracting frozen membership', () => {
  const frozenPath = 'scripts/tests/unit/lib/retired.test.mjs';
  const malformedRetirement = {
    receiptFile:
      'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/lib/bad-retired.test.mjs.json',
    error: 'frozen-test-retirements: invalid JSON',
  };
  const misplacedRetirement = {
    receiptFile:
      'scripts/tests/fixtures/test-corpus-frozen-retirements/integration/lib/retired.test.mjs.json',
    expectedReceiptFile:
      'scripts/tests/fixtures/test-corpus-frozen-retirements/unit/lib/retired.test.mjs.json',
    path: frozenPath,
  };
  const result = reconcileCorpusMembership({
    discovered: [],
    frozenPaths: [frozenPath],
    records: [],
    retirementErrors: [malformedRetirement],
    misplacedRetirements: [misplacedRetirement],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.malformedRetirements, [malformedRetirement]);
  assert.deepEqual(result.misplacedRetirements, [misplacedRetirement]);
  assert.deepEqual(result.missingPaths, [
    { path: frozenPath, authority: 'frozen', recordFile: null },
  ]);
  const diagnostics = formatCorpusMembershipErrors(result);
  assert.match(diagnostics, /Malformed frozen-retirement receipts/);
  assert.match(diagnostics, /Misplaced frozen-retirement receipts/);
  assert.match(diagnostics, /invalid JSON/);
  assert.match(diagnostics, new RegExp(misplacedRetirement.expectedReceiptFile));
});

test('reports canonical discovered paths missing from both membership authorities', () => {
  const undeclaredPath = 'scripts/tests/unit/lib/undeclared.test.mjs';
  const result = reconcileCorpusMembership({
    discovered: [undeclaredPath],
    frozenPaths: [],
    records: [],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.undeclaredPaths, [undeclaredPath]);
  assert.match(formatCorpusMembershipErrors(result), new RegExp(undeclaredPath));
  assert.match(
    formatCorpusMembershipErrors(result),
    new RegExp(recordPathForTestPath(undeclaredPath))
  );
});

test('reports record declarations whose canonical tests are missing from discovery', () => {
  const stalePath = 'scripts/tests/integration/lib/stale.test.mjs';
  const recordFile = recordPathForTestPath(stalePath);
  const result = reconcileCorpusMembership({
    discovered: [],
    frozenPaths: [],
    records: [{ recordFile, schema: 1, path: stalePath }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingPaths, [{ path: stalePath, authority: 'record', recordFile }]);
  assert.match(formatCorpusMembershipErrors(result), new RegExp(stalePath));
  assert.match(formatCorpusMembershipErrors(result), new RegExp(recordFile));
});

test('keeps a missing frozen destination distinct from a missing record declaration', () => {
  const frozenPath = 'scripts/tests/slow/lib/frozen.test.mjs';
  const result = reconcileCorpusMembership({
    discovered: [],
    frozenPaths: [frozenPath],
    records: [],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingPaths, [
    { path: frozenPath, authority: 'frozen', recordFile: null },
  ]);
  assert.match(formatCorpusMembershipErrors(result), /restore or repair the frozen destination/);
});

test('reports every record file that declares a duplicate logical path', () => {
  const duplicatePath = 'scripts/tests/unit/lib/duplicate.test.mjs';
  const firstRecordFile = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/duplicate-a.test.mjs.json`;
  const secondRecordFile = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/duplicate-b.test.mjs.json`;
  const result = reconcileCorpusMembership({
    discovered: [duplicatePath],
    frozenPaths: [],
    records: [
      { recordFile: secondRecordFile, schema: 1, path: duplicatePath },
      { recordFile: firstRecordFile, schema: 1, path: duplicatePath },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicatePaths, [
    { path: duplicatePath, recordFiles: [firstRecordFile, secondRecordFile] },
  ]);
  const diagnostics = formatCorpusMembershipErrors(result);
  assert.ok(diagnostics.indexOf(firstRecordFile) < diagnostics.indexOf(secondRecordFile));
});

test('reports records that overlap a frozen membership authority', () => {
  const overlapPath = 'scripts/tests/unit/lib/frozen.test.mjs';
  const recordFile = recordPathForTestPath(overlapPath);
  const result = reconcileCorpusMembership({
    discovered: [],
    frozenPaths: [overlapPath],
    records: [{ recordFile, schema: 1, path: overlapPath }],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.overlapPaths, [{ path: overlapPath, recordFiles: [recordFile] }]);
  assert.deepEqual(result.missingPaths, [
    { path: overlapPath, authority: 'frozen', recordFile: null },
    { path: overlapPath, authority: 'record', recordFile },
  ]);
  assert.match(formatCorpusMembershipErrors(result), new RegExp(overlapPath));
  assert.match(formatCorpusMembershipErrors(result), new RegExp(recordFile));
});

test('keeps a valid but misplaced record separate from malformed records', () => {
  const testPath = 'scripts/tests/integration/lib/misplaced.test.mjs';
  const misplacedRecord = {
    recordFile: `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/misplaced.test.mjs.json`,
    expectedRecordFile: recordPathForTestPath(testPath),
    path: testPath,
  };
  const result = reconcileCorpusMembership({
    discovered: [testPath],
    frozenPaths: [],
    records: [{ recordFile: misplacedRecord.recordFile, schema: 1, path: testPath }],
    misplacedRecords: [misplacedRecord],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.malformedRecords, []);
  assert.deepEqual(result.misplacedRecords, [misplacedRecord]);
  const diagnostics = formatCorpusMembershipErrors(result);
  assert.match(diagnostics, new RegExp(misplacedRecord.recordFile));
  assert.match(diagnostics, new RegExp(misplacedRecord.expectedRecordFile));
  assert.match(diagnostics, /move or repair that record/);
});

test('reports noncanonical discovery as a layout failure without proposing a record path', () => {
  const noncanonicalPath = 'scripts/gh/misplaced.test.mjs';
  const result = reconcileCorpusMembership({
    discovered: [noncanonicalPath],
    frozenPaths: [],
    records: [],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.noncanonicalDiscoveredPaths, [noncanonicalPath]);
  const diagnostics = formatCorpusMembershipErrors(result);
  assert.match(diagnostics, /test-tree-layout\.test\.mjs/);
  assert.match(diagnostics, /No membership record can be created/);
  assert.doesNotMatch(diagnostics, /test-corpus-post-snapshot\/scripts\/gh/);
});

test('fails closed when the record loader reports malformed records despite matching paths', () => {
  const testPath = 'scripts/tests/unit/lib/valid.test.mjs';
  const malformedRecord = {
    recordFile: `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/bad.test.mjs.json`,
    error: 'test-corpus-membership: invalid JSON',
  };
  const result = reconcileCorpusMembership({
    discovered: [testPath],
    frozenPaths: [testPath],
    records: [],
    recordErrors: [malformedRecord],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.malformedRecords, [malformedRecord]);
  const diagnostics = formatCorpusMembershipErrors(result);
  assert.match(diagnostics, new RegExp(malformedRecord.recordFile));
  assert.match(diagnostics, /invalid JSON/);
});

test('formats every diagnostic collection in deterministic plan order', () => {
  const noncanonicalA = 'scripts/gh/a-misplaced.test.mjs';
  const noncanonicalZ = 'scripts/gh/z-misplaced.test.mjs';
  const duplicateA = 'scripts/tests/unit/lib/a-duplicate.test.mjs';
  const duplicateZ = 'scripts/tests/unit/lib/z-duplicate.test.mjs';
  const overlapA = 'scripts/tests/slow/lib/a-overlap.test.mjs';
  const overlapZ = 'scripts/tests/slow/lib/z-overlap.test.mjs';
  const undeclaredA = 'scripts/tests/integration/lib/a-undeclared.test.mjs';
  const undeclaredZ = 'scripts/tests/integration/lib/z-undeclared.test.mjs';
  const missingA = 'scripts/tests/unit/lib/a-missing.test.mjs';
  const missingZ = 'scripts/tests/unit/lib/z-missing.test.mjs';
  const firstRecordFile = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/a.test.mjs.json`;
  const secondRecordFile = `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/z.test.mjs.json`;
  const misplacedA = {
    recordFile: `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/a-misplaced.test.mjs.json`,
    expectedRecordFile: recordPathForTestPath('scripts/tests/slow/lib/a-misplaced.test.mjs'),
    path: 'scripts/tests/slow/lib/a-misplaced.test.mjs',
  };
  const misplacedZ = {
    recordFile: `${POST_SNAPSHOT_REGISTRY_ROOT}/unit/lib/z-misplaced.test.mjs.json`,
    expectedRecordFile: recordPathForTestPath('scripts/tests/slow/lib/z-misplaced.test.mjs'),
    path: 'scripts/tests/slow/lib/z-misplaced.test.mjs',
  };
  const diagnostics = formatCorpusMembershipErrors({
    malformedRecords: [
      { recordFile: secondRecordFile, error: 'bad schema' },
      { recordFile: firstRecordFile, error: 'bad JSON' },
    ],
    misplacedRecords: [misplacedZ, misplacedA],
    noncanonicalDiscoveredPaths: [noncanonicalZ, noncanonicalA],
    duplicatePaths: [
      { path: duplicateZ, recordFiles: [secondRecordFile, firstRecordFile] },
      { path: duplicateA, recordFiles: [secondRecordFile, firstRecordFile] },
    ],
    overlapPaths: [
      { path: overlapZ, recordFiles: [secondRecordFile, firstRecordFile] },
      { path: overlapA, recordFiles: [secondRecordFile, firstRecordFile] },
    ],
    undeclaredPaths: [undeclaredZ, undeclaredA],
    missingPaths: [
      { path: missingZ, authority: 'record', recordFile: recordPathForTestPath(missingZ) },
      { path: missingA, authority: 'frozen', recordFile: null },
    ],
  });

  const headings = [
    'Malformed membership records:',
    'Misplaced membership records:',
    'Noncanonical discovered test files:',
    'Duplicate membership declarations:',
    'Post-snapshot records overlapping frozen destinations:',
    'Undeclared test files:',
    'Declared tests missing from disk:',
  ];
  for (let index = 1; index < headings.length; index += 1) {
    assert.ok(diagnostics.indexOf(headings[index - 1]) < diagnostics.indexOf(headings[index]));
  }
  assert.ok(diagnostics.indexOf(firstRecordFile) < diagnostics.indexOf(secondRecordFile));
  assert.ok(
    diagnostics.indexOf(misplacedA.recordFile) < diagnostics.indexOf(misplacedZ.recordFile)
  );
  assert.ok(diagnostics.indexOf(noncanonicalA) < diagnostics.indexOf(noncanonicalZ));
  assert.ok(diagnostics.indexOf(duplicateA) < diagnostics.indexOf(duplicateZ));
  assert.ok(diagnostics.indexOf(overlapA) < diagnostics.indexOf(overlapZ));
  assert.ok(diagnostics.indexOf(undeclaredA) < diagnostics.indexOf(undeclaredZ));
  assert.ok(diagnostics.indexOf(missingA) < diagnostics.indexOf(missingZ));
});
