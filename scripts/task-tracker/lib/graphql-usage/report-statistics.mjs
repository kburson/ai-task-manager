// @story #1838
const HOUR = 3_600_000;
export function distribution(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const n = sorted.length;
  return {
    samples: n,
    mean: n ? sorted.reduce((a, b) => a + b, 0) / n : null,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    p95: n ? sorted[Math.ceil(n * 0.95) - 1] : null,
  };
}
export function counts(rows) {
  const result = {
    observations: rows.length,
    httpAttempts: 0,
    httpUnknownDispatch: 0,
    httpNotSent: 0,
    opaqueInvocations: 0,
    knownPointSubtotal: 0,
    knownCostObservations: 0,
    unknownCostObservations: 0,
    incompleteCostObservations: 0,
    failures: 0,
    retries: 0,
  };
  const attempts = new Map();
  for (const r of rows) {
    if (r.observationKind === 'opaque-cli-invocation') result.opaqueInvocations++;
    else {
      result[
        { sent: 'httpAttempts', unknown: 'httpUnknownDispatch', 'not-sent': 'httpNotSent' }[
          r.dispatchStatus
        ]
      ]++;
      if (r.dispatchStatus !== 'not-sent' && r.logicalOperationId !== null) {
        const key = JSON.stringify([
          r.commonRootId,
          r.worktreeId,
          r.sessionId,
          r.logicalOperationId,
          r.pageIndex,
        ]);
        if (r.reportRetry ?? attempts.has(key)) result.retries++;
        attempts.set(key, true);
      }
    }
    if (r.pointCost === null) result.unknownCostObservations++;
    else {
      result.knownCostObservations++;
      result.knownPointSubtotal += r.pointCost;
    }
    if (r.costCoverage !== 'complete-observation') result.incompleteCostObservations++;
    if (r.outcome === 'failure') result.failures++;
  }
  return result;
}
export function summarize(rows) {
  return {
    counts: counts(rows),
    distributions: {
      pointCost: distribution(rows.filter((r) => r.pointCost !== null).map((r) => r.pointCost)),
      httpLatencyMs: distribution(
        rows.filter((r) => r.observationKind === 'http-attempt').map((r) => r.durationMs)
      ),
      cliLatencyMs: distribution(
        rows.filter((r) => r.observationKind === 'opaque-cli-invocation').map((r) => r.durationMs)
      ),
    },
  };
}
export function breakdown(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const id = String(row[key] ?? 'unknown');
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return Object.fromEntries(
    [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, group]) => [id, summarize(group)])
  );
}
export function localLabel(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(timestamp));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const offset = p.timeZoneName === 'GMT' ? '+00:00' : p.timeZoneName.replace('GMT', '');
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${offset}`;
}
export function buckets(rows, width, timeZone) {
  const groups = new Map();
  for (const row of rows) {
    const start = Math.floor(Date.parse(row.startedAt) / width) * width;
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(row);
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([start, group]) => ({
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(start + width).toISOString(),
      label: localLabel(start, timeZone),
      counts: counts(group),
    }));
}
export function rollingPeaks(rows) {
  const sorted = rows.toSorted((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  let left = 0,
    right = 0,
    http = 0,
    opaque = 0,
    points = 0;
  const peaks = {
    httpAttempts: { observations: 0, endedAt: null },
    opaqueInvocations: { observations: 0, endedAt: null },
    knownPoints: { knownPointSubtotal: 0, endedAt: null },
  };
  const apply = (r, sign) => {
    if (r.observationKind === 'http-attempt' && r.dispatchStatus === 'sent') http += sign;
    else if (r.observationKind === 'opaque-cli-invocation') opaque += sign;
    points += sign * (r.pointCost ?? 0);
  };
  while (right < sorted.length) {
    const time = Date.parse(sorted[right].startedAt);
    while (left < right && Date.parse(sorted[left].startedAt) <= time - HOUR)
      apply(sorted[left++], -1);
    while (right < sorted.length && Date.parse(sorted[right].startedAt) === time)
      apply(sorted[right++], 1);
    for (const [key, value, field] of [
      ['httpAttempts', http, 'observations'],
      ['opaqueInvocations', opaque, 'observations'],
      ['knownPoints', points, 'knownPointSubtotal'],
    ])
      if (value > peaks[key][field])
        peaks[key] = { [field]: value, endedAt: new Date(time).toISOString() };
  }
  return peaks;
}

export function markRetries(rows) {
  const seen = new Set();
  return rows.map((r) => {
    const key = JSON.stringify([
      r.commonRootId,
      r.worktreeId,
      r.sessionId,
      r.logicalOperationId,
      r.pageIndex,
    ]);
    const eligible =
      r.observationKind === 'http-attempt' &&
      r.dispatchStatus !== 'not-sent' &&
      r.logicalOperationId !== null;
    const reportRetry = eligible && seen.has(key);
    if (eligible) seen.add(key);
    return { ...r, reportRetry };
  });
}
