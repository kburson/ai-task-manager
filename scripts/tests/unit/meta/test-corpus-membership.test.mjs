// @story #1263
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  finalizedFrozenPaths,
  loadPostSnapshotRecords,
  POST_SNAPSHOT_REGISTRY_ROOT,
  recordPathForTestPath,
} from '../../lib/test-corpus-membership.mjs';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

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
  writeRecord(projectRoot, recordPathForTestPath(posixSecondPath), { schema: 1, path: posixSecondPath });
  writeRecord(projectRoot, recordPathForTestPath(posixFirstPath), { schema: 1, path: posixFirstPath });
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
  writeRecord(projectRoot, wrongSchema, { schema: 2, path: 'scripts/tests/unit/lib/wrong-schema.test.mjs' });
  writeRecord(projectRoot, noncanonicalPath, { schema: 1, path: 'scripts/gh/noncanonical.test.mjs' });
  writeRecord(projectRoot, duplicateFirst, { schema: 1, path: 'scripts/tests/unit/lib/duplicate.test.mjs' });
  writeRecord(projectRoot, duplicateSecond, { schema: 1, path: 'scripts/tests/unit/lib/duplicate.test.mjs' });

  const loaded = loadPostSnapshotRecords({ projectRoot });
  assert.deepEqual(
    loaded.errors.map(({ recordFile }) => recordFile),
    [invalidJson, duplicateSecond, extraKey, noncanonicalPath, wrongSchema].sort()
  );
  assert.match(loaded.errors.find(({ recordFile }) => recordFile === invalidJson).error, /invalid JSON/);
  assert.match(loaded.errors.find(({ recordFile }) => recordFile === extraKey).error, /keys/);
  assert.match(loaded.errors.find(({ recordFile }) => recordFile === wrongSchema).error, /schema/);
  assert.match(loaded.errors.find(({ recordFile }) => recordFile === noncanonicalPath).error, /noncanonical test path/);
  assert.match(loaded.errors.find(({ recordFile }) => recordFile === duplicateSecond).error, /duplicate declared path/);
  assert.deepEqual(
    loaded.records.map(({ path: recordPath }) => recordPath),
    ['scripts/tests/unit/lib/duplicate.test.mjs', validPath]
  );
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
