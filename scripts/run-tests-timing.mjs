// @story #861 #1307
// Per-file test-timing model (#861, epic #859 phase 1 — Measure).
//
// PURE, side-effect-free helpers that turn the per-file elapsed time
// `scripts/run-tests.mjs` already computes into first-class output: a readable
// pass line, a machine-readable JSON artifact keyed by file path, and an
// opt-in slow-test report (top-N, Pareto p50/p80, per-file share, wall-vs-in-
// process split, and a `tests/slow/` audit against the ≥2000ms rule).
//
// Every export takes plain data (strings / record arrays) so the whole module
// unit-tests in-process with zero test spawns. The runner is the only I/O
// caller; nothing here reads argv, the clock, or the filesystem.
//
// Record shape (produced by the runner, consumed here):
//   { file, label, wallMs, inProcMs, status }
//     file     — repo-relative path (artifact key)
//     label    — human label the runner prints (e.g. `slow/foo.test.mjs`)
//     wallMs   — spawnSync wall time in ms (always a number)
//     inProcMs — node:test in-process `duration_ms` in ms, or null when the
//                child printed no duration line (crash / non-node:test file)
//     status   — child exit status (0 = pass)

// node:test prints a summary duration under two reporters: TAP (`# duration_ms
// N`, emitted when stdout is not a TTY) and spec (`ℹ duration_ms N`). Per-test
// lines can also carry the token. We match every occurrence and return the
// MAXIMUM, which is the run total (it dominates any single test's slice) — this
// is reporter-agnostic and robust to either output shape.
const DURATION_MS_RE = /(?:^|\s)(?:#|ℹ|i)\s*duration_ms[:\s]+([0-9]+(?:\.[0-9]+)?)/gim;

// Parse the in-process test duration (ms) from a child's stdout. Returns a
// number, or null when no duration token is present.
export function parseInProcessDurationMs(stdout) {
  const src = String(stdout || '');
  let max = null;
  DURATION_MS_RE.lastIndex = 0;
  let m;
  while ((m = DURATION_MS_RE.exec(src)) !== null) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && (max === null || v > max)) max = v;
  }
  return max;
}

// Format a millisecond duration for humans: `1.7s` at/above 1s, `94ms` below.
export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return 'n/a';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

// The pass-path line the runner prints in place of a bare `ok`.
export function formatPassLine(elapsedMs) {
  return `ok (${formatDuration(elapsedMs)})`;
}

// Round to a fixed number of decimals, returning a plain number.
function round(n, dp = 1) {
  const f = 10 ** dp;
  return Math.round(Number(n) * f) / f;
}

// Median of a numeric array (0 for empty). Sorts a copy; caller's array is
// untouched.
export function median(nums) {
  const xs = (Array.isArray(nums) ? nums : [])
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// The number of slowest files whose cumulative wall-time share first reaches
// `fraction` (0..1) of the total. This is the Pareto count: `paretoFileCount(r,
// 0.5)` answers "how many files are half the runtime". Records are sorted
// descending by wallMs internally.
export function paretoFileCount(records, fraction) {
  const list = (Array.isArray(records) ? records : []).slice().sort((a, b) => b.wallMs - a.wallMs);
  const total = list.reduce((s, r) => s + (Number(r.wallMs) || 0), 0);
  if (total <= 0) return 0;
  const target = total * fraction;
  let cum = 0;
  for (let i = 0; i < list.length; i += 1) {
    cum += Number(list[i].wallMs) || 0;
    if (cum >= target) return i + 1;
  }
  return list.length;
}

// Build the timing report model from a record array. Pure data-in/data-out; the
// human string is produced separately by `formatTimingReport`.
export function buildTimingReport(
  records,
  {
    topN = 20,
    slowThresholdMs = 2000,
    runnerElapsedMs = null,
    poolElapsedMs = null,
    subprocessPoolElapsedMs = null,
    slowPoolElapsedMs = null,
    serialElapsedMs = null,
  } = {}
) {
  const list = (Array.isArray(records) ? records : []).slice();
  const count = list.length;
  const totalWallMs = list.reduce((s, r) => s + (Number(r.wallMs) || 0), 0);
  const inProcVals = list.map((r) => r.inProcMs).filter((n) => Number.isFinite(n));
  const totalInProcMs = inProcVals.reduce((s, n) => s + n, 0);
  // Spawn/IO overhead is wall minus the in-process test time we could measure.
  const spawnOverheadMs = Math.max(0, totalWallMs - totalInProcMs);

  const sorted = list.slice().sort((a, b) => b.wallMs - a.wallMs);
  const slowest = sorted.slice(0, topN).map((r) => ({
    file: r.file,
    label: r.label,
    wallMs: round(r.wallMs),
    inProcMs: Number.isFinite(r.inProcMs) ? round(r.inProcMs) : null,
    share: totalWallMs > 0 ? round((r.wallMs / totalWallMs) * 100, 2) : 0,
  }));

  return {
    count,
    totalWallMs: round(totalWallMs),
    totalInProcMs: round(totalInProcMs),
    spawnOverheadMs: round(spawnOverheadMs),
    // Fraction of wall time that is process-spawn / IO rather than assertions.
    spawnOverheadShare: totalWallMs > 0 ? round((spawnOverheadMs / totalWallMs) * 100, 1) : 0,
    elapsed: {
      runnerMs: Number.isFinite(runnerElapsedMs) ? round(runnerElapsedMs) : null,
      poolMs: Number.isFinite(poolElapsedMs) ? round(poolElapsedMs) : null,
      subprocessPoolMs: Number.isFinite(subprocessPoolElapsedMs)
        ? round(subprocessPoolElapsedMs)
        : null,
      slowPoolMs: Number.isFinite(slowPoolElapsedMs) ? round(slowPoolElapsedMs) : null,
      serialMs: Number.isFinite(serialElapsedMs) ? round(serialElapsedMs) : null,
    },
    medianWallMs: round(median(list.map((r) => r.wallMs))),
    medianInProcMs: round(median(inProcVals)),
    inProcMeasured: inProcVals.length,
    topN,
    slowest,
    pareto: {
      p50: paretoFileCount(list, 0.5),
      p80: paretoFileCount(list, 0.8),
    },
    slowBucket: auditSlowBucket(list, slowThresholdMs),
  };
}

// Audit records against the ≥`thresholdMs` rule that populated `tests/slow/`.
// A record is considered a `tests/slow/` member when its label/file sits under
// a `slow/` (or `tests/slow/`) path segment. Returns the counts needed to
// answer "does the slow bucket still reflect reality":
//   overThreshold        — files clearing the rule, whole suite
//   slowBucketFiles       — files currently in the slow bucket
//   slowBucketStillSlow   — slow-bucket files still ≥ threshold (rule holds)
//   slowBucketNowFast     — slow-bucket files now < threshold (demotion candidates)
//   fastLaneOverThreshold — non-bucket files ≥ threshold (promotion candidates)
export function auditSlowBucket(records, thresholdMs = 2000) {
  const list = Array.isArray(records) ? records : [];
  const isBucket = (r) => /(^|\/)slow\//.test(String(r.label || r.file || ''));
  const dur = (r) => (Number.isFinite(r.inProcMs) ? r.inProcMs : Number(r.wallMs) || 0);
  const slowBucket = list.filter(isBucket);
  const nonBucket = list.filter((r) => !isBucket(r));
  const stillSlow = slowBucket.filter((r) => dur(r) >= thresholdMs);
  const nowFast = slowBucket.filter((r) => dur(r) < thresholdMs);
  const fastLaneOver = nonBucket.filter((r) => dur(r) >= thresholdMs);
  return {
    thresholdMs,
    overThreshold: list.filter((r) => dur(r) >= thresholdMs).length,
    slowBucketFiles: slowBucket.length,
    slowBucketStillSlow: stillSlow.length,
    slowBucketNowFast: nowFast.length,
    fastLaneOverThreshold: fastLaneOver.length,
    // Named candidates so the report is actionable, not just a headline count.
    demotionCandidates: nowFast.map((r) => r.label || r.file),
    promotionCandidates: fastLaneOver.map((r) => r.label || r.file),
  };
}

// Serialize a run's records into the machine-readable artifact object, keyed by
// repo-relative file path so two runs diff cleanly. `meta` carries run-level
// context (lane, timestamp, totals). Pure — the runner writes the JSON.
export function serializeArtifact(records, meta = {}) {
  const list = Array.isArray(records) ? records : [];
  if (!Number.isFinite(Date.parse(meta.generatedAt || ''))) {
    throw new Error('test timing artifact: generatedAt must be an ISO timestamp');
  }
  if (!String(meta.lane || '').trim()) {
    throw new Error('test timing artifact: lane is required');
  }
  if (!String(meta.command || '').trim()) {
    throw new Error('test timing artifact: command is required');
  }
  if (!/^[0-9a-f]{40,64}$/.test(String(meta.commit || ''))) {
    throw new Error('test timing artifact: commit must be a full hexadecimal object id');
  }
  const runnerProfile = meta.runnerProfile;
  if (
    !runnerProfile ||
    !String(runnerProfile.label || '').trim() ||
    !String(runnerProfile.platform || '').trim() ||
    !String(runnerProfile.arch || '').trim() ||
    !String(runnerProfile.nodeVersion || '').trim() ||
    !Number.isInteger(runnerProfile.logicalCpuCount) ||
    runnerProfile.logicalCpuCount <= 0
  ) {
    throw new Error('test timing artifact: runnerProfile is incomplete');
  }
  if (!Array.isArray(meta.discoveryInventory)) {
    throw new Error('test timing artifact: discovery inventory is required');
  }
  const discoveryInventory = [...new Set(meta.discoveryInventory.map(String))].sort();
  if (discoveryInventory.length !== meta.discoveryInventory.length) {
    throw new Error('test timing artifact: discovery inventory contains duplicates');
  }
  const files = {};
  for (const r of list) {
    if (Object.hasOwn(files, r.file)) {
      throw new Error(`test timing artifact: duplicate timing record for ${r.file}`);
    }
    files[r.file] = {
      label: r.label,
      wallMs: round(r.wallMs),
      inProcMs: Number.isFinite(r.inProcMs) ? round(r.inProcMs) : null,
      status: r.status,
    };
  }
  const report = buildTimingReport(list, {
    topN: meta.topN ?? 20,
    slowThresholdMs: meta.slowThresholdMs ?? 2000,
    runnerElapsedMs: meta.runnerElapsedMs,
    poolElapsedMs: meta.poolElapsedMs,
    subprocessPoolElapsedMs: meta.subprocessPoolElapsedMs,
    slowPoolElapsedMs: meta.slowPoolElapsedMs,
    serialElapsedMs: meta.serialElapsedMs,
  });
  const measuredFiles = Object.keys(files).sort();
  if (
    measuredFiles.length !== discoveryInventory.length ||
    measuredFiles.some((file, index) => file !== discoveryInventory[index])
  ) {
    throw new Error('test timing artifact: discovery inventory differs from measured files');
  }
  return {
    schema: 5,
    generatedAt: meta.generatedAt,
    lane: meta.lane,
    command: meta.command,
    commit: meta.commit,
    runnerProfile: { ...runnerProfile },
    discoveryInventory,
    count: list.length,
    elapsed: report.elapsed,
    sums: {
      fileWallMs: report.totalWallMs,
      inProcessMs: report.totalInProcMs,
      estimatedSpawnIoMs: report.spawnOverheadMs,
    },
    pareto: report.pareto,
    slowBucket: report.slowBucket,
    files,
  };
}

// Normalize historical schemas 1/2/3 and current schema 4 for comparison.
// Schema 1's `totals.wallMs` was a sum of per-file wall durations, not actual
// runner elapsed; never fabricate a phase duration from per-file sums.
export function normalizeTimingArtifact(artifact) {
  const value = artifact && typeof artifact === 'object' ? artifact : {};
  if ([2, 3, 4, 5].includes(value.schema)) {
    return {
      ...value,
      sourceSchema: value.schema,
      elapsed: {
        runnerMs: Number.isFinite(value.elapsed?.runnerMs) ? value.elapsed.runnerMs : null,
        poolMs: Number.isFinite(value.elapsed?.poolMs) ? value.elapsed.poolMs : null,
        subprocessPoolMs:
          value.schema >= 3 && Number.isFinite(value.elapsed?.subprocessPoolMs)
            ? value.elapsed.subprocessPoolMs
            : null,
        slowPoolMs:
          value.schema >= 4 && Number.isFinite(value.elapsed?.slowPoolMs)
            ? value.elapsed.slowPoolMs
            : null,
        serialMs: Number.isFinite(value.elapsed?.serialMs) ? value.elapsed.serialMs : null,
      },
      sums: {
        fileWallMs: Number(value.sums?.fileWallMs) || 0,
        inProcessMs: Number(value.sums?.inProcessMs) || 0,
        estimatedSpawnIoMs: Number(value.sums?.estimatedSpawnIoMs) || 0,
      },
    };
  }
  if (value.schema === 1) {
    return {
      ...value,
      sourceSchema: 1,
      elapsed: {
        runnerMs: null,
        poolMs: null,
        subprocessPoolMs: null,
        slowPoolMs: null,
        serialMs: null,
      },
      sums: {
        fileWallMs: Number(value.totals?.wallMs) || 0,
        inProcessMs: Number(value.totals?.inProcMs) || 0,
        estimatedSpawnIoMs: Number(value.totals?.spawnOverheadMs) || 0,
      },
    };
  }
  throw new Error(`unsupported test timing artifact schema: ${String(value.schema)}`);
}

// Render the report model as a readable block. The runner prints this only
// behind `--timing-report` / `AITM_TEST_TIMING=1`; default output stays terse.
export function formatTimingReport(report) {
  if (!report || report.count === 0) return 'timing: no files measured.';
  const lines = [];
  lines.push('── Test timing report ──');
  if (report.elapsed?.runnerMs !== null) {
    lines.push(
      `actual elapsed=${formatDuration(report.elapsed.runnerMs)}  pool=${formatDuration(
        report.elapsed.poolMs
      )}  subprocess=${formatDuration(
        report.elapsed.subprocessPoolMs
      )}  slow=${formatDuration(report.elapsed.slowPoolMs)}  serial=${formatDuration(
        report.elapsed.serialMs
      )}`
    );
  }
  lines.push(
    `files=${report.count}  summed file wall=${formatDuration(
      report.totalWallMs
    )}  summed in-process=${formatDuration(
      report.totalInProcMs
    )}  estimated spawn/IO=${formatDuration(report.spawnOverheadMs)} (${report.spawnOverheadShare}%)`
  );
  lines.push(
    `median wall=${formatDuration(report.medianWallMs)}  median in-process=${formatDuration(
      report.medianInProcMs
    )}  (in-process measured on ${report.inProcMeasured}/${report.count})`
  );
  lines.push(
    `Pareto: ${report.pareto.p50} file(s) = 50% of wall, ${report.pareto.p80} file(s) = 80%`
  );
  const sb = report.slowBucket;
  lines.push(
    `slow bucket (≥${formatDuration(sb.thresholdMs)}): ${sb.slowBucketFiles} file(s), ${sb.slowBucketStillSlow} still slow, ${sb.slowBucketNowFast} now fast; ${sb.fastLaneOverThreshold} non-bucket file(s) over threshold`
  );
  lines.push(`top ${Math.min(report.topN, report.slowest.length)} slowest:`);
  for (const r of report.slowest) {
    const ip = r.inProcMs === null ? 'n/a' : formatDuration(r.inProcMs);
    lines.push(
      `  ${formatDuration(r.wallMs).padStart(7)}  ${String(r.share).padStart(5)}%  wall  ${ip.padStart(7)} in-proc  ${r.label}`
    );
  }
  if (sb.demotionCandidates.length) {
    lines.push(
      `slow-bucket demotion candidates (now <${formatDuration(sb.thresholdMs)}): ${sb.demotionCandidates.join(', ')}`
    );
  }
  if (sb.promotionCandidates.length) {
    lines.push(
      `fast-lane promotion candidates (≥${formatDuration(sb.thresholdMs)}): ${sb.promotionCandidates.join(', ')}`
    );
  }
  return lines.join('\n');
}
