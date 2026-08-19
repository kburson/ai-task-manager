// @story #609
// Coverage leaf for `scripts/providers/provider-adapter.mjs`.
//
// The module is a pure typedef carrier: it documents the ProviderAdapter shape
// in JSDoc and emits a bare `export {}` with no runtime values or side effects.
// The honest coverage assertion is therefore that it imports cleanly and
// exposes no enumerable exports — exercising the single executable line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { grokAdapter } from '../../../providers/grok.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('provider-adapter module imports with no runtime exports', async () => {
  const mod = await import('../../../providers/provider-adapter.mjs');
  assert.equal(typeof mod, 'object');
  assert.deepEqual(Object.keys(mod), []);
});

test('Grok adapter ships the declared project-local provider surfaces', () => {
  assert.equal(grokAdapter.installTarget, '.grok/skills/task');
  assert.equal(grokAdapter.installRecipe.hookTarget, '.grok/hooks/aitm.json');
  for (const relPath of [
    'scripts/providers/grok.mjs',
    'scripts/task-tracker/hooks/grok-wire.mjs',
    'skill/adapters/grok/SKILL.md',
  ]) {
    assert.ok(existsSync(path.join(PROJECT_ROOT, relPath)), `${relPath} must ship`);
  }
});

test('public install docs describe all-provider defaults, subsets, and no both alias', () => {
  const readme = readFileSync(path.join(PROJECT_ROOT, 'README.md'), 'utf8');
  assert.match(readme, /Claude.*Codex.*Grok/s);
  assert.match(readme, /default.*all registered providers/is);
  assert.match(readme, /--agent claude,grok/);
  assert.match(readme, /--agent.*both.*(?:reject|not supported|removed)/is);
});

test('Grok operator guide documents trust, native hooks, required sid, and double-fire safety', () => {
  const guidePath = path.join(PROJECT_ROOT, 'docs/guides/grok-provider.md');
  assert.ok(existsSync(guidePath), 'Grok operator guide must exist');
  const guide = readFileSync(guidePath, 'utf8');
  assert.match(guide, /\/hooks-trust/);
  assert.match(guide, /--trust/);
  assert.match(guide, /\.grok\/hooks\/aitm\.json/);
  assert.match(guide, /GROK_SESSION_ID/);
  assert.match(guide, /double-fire|fire twice/i);
  const docsIndex = readFileSync(path.join(PROJECT_ROOT, 'docs/README.md'), 'utf8');
  assert.match(docsIndex, /guides\/grok-provider\.md/);
});

test('architecture docs declare Grok adapter, hooks, transcript layout, and required tool sid', () => {
  const design = readFileSync(path.join(PROJECT_ROOT, 'docs/DESIGN.md'), 'utf8');
  assert.match(design, /grok\.mjs/);
  assert.match(design, /\.grok\/hooks\/aitm\.json/);
  assert.match(design, /cwd-session-dir/);
  assert.match(design, /GROK_SESSION_ID/);
});

test('occupancy and co-review authority surfaces ship with operator guidance', () => {
  for (const relPath of [
    'scripts/task-tracker/lib/occupancy.mjs',
    'scripts/review/lib/index.mjs',
    'scripts/task-tracker/lib/co-review-write-policy.mjs',
    'scripts/task-tracker/lib/mutation-targets.mjs',
  ]) {
    assert.ok(existsSync(path.join(PROJECT_ROOT, relPath)), `${relPath} must ship`);
  }
  const coordination = readFileSync(
    path.join(PROJECT_ROOT, 'docs/guides/github-native-coordination.md'),
    'utf8'
  );
  assert.match(coordination, /one issue.*one session/is);
  assert.match(coordination, /pause.*retain/is);
  assert.match(coordination, /stop.*release/is);
  assert.match(coordination, /occupancy --release #N/i);
  assert.match(coordination, /reviewer.*unbound/is);
  assert.match(coordination, /pending review artifact/i);
});
