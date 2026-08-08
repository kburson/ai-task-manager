#!/usr/bin/env node
// @story #1090
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildSampleSchedule,
  compareTestClusterMeasurements,
  parseBenchmarkArgs,
  runBenchmark,
  summarizeDurations,
} from '../../../../benchmarks/compare-test-fixtures.mjs';

test('parseBenchmarkArgs accepts refs, repeated files, samples, and output verbatim', () => {
  const parsed = parseBenchmarkArgs([
    '--baseline-ref',
    'base;not-shell',
    '--candidate-ref=candidate',
    '--file',
    'a path.test.mjs',
    '--file=b.test.mjs',
    '--samples',
    '7',
    '--output',
    '.tmp/benchmark/result.json',
  ]);
  assert.equal(parsed.baselineRef, 'base;not-shell');
  assert.equal(parsed.candidateRef, 'candidate');
  assert.deepEqual(parsed.files, ['a path.test.mjs', 'b.test.mjs']);
  assert.equal(parsed.samples, 7);
  assert.equal(parsed.output, '.tmp/benchmark/result.json');
});

test('parseBenchmarkArgs supports different old and new cluster compositions', () => {
  const parsed = parseBenchmarkArgs([
    '--baseline-ref=base',
    '--candidate-ref=head',
    '--baseline-file=old-a.test.mjs',
    '--baseline-file=old-b.test.mjs',
    '--candidate-file=new.test.mjs',
  ]);
  assert.deepEqual(parsed.baselineFiles, ['old-a.test.mjs', 'old-b.test.mjs']);
  assert.deepEqual(parsed.candidateFiles, ['new.test.mjs']);
  assert.equal(parsed.samples, 5);
});

test('buildSampleSchedule alternates ref order and pairs cold then warm samples', () => {
  assert.deepEqual(buildSampleSchedule(2), [
    { cycle: 1, ref: 'baseline', mode: 'cold' },
    { cycle: 1, ref: 'baseline', mode: 'warm' },
    { cycle: 1, ref: 'candidate', mode: 'cold' },
    { cycle: 1, ref: 'candidate', mode: 'warm' },
    { cycle: 2, ref: 'candidate', mode: 'cold' },
    { cycle: 2, ref: 'candidate', mode: 'warm' },
    { cycle: 2, ref: 'baseline', mode: 'cold' },
    { cycle: 2, ref: 'baseline', mode: 'warm' },
  ]);
});

test('summaries and comparison enforce median and P80 threshold', () => {
  const baseline = summarizeDurations([100, 100, 100, 100, 100]);
  const candidate = summarizeDurations([70, 70, 70, 70, 70]);
  const comparison = compareTestClusterMeasurements({ baseline, candidate, threshold: 0.25 });
  assert.equal(baseline.medianMs, 100);
  assert.equal(baseline.p80Ms, 100);
  assert.equal(comparison.medianImprovementPct, 30);
  assert.equal(comparison.p80ImprovementPct, 30);
  assert.equal(comparison.passesThreshold, true);

  const miss = compareTestClusterMeasurements({
    baseline,
    candidate: summarizeDurations([80, 80, 80, 80, 80]),
    threshold: 0.25,
  });
  assert.equal(miss.passesThreshold, false);
});

test('failed samples are rejected instead of discarded', () => {
  assert.throws(() => summarizeDurations([100, null, 90]), /failed or invalid sample at index 1/);
});

test('runBenchmark owns explicit worktrees, alternates samples, and cleans both refs', () => {
  const added = [];
  const removed = [];
  const measured = [];
  const result = runBenchmark(
    {
      baselineRef: 'base',
      candidateRef: 'head',
      baselineFiles: ['old.test.mjs'],
      candidateFiles: ['new.test.mjs'],
      samples: 2,
    },
    {
      projectDir: process.cwd(),
      addWorktree: (_project, ref, target) => added.push({ ref, target }),
      removeWorktree: (_project, target) => removed.push(target),
      measure: (target, files, sample) => {
        measured.push({ target, files, sample });
        return sample.ref === 'baseline' ? 100 : 70;
      },
    }
  );
  assert.deepEqual(
    added.map((entry) => entry.ref),
    ['base', 'head']
  );
  assert.deepEqual(removed.slice().sort(), added.map((entry) => entry.target).sort());
  assert.equal(measured.length, 8);
  assert.equal(result.measurements.baseline.invocationCount, 4);
  assert.equal(result.measurements.baseline.testFileWorkerProcessCount, 4);
  assert.equal(result.measurements.candidate.testFileWorkerProcessCount, 4);
  assert.equal(result.comparison.combined.passesThreshold, true);
  assert.deepEqual(result.cleanup, { baseline: true, candidate: true, root: true });
});

test('runBenchmark retains partial samples, failure detail, and cleanup in JSON shape', () => {
  const removed = [];
  const result = runBenchmark(
    {
      baselineRef: 'base',
      candidateRef: 'head',
      baselineFiles: ['old.test.mjs'],
      candidateFiles: ['new.test.mjs'],
      samples: 1,
    },
    {
      projectDir: process.cwd(),
      addWorktree: () => {},
      removeWorktree: (_project, target) => removed.push(target),
      measure: (_target, _files, sample) => {
        if (sample.ref === 'candidate') throw new Error('candidate sample failed');
        return 100;
      },
    }
  );
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /candidate sample failed/);
  assert.deepEqual(result.partialSamples.baseline, { cold: [100], warm: [100] });
  assert.equal(result.measurements, null);
  assert.equal(result.comparison, null);
  assert.equal(removed.length, 2);
  assert.deepEqual(result.cleanup, { baseline: true, candidate: true, root: true });
});
