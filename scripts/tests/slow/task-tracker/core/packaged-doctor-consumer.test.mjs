// @story #1694
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..');

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function doctor(cwd) {
  return spawnSync('npx', ['--no-install', 'aitm', 'doctor', '--json'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' },
  });
}

test('packed consumer verifies committed bootstrap after npm ci and reports drift read-only', () => {
  const sandbox = mkdtempSync(join(projectScratchDir('test'), 'aitm-doctor-pack-'));
  const packDir = join(sandbox, 'pack');
  const consumerDir = join(sandbox, 'consumer');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  try {
    const rawPackReport = run('npm', ['pack', '--json', '--pack-destination', packDir], ROOT);
    const packReport = parseNpmPackReport(rawPackReport, {
      expectedPackageName: '@kburson/ai-task-manager',
      requireFilename: true,
    });
    const tgz = join(packDir, packReport.filename);
    writeFileSync(
      join(consumerDir, 'package.json'),
      `${JSON.stringify({ name: 'doctor-consumer', private: true }, null, 2)}\n`
    );
    run(
      'npm',
      ['install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', tgz],
      consumerDir
    );

    run('git', ['init'], consumerDir);
    run('git', ['config', 'user.email', 'doctor@example.test'], consumerDir);
    run('git', ['config', 'user.name', 'Doctor Consumer'], consumerDir);
    run(
      join(consumerDir, 'node_modules', '.bin', 'ai-task-manager'),
      ['install', '--agent', 'codex', '--link-mode', 'stub', '--target', consumerDir],
      consumerDir
    );
    run('git', ['add', '.'], consumerDir);
    run('git', ['commit', '-m', 'commit portable AITM integration'], consumerDir);

    const installedPackage = JSON.parse(
      readFileSync(
        join(consumerDir, 'node_modules', '@kburson', 'ai-task-manager', 'package.json'),
        'utf8'
      )
    );
    assert.equal(installedPackage.scripts?.postinstall, undefined);
    assert.equal(installedPackage.scripts?.prepare, undefined);

    rmSync(join(consumerDir, 'node_modules'), { recursive: true, force: true });
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], consumerDir);

    const healthy = doctor(consumerDir);
    assert.equal(healthy.status, 0, healthy.stdout + healthy.stderr);
    const healthyReport = JSON.parse(healthy.stdout);
    assert.equal(healthyReport.schema, 'aitm.doctor/v1');
    assert.equal(healthyReport.healthy, true);

    const manifest = JSON.parse(
      readFileSync(join(consumerDir, '.ai-task-manager', 'install-manifest.json'), 'utf8')
    );
    for (const { id } of manifest.artifacts) {
      assert.ok(
        healthyReport.checks.some((check) => check.id === id),
        `doctor reports ${id}`
      );
    }

    const skillPath = join(consumerDir, '.agents', 'skills', 'task', 'SKILL.md');
    const hooksPath = join(consumerDir, '.codex', 'hooks.json');
    rmSync(skillPath);
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
    hooks.userFixture = { command: 'node user-hook.mjs' };
    writeFileSync(hooksPath, `${JSON.stringify(hooks, null, 2)}\n`);
    const hooksBefore = readFileSync(hooksPath, 'utf8');
    const statusBefore = run(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      consumerDir
    );

    const drift = doctor(consumerDir);
    assert.equal(drift.status, 1, drift.stdout + drift.stderr);
    const driftReport = JSON.parse(drift.stdout);
    assert.equal(driftReport.healthy, false);
    assert.equal(
      driftReport.checks.find(({ id }) => id === 'provider.codex.skill')?.status,
      'missing'
    );
    assert.equal(readFileSync(hooksPath, 'utf8'), hooksBefore);
    assert.equal(existsSync(skillPath), false, 'doctor must not recreate the missing skill');
    assert.equal(
      run('git', ['status', '--porcelain=v1', '--untracked-files=all'], consumerDir),
      statusBefore,
      'doctor must not mutate the drifted consumer'
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
