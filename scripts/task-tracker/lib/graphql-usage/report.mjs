// @story #1838
// Offline: no collection bootstrap, subprocess, transport or GitHub client imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readUsage, validateUsageControl } from './storage.mjs';
import { validateObservation, validateManifest, validateDiagnostic } from './records.mjs';
import {
  counts,
  summarize,
  breakdown,
  buckets,
  rollingPeaks,
  markRetries,
} from './report-statistics.mjs';
import { buildCoverage, validateDeclaration, comparisons } from './report-coverage.mjs';
const iso = (ms) => new Date(ms).toISOString();
function timestamp(value) {
  const n = Date.parse(value);
  if (!Number.isFinite(n) || iso(n) !== value)
    throw new TypeError('report requires canonical UTC timestamps');
  return n;
}
function validatedInput(input) {
  const data = {
    ...input,
    observations: [],
    participants: [],
    diagnostics: [],
    controls: [],
    malformedLineCount: input.malformedLineCount ?? 0,
  };
  for (const [list, validate] of [
    ['observations', validateObservation],
    ['participants', validateManifest],
    ['diagnostics', validateDiagnostic],
    ['controls', validateUsageControl],
  ]) {
    if (!Array.isArray(input[list])) throw new TypeError(`report requires ${list}`);
    for (const row of input[list]) {
      try {
        data[list].push(validate(row));
      } catch {
        data.malformedLineCount++;
      }
    }
  }
  return data;
}
function budgets(rows) {
  const result = new Map();
  for (const r of rows) {
    const key = JSON.stringify([r.endpointHost, r.budgetScopeId]);
    if (!result.has(key))
      result.set(key, {
        endpointHost: r.endpointHost,
        budgetScopeId: r.budgetScopeId,
        samples: [],
        unavailable: Object.create(null),
      });
    const group = result.get(key);
    if (r.rateLimit === null) {
      const why = r.rateLimitUnavailableReason;
      group.unavailable[why] = (group.unavailable[why] ?? 0) + 1;
    } else group.samples.push({ startedAt: r.startedAt, callId: r.callId, rateLimit: r.rateLimit });
  }
  return [...result.values()];
}
export function aggregateUsage(input, opts = {}) {
  const begun = performance.now();
  const data = validatedInput(input);
  if (typeof opts.commonRootId !== 'string' || !opts.commonRootId)
    throw new TypeError('single canonical commonRootId required');
  const commonRootId = opts.commonRootId,
    timeZone = opts.timeZone ?? 'UTC';
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(0));
  const times = [
    ...data.observations.map((r) => Date.parse(r.startedAt)),
    ...data.diagnostics.map((r) => Date.parse(r.occurredAt)),
    ...data.controls.flatMap((r) => [
      Date.parse(r.startedAt ?? r.occurredAt),
      Date.parse(r.endedAt ?? r.occurredAt),
    ]),
  ];
  let minimum = Infinity,
    maximum = -Infinity;
  for (const n of times) {
    minimum = Math.min(minimum, n);
    maximum = Math.max(maximum, n);
  }
  const startedAt =
    opts.startedAt ??
    opts.declaration?.startedAt ??
    iso(times.length ? Math.floor(minimum / 86400000) * 86400000 : 0);
  const endedAt =
    opts.endedAt ??
    opts.declaration?.endedAt ??
    iso(times.length ? (Math.floor(maximum / 86400000) + 1) * 86400000 : 86400000);
  const start = timestamp(startedAt),
    end = timestamp(endedAt);
  if (start >= end) throw new TypeError('report interval must be nonempty');
  const declaration = opts.declaration
    ? validateDeclaration(opts.declaration, { commonRootId, startedAt, endedAt })
    : null;
  const rows = markRetries(
    data.observations
      .filter(
        (r) =>
          r.commonRootId === commonRootId &&
          Date.parse(r.startedAt) >= start &&
          Date.parse(r.startedAt) < end
      )
      .toSorted(
        (a, b) => a.startedAt.localeCompare(b.startedAt) || a.callId.localeCompare(b.callId)
      )
  );
  const coverage = buildCoverage(data, rows, commonRootId, start, end);
  return {
    schema: 'aitm.graphql-usage.report/v1',
    commonRootId,
    interval: { startedAt, endedAt, boundary: '[start, end)', timeZone },
    interpretation:
      'Known-point subtotals are lower bounds unless a declared group passes its complete-cost gate. This report does not qualify a real baseline.',
    totals: counts(rows),
    distributions: summarize(rows).distributions,
    hourly: buckets(rows, 3600000, timeZone),
    daily: buckets(rows, 86400000, timeZone),
    peaks: rollingPeaks(rows),
    breakdowns: Object.fromEntries(
      [
        ['operation', 'operation'],
        ['kind', 'kind'],
        ['stage', 'lifecycleState'],
        ['issue', 'issueNumber'],
        ['worktree', 'worktreeId'],
        ['session', 'sessionId'],
      ].map(([name, key]) => [name, breakdown(rows, key)])
    ),
    activity: breakdown(rows, 'worktreeId'),
    budgets: budgets(rows),
    coverage,
    declaration: declaration
      ? {
          ...declaration,
          sha256:
            'sha256:' + createHash('sha256').update(JSON.stringify(declaration)).digest('hex'),
          authority:
            'operator-supplied declaration; declaration timestamp is not independently authenticated',
        }
      : null,
    comparisons: comparisons(declaration, data, rows, coverage),
    aggregation: {
      fileOpenCount: data.fileOpenCount ?? 0,
      elapsedMs: data.elapsedMs ?? 0,
      computeElapsedMs: performance.now() - begun,
      extents: data.extents ?? [],
    },
  };
}
export async function reportUsage(root, { io = fs, participants = [], ...opts } = {}) {
  const data = await readUsage(root, { io });
  // readUsage checks the supplied root's identity. Hash only its canonical Git-common parent.
  const common = await fs.realpath(path.dirname(path.dirname(root)));
  const commonRootId = 'sha256:' + createHash('sha256').update(common).digest('hex');
  if (opts.commonRootId !== undefined && opts.commonRootId !== commonRootId)
    throw new TypeError('report root identity mismatch');
  if (!Array.isArray(participants)) throw new TypeError('participant manifest must be an array');
  data.participants.push(...participants);
  return aggregateUsage(data, { ...opts, commonRootId });
}
