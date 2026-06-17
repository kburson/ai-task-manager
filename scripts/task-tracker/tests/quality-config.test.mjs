#!/usr/bin/env node
// @story #93
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dir, '..', '..', '..');

const requiredFiles = [
  '.prettierrc.json',
  '.prettierignore',
  'eslint.config.mjs',
  '.markdownlint-cli2.jsonc',
  '.markdownlintignore',
  'cspell.json',
  'cspell-dictionary.txt',
];

for (const rel of requiredFiles) {
  assert.ok(existsSync(path.join(repoRoot, rel)), `${rel} must exist`);
}

const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const requiredScripts = [
  'format',
  'format:check',
  'lint:js',
  'lint:md',
  'lint:spell',
  'lint',
  'quality',
];
for (const s of requiredScripts) {
  assert.ok(pkg.scripts?.[s], `package.json script "${s}" must be defined`);
}

assert.match(pkg.scripts.quality, /format:check/, 'quality must run format:check');
assert.match(pkg.scripts.quality, /lint/, 'quality must run lint');
assert.match(pkg.scripts.quality, /test/, 'quality must run test');
assert.match(pkg.scripts.lint, /lint:js/, 'lint must include lint:js');
assert.match(pkg.scripts.lint, /lint:md/, 'lint must include lint:md');
assert.match(pkg.scripts.lint, /lint:spell/, 'lint must include lint:spell');

const requiredDevDeps = ['eslint', 'prettier', 'markdownlint-cli2', 'cspell', 'globals'];
for (const d of requiredDevDeps) {
  assert.ok(pkg.devDependencies?.[d], `devDependency "${d}" must be declared`);
}

const cspell = JSON.parse(readFileSync(path.join(repoRoot, 'cspell.json'), 'utf8'));
assert.ok(Array.isArray(cspell.dictionaryDefinitions), 'cspell.json must define dictionaries');
assert.ok(
  cspell.dictionaryDefinitions.some((d) => d.path === './cspell-dictionary.txt'),
  'project dictionary must point at ./cspell-dictionary.txt'
);

const sharedIgnores = ['node_modules', 'tmp', '.worktrees', '.claude/worktrees'];
const eslintCfg = readFileSync(path.join(repoRoot, 'eslint.config.mjs'), 'utf8');
const mdCfg = readFileSync(path.join(repoRoot, '.markdownlint-cli2.jsonc'), 'utf8');
for (const ig of sharedIgnores) {
  assert.match(eslintCfg, new RegExp(ig.replace(/\./g, '\\.')), `eslint must ignore ${ig}`);
  assert.match(mdCfg, new RegExp(ig.replace(/\./g, '\\.')), `markdownlint must ignore ${ig}`);
  assert.ok(
    (cspell.ignorePaths || []).some((p) => p.includes(ig)),
    `cspell must ignore ${ig}`
  );
}

const dict = readFileSync(path.join(repoRoot, 'cspell-dictionary.txt'), 'utf8')
  .split('\n')
  .filter((l) => l.trim().length > 0);
const seen = new Set();
for (const word of dict) {
  assert.ok(!seen.has(word), `cspell-dictionary.txt has duplicate: ${word}`);
  seen.add(word);
}

console.log(`ok — ${requiredFiles.length} files, ${requiredScripts.length} scripts verified`);
