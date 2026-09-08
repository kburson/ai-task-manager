// @story #1226
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  calibrationInputSha256,
  longestProcessingTimeMaximum,
  nearestRankP95,
  normalizeCloudTestBaseline,
  requiredSlotsForValidations,
  selectCanarySlowWidth,
  validationCapacity,
} from '../../../../../task-tracker/lib/cloud-test/performance-baseline.mjs';

const HEAD = 'a'.repeat(40);
const BASELINE_PATH =
  'scripts/tests/fixtures/performance/cloud-test-local-baseline-2026-09-02.json';
const BASELINE_SHA = 'b'.repeat(64);
const INPUT_SHA = 'c'.repeat(64);
const PROFILE = Object.freeze({
  label: 'local-test',
  platform: 'darwin',
  arch: 'arm64',
  nodeVersion: '25.6.0',
  logicalCpuCount: 10,
});

const CHECKED_IN_BASELINE = new URL(
  '../../../../fixtures/performance/cloud-test-local-baseline-2026-09-02.json',
  import.meta.url
);

function artifact(lane, files) {
  const laneMinute = { unit: '01', integration: '02', slow: '03' }[lane];
  return {
    schema: 5,
    generatedAt: `2026-09-02T00:${laneMinute}:00Z`,
    lane,
    command: `node scripts/run-tests.mjs --lane ${lane}`,
    commit: HEAD,
    runnerProfile: PROFILE,
    count: files.length,
    discoveryInventory: files.map(({ file }) => file).sort(),
    elapsed: {
      runnerMs: 1000,
      poolMs: 500,
      subprocessPoolMs: 100,
      slowPoolMs: 100,
      serialMs: 300,
    },
    sums: { fileWallMs: 1000, inProcessMs: 700, estimatedSpawnIoMs: 300 },
    files: Object.fromEntries(
      files.map(({ file, wallMs, inProcMs = null }) => [
        file,
        { label: file, wallMs, inProcMs, status: 0 },
      ])
    ),
  };
}

function baselineInputs() {
  const discoveredByLane = {
    unit: ['scripts/tests/unit/a.test.mjs', 'scripts/tests/unit/b.test.mjs'],
    integration: ['scripts/tests/integration/c.test.mjs'],
    slow: ['scripts/tests/slow/d.test.mjs', 'scripts/tests/slow/e.test.mjs'],
  };
  return {
    expectedHeadSha: HEAD,
    calibrationInputSha256: INPUT_SHA,
    discoveredByLane,
    artifacts: {
      unit: artifact('unit', [
        { file: discoveredByLane.unit[0], wallMs: 400, inProcMs: 300 },
        { file: discoveredByLane.unit[1], wallMs: 100 },
      ]),
      integration: artifact('integration', [
        { file: discoveredByLane.integration[0], wallMs: 250 },
      ]),
      slow: artifact('slow', [
        { file: discoveredByLane.slow[0], wallMs: 900 },
        { file: discoveredByLane.slow[1], wallMs: 600 },
      ]),
    },
  };
}

test('normalizeCloudTestBaseline binds three schema-5 lanes and preserves null timings', () => {
  const result = normalizeCloudTestBaseline(baselineInputs());
  assert.equal(result.schema, 1);
  assert.equal(result.measuredCommit, HEAD);
  assert.equal(result.calibrationInputSha256, INPUT_SHA);
  assert.deepEqual(result.runnerProfile, PROFILE);
  assert.equal(result.lanes.unit.fileCount, 2);
  assert.match(result.lanes.unit.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(result.weights['scripts/tests/unit/b.test.mjs'].inProcMs, null);
  assert.equal(result.weights['scripts/tests/slow/d.test.mjs'].wallMs, 900);
});

test('checked-in baseline is internally complete and provenance-bound', () => {
  const baseline = JSON.parse(readFileSync(CHECKED_IN_BASELINE, 'utf8'));
  assert.equal(baseline.schema, 1);
  assert.match(baseline.measuredCommit, /^[0-9a-f]{40,64}$/);
  assert.match(baseline.calibrationInputSha256, /^[0-9a-f]{64}$/);
  assert.equal(baseline.dependencyLock.path, 'package-lock.json');
  assert.match(baseline.dependencyLock.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(baseline.lanes).map(([lane, value]) => [lane, value.fileCount])
    ),
    { unit: 831, integration: 157, slow: 53 }
  );
  const inventory = Object.entries(baseline.lanes).flatMap(([lane, value]) => {
    assert.match(value.sourceSha256, /^[0-9a-f]{64}$/);
    assert.equal(value.fileCount, value.discoveryInventory.length);
    for (const file of value.discoveryInventory) assert.equal(baseline.weights[file].lane, lane);
    return value.discoveryInventory;
  });
  assert.equal(new Set(inventory).size, inventory.length);
  assert.equal(inventory.length, 1041);
  assert.equal(inventory.length, Object.keys(baseline.weights).length);
});

test('normalizeCloudTestBaseline rejects missing provenance and mismatched discovery', () => {
  const missing = baselineInputs();
  delete missing.artifacts.unit.command;
  assert.throws(() => normalizeCloudTestBaseline(missing), /unit command/);

  const mismatched = baselineInputs();
  mismatched.artifacts.slow.discoveryInventory = ['scripts/tests/slow/d.test.mjs'];
  assert.throws(() => normalizeCloudTestBaseline(mismatched), /slow discovery inventory/);

  const mixedHead = baselineInputs();
  mixedHead.artifacts.integration.commit = 'd'.repeat(40);
  assert.throws(() => normalizeCloudTestBaseline(mixedHead), /integration commit/);
});

test('calibrationInputSha256 binds lane inventories, test blobs, and dependency lock', () => {
  const input = baselineInputs();
  const testBlobIds = Object.fromEntries(
    Object.values(input.discoveredByLane)
      .flat()
      .map((file, index) => [file, String(index + 1).padStart(40, '0')])
  );
  const first = calibrationInputSha256({
    discoveredByLane: input.discoveredByLane,
    testBlobIds,
    dependencyLockSha256: 'd'.repeat(64),
  });
  const reordered = calibrationInputSha256({
    discoveredByLane: {
      slow: input.discoveredByLane.slow.slice().reverse(),
      integration: input.discoveredByLane.integration,
      unit: input.discoveredByLane.unit.slice().reverse(),
    },
    testBlobIds: Object.fromEntries(Object.entries(testBlobIds).reverse()),
    dependencyLockSha256: 'd'.repeat(64),
  });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(reordered, first);
  assert.notEqual(
    calibrationInputSha256({
      discoveredByLane: input.discoveredByLane,
      testBlobIds: { ...testBlobIds, [input.discoveredByLane.slow[0]]: 'e'.repeat(40) },
      dependencyLockSha256: 'd'.repeat(64),
    }),
    first
  );
  assert.throws(
    () =>
      calibrationInputSha256({
        discoveredByLane: input.discoveredByLane,
        testBlobIds: {},
        dependencyLockSha256: 'd'.repeat(64),
      }),
    /blob id/
  );
});

test('longestProcessingTimeMaximum is deterministic and validates weights', () => {
  const weights = [
    { file: 'c', weightSeconds: 7 },
    { file: 'a', weightSeconds: 5 },
    { file: 'b', weightSeconds: 4 },
    { file: 'd', weightSeconds: 2 },
  ];
  assert.equal(longestProcessingTimeMaximum(weights, 2), 9);
  assert.equal(longestProcessingTimeMaximum(weights.slice().reverse(), 2), 9);
  assert.throws(
    () => longestProcessingTimeMaximum([{ file: 'a', weightSeconds: -1 }], 2),
    /non-negative/
  );
});

function candidate({ repositorySeconds, totalSeconds, executionSeconds }) {
  return { passed: true, repositorySeconds, totalSeconds, executionSeconds };
}

function canaryRun(overrides = {}) {
  return {
    runId: 100,
    attempt: 1,
    status: 'completed',
    headSha: HEAD,
    sourceBaseline: { path: BASELINE_PATH, sha256: BASELINE_SHA },
    unmeasuredFallbackFileCount: 0,
    unmeasuredFallbackWeightSeconds: 0,
    qualityPassed: true,
    fastShardsPassed: true,
    candidates: {
      2: {
        partitionProof: { ok: true, headSha: HEAD, lane: 'slow', width: 2 },
        cold: candidate({ repositorySeconds: 470, totalSeconds: 520, executionSeconds: 405 }),
        warm: candidate({ repositorySeconds: 450, totalSeconds: 500, executionSeconds: 408 }),
      },
      3: {
        partitionProof: { ok: true, headSha: HEAD, lane: 'slow', width: 3 },
        cold: candidate({ repositorySeconds: 390, totalSeconds: 430, executionSeconds: 300 }),
        warm: candidate({ repositorySeconds: 370, totalSeconds: 410, executionSeconds: 280 }),
      },
    },
    ...overrides,
  };
}

test('selectCanarySlowWidth requires five complete pairs and prefers width two at the boundary', () => {
  const runs = Array.from({ length: 5 }, (_, index) => canaryRun({ runId: 100 + index }));
  assert.equal(
    selectCanarySlowWidth({
      runs,
      expectedHeadSha: HEAD,
      expectedBaseline: { path: BASELINE_PATH, sha256: BASELINE_SHA },
    }),
    2
  );
  assert.throws(
    () =>
      selectCanarySlowWidth({
        runs: runs.slice(1),
        expectedHeadSha: HEAD,
        expectedBaseline: { path: BASELINE_PATH, sha256: BASELINE_SHA },
      }),
    /five/
  );
});

test('selectCanarySlowWidth requires five distinct runs and exact candidate partition proofs', () => {
  const runs = Array.from({ length: 5 }, (_, index) => canaryRun({ runId: 100 + index }));
  const duplicated = runs.map((run) => structuredClone(run));
  duplicated[4].runId = duplicated[3].runId;
  assert.throws(
    () =>
      selectCanarySlowWidth({
        runs: duplicated,
        expectedHeadSha: HEAD,
        expectedBaseline: { path: BASELINE_PATH, sha256: BASELINE_SHA },
      }),
    /distinct/
  );

  const wrongProof = runs.map((run) => structuredClone(run));
  wrongProof[2].candidates[2].partitionProof.headSha = 'd'.repeat(40);
  assert.throws(
    () =>
      selectCanarySlowWidth({
        runs: wrongProof,
        expectedHeadSha: HEAD,
        expectedBaseline: { path: BASELINE_PATH, sha256: BASELINE_SHA },
      }),
    /partition proof/
  );
});

test('selectCanarySlowWidth falls back to three and refuses incomplete calibration', () => {
  const widthThree = Array.from({ length: 5 }, (_, index) => canaryRun({ runId: 100 + index }));
  widthThree[2].candidates[2].warm.executionSeconds = 408.001;
  assert.equal(
    selectCanarySlowWidth({
      runs: widthThree,
      expectedHeadSha: HEAD,
      expectedBaseline: { path: BASELINE_PATH, sha256: BASELINE_SHA },
    }),
    3
  );

  const fallback = Array.from({ length: 5 }, (_, index) => canaryRun({ runId: 100 + index }));
  fallback[0].unmeasuredFallbackFileCount = 1;
  fallback[0].unmeasuredFallbackWeightSeconds = 2.5;
  assert.throws(
    () =>
      selectCanarySlowWidth({
        runs: fallback,
        expectedHeadSha: HEAD,
        expectedBaseline: { path: BASELINE_PATH, sha256: BASELINE_SHA },
      }),
    /calibration-incomplete/
  );

  const wrongSource = Array.from({ length: 5 }, (_, index) => canaryRun({ runId: 100 + index }));
  wrongSource[4].sourceBaseline.sha256 = 'd'.repeat(64);
  assert.throws(
    () =>
      selectCanarySlowWidth({
        runs: wrongSource,
        expectedHeadSha: HEAD,
        expectedBaseline: { path: BASELINE_PATH, sha256: BASELINE_SHA },
      }),
    /source baseline/
  );
});

test('nearestRankP95 requires twenty eligible samples', () => {
  assert.throws(() => nearestRankP95(Array.from({ length: 19 }, (_, i) => i + 1)), /20/);
  assert.throws(
    () => nearestRankP95([...Array.from({ length: 19 }, (_, i) => i + 1), null]),
    /finite/
  );
  assert.equal(nearestRankP95(Array.from({ length: 20 }, (_, i) => i + 1)), 19);
});

test('validation capacity preserves four slots and matches Free and Pro examples', () => {
  assert.equal(validationCapacity({ totalSlots: 20, heavyJobsPerValidation: 5 }), 3);
  assert.equal(validationCapacity({ totalSlots: 20, heavyJobsPerValidation: 6 }), 2);
  assert.equal(validationCapacity({ totalSlots: 40, heavyJobsPerValidation: 5 }), 7);
  assert.equal(validationCapacity({ totalSlots: 40, heavyJobsPerValidation: 6 }), 6);
  assert.equal(validationCapacity({ totalSlots: 40, heavyJobsPerValidation: 4 }), 9);
  assert.equal(requiredSlotsForValidations({ validations: 10, heavyJobsPerValidation: 4 }), 44);
});
