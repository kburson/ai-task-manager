// @story #1007
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SELF_DOC } from '../../../../lib/self-doc.mjs';
import { routeIdentityForCommand } from '../../../../task-tracker/lib/command-surface/catalog.mjs';
import {
  ENTRYPOINT_CLASSIFICATIONS,
  EXECUTABLE_ENTRYPOINTS,
} from '../../../fixtures/executable-entrypoint-classification.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const PACKAGE = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PACKAGE_BIN_PATHS = new Set(Object.values(PACKAGE.bin));
const SELF_DOC_PATHS = new Map(
  Object.entries(SELF_DOC).map(([command, { path: scriptPath }]) => [scriptPath, command])
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

function globToRegExp(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function packageRuleMatches(relativePath, rule) {
  if (rule.endsWith('/')) return relativePath.startsWith(rule);
  return globToRegExp(rule).test(relativePath);
}

function filesForPositiveRule(rule) {
  const wildcardAt = rule.search(/[*?]/);
  if (wildcardAt === -1) {
    const exactPath = rule.endsWith('/') ? rule.slice(0, -1) : rule;
    const absoluteExact = path.join(ROOT, exactPath);
    if (!existsSync(absoluteExact)) return [];
    return statSync(absoluteExact).isDirectory() ? walk(exactPath) : [exactPath];
  }
  const staticPrefix = wildcardAt === -1 ? rule : rule.slice(0, wildcardAt);
  const candidatePath = staticPrefix.endsWith('/')
    ? staticPrefix.slice(0, -1)
    : path.posix.dirname(staticPrefix);
  const root = candidatePath === '.' ? '' : candidatePath;
  const absolute = path.join(ROOT, root);
  if (!existsSync(absolute)) return [];
  const candidates = statSync(absolute).isDirectory() ? walk(root) : [root];
  return candidates.filter((relativePath) => packageRuleMatches(relativePath, rule));
}

function discoverPackageShippedFiles() {
  const positiveRules = PACKAGE.files.filter((rule) => !rule.startsWith('!'));
  const negativeRules = PACKAGE.files
    .filter((rule) => rule.startsWith('!'))
    .map((rule) => rule.slice(1));
  return [
    ...new Set(
      positiveRules
        .flatMap(filesForPositiveRule)
        .filter(
          (relativePath) => !negativeRules.some((rule) => packageRuleMatches(relativePath, rule))
        )
    ),
  ];
}

export function discoverShippedEntrypoints() {
  return discoverPackageShippedFiles()
    .filter((relativePath) => /\.(?:mjs|js)$/.test(relativePath))
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
      const route = routeIdentityForCommand(entry.command);
      assert.ok(route, `${entry.path}: ${entry.command}`);
      assert.equal(`scripts/task-tracker/${route.dispatch}`, entry.path, entry.command);
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
