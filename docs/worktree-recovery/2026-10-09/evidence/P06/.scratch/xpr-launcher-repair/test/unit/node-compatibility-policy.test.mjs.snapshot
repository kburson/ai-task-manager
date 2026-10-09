import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

test('package metadata and active guidance enforce the Node 24 floor', () => {
  const packageJson = JSON.parse(read('package.json'));
  const packageLock = JSON.parse(read('package-lock.json'));
  const readme = read('README.md');
  const workflows = [read('.github/workflows/ci.yml'), read('.github/workflows/release.yml')];

  assert.equal(packageJson.engines?.node, '>=24');
  assert.equal(packageLock.packages?.['']?.engines?.node, '>=24');
  assert.equal(read('.nvmrc'), '26\n');
  assert.match(readme, /requires Node\.js 24 or later/);
  assert.doesNotMatch(readme, /(?:requires|supports|minimum)[^\n]*Node(?:\.js)? 22/i);
  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /node-version:\s*(?:['"]?22['"]?|lts\/\*)/);
  }
});

test('hosted CI exercises pack consumers under exact npm 11 and npm 12 versions', () => {
  const ci = read('.github/workflows/ci.yml');
  const compatibility = ci.match(/npm-pack-compatibility:[\s\S]*?\n  phase-2-boundary:/)?.[0] ?? '';

  assert.match(compatibility, /node:\s*24\s*\n\s+npm:\s*'11\.8\.0'/);
  assert.match(compatibility, /node:\s*26\s*\n\s+npm:\s*'12\.0\.2'/);
  assert.match(compatibility, /npm install --global "npm@\$\{\{ matrix\.npm \}\}"/);
  assert.match(compatibility, /npm run test:packaging/);
  assert.match(compatibility, /npm run test:smoke/);
});

test('release uses the minimum Node runtime and documents the 0.3.0 compatibility break', () => {
  const release = read('.github/workflows/release.yml');
  assert.ok(existsSync(path.join(root, 'docs/releases/0.3.0.md')), 'release note must exist');
  const notes = read('docs/releases/0.3.0.md');

  assert.match(release, /node-version:\s*24/);
  assert.doesNotMatch(release, /node-version:\s*(?:22|26)/);
  assert.match(release, /npm install --global npm@12\.0\.2/);
  assert.match(notes, /Node(?:\.js)? 24/i);
  assert.match(notes, /breaking/i);
  assert.match(notes, /0\.3\.0/);
  assert.match(notes, /npm 11[^\n]*npm 12|npm 11 and npm 12/i);
});
