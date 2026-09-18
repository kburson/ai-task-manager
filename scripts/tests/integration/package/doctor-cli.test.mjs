// @story #1693
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runInstall } from '../../../../bin/cli.mjs';
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
});
