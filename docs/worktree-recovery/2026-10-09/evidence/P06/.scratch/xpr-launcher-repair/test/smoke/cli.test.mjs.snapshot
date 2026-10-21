import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseNpmPackOutput, runNpm } from '../helpers/npm-command.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('packed CLI installs into a non-Node host and starts a review', (t) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'apr-installed-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const packDir = path.join(fixture, 'pack');
  const host = path.join(fixture, 'host');
  mkdirSync(packDir);
  mkdirSync(host);
  const packed = parseNpmPackOutput(
    runNpm('npm', ['pack', '--json', '--pack-destination', packDir], {
      cwd: root,
      encoding: 'utf8',
    }),
    { expectedPackageName: 'ai-peer-review', requireFilename: true }
  );
  const tarball = path.join(packDir, packed.filename);
  const zeroInstallHelp = runNpm(
    'npx',
    ['--yes', '--package', tarball, 'ai-peer-review', '--help'],
    {
      cwd: host,
      encoding: 'utf8',
    }
  );
  assert.match(zeroInstallHelp, /Commands:/);
  writeFileSync(path.join(host, 'package.json'), '{"private":true}\n');
  runNpm('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: host,
    stdio: 'pipe',
  });
  const help = runNpm('npx', ['--no-install', 'peer-review', '--help'], {
    cwd: host,
    encoding: 'utf8',
  });
  assert.match(help, /Commands:/);

  execFileSync('git', ['init', '-b', 'trunk'], { cwd: host, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: host });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: host });
  mkdirSync(path.join(host, 'docs'));
  writeFileSync(path.join(host, 'docs/spec.md'), '# Specification\n');
  writeFileSync(path.join(host, '.git/info/exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/spec.md'], { cwd: host });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: host, stdio: 'ignore' });
  const started = runNpm(
    'npx',
    [
      '--no-install',
      'peer-review',
      'start',
      'docs/spec.md',
      '--artifact-kind',
      'spec',
      '--reviewer-provider',
      'claude',
      '--reviewer-model',
      'claude-opus-5',
      '--reviewer-effort',
      'medium',
    ],
    {
      cwd: host,
      encoding: 'utf8',
      env: {
        ...process.env,
        CODEX_THREAD_ID: 'installed-smoke-author',
        CODEX_MODEL_ID: 'gpt-test',
        CODEX_MODEL_DISPLAY: 'GPT Test',
      },
    }
  );
  assert.match(started, /Review .*: awaiting-reviewer/);
  assert.match(started, /Next:/);
});
