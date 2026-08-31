// @story #1117 #1460

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../../..');
const GRAMMAR = resolve(ROOT, 'scripts/task-tracker/lib/stage-entry-grammar.mjs');
const PROJECTED_READER = resolve(ROOT, 'scripts/task-tracker/lib/stage-entry-markers.mjs');

function executableModules(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests') continue;
      found.push(...executableModules(path));
    } else if (entry.isFile() && extname(entry.name) === '.mjs') {
      found.push(path);
    }
  }
  return found;
}

function constructsEntryRegex(source) {
  const regexLiteral = /\/[^/\n]*aitm-entered[^/\n]*\/[a-z]*/;
  const constructor = /new\s+RegExp\s*\([^)]{0,800}aitm-entered/s;
  return regexLiteral.test(source) || constructor.test(source);
}

function staticImports(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)].map(
    (match) => match[1]
  );
}

function localDependency(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  return resolve(dirname(from), specifier);
}

test('entry grammar accepts every modern and legacy corpus shape', async () => {
  const {
    LEGACY_COLON_ENTRY_MARKER_RE,
    parseEntryMarker,
    parseEntryMarkers,
    serializeEntryMarker,
  } = await import(pathToFileURL(GRAMMAR));

  assert.deepEqual(parseEntryMarker('<!-- aitm-entered-review ts="2026-01-01T00:00:00Z" -->'), {
    state: 'review',
    visit: 1,
    ts: '2026-01-01T00:00:00Z',
    move: null,
  });
  assert.deepEqual(
    parseEntryMarker('<!-- aitm-entered-review-2 move="move-2" ts="2026-01-02T00:00:00Z" -->'),
    {
      state: 'review',
      visit: 2,
      ts: '2026-01-02T00:00:00Z',
      move: 'move-2',
    }
  );
  assert.deepEqual(parseEntryMarker('<!-- aitm-entered-on-deck: 2026-01-03T00:00:00Z -->'), {
    state: 'on-deck',
    visit: 1,
    ts: '2026-01-03T00:00:00Z',
    move: null,
  });
  assert.deepEqual(parseEntryMarker('<!-- aitm-entered-assigned-2: t4 -->'), {
    state: 'assigned',
    visit: 2,
    ts: 't4',
    move: null,
  });
  assert.equal(LEGACY_COLON_ENTRY_MARKER_RE.test('<!-- aitm-entered-plan-3: t3 -->'), true);

  const body = [
    'prose',
    '<!-- aitm-entered-plan: t1 -->',
    '<!-- aitm-entered-plan-2 move="m2" ts="t2" -->',
    '<!-- aitm-entered-plan-3 ts="t3" move="m3" -->',
  ].join('\n');
  assert.deepEqual(parseEntryMarkers(body), [
    { state: 'plan', visit: 1, ts: 't1', move: null, occurrence: 1 },
    { state: 'plan', visit: 2, ts: 't2', move: 'm2', occurrence: 2 },
    { state: 'plan', visit: 3, ts: 't3', move: 'm3', occurrence: 3 },
  ]);
  assert.equal(
    serializeEntryMarker({ state: 'review', visit: 2, ts: 't2', move: 'm2' }),
    '<!-- aitm-entered-review-2 ts="t2" move="m2" -->'
  );
  assert.equal(
    serializeEntryMarker({ state: 'review', visit: 1, ts: 't1' }),
    '<!-- aitm-entered-review ts="t1" -->'
  );

  const { parseEntryMarkers: parseProjectedEntries } = await import(
    pathToFileURL(PROJECTED_READER)
  );
  assert.deepEqual(parseProjectedEntries(body), [
    { stage: 'plan', visit: 1, ts: 't1' },
    { stage: 'plan', visit: 2, ts: 't2' },
    { stage: 'plan', visit: 3, ts: 't3' },
  ]);
  assert.deepEqual(
    parseProjectedEntries(
      '<!-- aitm-entered-assigned: t1 -->\n<!-- aitm-entered-on-deck-2: t2 -->'
    ),
    [
      { stage: 'ready-for-plan', visit: 1, ts: 't1' },
      { stage: 'ready-for-plan', visit: 2, ts: 't2' },
    ]
  );
});

test('only stage-entry-grammar constructs executable entry-marker regexes', () => {
  const offenders = executableModules(resolve(ROOT, 'scripts'))
    .filter((path) => path !== GRAMMAR)
    .filter((path) => constructsEntryRegex(readFileSync(path, 'utf8')))
    .map((path) => relative(ROOT, path))
    .sort();
  assert.deepEqual(offenders, []);
});

test('the grammar import graph stays side-effect free for fail-closed guards', () => {
  const queue = [GRAMMAR];
  const visited = new Set();
  const forbidden = [];
  while (queue.length > 0) {
    const path = queue.shift();
    if (visited.has(path)) continue;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    for (const specifier of staticImports(source)) {
      if (
        specifier === 'node:child_process' ||
        /(?:github|lifecycle-policy|database|sqlite|postgres)/i.test(specifier)
      ) {
        forbidden.push(`${relative(ROOT, path)} -> ${specifier}`);
      }
      const dependency = localDependency(path, specifier);
      if (dependency) queue.push(dependency);
    }
  }
  assert.deepEqual(forbidden, []);
  assert.match(
    readFileSync(resolve(ROOT, 'scripts/task-tracker/lib/gh-edit-guard.mjs'), 'utf8'),
    /from ['"]\.\/stage-entry-grammar\.mjs['"]/
  );
});
