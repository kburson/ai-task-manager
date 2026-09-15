// @story #1630
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..');

const REQUIRED_FILES = Object.freeze([
  'bin/aitm.mjs',
  'docs/guides/workflow.md',
  'docs/superpowers/specs/2026-09-14-1624-workflow-exceptions-design.md',
  'hooks/commit-trail.sh',
  'hooks/task-tracker.sh',
  'scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs',
  'scripts/task-tracker/lib/runtime-capabilities.mjs',
  'scripts/task-tracker/lib/workflow-policy/catalog.mjs',
  'scripts/task-tracker/lib/workflow-policy/evaluator.mjs',
  'scripts/task-tracker/lib/workflow-policy/exception-record.mjs',
  'scripts/task-tracker/lib/workflow-policy/preflight.mjs',
  'scripts/task-tracker/verbs/workflow-exception.mjs',
  'scripts/task-tracker/verbs/workflow-preflight.mjs',
  'skill/shared/router.md',
  'skill/shared/rules/full-auto.md',
  'skill/shared/rules/state-walk.md',
  'templates/pickup-directive.md',
  'templates/references/status-reporting.md',
]);

test('clean offline packed install exposes the supported workflow-exception package', () => {
  const sourceStatusBefore = execFileSync('git', ['status', '--porcelain=v1'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const sandbox = mkdtempSync(join(projectScratchDir('test'), 'aitm-workflow-policy-pack-'));
  const packDir = join(sandbox, 'pack');
  const consumerDir = join(sandbox, 'consumer');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  try {
    const rawPackReport = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, npm_config_loglevel: 'silent' },
    });
    const packReport = parseNpmPackReport(rawPackReport, {
      expectedPackageName: '@kburson/ai-task-manager',
      requireFilename: true,
    });
    const packedFiles = new Set(packReport.files.map((file) => file.path));
    for (const required of REQUIRED_FILES) {
      assert.ok(packedFiles.has(required), `required packed file missing: ${required}`);
    }

    const tgz = join(packDir, packReport.filename);
    writeFileSync(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'workflow-policy-consumer', private: true, type: 'module' })
    );
    execFileSync(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        tgz,
      ],
      {
        cwd: consumerDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_loglevel: 'silent',
          npm_config_offline: 'true',
        },
      }
    );

    const installedRoot = join(consumerDir, 'node_modules', '@kburson', 'ai-task-manager');
    for (const required of REQUIRED_FILES) {
      assert.ok(
        existsSync(join(installedRoot, required)),
        `required installed file missing: ${required}`
      );
    }

    const consumerModule = join(consumerDir, 'consume.mjs');
    writeFileSync(
      consumerModule,
      `import { assembleCapabilities } from './node_modules/@kburson/ai-task-manager/scripts/task-tracker/lib/runtime-capabilities.mjs';
import { REQUIRED_SCHEMA_VERSIONS } from './node_modules/@kburson/ai-task-manager/scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs';
import { WORKFLOW_EXCEPTION_SCHEMA } from './node_modules/@kburson/ai-task-manager/scripts/task-tracker/lib/workflow-policy/exception-record.mjs';

const policy = assembleCapabilities({}).workflowPolicy;
const evaluation = policy.evaluate({
  repository: 'example/consumer',
  issue: 57,
  scopeIdentity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  now: '2026-09-14T12:00:00.000Z',
  state: 'plan',
  baselineRequirementIds: ['planning.deep-dive'],
  records: [],
  evidence: {},
});
console.log(JSON.stringify({
  capability: policy.capability,
  frozen: Object.isFrozen(policy),
  evaluationSchema: evaluation.schema,
  exceptionSchema: WORKFLOW_EXCEPTION_SCHEMA,
  schemas: REQUIRED_SCHEMA_VERSIONS,
}));
`
    );

    const output = JSON.parse(
      execFileSync(process.execPath, [consumerModule], {
        cwd: consumerDir,
        encoding: 'utf8',
        env: { ...process.env, npm_config_offline: 'true', TT_SKIP_NETWORK: '1' },
      })
    );
    assert.deepEqual(output, {
      capability: 'aitm.workflow-policy/v1',
      frozen: true,
      evaluationSchema: 'aitm.workflow-policy-evaluation/v1',
      exceptionSchema: 'aitm.workflow-exception/v1',
      schemas: [
        'aitm.evidence-record/v2',
        'aitm.workflow-exception/v1',
        'aitm.workflow-policy-evaluation/v1',
        'aitm.workflow-preflight-report/v1',
      ],
    });

    for (const verb of ['workflow-exception', 'workflow-preflight']) {
      const help = execFileSync(
        process.execPath,
        [join(installedRoot, 'bin', 'aitm.mjs'), verb, '--help'],
        {
          cwd: consumerDir,
          encoding: 'utf8',
          env: { ...process.env, npm_config_offline: 'true', TT_SKIP_NETWORK: '1' },
        }
      );
      assert.match(help, new RegExp(`/task ${verb}`));
    }

    assert.match(
      readFileSync(join(installedRoot, 'docs', 'guides', 'workflow.md'), 'utf8'),
      /Only a current, issue-scoped/
    );
    assert.match(
      readFileSync(join(installedRoot, 'skill', 'shared', 'rules', 'full-auto.md'), 'utf8'),
      /provider\.managed-execution: deny/
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  const sourceStatusAfter = execFileSync('git', ['status', '--porcelain=v1'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(sourceStatusAfter, sourceStatusBefore, 'packed smoke changed the source checkout');
});
