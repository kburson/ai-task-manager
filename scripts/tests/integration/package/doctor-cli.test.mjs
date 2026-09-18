// @story #1693
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runInstall } from '../../../../bin/cli.mjs';
import { diagnoseInstallation } from '../../../package/install-observer.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const aitm = path.join(root, 'bin', 'aitm.mjs');
const scratch = mkdtempSync(path.join(projectScratchDir('test'), 'doctor-cli-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function invoke(cwd, args) {
  return spawnSync(process.execPath, [aitm, 'doctor', ...args], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
}

test('doctor CLI reports a committed install identically without writes or task state', async () => {
  const project = path.join(scratch, 'consumer');
  git(scratch, ['init', project]);
  git(project, ['config', 'user.email', 'doctor@example.test']);
  git(project, ['config', 'user.name', 'Doctor Test']);
  await runInstall(
    {
      targetDir: project,
      args: [],
      selectedNames: ['codex'],
      linkMode: 'stub',
      enableCodexSuperpowers: false,
      globalCodexSuperpowers: false,
    },
    {
      packageRoot: root,
      installMemorySeed: async () => ({ count: 0, files: [] }),
    }
  );
  git(project, ['add', '.']);
  git(project, ['commit', '-m', 'installed AITM bootstrap']);
  const before = git(project, ['status', '--porcelain=v1', '--untracked-files=all']);

  const jsonResult = invoke(project, ['--json']);
  assert.equal(jsonResult.status, 0, jsonResult.stdout + jsonResult.stderr);
  assert.equal(jsonResult.stderr, '');
  const report = JSON.parse(jsonResult.stdout);
  assert.equal(report.schema, 'aitm.doctor/v1');
  assert.equal(report.healthy, true);
  assert.ok(!jsonResult.stdout.includes('activeIssue'));
  assert.ok(!jsonResult.stdout.includes('sessionId'));

  const humanResult = invoke(project, []);
  assert.equal(humanResult.status, 0, humanResult.stdout + humanResult.stderr);
  for (const { id, status } of report.checks) {
    assert.match(humanResult.stdout, new RegExp(`\\[${status.toUpperCase()}\\] ${id}:`));
  }
  assert.equal(git(project, ['status', '--porcelain=v1', '--untracked-files=all']), before);
  assert.match(readFileSync(path.join(project, '.gitignore'), 'utf8'), /ai-task-manager/);

  writeFileSync(path.join(project, '.agents', 'skills', 'task', 'SKILL.md'), 'drifted\n');
  const drift = invoke(project, ['--json']);
  assert.equal(drift.status, 1, drift.stdout + drift.stderr);
  assert.equal(
    JSON.parse(drift.stdout).checks.find(({ id }) => id === 'provider.codex.skill').status,
    'modified'
  );
});

test('doctor CLI reserves exit 2 for usage errors and reports missing Git context as health', () => {
  const nonGit = path.join(scratch, 'not-a-repository');
  mkdirSync(nonGit, { recursive: true });

  const help = invoke(nonGit, ['--help']);
  assert.equal(help.status, 0, help.stdout + help.stderr);
  assert.match(help.stdout, /aitm doctor/);

  const unknown = invoke(nonGit, ['--unknown']);
  assert.equal(unknown.status, 2, unknown.stdout + unknown.stderr);

  const health = invoke(nonGit, ['--json']);
  assert.equal(health.status, 1, health.stdout + health.stderr);
  assert.equal(JSON.parse(health.stdout).healthy, false);
});

test('doctor inspects artifacts declared by a stale manifest rather than mismatched current IDs', async () => {
  const project = path.join(scratch, 'stale-consumer');
  git(scratch, ['init', project]);
  git(project, ['config', 'user.email', 'doctor@example.test']);
  git(project, ['config', 'user.name', 'Doctor Test']);
  await runInstall(
    {
      targetDir: project,
      args: [],
      selectedNames: ['codex'],
      linkMode: 'stub',
      enableCodexSuperpowers: false,
      globalCodexSuperpowers: false,
    },
    {
      packageRoot: root,
      installMemorySeed: async () => ({ count: 0, files: [] }),
    }
  );
  const manifestPath = path.join(project, '.ai-task-manager', 'install-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = manifest.artifacts[0];
  declared.id = 'legacy.declared-artifact';
  manifest.generatedBy.contractDigest = '0'.repeat(64);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  git(project, ['add', '.']);
  git(project, ['commit', '-m', 'stale installed contract']);

  const report = diagnoseInstallation({ cwd: project, packageRoot: root });
  assert.equal(report.checks.find(({ id }) => id === 'manifest.contract').status, 'stale');
  assert.equal(report.checks.find(({ id }) => id === declared.id).status, 'ok');
});

test('doctor refuses an install manifest reached through an escaping parent symlink', () => {
  const project = path.join(scratch, 'manifest-symlink');
  const outside = path.join(scratch, 'manifest-outside');
  git(scratch, ['init', project]);
  mkdirSync(outside, { recursive: true });
  writeFileSync(path.join(outside, 'install-manifest.json'), '{}\n');
  symlinkSync(outside, path.join(project, '.ai-task-manager'));

  const report = diagnoseInstallation({ cwd: project, packageRoot: root });
  const manifest = report.checks.find(({ id }) => id === 'manifest.file');
  assert.equal(manifest.status, 'unsafe');
  assert.match(manifest.details, /outside|symlink|project/i);
});
