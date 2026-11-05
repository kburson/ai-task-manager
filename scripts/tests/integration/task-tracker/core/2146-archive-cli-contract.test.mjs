// @story #2146
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { sha } from '../../../../research/2146-native-recovery/archive.mjs';
import {
  allocateValidationRoot,
  reconstructHistoricalSource,
} from '../../../../research/2146-native-recovery/reconstruct.mjs';
const script = fileURLToPath(
  new URL('../../../../research/2146-native-recovery/verify.mjs', import.meta.url)
);
for (const args of [
  [],
  ['unsupported'],
  ['report', '--root=/foreign'],
  ['plan', '--manifest-hash=changed'],
]) {
  test(`strict verifier refuses unsupported invocation ${JSON.stringify(args)}`, () => {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /^verification:usage/m);
  });
}

// Removing strict carrier validation or accepting caller-replaced manifest pins
// must break these real subprocess checks, even with a self-consistent Git commit.
test('strict CLI refuses executable drift and a committed replaced original manifest', async (t) => {
  const allocation = await allocateValidationRoot(process.cwd());
  const historical = reconstructHistoricalSource(process.cwd(), allocation);
  const fixture = historical.sourceRoot;
  const source = fileURLToPath(new URL('../../../../../', import.meta.url));
  const code = 'scripts/research/2146-native-recovery/';
  const data = 'docs/archive/2146-native-recovery/';
  const inputs = [
    'archive.mjs',
    'pack.mjs',
    'reconstruct.mjs',
    'historical-context.mjs',
    'verify-historical.mjs',
    'carrier.mjs',
    'verify.mjs',
  ]
    .map((name) => code + name)
    .concat([data + 'index.json', data + 'objects.json.gz']);
  for (const relative of inputs) {
    const target = path.join(fixture, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    // Reconstruction can already contain the committed archive in a later carrier;
    // only this newly owned fixture receives the current test input bytes.
    writeFileSync(target, readFileSync(path.join(source, relative)));
  }
  const git = (args) =>
    execFileSync('git', ['--no-pager', '--no-optional-locks', ...args], {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const commit = () => {
    git(['add', '--', ...inputs]);
    git([
      '-c',
      'user.name=Archive validation fixture',
      '-c',
      'user.email=archive-fixture@example.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '-m',
      'Disposable strict CLI fixture',
    ]);
  };
  const run = (mode) =>
    spawnSync(process.execPath, [path.join(fixture, code + 'verify.mjs'), mode], {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    });
  const requireRefusal = (mode) => {
    const result = run(mode);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    const lines = result.stderr.trim().split('\n');
    assert.equal(lines[0], 'verification:input-or-reconstruction');
    const failure = JSON.parse(lines[1]);
    assert.equal(failure.ownedRoot, null, 'must refuse before reconstruction allocation');
    assert.deepEqual(failure.commands, []);
    return failure;
  };
  commit();
  const control = run('report');
  assert.equal(control.status, 0, control.stderr);
  assert.equal(JSON.parse(control.stdout).executionRecords, 81);

  const adapter = path.join(fixture, code + 'verify-historical.mjs');
  const adapterBytes = readFileSync(adapter);
  writeFileSync(adapter, Buffer.concat([adapterBytes, Buffer.from('\n// disposable drift\n')]));
  // Exercise committed-blob checks even when Git's status trusts this index flag.
  git(['update-index', '--assume-unchanged', '--', code + 'verify-historical.mjs']);
  assert.equal(git(['status', '--porcelain', '--untracked-files=all']), '');
  for (const mode of ['report', 'plan']) requireRefusal(mode);
  writeFileSync(adapter, adapterBytes);
  git(['update-index', '--no-assume-unchanged', '--', code + 'verify-historical.mjs']);

  const indexPath = path.join(fixture, data + 'index.json');
  const archivePath = path.join(fixture, data + 'objects.json.gz');
  const index = JSON.parse(readFileSync(indexPath));
  const objects = new Map(JSON.parse(gunzipSync(readFileSync(archivePath))));
  const manifest = index.files.find((file) => file.path === 'manifest-v2.json');
  const originalHash = manifest.sha256;
  const changed = Buffer.concat([
    Buffer.from(objects.get(originalHash), 'base64'),
    Buffer.from(' '),
  ]);
  // Equivalent JSON with different bytes is still a replaced original manifest.
  JSON.parse(changed);
  objects.delete(originalHash);
  manifest.sha256 = sha(changed);
  manifest.size = changed.length;
  objects.set(manifest.sha256, changed.toString('base64'));
  index.manifestSha256 = manifest.sha256;
  index.totalBytes += 1;
  index.uniqueBytes += 1;
  const raw = Buffer.from(
    JSON.stringify([...objects].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) + '\n'
  );
  const compressed = gzipSync(raw, { level: 9 });
  compressed[9] = 19;
  index.objectFile.size = compressed.length;
  index.objectFile.sha256 = sha(compressed);
  index.objectFile.uncompressedBytes = raw.length;
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  writeFileSync(archivePath, compressed);
  commit();
  assert.equal(git(['status', '--porcelain', '--untracked-files=all']), '');
  assert.notEqual(manifest.sha256, originalHash);
  for (const mode of ['report', 'plan']) requireRefusal(mode);
  t.diagnostic(
    JSON.stringify({
      ownedRoot: allocation.ownedRoot,
      originalManifestSha256: originalHash,
      replacedManifestSha256: manifest.sha256,
      controlPassed: true,
      refusedModes: ['report', 'plan'],
    })
  );
  // Preserve the complete fixture on any failure; clean only after every assertion.
  rmSync(allocation.ownedRoot, { recursive: true });
});
