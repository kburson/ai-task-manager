#!/usr/bin/env node
// @story #1090
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildTimingReport,
  formatTimingReport,
  serializeArtifact,
} from '../../../../run-tests-timing.mjs';

const parallelRecords = [
  { file: 'a.test.mjs', label: 'a.test.mjs', wallMs: 1000, inProcMs: 900, status: 0 },
  { file: 'b.test.mjs', label: 'b.test.mjs', wallMs: 1000, inProcMs: 900, status: 0 },
  { file: 'c.test.mjs', label: 'c.test.mjs', wallMs: 1000, inProcMs: 900, status: 0 },
];

test('schema 3 separates actual runner/pool/subprocess/serial elapsed from duration sums', () => {
  const artifact = serializeArtifact(parallelRecords, {
    lane: 'unit',
    runnerElapsedMs: 1250,
    poolElapsedMs: 800,
    subprocessPoolElapsedMs: 300,
    serialElapsedMs: 150,
  });
  assert.equal(artifact.schema, 3);
  assert.deepEqual(artifact.elapsed, {
    runnerMs: 1250,
    poolMs: 800,
    subprocessPoolMs: 300,
    serialMs: 150,
  });
  assert.equal(artifact.sums.fileWallMs, 3000);
  assert.equal(artifact.sums.inProcessMs, 2700);
  assert.equal(artifact.sums.estimatedSpawnIoMs, 300);
  assert.ok(
    artifact.sums.fileWallMs > artifact.elapsed.poolMs,
    'parallel summed wall may exceed actual pool elapsed'
  );
});

test('timing report labels actual elapsed, summed wall, in-process, and spawn IO', () => {
  const report = buildTimingReport(parallelRecords, {
    runnerElapsedMs: 1250,
    poolElapsedMs: 800,
    subprocessPoolElapsedMs: 300,
    serialElapsedMs: 150,
  });
  const text = formatTimingReport(report);
  assert.match(text, /actual elapsed=1\.3s/);
  assert.match(text, /pool=800ms/);
  assert.match(text, /subprocess=300ms/);
  assert.match(text, /serial=150ms/);
  assert.match(text, /summed file wall=3\.0s/);
  assert.match(text, /summed in-process=2\.7s/);
  assert.match(text, /estimated spawn\/IO=300ms/);
});
