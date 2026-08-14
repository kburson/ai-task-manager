// @story #768
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// #768 scopes the published package to @kburson/ai-task-manager because the bare
// name is owned by a third party on npm. This guard pins the registry-facing
// metadata AND the surfaces that must NOT move (local bin, GitHub URLs).
const HERE = dirname(fileURLToPath(import.meta.url)) + '/..';
const ROOT = join(HERE, '..', '..', '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('package.json name is the scoped @kburson/ai-task-manager', () => {
  assert.equal(
    manifest.name,
    '@kburson/ai-task-manager',
    'the published package name must be the @kburson scope'
  );
});

test('publishConfig.access is public (scoped packages default to restricted)', () => {
  assert.equal(
    manifest.publishConfig?.access,
    'public',
    'without publishConfig.access=public the first publish of a scoped package returns 402'
  );
});

test('the local bin command "ai-task-manager" is unchanged', () => {
  assert.ok(
    manifest.bin && typeof manifest.bin['ai-task-manager'] === 'string',
    'the post-install local bin key must stay "ai-task-manager" (not scoped)'
  );
});

test('GitHub repo URLs are left unchanged (npm scoping is not a repo rename)', () => {
  assert.match(
    manifest.homepage ?? '',
    /github\.com\/kburson\/ai-task-manager/,
    'homepage must still point at github.com/kburson/ai-task-manager'
  );
  assert.match(
    manifest.repository?.url ?? '',
    /github\.com\/kburson\/ai-task-manager/,
    'repository.url must still point at github.com/kburson/ai-task-manager'
  );
});

test('README first-run install uses the scoped name', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.match(
    readme,
    /npm i -D @kburson\/ai-task-manager/,
    'README registry install example must use the scoped name'
  );
});
