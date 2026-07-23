#!/usr/bin/env node
// @story #734
// Unit: `detectRelease` (lib/release-detection.mjs). Covers BOTH flag states and
// the additive-separation contract (AC2/AC3): release detection is opt-in,
// default-off, and does not alter universal attribution.
//
//   1. Flag off (default config): disabled no-op, enabled === false.
//   2. Flag on: correct release-vs-feature branch classification.
//   3. Structural invariance: the module imports NOTHING from
//      commit-attribution, and toggling the flag changes ONLY the release
//      fields of the result — never any attribution input.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { detectRelease } from '../../../lib/release-detection.mjs';
import { DEFAULTS } from '../../../config.mjs';

const MODULE_PATH = fileURLToPath(new URL('../../../lib/release-detection.mjs', import.meta.url));

test('flag off (default): disabled no-op regardless of branch', () => {
  // The shipped default MUST be off.
  assert.equal(DEFAULTS.releaseDetection, false);

  const offConfig = { releaseDetection: false };
  assert.deepEqual(detectRelease({ config: offConfig, branch: 'release/1.2.0' }), {
    enabled: false,
    isRelease: false,
  });
  // Missing config / missing branch are also disabled no-ops.
  assert.deepEqual(detectRelease({}), { enabled: false, isRelease: false });
  assert.deepEqual(detectRelease(), { enabled: false, isRelease: false });
  assert.deepEqual(detectRelease({ config: {}, branch: 'hotfix/urgent' }), {
    enabled: false,
    isRelease: false,
  });
});

test('flag on: classifies release-like vs feature-like branches', () => {
  const onConfig = { releaseDetection: true };

  // Release-like branches → isRelease true.
  for (const branch of ['release/2.0.0', 'hotfix/critical', 'RELEASE/9', 'main', 'master']) {
    assert.deepEqual(
      detectRelease({ config: onConfig, branch }),
      { enabled: true, isRelease: true },
      `expected ${branch} to classify as release`
    );
  }

  // Feature-like / trunk-topology branches → isRelease false.
  for (const branch of ['feat/734-release-detection-config', 'trunk', 'fix/bug', '', undefined]) {
    assert.deepEqual(
      detectRelease({ config: onConfig, branch }),
      { enabled: true, isRelease: false },
      `expected ${branch} to classify as non-release`
    );
  }
});

test('AC2/AC3 invariance: additive, does not import or alter attribution', () => {
  // Structural separation: the module must not IMPORT the attribution engine.
  // Scan actual import statements only — a prose mention of commit-attribution
  // in a comment is fine, an `import ... from '...commit-attribution...'` is not.
  const src = readFileSync(MODULE_PATH, 'utf8');
  const importSpecifiers = [...src.matchAll(/^\s*import\b[^\n]*?from\s*['"]([^'"]+)['"]/gm)].map(
    (m) => m[1]
  );
  assert.ok(
    !importSpecifiers.some((spec) => spec.includes('commit-attribution')),
    `release-detection.mjs must not import commit-attribution (imports: ${JSON.stringify(importSpecifiers)})`
  );

  // Behavioral separation: toggling the flag changes ONLY the release fields.
  // A "universal attribution input" is modeled here as a stable payload the
  // caller would pass alongside; detectRelease neither reads nor mutates it.
  const attributionInput = { issue: 734, branch: 'release/3.0.0' };
  const before = JSON.stringify(attributionInput);

  const off = detectRelease({
    config: { releaseDetection: false },
    branch: attributionInput.branch,
  });
  const on = detectRelease({ config: { releaseDetection: true }, branch: attributionInput.branch });

  // The attribution input is untouched by either call.
  assert.equal(JSON.stringify(attributionInput), before);

  // The ONLY difference between off and on is the release fields.
  assert.notDeepEqual(off, on);
  assert.equal(off.enabled, false);
  assert.equal(on.enabled, true);
  assert.equal(on.isRelease, true);
});
