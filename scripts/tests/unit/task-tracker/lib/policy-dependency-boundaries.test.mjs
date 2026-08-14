// @story #1012
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

function packageFiles(relativeDir) {
  return readdirSync(path.join(ROOT, relativeDir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => path.posix.join(relativeDir, entry.name));
}

function importsFor(file) {
  const source = readFileSync(path.join(ROOT, file), 'utf8');
  return [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('lifecycle policy is data-only and has no timing or operational dependency', () => {
  for (const file of packageFiles('scripts/task-tracker/lib/lifecycle-policy')) {
    const imports = importsFor(file);
    assert.ok(
      imports.every((specifier) => specifier.startsWith('./')),
      `${file}: ${imports.join(', ')}`
    );
    assert.doesNotMatch(
      readFileSync(path.join(ROOT, file), 'utf8'),
      /timing|phase-events|verbs\/|move-state|guard-registry/
    );
  }
});

test('timing-event policy depends only on sibling modules and lifecycle identities', () => {
  for (const file of packageFiles('scripts/task-tracker/lib/timing-events')) {
    const imports = importsFor(file);
    assert.ok(
      imports.every(
        (specifier) => specifier.startsWith('./') || specifier === '../lifecycle-policy/index.mjs'
      ),
      `${file}: ${imports.join(', ')}`
    );
  }
});

test('command help catalog consumes only narrow command-surface routing identity', () => {
  const catalog = 'scripts/task-tracker/lib/command-surface/catalog.mjs';
  const source = readFileSync(path.join(ROOT, catalog), 'utf8');
  assert.doesNotMatch(source, /command-manifest/);
  assert.match(source, /['"]\.\/routing\.mjs['"]/);
});
