// @story #1839
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { aggregateUsage } from '../../../task-tracker/lib/graphql-usage/report.mjs';
import { qualifyBaseline } from '../../../task-tracker/lib/graphql-usage/baseline.mjs';
import {
  row,
  input,
  participant,
  declaration,
} from '../../helpers/graphql-usage/report-fixture.mjs';
const start = '2026-10-05T00:00:00.000Z',
  end = '2026-10-05T01:00:00.000Z';
const sessionA = 'sha256:' + 'a'.repeat(64),
  sessionB = 'sha256:' + 'b'.repeat(64);
const pair = (tree, session) => ({ worktreeId: tree, sessionId: session });
function fixture({ points = false } = {}) {
  const participants = [
    participant({ recordedAt: '2026-10-04T23:59:00.000Z' }),
    participant({
      worktreeId: 'tree-b',
      sessionId: sessionB,
      enrollmentId: 'enrollment-b',
      recordedAt: '2026-10-04T23:59:00.000Z',
    }),
  ];
  const observations = [
    row('a', '2026-10-05T00:01:00.000Z', {
      pointCost: points ? 1 : null,
      costSource: points ? 'same-response-rate-limit' : null,
      costUnknownReason: points ? null : 'no-same-response-cost',
      costCoverage: points ? 'complete-observation' : 'unknown',
    }),
    row('b', '2026-10-05T00:02:00.000Z', {
      worktreeId: 'tree-b',
      sessionId: sessionB,
      enrollmentId: 'enrollment-b',
      pointCost: points ? 1 : null,
      costSource: points ? 'same-response-rate-limit' : null,
      costUnknownReason: points ? null : 'no-same-response-cost',
      costCoverage: points ? 'complete-observation' : 'unknown',
    }),
  ];
  const d = declaration({
    declaredAt: '2026-10-04T23:59:30.000Z',
    startedAt: start,
    endedAt: end,
    participants: [pair('tree-a', sessionA), pair('tree-b', sessionB)],
    groups: [
      {
        id: 'reads',
        operations: ['GetIssue'],
        sites: ['scripts/gh/lib/github-projects.mjs:12'],
        observationKind: 'http-attempt',
        signal: points ? 'point-cost' : 'http-attempt-volume',
      },
    ],
  });
  const data = input(observations, { participants });
  const report = aggregateUsage(data, {
    commonRootId: 'root-a',
    startedAt: start,
    endedAt: end,
    declaration: d,
  });
  const run = {
    schema: 'aitm.graphql-usage.baseline-run/v1',
    workloadKind: 'controlled',
    declaredAt: d.declaredAt,
    startedAt: start,
    endedAt: end,
    commonRootId: 'root-a',
    declarationSha256: report.declaration.sha256,
    collectorVersion: 'v1',
    recipeId: 'create-refine-plan-v1',
    configurationId: 'fixture-config-v1',
    participants: participants.map((p) => ({
      ...pair(p.worktreeId, p.sessionId),
      enrollmentId: p.enrollmentId,
      commonRootId: p.commonRootId,
      outcome: p.outcome,
      enrolledAt: p.recordedAt,
      collectorStartedAt: '2026-10-04T23:59:45.000Z',
      collectorEndedAt: '2026-10-05T01:00:01.000Z',
      permitted: true,
    })),
    workflows: participants.map((p, i) => ({
      id: 'workflow-' + i,
      ...pair(p.worktreeId, p.sessionId),
      issueNumber: i + 1,
      startedAt: '2026-10-05T00:00:30.000Z',
      endedAt: '2026-10-05T00:03:00.000Z',
      steps: ['create', 'refine', 'ready-for-plan', 'plan'].map((action) => ({
        action,
        exitCode: 0,
      })),
    })),
  };
  return { report, run, data, d };
}
test('adequate predeclared volume qualifies controlled evidence without asserting point ranking or savings', () => {
  const { report, run } = fixture();
  const q = qualifyBaseline(report, run);
  assert.equal(q.status, 'decision-grade-controlled');
  assert.equal(q.completedWorkflows, 2);
  assert.equal(q.normalized.httpAttemptsPerWorkflow, 1);
  assert.equal(q.normalized.knownPointsPerWorkflow, 0);
  assert.equal(q.pointRankingSupported, false);
  assert.equal(q.pointSavingsSupported, false);
  assert.equal(q.overlapSeconds, 3600);
  assert.equal(q.organicUsageSupported, false);
});
test('complete query costs permit scoped point ranking but never prove optimization savings', () => {
  const { report, run } = fixture({ points: true });
  const q = qualifyBaseline(report, run);
  assert.equal(q.status, 'decision-grade-controlled');
  assert.equal(q.pointRankingSupported, true);
  assert.equal(q.normalized.knownPointsPerWorkflow, 1);
  assert.equal(q.pointSavingsSupported, false);
});
for (const [name, change] of [
  [
    'short declared window',
    ({ run }) => {
      run.endedAt = '2026-10-05T00:59:59.000Z';
    },
  ],
  [
    'short actual overlap',
    ({ run }) => {
      run.participants[1].collectorStartedAt = '2026-10-05T00:00:01.000Z';
    },
  ],
  [
    'single worktree',
    ({ run }) => {
      run.participants.pop();
    },
  ],
  [
    'absent workflow',
    ({ run }) => {
      run.workflows = [];
    },
  ],
  [
    'failed workflow',
    ({ run }) => {
      run.workflows[0].steps[1].exitCode = 1;
      run.workflows[1].steps[1].exitCode = 1;
    },
  ],
  [
    'missing creation step',
    ({ run }) => {
      run.workflows.forEach((w) => w.steps.shift());
    },
  ],
  [
    'reordered stages',
    ({ run }) => {
      run.workflows.forEach((w) => w.steps.reverse());
    },
  ],
  [
    'workflow after window',
    ({ run }) => {
      run.workflows.forEach((w) => (w.endedAt = '2026-10-05T01:00:01.000Z'));
    },
  ],
  [
    'workflow uses unknown session',
    ({ run }) => {
      run.workflows.forEach((w) => (w.sessionId = 'sha256:' + 'f'.repeat(64)));
    },
  ],
  [
    'worktree root mismatch',
    ({ run }) => {
      run.participants[0].commonRootId = 'root-b';
    },
  ],
  [
    'run root mismatch',
    ({ run }) => {
      run.commonRootId = 'root-b';
    },
  ],
  [
    'declaration changed after collection',
    ({ run }) => {
      run.declarationSha256 = 'sha256:' + 'f'.repeat(64);
    },
  ],
  [
    'declaration late',
    ({ run }) => {
      run.declaredAt = '2026-10-05T00:00:01.000Z';
    },
  ],
  [
    'participant enrollment late',
    ({ run }) => {
      run.participants[0].enrolledAt = '2026-10-05T00:00:01.000Z';
    },
  ],
  [
    'denied declared participant',
    ({ run }) => {
      run.participants[0].outcome = 'denied';
    },
  ],
  [
    'unknown declared participant',
    ({ run }) => {
      run.participants[0].outcome = 'unknown';
    },
  ],
  [
    'malformed timestamp',
    ({ run }) => {
      run.startedAt = 'yesterday';
    },
  ],
  [
    'reversed collector interval',
    ({ run }) => {
      run.participants[0].collectorEndedAt = '2026-10-04T23:00:00.000Z';
    },
  ],
  [
    'duplicate participant',
    ({ run }) => {
      run.participants.push(structuredClone(run.participants[0]));
    },
  ],
  [
    'duplicate workflow denominator',
    ({ run }) => {
      run.workflows.push(structuredClone(run.workflows[0]));
    },
  ],
  [
    'collector version mismatch',
    ({ run }) => {
      run.collectorVersion = 'v2';
    },
  ],
  [
    'claim of organic workload',
    ({ run }) => {
      run.workloadKind = 'organic';
    },
  ],
  [
    'invalid report shape',
    ({ report }) => {
      delete report.coverage;
    },
  ],
  [
    'missing comparison declaration',
    ({ report }) => {
      report.declaration = null;
    },
  ],
  [
    'preliminary comparison',
    ({ report }) => {
      report.comparisons[0].status = 'preliminary';
    },
  ],
])
  test(name + ' cannot qualify', () => {
    const f = fixture();
    change(f);
    const q = qualifyBaseline(f.report, f.run);
    assert.equal(q.status, 'preliminary');
    assert.ok(q.findings.length > 0);
  });
test('a collector window without traffic from both worktrees remains preliminary', () => {
  const f = fixture();
  f.report = aggregateUsage(
    { ...f.data, observations: f.data.observations.slice(0, 1) },
    { commonRootId: 'root-a', startedAt: start, endedAt: end, declaration: f.d }
  );
  assert.equal(qualifyBaseline(f.report, f.run).status, 'preliminary');
});
test('denial outside the predeclared sample is disclosed and does not invalidate scoped evidence', () => {
  const f = fixture();
  f.data.participants.push(
    participant({
      worktreeId: 'excluded',
      sessionId: 'sha256:' + 'c'.repeat(64),
      enrollmentId: null,
      outcome: 'denied',
      reasonCode: 'shared-root-access-denied',
    })
  );
  f.report = aggregateUsage(f.data, {
    commonRootId: 'root-a',
    startedAt: start,
    endedAt: end,
    declaration: f.d,
  });
  f.run.participants.push({
    ...pair('excluded', 'sha256:' + 'c'.repeat(64)),
    commonRootId: 'root-a',
    outcome: 'denied',
    permitted: false,
    enrollmentId: null,
    enrolledAt: '2026-10-04T23:59:00.000Z',
    collectorStartedAt: null,
    collectorEndedAt: null,
  });
  const q = qualifyBaseline(f.report, f.run);
  assert.equal(q.status, 'decision-grade-controlled');
  assert.equal(q.excludedParticipants, 1);
  assert.equal(q.organicUsageSupported, false);
});
test('inadequate candidate coverage and collection gaps never pass qualification', () => {
  for (const mutation of [
    (f) => {
      f.d.inventory[0].coverage = 'uncovered';
    },
    (f) => {
      f.data.malformedLineCount = 1;
    },
    (f) => {
      f.data.observations[1].enrollmentId = 'unmatched';
    },
  ]) {
    const f = fixture();
    mutation(f);
    f.report = aggregateUsage(f.data, {
      commonRootId: 'root-a',
      startedAt: start,
      endedAt: end,
      declaration: f.d,
    });
    assert.equal(qualifyBaseline(f.report, f.run).status, 'preliminary');
  }
});
test('offline CLI reads saved evidence, returns preliminary exit status, and needs no Git checkout', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'baseline-1839-'));
  try {
    const f = fixture();
    const rp = path.join(dir, 'report.json'),
      mp = path.join(dir, 'run.json');
    await fs.writeFile(rp, JSON.stringify(f.report));
    await fs.writeFile(mp, JSON.stringify(f.run));
    const cli = path.resolve('scripts/task-tracker/graphql-usage-baseline.mjs');
    const result = await promisify(execFile)(process.execPath, [cli, '--report', rp, '--run', mp], {
      cwd: dir,
      env: { ...process.env, GH_HOST: 'invalid.example', GH_TOKEN: '' },
    });
    assert.equal(JSON.parse(result.stdout).status, 'decision-grade-controlled');
    f.run.workflows = [];
    await fs.writeFile(mp, JSON.stringify(f.run));
    await assert.rejects(
      promisify(execFile)(process.execPath, [cli, '--report', rp, '--run', mp], { cwd: dir }),
      (e) => e.code === 2 && JSON.parse(e.stdout).status === 'preliminary'
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
