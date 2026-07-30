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
    'npm run release:ledger && npm publish --access public',
    'release must publish the ledger before the root package'
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

test('ledger dry-run pack contains runtime only and root pack keeps the workspace separate', () => {
  assert.ok(existsSync(LEDGER_MANIFEST), 'packages/aitm-ledger/package.json is missing');
  const ledgerFiles = packedFiles(['--workspace', '@kburson/aitm-ledger']);
  assert.deepEqual(
    [...ledgerFiles].sort(),
    ['package.json', 'src/index.mjs'],
    'ledger pack must contain only its manifest and runtime export'
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
