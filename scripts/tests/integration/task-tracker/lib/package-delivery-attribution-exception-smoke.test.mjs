// @story #1755
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed (${result.status}):\n${result.stderr}`
  );
  return result.stdout;
}

test('packed delivery exception runtime and guide support installed CLI help', () => {
  const sandbox = mkdtempSync(join(projectScratchDir('test', root), 'delivery-exception-pack-'));
  const consumer = join(sandbox, 'consumer');
  mkdirSync(consumer);
  try {
    const packed = run('npm', ['pack', '--json', '--pack-destination', sandbox], root, {
      ...process.env,
      npm_config_loglevel: 'silent',
    });
    const report = parseNpmPackReport(packed, {
      expectedPackageName: '@kburson/ai-task-manager',
      requireFilename: true,
    });
    const entries = new Set(report.files.map(({ path }) => path));
    for (const required of [
      'scripts/task-tracker/verbs/delivery-attribution-exception.mjs',
      'scripts/task-tracker/lib/delivery-attribution-exception.mjs',
      'scripts/task-tracker/lib/delivery-attribution-exception-record.mjs',
      'skill/shared/rules/deliver.md',
      'docs/guides/workflow.md',
    ]) {
      assert.ok(entries.has(required), `tarball omits ${required}`);
    }
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'delivery-exception-smoke', private: true, type: 'module' })
    );
    run(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        join(sandbox, report.filename),
      ],
      consumer
    );
    const installedCli = join(consumer, 'node_modules', '.bin', 'aitm');
    assert.ok(existsSync(installedCli));
    const installedHelp = run(installedCli, ['help', 'delivery-attribution-exception'], consumer);
    const sourceHelp = run(
      process.execPath,
      [join(root, 'bin', 'aitm.mjs'), 'help', 'delivery-attribution-exception'],
      root
    );
    assert.equal(installedHelp, sourceHelp);
    for (const action of ['prepare', 'record', 'show', 'revise', 'revoke']) {
      assert.match(installedHelp, new RegExp(`delivery-attribution-exception ${action} #1759`));
    }
    assert.match(installedHelp, /authorization-host-unsupported/);
    const verbUrl = pathToFileURL(
      join(
        consumer,
        'node_modules',
        '@kburson',
        'ai-task-manager',
        'scripts',
        'task-tracker',
        'verbs',
        'delivery-attribution-exception.mjs'
      )
    ).href;
    const unsupported = run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { runDeliveryAttributionException } from ${JSON.stringify(verbUrl)};
         try {
           await runDeliveryAttributionException({
             action: 'prepare', issueNumber: 1759, repository: 'kburson/ai-task-manager',
             runtime: { host: { provider: 'unsupported' }, fetchScope() { throw Error('unexpected read'); } }
           });
         } catch (error) { process.stdout.write(error.message); }`,
      ],
      consumer
    );
    assert.equal(unsupported, 'delivery-attribution-exception:authorization-host-unsupported');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
