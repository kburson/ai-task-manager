#!/usr/bin/env node
// @story #941
// Exercises scripts/maintenance/lint-doc-anchors.mjs — the lint that re-homes the
// two #912 doc-presence tests deleted under this issue. Importing lintDocAnchors
// reaches a repo source module, so this test clears the #866 reach gate (unlike
// the pure readFileSync/assert.match tests it replaces).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';
import {
  lintDocAnchors,
  DOC_ANCHOR_SPECS,
  REPO_ROOT,
} from '../../../maintenance/lint-doc-anchors.mjs';

// Turn a required-anchor regex into a literal line the regex matches. Every
// anchor in the spec is a plain string plus escaped metacharacters (`\+`, `\/`,
// `\.`), so dropping the backslashes yields matching content.
function sampleFor(re) {
  return re.source.replace(/\\/g, '');
}

// Write a doc tree under `root` from a { rel: contents } map.
function seedDocs(root, files) {
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, contents, 'utf8');
  }
}

// Build a { rel: contents } map that satisfies every required anchor and trips no
// forbidden one. `omit` optionally drops one required anchor (by rel + label) so a
// test can assert it is reported missing.
function anchoredDocs(omit = null) {
  const files = {};
  for (const spec of DOC_ANCHOR_SPECS) {
    const lines = spec.required
      .filter((r) => !(omit && omit.rel === spec.rel && omit.label === r.label))
      .map((r) => sampleFor(r.re));
    files[spec.rel] = lines.join('\n') + '\n';
  }
  return files;
}

test('the live repo docs pass lint:doc-anchors', () => {
  assert.deepEqual(lintDocAnchors(REPO_ROOT), []);
});

test('a fully-anchored fixture is clean', () => {
  const root = mkdtempProjectIsolated('doc-anchors-');
  seedDocs(root, anchoredDocs());
  assert.deepEqual(lintDocAnchors(root), []);
});

test('a missing required anchor is reported', () => {
  const spec = DOC_ANCHOR_SPECS[0];
  const dropped = spec.required[spec.required.length - 1];
  const root = mkdtempProjectIsolated('doc-anchors-');
  seedDocs(root, anchoredDocs({ rel: spec.rel, label: dropped.label }));
  const offenders = lintDocAnchors(root);
  assert.ok(
    offenders.some((o) => o.includes('missing anchor') && o.includes(dropped.label)),
    `expected a missing-anchor violation for "${dropped.label}", got ${JSON.stringify(offenders)}`
  );
});

test('a forbidden anchor present is reported', () => {
  const spec = DOC_ANCHOR_SPECS.find((s) => s.forbidden.length > 0);
  assert.ok(spec, 'fixture assumes at least one forbidden anchor exists');
  const root = mkdtempProjectIsolated('doc-anchors-');
  const files = anchoredDocs();
  files[spec.rel] += '\nstale figure ~130s lurks here\n';
  seedDocs(root, files);
  const offenders = lintDocAnchors(root);
  assert.ok(offenders.some((o) => o.includes('forbidden anchor present')));
});

test('an unreadable doc is reported rather than throwing', () => {
  const root = mkdtempProjectIsolated('doc-anchors-');
  // Seed nothing — every required doc is missing.
  const offenders = lintDocAnchors(root);
  assert.ok(offenders.some((o) => o.includes('cannot read')));
});
