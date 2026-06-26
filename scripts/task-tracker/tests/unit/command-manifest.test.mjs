#!/usr/bin/env node
// @story #556
// Proves the command manifest is the registry's source of truth and that it
// stays in lockstep with the dispatch switch it replaced the regex scrape of.
//
//   1. Shape — every entry declares verb/aliases/description/category/dispatch.
//   2. Alias resolution — end→close, next→promote resolve to their canonical.
//   3. Help & dispatch share the manifest — bin/aitm-registry.mjs#VERBS is the
//      manifest's name set, and groupedListing() (help) lists exactly those.
//   4. Parity / drift guard — the manifest's verb set equals the dispatch
//      switch's `case` labels (minus non-command cases). Neither can drift.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  COMMAND_MANIFEST,
  MANIFEST_INDEX,
  manifestVerbNames,
  resolveVerb,
} from '../../command-manifest.mjs';
import { VERBS, parseVerbs, groupedListing } from '../../../../bin/aitm-registry.mjs';

// --- 1. Every entry is fully declared. -----------------------------------
test('manifest: each entry declares verb, aliases, description, category, dispatch', () => {
  assert.ok(COMMAND_MANIFEST.length > 0, 'manifest must not be empty');
  for (const e of COMMAND_MANIFEST) {
    assert.equal(typeof e.verb, 'string', `verb must be a string: ${JSON.stringify(e)}`);
    assert.ok(e.verb.length > 0, `verb must be non-empty: ${JSON.stringify(e)}`);
    assert.ok(Array.isArray(e.aliases), `${e.verb}: aliases must be an array`);
    assert.ok(
      typeof e.description === 'string' && e.description.length > 0,
      `${e.verb}: description must be a non-empty string`
    );
    assert.ok(
      typeof e.category === 'string' && e.category.length > 0,
      `${e.verb}: category must be a non-empty string`
    );
    assert.ok(
      typeof e.dispatch === 'string' && e.dispatch.length > 0,
      `${e.verb}: dispatch must be a non-empty string`
    );
  }
});

test('manifest: canonical verbs and aliases are globally unique', () => {
  const seen = new Set();
  for (const e of COMMAND_MANIFEST) {
    for (const name of [e.verb, ...e.aliases]) {
      assert.ok(!seen.has(name), `duplicate command name: ${name}`);
      seen.add(name);
    }
  }
});

// --- 2. Alias resolution. -------------------------------------------------
test('manifest: aliases resolve to their canonical verb', () => {
  assert.equal(resolveVerb('end'), 'close', 'end is an alias of close');
  assert.equal(resolveVerb('next'), 'promote', 'next is an alias of promote');
  assert.equal(resolveVerb('close'), 'close', 'canonical resolves to itself');
  assert.equal(resolveVerb('promote'), 'promote', 'canonical resolves to itself');
  assert.equal(resolveVerb('not-a-verb'), null, 'unknown resolves to null');

  // The index maps both the canonical name and each alias to the same entry.
  assert.equal(MANIFEST_INDEX.get('end'), MANIFEST_INDEX.get('close'));
  assert.equal(MANIFEST_INDEX.get('next'), MANIFEST_INDEX.get('promote'));
});

// --- 3. Help and dispatch share the manifest. ----------------------------
test('registry VERBS is exactly the manifest name set', () => {
  assert.deepEqual(
    [...VERBS].sort(),
    [...manifestVerbNames()].sort(),
    'bin/aitm-registry.mjs#VERBS must be the manifest name set'
  );
});

test('groupedListing (help) lists exactly the manifest verbs', () => {
  const { verbs } = groupedListing();
  assert.deepEqual(
    [...verbs].sort(),
    [...manifestVerbNames()].sort(),
    'help output and dispatch routing read the same manifest-backed VERBS'
  );
});

// --- 4. Parity / drift guard. --------------------------------------------
test('manifest verb set equals the dispatch switch case labels', () => {
  const fromSwitch = [...parseVerbs()].sort();
  const fromManifest = [...manifestVerbNames()].sort();
  assert.deepEqual(
    fromManifest,
    fromSwitch,
    'manifest and dispatch switch have drifted — a case label or manifest ' +
      'entry was added without its counterpart'
  );
});
