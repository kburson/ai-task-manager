// @story #1838
// cspell:ignore xychart
const cell = (v) => String(v ?? 'unknown').replace(/[|`<>\r\n]/g, ' ');
function table(headers, rows) {
  return [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...rows.map((row) => '| ' + row.map(cell).join(' | ') + ' |'),
  ].join('\n');
}
function chart(title, buckets, field) {
  if (!buckets.length) return `${title}: no observations.`;
  const shown = buckets.slice(0, 168);
  return [
    '```mermaid',
    'xychart-beta',
    `  title "${title}"`,
    `  x-axis [${shown.map((_, i) => `"${i + 1}"`).join(', ')}]`,
    `  bar [${shown.map((b) => b.counts[field]).join(', ')}]`,
    '```',
    `Bucket indices follow the UTC bucket table (${shown.length}/${buckets.length} shown).`,
  ].join('\n');
}
function series(name, buckets) {
  return [
    `## ${name}`,
    'Only nonempty UTC buckets are shown; absent buckets do not prove collection coverage.',
    chart(`${name} dispatched HTTP attempts`, buckets, 'httpAttempts'),
    chart(`${name} opaque invocations`, buckets, 'opaqueInvocations'),
    chart(`${name} known-point lower bounds`, buckets, 'knownPointSubtotal'),
    table(
      [
        'Local start with offset',
        'UTC start',
        'HTTP sent',
        'HTTP uncertain',
        'HTTP not sent',
        'Opaque',
        'Known-point subtotal',
        'Unknown costs',
        'Incomplete costs',
      ],
      buckets.map((b) => [
        b.label,
        b.startedAt,
        b.counts.httpAttempts,
        b.counts.httpUnknownDispatch,
        b.counts.httpNotSent,
        b.counts.opaqueInvocations,
        b.counts.knownPointSubtotal,
        b.counts.unknownCostObservations,
        b.counts.incompleteCostObservations,
      ])
    ),
  ].join('\n\n');
}
export function renderUsageMarkdown(r) {
  const c = r.totals;
  const sections = [
    '# GraphQL usage report',
    `Common root: ${cell(r.commonRootId)}. Interval: ${r.interval.startedAt} ≤ start < ${r.interval.endedAt}. Display zone: ${cell(r.interval.timeZone)}.`,
    r.interpretation,
    `Fleet: ${r.coverage.fleetCompleteness}. ${r.coverage.fleetFinding}`,
    table(
      [
        'Observations',
        'HTTP dispatched',
        'HTTP uncertain',
        'HTTP not sent',
        'Opaque invocations',
        'Known-point subtotal',
        'Unknown costs',
        'Incomplete costs',
        'Retries',
        'Failures',
      ],
      [
        [
          c.observations,
          c.httpAttempts,
          c.httpUnknownDispatch,
          c.httpNotSent,
          c.opaqueInvocations,
          c.knownPointSubtotal,
          c.unknownCostObservations,
          c.incompleteCostObservations,
          c.retries,
          c.failures,
        ],
      ]
    ),
    '## Decision sufficiency',
    r.comparisons.length
      ? table(
          [
            'Group',
            'Scope',
            'Signal',
            'Status',
            'Observed denominator',
            'Point finding',
            'Coverage limitations',
          ],
          r.comparisons.map((g) => [
            g.id,
            g.scope,
            g.signal,
            g.status,
            g.denominator,
            g.pointFinding,
            g.reasons.join('; '),
          ])
        )
      : 'Preliminary: no predeclared candidate comparison supplied. No total-point ranking is certified.',
    'Baseline qualification (real workflow, enrolled overlap, matched workload): not assessed by this offline report.',
    series('Hourly', r.hourly),
    series('Daily', r.daily),
    '## Rolling 60-minute peaks',
    'Windows use (t − 60 minutes, t] at observation start times; simultaneous starts are counted together.',
    table(
      ['Signal', 'Peak', 'Window end UTC'],
      [
        ['HTTP attempts', r.peaks.httpAttempts.observations, r.peaks.httpAttempts.endedAt],
        [
          'Opaque invocations',
          r.peaks.opaqueInvocations.observations,
          r.peaks.opaqueInvocations.endedAt,
        ],
        [
          'Known-point subtotal (lower bound)',
          r.peaks.knownPoints.knownPointSubtotal,
          r.peaks.knownPoints.endedAt,
        ],
      ]
    ),
  ];
  for (const [name, groups] of Object.entries(r.breakdowns))
    sections.push(
      `## By ${name}`,
      table(
        [
          'Value',
          'HTTP sent',
          'Opaque',
          'Known-point subtotal',
          'Unknown costs',
          'Incomplete costs',
          'Retries',
          'Failures',
        ],
        Object.entries(groups).map(([id, g]) => [
          id,
          g.counts.httpAttempts,
          g.counts.opaqueInvocations,
          g.counts.knownPointSubtotal,
          g.counts.unknownCostObservations,
          g.counts.incompleteCostObservations,
          g.counts.retries,
          g.counts.failures,
        ])
      )
    );
  sections.push(
    '## Operation distributions',
    'Known-cost samples include visible-response-only costs; they do not imply complete observation cost. P95 uses nearest rank; an even-sample median averages the two middle samples.',
    table(
      ['Operation', 'Distribution', 'Samples', 'Mean', 'Median', 'P95'],
      Object.entries(r.breakdowns.operation).flatMap(([op, g]) =>
        Object.entries(g.distributions).map(([name, d]) => [
          op,
          name,
          d.samples,
          d.mean,
          d.median,
          d.p95,
        ])
      )
    ),
    '## Account-budget context',
    'These are response header snapshots of shared account budgets, not AITM-attributed consumption. Unknown scope remains separate. Shim-only transport-unavailable data is unavailable, not zero.',
    table(
      [
        'Endpoint',
        'Scope',
        'Observation time',
        'limit',
        'remaining',
        'used',
        'reset',
        'resource',
        'Unavailable reason / count',
      ],
      r.budgets.flatMap((b) => [
        ...b.samples.map((s) => [
          b.endpointHost,
          b.budgetScopeId,
          s.startedAt,
          s.rateLimit.limit,
          s.rateLimit.remaining,
          s.rateLimit.used,
          s.rateLimit.reset,
          s.rateLimit.resource,
          '—',
        ]),
        ...Object.entries(b.unavailable).map(([reason, count]) => [
          b.endpointHost,
          b.budgetScopeId,
          'unavailable',
          'unavailable',
          'unavailable',
          'unavailable',
          'unavailable',
          'unavailable',
          `${reason}: ${count}`,
        ]),
      ])
    ),
    '## Coverage and read diagnostics',
    table(
      ['Diagnostic', 'Value'],
      Object.entries(r.coverage)
        .filter(([, v]) => v === null || typeof v !== 'object')
        .map(([k, v]) => [k, v])
    ),
    table(
      ['Collector versions', 'Denial classes', 'Storage gaps', 'Collection diagnostics'],
      [
        [
          JSON.stringify(r.coverage.collectorVersions),
          JSON.stringify(r.coverage.denialClasses),
          JSON.stringify(r.coverage.storageGaps),
          JSON.stringify(r.coverage.diagnostics),
        ],
      ]
    ),
    `Usage-file opens: ${r.aggregation.fileOpenCount}; read elapsed milliseconds: ${r.aggregation.elapsedMs}; aggregation milliseconds: ${r.aggregation.computeElapsedMs}. Active or unclean writers are coverage uncertainty, not a measured lost-call count.`,
    table(
      ['Hashed file identity', 'Snapshotted readable bytes', 'Bytes read'],
      r.aggregation.extents.map((e) => [e.fileId, e.readableBytes, e.readBytes])
    )
  );
  for (const g of r.comparisons)
    if (g.ranking.length)
      sections.push(
        `## Declared ranking: ${cell(g.id)}`,
        table(
          [
            'Operation',
            'HTTP attempts',
            'Opaque invocations',
            'Known-point subtotal',
            'Unknown costs',
            'Incomplete costs',
          ],
          g.ranking.map((x) => [
            x.operation,
            x.httpAttempts,
            x.opaqueInvocations,
            x.knownPointSubtotal,
            x.unknownCostObservations,
            x.incompleteCostObservations,
          ])
        )
      );
  return sections.join('\n\n') + '\n';
}
