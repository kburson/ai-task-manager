// @story #876

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempOutsideRepo } from '../../../lib/scratch-dir.mjs';

const AUDIT = fileURLToPath(new URL('../../audit-story-tags.mjs', import.meta.url));

function write(cwd, rel, content) {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function runAudit(cwd) {
  return spawnSync(process.execPath, [AUDIT], { cwd, encoding: 'utf8' });
}

test('audit rejects an untagged co-located test from the scripts tree', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-untagged-');
  write(cwd, 'scripts/tests/unit/tagged.test.mjs', '// @story #876\n');
  write(cwd, 'scripts/providers/tests/tagged.test.mjs', '// @story #876\n');
  write(cwd, 'scripts/gh/orphan.test.mjs', 'export const orphan = true;\n');

  const result = runAudit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /scripts\/gh\/orphan\.test\.mjs/);
});

test('audit accepts a fully tagged scripts tree', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-tagged-');
  write(cwd, 'scripts/tests/unit/tagged.test.mjs', '// @story #876\n');
  write(cwd, 'scripts/providers/tests/tagged.test.mjs', '// @story #876\n');
  write(cwd, 'scripts/gh/tagged.test.mjs', '// @story #876\n');

  const result = runAudit(cwd);
  assert.equal(result.status, 0, result.stderr);
});
