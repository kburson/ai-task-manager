// @story #1007
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMAND_MANIFEST } from '../../../command-manifest.mjs';
import { SELF_DOC } from '../../../../lib/self-doc.mjs';
import {
  ENTRYPOINT_CLASSIFICATIONS,
  EXECUTABLE_ENTRYPOINTS,
} from '../../fixtures/executable-entrypoint-classification.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const PACKAGE = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PACKAGE_BIN_PATHS = new Set(Object.values(PACKAGE.bin));
const SELF_DOC_PATHS = new Map(
  Object.entries(SELF_DOC).map(([command, { path: scriptPath }]) => [scriptPath, command])
);
const MANIFEST_VERBS = new Set(
  COMMAND_MANIFEST.flatMap(({ verb, aliases = [] }) => [verb, ...aliases])
);
const ALLOWED_CLASSIFICATIONS = new Set(ENTRYPOINT_CLASSIFICATIONS);

function walk(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) return walk(relativePath);
    return [relativePath];
  });
}

function isPackageShipped(relativePath) {
  if (!/^(bin|hooks|scripts)\//.test(relativePath)) return false;
  if (/^scripts\/maintenance\//.test(relativePath)) return false;
  if (/\/tests\//.test(relativePath) || /\.test\.mjs$/.test(relativePath)) return false;
  return /\.(?:mjs|js)$/.test(relativePath);
}

export function discoverShippedEntrypoints() {
  return ['bin', 'hooks', 'scripts']
    .flatMap(walk)
    .filter(isPackageShipped)
    .filter((relativePath) => {
      if (PACKAGE_BIN_PATHS.has(relativePath)) return true;
      const source = readFileSync(path.join(ROOT, relativePath), 'utf8');
      return (
        /^#!.*\bnode\b/m.test(source) ||
        /process\.argv\[1\]/.test(source) ||
        /(?:^|\W)_?isMain(?:\W|$)/.test(source)
      );
    })
    .sort();
}

test('each shipped executable entry point has exactly one explicit classification', () => {
  const discovered = discoverShippedEntrypoints();
  const classified = EXECUTABLE_ENTRYPOINTS.map(({ path: scriptPath }) => scriptPath).sort();
  assert.equal(new Set(classified).size, classified.length);
  assert.deepEqual(classified, discovered);

  for (const entry of EXECUTABLE_ENTRYPOINTS) {
    assert.ok(ALLOWED_CLASSIFICATIONS.has(entry.classification), entry.path);
    assert.ok(entry.command || entry.reason, entry.path);
  }
});

test('public classifications resolve through an existing command authority', () => {
  for (const entry of EXECUTABLE_ENTRYPOINTS) {
    if (entry.classification === 'agent-callable-verb') {
      assert.ok(MANIFEST_VERBS.has(entry.command), `${entry.path}: ${entry.command}`);
    }
    if (entry.classification === 'agent-callable-standalone') {
      const selfDocCommand = SELF_DOC_PATHS.get(entry.path);
      const packageBinCommand = Object.entries(PACKAGE.bin).find(
        ([, scriptPath]) => scriptPath === entry.path
      )?.[0];
      assert.equal(entry.command, selfDocCommand ?? packageBinCommand, entry.path);
    }
  }
});

test('the approved classification vocabulary is closed and deeply frozen', () => {
  assert.deepEqual(ENTRYPOINT_CLASSIFICATIONS, [
    'agent-callable-verb',
    'agent-callable-standalone',
    'package-lifecycle-cli',
    'live-maintenance-or-migration',
    'internal-hook-or-guard',
    'internal-library-or-orchestration',
    'test-fixture-or-retired-one-shot',
  ]);
  assert.equal(Object.isFrozen(ENTRYPOINT_CLASSIFICATIONS), true);
  assert.equal(Object.isFrozen(EXECUTABLE_ENTRYPOINTS), true);
  for (const row of EXECUTABLE_ENTRYPOINTS) assert.equal(Object.isFrozen(row), true);
});
