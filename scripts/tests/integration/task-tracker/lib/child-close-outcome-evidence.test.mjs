// @story #1129
// @story #1160

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import * as outcomeRuntime from '../../../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { buildEstimationOutcome } from '../../../../task-tracker/lib/estimation/outcome-builder.mjs';
import { ensureEstimationOutcome } from '../../../../task-tracker/lib/estimation/outcome-writer.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { readEstimationStageTiming } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import * as outcomeRepair from '../../../../maintenance/repair-child-outcome-records.mjs';

function git(repo, ...args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'aitm-test',
      GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
      GIT_COMMITTER_NAME: 'aitm-test',
      GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
    },
  }).trim();
}

function commitFile(repo, file, contents, subject) {
  const target = path.join(repo, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
  git(repo, 'add', '-f', file);
  git(repo, 'commit', '-q', '--no-verify', '-m', subject);
  return git(repo, 'rev-parse', 'HEAD');
}

test('issue-attributed diff excludes epic, similarly numbered, and later sibling commits', async (t) => {
  const repo = mkdtempProjectIsolated('child-outcome-evidence-');
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  commitFile(repo, 'docs/epic.md', 'epic\n', '[#1122] epic baseline');
  commitFile(repo, 'src/nearby.mjs', 'nearby\n', '[#112] similarly numbered issue');
  commitFile(repo, 'scripts/task-tracker/one.mjs', 'one\n', '[#1129] first change');
  const finalIssueSha = commitFile(
    repo,
    'scripts/tests/unit/task-tracker/two.test.mjs',
    'two\n',
    '[#1129] second change'
  );
  const verificationSha = commitFile(repo, 'docs/later.md', 'later\n', '[#1130] later sibling');

  const evidence = await outcomeRuntime.issueAttributedDiffEvidence({
    projectDir: repo,
    issueNumber: 1129,
  });

  assert.deepEqual(evidence, {
    commitSha: finalIssueSha,
    verificationSha,
    filesChanged: 2,
    modules: ['scripts/task-tracker', 'scripts/tests'],
    lanes: ['unit', 'sandbox'],
    dependencyBreadth: 1,
  });
});

test('estimation timing freezes at the first terminal issue wrap', () => {
  const rows = [
    '| 2026-08-06 00:11:08 -05:00 | plan:completed | | | | | | <!-- row-sec: a=258 i=0 -->',
    '| 2026-08-06 00:55:45 -05:00 | develop:completed | | | | | | <!-- row-sec: a=2677 i=0 -->',
    '| 2026-08-06 00:56:41 -05:00 | test:passed | | | | | | <!-- row-sec: a=56 i=0 -->',
    '| 2026-08-06 07:50:44 -05:00 | review:approved | | | | | | <!-- row-sec: a=27 i=0 -->',
    '| 2026-08-06 07:50:44 -05:00 | issue:wrap | | | | | | <!-- row-sec: a=0 i=0 -->',
    '| 2026-08-06 07:52:18 -05:00 | review:approved | | | | | | <!-- row-sec: a=8 i=0 -->',
    '| 2026-08-06 07:52:18 -05:00 | issue:wrap | | | | | | <!-- row-sec: a=0 i=0 -->',
  ];

  assert.deepEqual(readEstimationStageTiming(rows), {
    stagesMs: { plan: 258_000, develop: 2_677_000, test: 56_000, review: 27_000 },
    engagedMs: 3_018_000,
  });
});

test('close accepts the persisted exact-SHA Test receipt after its worktree is removed', () => {
  const commitSha = 'a'.repeat(40);
  const receipt = {
    schema: 'aitm.verification-receipt/v1',
    receiptId: '01J00000000000000000011299',
    issue: 1129,
    stage: 'test',
    commitSha,
    verificationCommands: [],
    startedAt: '2026-08-06T01:00:00.000Z',
    completedAt: '2026-08-06T01:05:00.000Z',
    environment: {
      node: 'v22.0.0',
      platform: 'darwin-arm64',
      lockfileHash: `sha256:${'b'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'c'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity: '/removed/1129', clean: true },
    },
    commands: [
      ['lint-full', ['run', 'lint']],
      ['format-full', ['run', 'format:check']],
      ['test-unit', ['run', 'test:unit']],
      ['test-integration', ['run', 'test:integration']],
      ['test-slow', ['run', 'test:slow']],
    ].map(([classification, args]) => ({
      classification,
      command: 'npm',
      args,
      exitCode: 0,
      durationMs: 1_000,
    })),
    supersedes: null,
  };
  const body = `<!-- aitm-verification-receipt stage="test" data="${Buffer.from(
    JSON.stringify(receipt)
  ).toString('base64url')}" -->`;

  assert.doesNotThrow(() =>
    outcomeRuntime.verificationEvidence(body, {
      expectedIssue: 1129,
      expectedFinalSha: commitSha,
    })
  );
});

test('outcome writer resolves the active leaf of a linear immutable correction chain', async () => {
  const forecast = { recordId: '01J00000000000000000011290', payload: { issue: 1129 } };
  const expected = {
    schema: 'aitm.estimation-outcome/v1',
    kind: 'story',
    issue: 1129,
    forecastRecordId: forecast.recordId,
    landscape: { filesChanged: 2 },
  };
  const priorId = '01J00000000000000000011291';
  const correctedId = '01J00000000000000000011292';
  const records = [
    {
      commentNodeId: 'IC_prior',
      envelope: {
        recordId: priorId,
        recordType: 'estimation-outcome',
        issue: 1129,
        supersedes: null,
        payload: { ...expected, landscape: { filesChanged: 46 } },
      },
    },
    {
      commentNodeId: 'IC_corrected',
      envelope: {
        recordId: correctedId,
        recordType: 'estimation-outcome',
        issue: 1129,
        supersedes: priorId,
        payload: expected,
      },
    },
  ];

  const result = await ensureEstimationOutcome({
    issue: 1129,
    forecast,
    outcomePayload: expected,
    deps: { listOutcomeRecords: async () => records },
  });

  assert.deepEqual(result, {
    status: 'existing',
    recordId: correctedId,
    commentNodeId: 'IC_corrected',
  });
});

test('outcome writer fails closed on forked and dangling correction chains', async () => {
  const forecast = { recordId: '01J00000000000000000011290', payload: { issue: 1129 } };
  const payload = {
    schema: 'aitm.estimation-outcome/v1',
    kind: 'story',
    issue: 1129,
    forecastRecordId: forecast.recordId,
    landscape: { filesChanged: 2 },
  };
  const priorId = '01J00000000000000000011291';
  const record = (recordId, supersedes) => ({
    envelope: {
      recordId,
      recordType: 'estimation-outcome',
      issue: 1129,
      supersedes,
      payload,
    },
  });
  const cases = [
    [
      record(priorId, null),
      record('01J00000000000000000011292', priorId),
      record('01J00000000000000000011293', priorId),
    ],
    [record('01J00000000000000000011294', '01J00000000000000000011295')],
  ];

  for (const records of cases) {
    await assert.rejects(
      ensureEstimationOutcome({
        issue: 1129,
        forecast,
        outcomePayload: payload,
        deps: { listOutcomeRecords: async () => records },
      }),
      /estimation-outcome-writer:duplicate/
    );
  }
});

test('estimation samples exclude superseded outcomes from the learning cohort', () => {
  const forecastId = '01J00000000000000000011280';
  const priorId = '01J00000000000000000011281';
  const correctedId = '01J00000000000000000011282';
  const records = [
    {
      envelope: {
        recordId: forecastId,
        recordType: 'estimation-forecast',
        issue: 1129,
        createdAt: '2026-08-06T00:00:00.000Z',
        payload: { issue: 1129 },
      },
    },
    {
      envelope: {
        recordId: priorId,
        recordType: 'estimation-outcome',
        issue: 1129,
        createdAt: '2026-08-06T01:00:00.000Z',
        supersedes: null,
        payload: {
          kind: 'story',
          issue: 1129,
          forecastRecordId: forecastId,
          landscape: { filesChanged: 46 },
        },
      },
    },
    {
      envelope: {
        recordId: correctedId,
        recordType: 'estimation-outcome',
        issue: 1129,
        createdAt: '2026-08-06T02:00:00.000Z',
        supersedes: priorId,
        payload: {
          kind: 'story',
          issue: 1129,
          forecastRecordId: forecastId,
          landscape: { filesChanged: 2 },
        },
      },
    },
  ];

  const samples = outcomeRuntime.estimationOutcomeSamples(records);

  assert.equal(samples.length, 1);
  assert.equal(samples[0].recordId, correctedId);
  assert.equal(samples[0].payload.landscape.filesChanged, 2);
});

test('outcome repair changes only issue-scoped landscape evidence', () => {
  const original = {
    schema: 'aitm.estimation-outcome/v1',
    issue: 1127,
    kind: 'story',
    actual: { engagedHours: 0.8384 },
    landscape: {
      filesChanged: 46,
      modules: ['docs/superpowers', 'scripts/task-tracker'],
      lanes: ['unit', 'integration', 'sandbox'],
      dependencyBreadth: 2,
      childOutcomeRecordIds: [],
    },
    variance: { vsAiP50Hours: -2.1616 },
  };
  const corrected = outcomeRepair.buildCorrectedOutcomePayload({
    payload: original,
    diff: {
      filesChanged: 3,
      modules: ['scripts/task-tracker'],
      lanes: ['unit', 'sandbox'],
      dependencyBreadth: 1,
    },
  });

  assert.deepEqual(corrected, {
    ...original,
    landscape: {
      filesChanged: 3,
      modules: ['scripts/task-tracker'],
      lanes: ['unit', 'sandbox'],
      dependencyBreadth: 1,
      childOutcomeRecordIds: [],
    },
  });
  assert.equal(original.landscape.filesChanged, 46);
});

test('outcome repair appends a validated immutable correction linked to the active record', async () => {
  const issue = 1127;
  const priorId = '01J00000000000000000011271';
  const correctedId = '01J00000000000000000011272';
  const forecast = {
    recordId: '01J00000000000000000011270',
    payload: {
      issue,
      plan: { humanHours: 3.5 },
      ai: { p50EngagedHours: 3, p80EngagedHours: 3 },
    },
  };
  const priorPayload = buildEstimationOutcome({
    issue,
    forecast,
    timing: {
      stagesMs: { plan: 258_000, develop: 2_677_000, test: 56_000, review: 27_000 },
    },
    verification: [],
    diff: {
      filesChanged: 46,
      modules: ['docs/superpowers', 'scripts/task-tracker'],
      lanes: ['unit', 'integration', 'sandbox'],
      dependencyBreadth: 2,
    },
    review: { fixCycles: 2 },
  });
  const records = [
    {
      commentNodeId: 'IC_prior',
      envelope: {
        recordId: priorId,
        recordType: 'estimation-outcome',
        issue,
        supersedes: null,
        payload: priorPayload,
      },
    },
  ];
  const writes = [];

  const result = await outcomeRepair.repairChildOutcomeRecords({
    issueNumbers: [issue],
    mode: 'apply',
    projectDir: '/repo',
    deps: {
      listIssueRecords: async () => records,
      readDiffEvidence: async () => ({
        commitSha: 'a'.repeat(40),
        filesChanged: 3,
        modules: ['scripts/task-tracker'],
        lanes: ['unit', 'sandbox'],
        dependencyBreadth: 1,
      }),
      createEnvelope: ({ payload, supersedes }) => ({
        recordId: correctedId,
        recordType: 'estimation-outcome',
        issue,
        supersedes,
        payload,
      }),
      writeOutcome: async ({ envelope }) => {
        writes.push(envelope);
        return { commentNodeId: 'IC_corrected', envelope };
      },
    },
  });

  assert.deepEqual(result, [
    { issue, status: 'repaired', recordId: correctedId, supersedes: priorId },
  ]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].supersedes, priorId);
  assert.deepEqual(writes[0].payload.landscape, {
    filesChanged: 3,
    modules: ['scripts/task-tracker'],
    lanes: ['unit', 'sandbox'],
    dependencyBreadth: 1,
    childOutcomeRecordIds: [],
  });
});
