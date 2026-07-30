// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..');

function pack(packDir, extraArgs = []) {
  const report = JSON.parse(
    execFileSync(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', packDir, ...extraArgs],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, npm_config_loglevel: 'silent' },
      }
    )
  )[0];
  return {
    tarball: join(packDir, report.filename),
    files: new Set((report.files ?? []).map((file) => file.path)),
  };
}

test('packed root and ledger install and initialize without workspace links', () => {
  const sandbox = mkdtempSync(join(projectScratchDir('test'), 'aitm-ledger-pack-'));
  const packDir = join(sandbox, 'pack');
  const consumer = join(sandbox, 'consumer');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumer, { recursive: true });

  try {
    const ledger = pack(packDir, ['--workspace', '@kburson/aitm-ledger']);
    const root = pack(packDir);

    for (const required of [
      'package.json',
      'src/index.mjs',
      'src/lease/errors.mjs',
      'src/lease/port.mjs',
      'src/lease/schema.mjs',
    ]) {
      assert.ok(ledger.files.has(required), `ledger tarball is missing ${required}`);
    }
    assert.equal(
      [...ledger.files].some((path) => /(^|\/)tests?\//.test(path) || path.endsWith('.test.mjs')),
      false,
      'ledger tarball must exclude tests'
    );
    for (const required of [
      'package.json',
      'bin/cli.mjs',
      'bin/lib/stamp-skill-version.mjs',
      'scripts/task-tracker/lib/write-if-changed.mjs',
    ]) {
      assert.ok(root.files.has(required), `root tarball is missing ${required}`);
    }
    assert.equal(
      [...root.files].some((path) => /(^|\/)tests?\//.test(path) || path.endsWith('.test.mjs')),
      false,
      'root tarball must exclude tests'
    );

    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'aitm-ledger-consumer', private: true, type: 'module' }) + '\n',
      'utf8'
    );
    writeFileSync(join(consumer, '.gitignore'), 'nested/.db/\n', 'utf8');
    execFileSync(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', ledger.tarball, root.tarball],
      {
        cwd: consumer,
        encoding: 'utf8',
        env: { ...process.env, npm_config_loglevel: 'silent' },
      }
    );

    const installedRoot = join(consumer, 'node_modules', '@kburson', 'ai-task-manager');
    const installedLedger = join(consumer, 'node_modules', '@kburson', 'aitm-ledger');
    assert.ok(existsSync(installedRoot));
    assert.ok(existsSync(installedLedger));
    assert.equal(lstatSync(installedRoot).isSymbolicLink(), false);
    assert.equal(lstatSync(installedLedger).isSymbolicLink(), false);

    const cliOutput = execFileSync(
      process.execPath,
      [join(installedRoot, 'bin', 'cli.mjs'), '--version'],
      { cwd: consumer, encoding: 'utf8' }
    );
    assert.match(cliOutput, /ai-task-manager v1\.0\.0/);
    const ledgerOutput = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "import { LEDGER_PACKAGE_NAME } from '@kburson/aitm-ledger'; console.log(LEDGER_PACKAGE_NAME);",
      ],
      { cwd: consumer, encoding: 'utf8' }
    );
    assert.equal(ledgerOutput, '@kburson/aitm-ledger\n');

    for (let run = 0; run < 2; run += 1) {
      execFileSync(
        process.execPath,
        [join(installedRoot, 'bin', 'cli.mjs'), 'install', '--target', consumer],
        { cwd: consumer, encoding: 'utf8' }
      );
    }
    const ignoreLines = readFileSync(join(consumer, '.gitignore'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim());
    assert.equal(ignoreLines.filter((line) => line === '/.db/').length, 1);
    assert.ok(ignoreLines.includes('nested/.db/'), 'installer must preserve a similar nested rule');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
