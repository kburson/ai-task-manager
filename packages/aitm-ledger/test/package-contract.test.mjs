// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const LEDGER_ROOT = join(ROOT, 'packages', 'aitm-ledger');
const LEDGER_MANIFEST = join(LEDGER_ROOT, 'package.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function packedFiles(args) {
  const report = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, npm_config_loglevel: 'silent' },
    })
  );
  return new Set((report[0]?.files ?? []).map((file) => file.path));
}

test('ledger workspace publishes an independently consumable ESM package', async () => {
  assert.ok(existsSync(LEDGER_MANIFEST), 'packages/aitm-ledger/package.json is missing');
  const root = readJson(join(ROOT, 'package.json'));
  const ledger = readJson(LEDGER_MANIFEST);

  assert.deepEqual(root.workspaces, ['packages/aitm-ledger']);
  assert.equal(root.engines?.node, '>=22.15.0');
  assert.equal(root.dependencies?.['@kburson/aitm-ledger'], '1.0.0');
  assert.equal(root.scripts?.['test:ledger'], 'node --test packages/aitm-ledger/test/*.test.mjs');
  assert.equal(
    root.scripts?.release,
    'node scripts/release/publish-ledger-if-needed.mjs && npm publish --access public',
    'release must ensure the ledger version exists before publishing root'
  );
  assert.equal(
    root.scripts?.['release:ledger'],
    'npm publish --access public --workspace @kburson/aitm-ledger'
  );

  assert.equal(ledger.name, '@kburson/aitm-ledger');
  assert.equal(ledger.version, '1.0.0');
  assert.equal(ledger.type, 'module');
  assert.equal(ledger.license, 'AGPL-3.0-or-later');
  assert.equal(ledger.engines?.node, '>=22.15.0');
  assert.deepEqual(ledger.exports, { '.': './src/index.mjs' });
  assert.deepEqual(ledger.files, ['src/']);
  assert.deepEqual(ledger.publishConfig, { access: 'public' });

  const ledgerModule = await import(pathToFileURL(join(LEDGER_ROOT, 'src', 'index.mjs')).href);
  assert.equal(ledgerModule.LEDGER_PACKAGE_NAME, '@kburson/aitm-ledger');
});

test('ledger release decision is idempotent and fails closed on ambiguous registry errors', async () => {
  const releaseScript = join(ROOT, 'scripts', 'release', 'publish-ledger-if-needed.mjs');
  assert.ok(existsSync(releaseScript), 'ledger release helper is missing');
  const { decideLedgerPublish } = await import(pathToFileURL(releaseScript).href);

  assert.equal(
    decideLedgerPublish({ status: 0, stdout: '"1.0.0"\n', stderr: '', version: '1.0.0' }),
    'skip'
  );
  assert.equal(
    decideLedgerPublish({
      status: 1,
      stdout: '',
      stderr: 'npm error code E404',
      version: '1.0.0',
    }),
    'publish'
  );
  assert.throws(
    () =>
      decideLedgerPublish({
        status: 1,
        stdout: '',
        stderr: 'npm error code EAI_AGAIN',
        version: '1.0.0',
      }),
    /refusing to publish/
  );
  assert.throws(
    () => decideLedgerPublish({ status: 0, stdout: '"2.0.0"', stderr: '', version: '1.0.0' }),
    /unexpected version/
  );
});

test('ledger dry-run pack contains runtime only and root pack keeps the workspace separate', () => {
  assert.ok(existsSync(LEDGER_MANIFEST), 'packages/aitm-ledger/package.json is missing');
  const ledgerFiles = packedFiles(['--workspace', '@kburson/aitm-ledger']);
  for (const required of [
    'package.json',
    'src/index.mjs',
    'src/lease/errors.mjs',
    'src/lease/port.mjs',
    'src/lease/schema.mjs',
  ]) {
    assert.ok(ledgerFiles.has(required), `ledger pack is missing ${required}`);
  }
  assert.equal(
    [...ledgerFiles].some((path) => /(^|\/)tests?\//.test(path) || path.endsWith('.test.mjs')),
    false,
    'ledger pack must contain runtime files only'
  );

  const rootFiles = packedFiles([]);
  assert.ok(rootFiles.has('bin/cli.mjs'), 'root pack must retain the installer CLI');
  assert.ok(rootFiles.has('package.json'), 'root pack must retain its manifest');
  assert.equal(
    [...rootFiles].some((path) => path.startsWith('packages/aitm-ledger/')),
    false,
    'root pack must not duplicate the independently published ledger package'
  );
});
