// @story #861
// Unit tests for the pure timing module (#861). Zero spawns — every function
// takes plain data, so this runs in the fast (unit) lane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInProcessDurationMs,
  formatDuration,
  formatPassLine,
  median,
  paretoFileCount,
  buildTimingReport,
  auditSlowBucket,
  serializeArtifact,
  normalizeTimingArtifact,
  formatTimingReport,
} from '../../../../run-tests-timing.mjs';

test('parseInProcessDurationMs reads the TAP summary line', () => {
  const stdout = ['TAP version 13', 'ok 1 - a test', '# tests 1', '# duration_ms 42.5'].join('\n');
  assert.equal(parseInProcessDurationMs(stdout), 42.5);
});

test('parseInProcessDurationMs reads the spec (ℹ) summary line', () => {
  const stdout = ['✔ a test (0.38ms)', 'ℹ tests 1', 'ℹ duration_ms 10.011834'].join('\n');
  assert.equal(parseInProcessDurationMs(stdout), 10.011834);
});

test('parseInProcessDurationMs returns the max when several duration lines exist', () => {
  // Per-test YAML blocks can each carry a duration; the run total dominates.
  const stdout = ['  duration_ms 3', '  duration_ms 7', '# duration_ms 25'].join('\n');
  assert.equal(parseInProcessDurationMs(stdout), 25);
});

test('parseInProcessDurationMs returns null when no duration token present', () => {
  assert.equal(parseInProcessDurationMs('boom: crashed before any test ran'), null);
  assert.equal(parseInProcessDurationMs(''), null);
  assert.equal(parseInProcessDurationMs(undefined), null);
});

test('parseInProcessDurationMs ignores a malformed (non-numeric) duration', () => {
  assert.equal(parseInProcessDurationMs('# duration_ms n/a'), null);
});

test('formatDuration renders seconds at/above 1s and ms below', () => {
  assert.equal(formatDuration(1700), '1.7s');
  assert.equal(formatDuration(1000), '1.0s');
  assert.equal(formatDuration(94), '94ms');
  assert.equal(formatDuration(94.6), '95ms');
  assert.equal(formatDuration(-1), 'n/a');
  assert.equal(formatDuration(NaN), 'n/a');
});

test('formatPassLine wraps the elapsed time', () => {
  assert.equal(formatPassLine(1700), 'ok (1.7s)');
  assert.equal(formatPassLine(12), 'ok (12ms)');
});

test('median handles even, odd, and empty', () => {
  assert.equal(median([5]), 5);
  assert.equal(median([1, 3]), 2);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), 0);
});

test('paretoFileCount finds the file count reaching a cumulative share', () => {
  // total 120: sorted 60,30,20,10. p50 (>=60) -> 1 file; p80 (>=96) -> 3 files.
  const recs = [
    { file: 'a', wallMs: 60 },
    { file: 'b', wallMs: 30 },
    { file: 'c', wallMs: 20 },
    { file: 'd', wallMs: 10 },
  ];
  assert.equal(paretoFileCount(recs, 0.5), 1);
  assert.equal(paretoFileCount(recs, 0.8), 3);
  assert.equal(paretoFileCount([], 0.5), 0);
});

function sample() {
  return [
    // non-bucket file that is genuinely expensive -> promotion candidate
    { file: 'scripts/x/a.test.mjs', label: 'a.test.mjs', wallMs: 2200, inProcMs: 2100, status: 0 },
    { file: 'scripts/x/b.test.mjs', label: 'b.test.mjs', wallMs: 100, inProcMs: 40, status: 0 },
    // slow-bucket file still ≥2s -> rule holds
    {
      file: 'scripts/x/slow/c.test.mjs',
      label: 'slow/c.test.mjs',
      wallMs: 3000,
      inProcMs: 2900,
      status: 0,
    },
    // slow-bucket file now fast -> demotion candidate
    {
      file: 'scripts/x/slow/d.test.mjs',
      label: 'slow/d.test.mjs',
      wallMs: 500,
      inProcMs: 400,
      status: 1,
    },
    // child printed no duration line -> in-process null, wall only
    { file: 'scripts/x/e.test.mjs', label: 'e.test.mjs', wallMs: 200, inProcMs: null, status: 0 },
  ];
}

test('buildTimingReport aggregates totals, ordering, and share', () => {
  const r = buildTimingReport(sample());
  assert.equal(r.count, 5);
  assert.equal(r.totalWallMs, 6000);
  // in-process sum excludes the null; 2100+40+2900+400 = 5440
  assert.equal(r.totalInProcMs, 5440);
  assert.equal(r.spawnOverheadMs, 560);
  // slowest is c (3000) then a (2000)
  assert.equal(r.slowest[0].label, 'slow/c.test.mjs');
  assert.equal(r.slowest[1].label, 'a.test.mjs');
  // shares sum to ~100 across all files
  const shareSum = r.slowest.reduce((s, x) => s + x.share, 0);
  assert.ok(Math.abs(shareSum - 100) < 0.5, `share sum ~100, got ${shareSum}`);
  // null in-process is preserved as null in the row
  const eRow = r.slowest.find((x) => x.label === 'e.test.mjs');
  assert.equal(eRow.inProcMs, null);
});

test('buildTimingReport reports Pareto p50/p80 file counts', () => {
  const r = buildTimingReport(sample());
  // total 6000; c=3000 alone is >=50%; c+a=5200 is >=80%.
  assert.equal(r.pareto.p50, 1);
  assert.equal(r.pareto.p80, 2);
});

test('buildTimingReport separates wall from in-process time', () => {
  const r = buildTimingReport(sample());
  assert.ok(r.totalWallMs > r.totalInProcMs);
  assert.equal(r.totalWallMs - r.totalInProcMs, r.spawnOverheadMs);
  assert.ok(r.spawnOverheadShare > 0 && r.spawnOverheadShare < 100);
  assert.equal(r.inProcMeasured, 4);
});

test('auditSlowBucket classifies against the ≥2000ms rule', () => {
  const a = auditSlowBucket(sample(), 2000);
  assert.equal(a.thresholdMs, 2000);
  // slow bucket = c (3000, still slow) + d (500, now fast)
  assert.equal(a.slowBucketFiles, 2);
  assert.equal(a.slowBucketStillSlow, 1);
  assert.equal(a.slowBucketNowFast, 1);
  assert.deepEqual(a.demotionCandidates, ['slow/d.test.mjs']);
  // non-bucket file a (in-process 2100) is over threshold -> promotion candidate
  assert.equal(a.fastLaneOverThreshold, 1);
  assert.deepEqual(a.promotionCandidates, ['a.test.mjs']);
});

test('serializeArtifact keys files by path and carries totals + slow bucket', () => {
  const art = serializeArtifact(sample(), {
    lane: 'all',
    generatedAt: '2026-07-19T00:00:00Z',
    runnerElapsedMs: 4100,
    poolElapsedMs: 2100,
    serialElapsedMs: 2000,
  });
  assert.equal(art.schema, 2);
  assert.equal(art.lane, 'all');
  assert.equal(art.generatedAt, '2026-07-19T00:00:00Z');
  assert.equal(art.count, 5);
  assert.equal(art.elapsed.runnerMs, 4100);
  assert.equal(art.elapsed.poolMs, 2100);
  assert.equal(art.elapsed.serialMs, 2000);
  assert.equal(art.sums.fileWallMs, 6000);
  assert.equal(art.sums.inProcessMs, 5440);
  assert.equal(art.sums.estimatedSpawnIoMs, 560);
  assert.ok(art.files['scripts/x/slow/c.test.mjs']);
  assert.equal(art.files['scripts/x/slow/c.test.mjs'].wallMs, 3000);
  assert.equal(art.files['scripts/x/e.test.mjs'].inProcMs, null);
  assert.equal(art.slowBucket.slowBucketFiles, 2);
  // artifact must survive a JSON round trip (it is written to disk as JSON)
  assert.deepEqual(JSON.parse(JSON.stringify(art)), art);
});

test('normalizeTimingArtifact preserves schema 1 wall as a sum, never actual elapsed', () => {
  const normalized = normalizeTimingArtifact({
    schema: 1,
    lane: 'unit',
    totals: { wallMs: 9000, inProcMs: 7000, spawnOverheadMs: 2000 },
    files: {},
  });
  assert.equal(normalized.sourceSchema, 1);
  assert.equal(normalized.elapsed.runnerMs, null);
  assert.equal(normalized.elapsed.poolMs, null);
  assert.equal(normalized.elapsed.serialMs, null);
  assert.equal(normalized.sums.fileWallMs, 9000);
  assert.equal(normalized.sums.inProcessMs, 7000);
  assert.equal(normalized.sums.estimatedSpawnIoMs, 2000);
});

test('formatTimingReport renders a non-empty block and handles empty input', () => {
  const out = formatTimingReport(buildTimingReport(sample()));
  assert.match(out, /Test timing report/);
  assert.match(out, /Pareto:/);
  assert.match(out, /slow bucket/);
  assert.equal(formatTimingReport(buildTimingReport([])), 'timing: no files measured.');
});

test('timing aggregation adds only bounded overhead per record', () => {
  // Demonstrable "bounded overhead" AC: build + audit + serialize over a
  // realistic 600-file run must cost well under a millisecond per record.
  const big = [];
  for (let i = 0; i < 600; i += 1) {
    big.push({
      file: `scripts/gen/f${i}.test.mjs`,
      label: `f${i}.test.mjs`,
      wallMs: 50 + (i % 40) * 25,
      inProcMs: 20 + (i % 40) * 20,
      status: 0,
    });
  }
  const t0 = process.hrtime.bigint();
  const report = buildTimingReport(big);
  serializeArtifact(big, { lane: 'all' });
  const perRecordMs = Number(process.hrtime.bigint() - t0) / 1e6 / big.length;
  assert.equal(report.count, 600);
  assert.ok(perRecordMs < 1, `expected < 1ms/record, got ${perRecordMs.toFixed(4)}ms`);
});
