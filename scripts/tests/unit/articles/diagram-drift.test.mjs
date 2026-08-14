// @story #1102
// Every in-body Mermaid fence must have an exact twin under
// docs/articles/assets/diagrams/. When the two copies diverge, the published
// article and the diagram library tell different stories about the same
// picture, and nothing catches it until someone reads the drift report.
//
// This runs in the fast lane: `skipDiagrams` turns off Mermaid rendering, and
// what is left — extracting fences, normalizing them, comparing against the
// `.mmd` sources — is pure string work. The rendering half of the contract
// (that a reconciled fence still produces a valid image) belongs to
// tests/slow/publish-articles-e2e.test.mjs.

import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

import { DRIFT_REPORT, publishAll } from '../../../articles/lib/publish.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'docs', 'articles');
// Scratch stays inside the repo — `lint:tmp` forbids reaching for a system
// temp path.
const OUT_ROOT = path.join(REPO_ROOT, '.tmp', 'published-drift-check');

let result;

before(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
  result = await publishAll({
    articlesDir: ARTICLES_DIR,
    outRoot: OUT_ROOT,
    skipDiagrams: true,
  });
});

after(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
});

test('no in-body fence has drifted from the diagram library', () => {
  assert.deepEqual(
    result.drift,
    [],
    `drifted fences:\n${result.drift.join('\n')}\n` +
      'Reconcile each pair — decide which copy is correct for the article, ' +
      'then make the other match it.'
  );
});

test('the drift report names no article', async () => {
  const report = await readFile(path.join(OUT_ROOT, DRIFT_REPORT), 'utf8');
  assert.match(report, /^No drift:/);
  assert.doesNotMatch(report, /\.md:/);
});

test('the comparison actually ran against a populated library', () => {
  // Guards the false green where a library read silently yields nothing: with
  // zero `.mmd` sources every fence would drift, so an empty drift list only
  // means something if there was a library to compare against.
  assert.ok(result.libraryCount > 0, 'no .mmd sources were read');
  assert.ok(result.results.length > 0, 'no articles were published');
  assert.ok(
    result.results.some((entry) => entry.diagramCount > 0),
    'no article contributed an in-body fence to compare'
  );
});
