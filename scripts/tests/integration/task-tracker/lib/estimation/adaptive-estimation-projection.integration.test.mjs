// @story #1091
import { createAdaptivePlanRuntime } from '../../../../../task-tracker/lib/estimation/runtime-adapter.mjs';
test('#1857 comparable ingress excludes all incomplete generations without inventing forecasts', async () => {
  const records = ['v2', 'v3'].flatMap((version, index) =>
    ['code', 'docs-only', 'audit', 'research', 'spike'].map((issueKind, offset) => ({
      envelope: {
        recordType: 'estimation-outcome',
        recordId: 'incomplete-' + version + '-' + issueKind,
        issue: 1857 + index * 10 + offset,
        supersedes: null,
        payload: {
          schema: 'aitm.estimation-outcome/' + version,
          kind: 'story',
          forecastRecordId: null,
          telemetry: { status: 'incomplete', verification: { issueKind } },
          actual: { engagedHours: null },
        },
      },
    }))
  );
  const complete = {
    envelope: {
      recordType: 'estimation-outcome',
      recordId: 'complete',
      issue: 1900,
      supersedes: null,
      payload: {
        schema: 'aitm.estimation-outcome/v1',
        kind: 'story',
        forecastRecordId: 'forecast',
        actual: { engagedHours: 2 },
      },
    },
  };
  records.push(complete);
  // #2063: historical ingress is prohibited; incomplete record semantics remain pure below.
  assert.throws(
    () =>
      createAdaptivePlanRuntime({
        cfg: { repo: repository, projectId: 'PROJECT', estimationRubricIssue: 100 },
        deps: {
          get loadProjectEstimationCorpus() {
            throw Error('prohibited corpus');
          },
        },
      }),
    (error) => error.code === 'estimation-cloud-dispatch-prohibited'
  );
  assert.deepEqual(estimationOutcomeSamples(records.slice(0, -1)), []);
  assert.throws(() => estimationOutcomeSamples(records), /rubric-outcome-forecast/);
});
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimationOutcomeSamples,
  loadProjectEstimationCorpus,
  refineEstimateFromProjection,
} from '../../../../../task-tracker/lib/estimation/runtime-adapter.mjs';

const repository = 'kburson/ai-task-manager';

test('process retry preserves the immutable Refine baseline after partial Plan writes', () => {
  assert.deepEqual(
    refineEstimateFromProjection({
      refineAppendix: {
        refine: { size: 'L', humanHours: 20 },
        plan: { size: 'XL', humanHours: 40 },
      },
      board: { size: 'XL', estimate: 40 },
    }),
    { size: 'L', humanHours: 20 }
  );
});

test('rubric corpus pairs each story outcome with its exact frozen forecast', () => {
  const forecastPayload = {
    issue: 1091,
    refine: { humanHours: 8 },
    plan: { humanHours: 10 },
  };
  const forecastRecordId = '01J00000000000000000000601';
  const records = [
    {
      envelope: {
        recordType: 'estimation-forecast',
        recordId: forecastRecordId,
        issue: 1091,
        payload: forecastPayload,
      },
    },
    {
      envelope: {
        recordType: 'estimation-outcome',
        recordId: '01J00000000000000000000602',
        createdAt: '2026-08-02T15:00:00.000Z',
        issue: 1091,
        payload: { kind: 'story', forecastRecordId },
      },
    },
  ];

  const [sample] = estimationOutcomeSamples(records);
  assert.strictEqual(sample.forecastPayload, forecastPayload);
  assert.equal(sample.payload.forecastRecordId, forecastRecordId);
  assert.throws(
    () => estimationOutcomeSamples(records.slice(1)),
    /estimation-runtime:rubric-outcome-forecast/
  );
});

// #2063: cloud pagination is no longer an estimation capability. No page may dispatch,
// even when a caller offers a complete-looking or malformed historical response.
for (const estimationRubricIssue of [0, 100, -1]) {
  test(`project corpus refuses rubric ${estimationRubricIssue} before any page or record loader`, async () => {
    let calls = 0;
    const transport = () => {
      calls++;
      throw Error('prohibited historical transport');
    };
    await assert.rejects(
      loadProjectEstimationCorpus({
        cfg: { repo: repository, projectId: 'PROJECT', estimationRubricIssue },
        graphql: transport,
        io: { listIssueRecords: transport },
      }),
      (error) => error.code === 'estimation-cloud-dispatch-prohibited'
    );
    assert.equal(calls, 0);
  });
}

// @story #1857
test('incomplete legacy-none outcomes never demand a missing forecast for calibration', () => {
  for (const issueKind of ['code', 'research', 'audit', 'spike']) {
    const records = [
      {
        envelope: {
          recordType: 'estimation-outcome',
          recordId: '01J00000000000000000000602',
          issue: 1857,
          payload: {
            schema: 'aitm.estimation-outcome/v3',
            kind: 'story',
            forecastRecordId: null,
            telemetry: {
              status: 'incomplete',
              forecastStatus: 'legacy-none',
              verification: { issueKind },
            },
            actual: { engagedHours: null },
          },
        },
      },
    ];
    assert.deepEqual(estimationOutcomeSamples(records), []);
  }
});

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runHook } from '../../../../../task-tracker/source-edit-gate.mjs';
import { mkdtempProjectIsolated } from '../../../../../task-tracker/lib/scratch-dir.mjs';
const cfg = { repo: 'test/repo', projectId: 'PVT_test', estimationRubricIssue: 0 };
test('hook estimator requests stop before decomposition, but quoted mentions are ordinary commands', async () => {
  const dir = mkdtempProjectIsolated('local-dispatch-');
  try {
    mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
    writeFileSync(path.join(dir, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
    for (const command of [
      'npx aitm plan-estimate 2063 --evidence-file input.json',
      'node bin/aitm.mjs plan-estimate 2063 --evidence-file input.json',
      'npx aitm plan-estimate 2063 --compatibility-mode --evidence-file input.json',
    ]) {
      const payload = { tool_name: 'Bash', cwd: dir, tool_input: { command } };
      const source = await runHook(payload, { projectDir: dir, cfg });
      assert.equal(source.code, 'estimation-dispatch-stopped');
      const activity = JSON.parse(
        execFileSync(process.execPath, [path.resolve('scripts/task-tracker/activity-guard.mjs')], {
          cwd: dir,
          input: JSON.stringify(payload),
          encoding: 'utf8',
        })
      );
      assert.equal(activity.code, 'estimation-dispatch-stopped');
    }
    const mention = await runHook(
      {
        tool_name: 'Bash',
        cwd: dir,
        tool_input: { command: 'printf "%s" "npx aitm plan-estimate 2063"' },
      },
      { projectDir: dir, cfg }
    );
    assert.equal(mention.reason, 'tool-not-gated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// #2063: both real public routing paths must stop before reading evidence or gh.
import { spawnSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';
test('direct and packaged CLI report typed estimation stops while preserving the target lifecycle read', () => {
  const dir = mkdtempProjectIsolated('local-dispatch-cli-');
  try {
    mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
    writeFileSync(path.join(dir, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
    const bin = path.join(dir, 'bin');
    mkdirSync(bin);
    const marker = path.join(dir, 'transport-called');
    const gh = path.join(bin, 'gh');
    writeFileSync(
      gh,
      '#!/usr/bin/env node\nconst a=process.argv.slice(2); if(JSON.stringify(a)===JSON.stringify(["issue","view","2063","-R","test/repo","--json","body","--jq",".body"])) {process.stdout.write("## Scope\\nTarget lifecycle observation only.\\n");process.exit(0);} require("fs").writeFileSync(' +
        JSON.stringify(marker) +
        ', JSON.stringify(a)); process.exit(91);\n'
    );
    chmodSync(gh, 0o700);
    for (const [estimationRubricIssue, diagnostic] of [
      [0, /Estimation disabled: rubric-disabled/],
      [12, /Estimation unavailable: retained-local-input-required/],
      [-1, /Estimation unavailable: rubric-invalid/],
    ]) {
      writeFileSync(
        path.join(dir, '.ai-task-manager/task-tracker.json'),
        JSON.stringify({ ...cfg, estimationRubricIssue })
      );
      for (const entry of ['scripts/task-tracker/task-tracker.mjs', 'bin/aitm.mjs']) {
        const result = spawnSync(
          process.execPath,
          [path.resolve(entry), 'plan-estimate', '2063', '--evidence-file', 'does-not-exist.json'],
          {
            cwd: dir,
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: bin + path.delimiter + process.env.PATH,
              AITM_CAPTURE_REAL_GH: gh,
            },
          }
        );
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, diagnostic, result.stderr);
        assert.equal(existsSync(marker), false);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
