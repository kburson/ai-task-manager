// @story #728
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { memorySeedFiles } from '../../../../../bin/lib/template-manifest.mjs';
import { durableSeedFiles, EXCLUDE_PATTERNS } from '../../../../../bin/lib/memory-seed-set.mjs';

test('memorySeedFiles() sources the real durable seed from docs/ai-memory', () => {
  // Default (no arg) reads the repo's docs/ai-memory; must include a known
  // durable fact and must NOT include any meta-doc or ephemeral tracker.
  const seed = memorySeedFiles();
  assert.ok(
    seed.includes('feedback_never_fabricate_evidence.md'),
    'a known durable memory-fact file must be part of the seed group'
  );
  for (const meta of ['MEMORY.md', 'EXCLUDED.md', 'DELIVERY.md']) {
    assert.ok(!seed.includes(meta), `meta-doc ${meta} must not be a seed member`);
  }
  assert.ok(
    !seed.some((f) => EXCLUDE_PATTERNS.some((re) => re.test(f))),
    'no ephemeral (drive-tree / integrity-epic) tracker may be a seed member'
  );
});

test('the manifest group excludes archive/, meta-docs, and EXCLUDE_PATTERNS', () => {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-seed-'));
  try {
    // Durable facts (ship) ...
    writeFileSync(join(dir, 'feedback_example.md'), 'x');
    writeFileSync(join(dir, 'reference_example.md'), 'x');
    // ... meta-docs (never ship) ...
    writeFileSync(join(dir, 'MEMORY.md'), 'x');
    writeFileSync(join(dir, 'EXCLUDED.md'), 'x');
    writeFileSync(join(dir, 'DELIVERY.md'), 'x');
    // ... ephemeral trackers matching EXCLUDE_PATTERNS (never ship) ...
    writeFileSync(join(dir, 'project_drive_999_tree.md'), 'x');
    writeFileSync(join(dir, 'project_integrity_epic_42.md'), 'x');
    // ... and an archive/ subdir (non-top-level, never recursed).
    mkdirSync(join(dir, 'archive'));
    writeFileSync(join(dir, 'archive', 'old_fact.md'), 'x');

    const seed = memorySeedFiles(dir);
    assert.deepEqual(
      seed,
      ['feedback_example.md', 'reference_example.md'],
      'only top-level durable facts survive the manifest filter'
    );
    // memorySeedFiles is the manifest surface over the shared durableSeedFiles rule.
    assert.deepEqual(seed, durableSeedFiles(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
