// @story #1089
// Explainable hybrid selection for fast Develop iterations.

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { discoverTestFiles } from './discover-test-files.mjs';
import { laneOf, LANES } from './test-lanes.mjs';
import { findUnitTestMatches } from '../find-unit-tests.mjs';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.tmp',
  '.worktrees',
  'coverage',
  'node_modules',
  'reports',
]);
const STATIC_IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function normalizeRepoPath(value, label = 'path') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`test-impact: ${label} must be a non-empty string`);
  }
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  const segments = normalized.split('/');
  if (path.posix.isAbsolute(normalized) || segments.includes('..')) {
    throw new TypeError(`test-impact: ${label} escapes the repository: ${value}`);
  }
  return normalized;
}

function globRegex(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

function matchesGlob(value, pattern) {
  return globRegex(pattern).test(value);
}

function validateManifest(manifest) {
  if (!manifest || manifest.schema !== 1 || !Array.isArray(manifest.rules)) {
    throw new TypeError('test-impact: manifest schema must be 1 with a rules array');
  }
  return manifest.rules.map((rule, index) => {
    if (!rule || !Array.isArray(rule.sources) || rule.sources.length === 0) {
      throw new TypeError(`test-impact: rule ${index} requires source globs`);
    }
    if (typeof rule.reason !== 'string' || rule.reason.trim() === '') {
      throw new TypeError(`test-impact: rule ${index} requires a non-empty reason`);
    }
    const sources = rule.sources.map((item) => normalizeRepoPath(item, 'source pattern'));
    const tests = (rule.tests || []).map((item) => normalizeRepoPath(item, 'test pattern'));
    const lanes = rule.lanes || [];
    if (!Array.isArray(lanes) || lanes.some((lane) => !LANES.includes(lane))) {
      throw new TypeError(`test-impact: rule ${index} has an unknown lane`);
    }
    if (tests.length === 0 && lanes.length === 0) {
      throw new TypeError(`test-impact: rule ${index} requires tests or lanes`);
    }
    return { sources, tests, lanes, reason: rule.reason.trim() };
  });
}

function walkModules(projectDir) {
  const modules = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile() && (entry.name.endsWith('.mjs') || entry.name.endsWith('.js'))) {
        modules.push(path.relative(projectDir, absolute).replaceAll(path.sep, '/'));
      }
    }
  };
  visit(projectDir);
  return modules.sort();
}

function resolveStaticImport(projectDir, importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const importerDirectory = path.dirname(path.join(projectDir, importer));
  const unresolved = path.resolve(importerDirectory, specifier);
  const relative = path.relative(projectDir, unresolved).replaceAll(path.sep, '/');
  if (relative === '..' || relative.startsWith('../')) return null;
  const candidates = path.extname(unresolved)
    ? [unresolved]
    : [`${unresolved}.mjs`, `${unresolved}.js`, path.join(unresolved, 'index.mjs')];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  return resolved ? path.relative(projectDir, resolved).replaceAll(path.sep, '/') : null;
}

function buildReverseImportGraph(projectDir) {
  const reverse = new Map();
  for (const importer of walkModules(projectDir)) {
    const source = readFileSync(path.join(projectDir, importer), 'utf8');
    for (const match of source.matchAll(STATIC_IMPORT_RE)) {
      const imported = resolveStaticImport(projectDir, importer, match[1]);
      if (!imported) continue;
      const importers = reverse.get(imported) || new Set();
      importers.add(importer);
      reverse.set(imported, importers);
    }
  }
  return reverse;
}

function importedTestConsumers(changedPath, reverse, discoveredSet) {
  const consumers = [];
  const queue = [{ module: changedPath, distance: 0 }];
  const visited = new Set([changedPath]);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const importer of [...(reverse.get(current.module) || [])].sort()) {
      if (visited.has(importer)) continue;
      visited.add(importer);
      const distance = current.distance + 1;
      if (discoveredSet.has(importer)) consumers.push({ test: importer, distance });
      queue.push({ module: importer, distance });
    }
  }
  return consumers;
}

function loadDefaultManifest(projectDir) {
  const manifestPath = path.join(projectDir, 'scripts/task-tracker/test-impact-manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function selectAffectedTests({
  projectDir,
  changedPaths = [],
  manifest,
  discoveredTests,
} = {}) {
  const root = realpathSync(projectDir);
  const changed = [...new Set(changedPaths.map((item) => normalizeRepoPath(item)))].sort();
  const discovered = [
    ...new Set(discoveredTests || discoverTestFiles({ projectRoot: root })),
  ].sort();
  const discoveredSet = new Set(discovered);
  const rules = validateManifest(manifest || loadDefaultManifest(root));
  const reverse = buildReverseImportGraph(root);
  const reasons = [];
  const tests = new Set();
  const escalatedLanes = new Set();
  const add = (changedPath, test, signal, reason) => {
    tests.add(test);
    const key = `${changedPath}\0${test}\0${signal}\0${reason}`;
    if (!reasons.some((entry) => entry.key === key)) {
      reasons.push({ key, changedPath, test, signal, reason });
    }
  };

  for (const changedPath of changed) {
    const before = reasons.length;
    if (discoveredSet.has(changedPath)) {
      add(changedPath, changedPath, 'changed-test', 'changed or newly discovered test');
    }
    for (const consumer of importedTestConsumers(changedPath, reverse, discoveredSet)) {
      const direct = consumer.distance === 1;
      add(
        changedPath,
        consumer.test,
        direct ? 'import-direct' : 'import-transitive',
        direct ? 'test statically imports changed path' : 'test transitively imports changed path'
      );
    }
    for (const match of findUnitTestMatches([changedPath], {
      projectRoot: root,
      discovered,
    })) {
      add(changedPath, match.test, 'basename', 'conventional basename compatibility mapping');
    }

    for (const rule of rules) {
      if (!rule.sources.some((pattern) => matchesGlob(changedPath, pattern))) continue;
      const manifestTests = discovered.filter((test) =>
        rule.tests.some((pattern) => matchesGlob(test, pattern))
      );
      if (rule.tests.length > 0 && manifestTests.length === 0) {
        throw new Error(`test-impact: matched rule for ${changedPath} matched no tests`);
      }
      for (const test of manifestTests) add(changedPath, test, 'manifest', rule.reason);
      for (const lane of rule.lanes) {
        escalatedLanes.add(lane);
        for (const test of discovered.filter((candidate) => laneOf(candidate) === lane)) {
          add(changedPath, test, 'lane-escalation', rule.reason);
        }
      }
    }

    if (reasons.length === before) {
      reasons.push({
        key: `${changedPath}\0`,
        changedPath,
        test: null,
        signal: 'no-verification-impact',
        reason: 'path has no source, test, fixture, runner, dependency, or verification impact',
      });
    }
  }

  const cleanReasons = reasons
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ key: _key, ...entry }) => entry);
  return {
    tests: [...tests].sort(),
    lanes: LANES.filter((lane) => escalatedLanes.has(lane)),
    reasons: cleanReasons,
    escalated: escalatedLanes.size > 0,
  };
}

export function formatTestImpactReport(selection) {
  const lines = selection.reasons.map(({ changedPath, test, signal, reason }) =>
    test
      ? `${changedPath} -> ${test} [${signal}] ${reason}`
      : `${changedPath} [${signal}] ${reason}`
  );
  if (selection.escalated) lines.push(`full lanes: ${selection.lanes.join(', ')}`);
  return lines.join('\n');
}
