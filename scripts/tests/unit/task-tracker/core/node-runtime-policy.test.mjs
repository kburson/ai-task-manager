// @story #1615
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getProjectDir } from '../../../../task-tracker/paths.mjs';

const ROOT = getProjectDir(
  {},
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
);

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

test('published metadata requires Node.js 24 or newer', () => {
  const manifest = readJson('package.json');
  const lockfile = readJson('package-lock.json');

  assert.equal(manifest.engines?.node, '>=24');
  assert.equal(lockfile.packages?.['']?.engines?.node, '>=24');
});

test('active CI proves the Node 24 floor and a later supported runtime', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const nodeVersions = [
    ...workflow.matchAll(/^\s+(?:-\s+)?(?:node-version|node):\s*['"]?([^'"\s#]+)/gm),
  ].map(([, version]) => version);

  assert.ok(nodeVersions.includes('24'), 'CI must exercise the minimum Node 24 runtime');
  assert.ok(
    nodeVersions.some((version) => version === '26' || version === 'current'),
    'CI must retain a later/current Node runtime lane'
  );
  assert.ok(!nodeVersions.includes('22'), 'active CI must not pin Node 22');
});

test('hosted compatibility runs every pack consumer under npm 11 and npm 12', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');

  assert.match(workflow, /npm-pack-compatibility:/);
  assert.match(workflow, /npm:\s*'11\.8\.0'/);
  assert.match(workflow, /npm:\s*'12\.0\.2'/);
  assert.match(workflow, /test "\$\(npm --version\)" = "\$\{\{ matrix\.npm \}\}"/);

  for (const testFile of [
    'npm-pack-report.test.mjs',
    'package-boundary.test.mjs',
    'memory-seed-packaged.test.mjs',
    'scope-pack.test.mjs',
    'package-test-corpus.test.mjs',
    'packaged-tail-profile-consumer.test.mjs',
  ]) {
    assert.ok(workflow.includes(testFile), `hosted compatibility must run ${testFile}`);
  }
});
