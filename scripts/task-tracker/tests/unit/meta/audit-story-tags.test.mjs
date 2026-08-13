// @story #876

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

test('audit module import does not run the audit or mutate its caller fixture', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-import-');
  const fixture = path.join(cwd, 'scripts/gh/untouched.test.mjs');
  write(cwd, 'scripts/gh/untouched.test.mjs', 'export const untouched = true;\n');
  const auditUrl = pathToFileURL(AUDIT).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { auditStoryTags } from ${JSON.stringify(auditUrl)}; console.log(typeof auditStoryTags);`,
    ],
    { cwd, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'function\n');
  assert.equal(result.stderr, '');
  assert.equal(readFileSync(fixture, 'utf8'), 'export const untouched = true;\n');
});

test('audit rejects a story tag after executable source content', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-malformed-');
  write(cwd, 'scripts/gh/malformed.test.mjs', 'export const malformed = true;\n// @story #876\n');

  const result = runAudit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /scripts\/gh\/malformed\.test\.mjs/);
});

test('audit accepts the cspell preamble followed by a story tag', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-cspell-');
  write(cwd, 'scripts/gh/cspell.test.mjs', '// cspell:ignore metachar\n// @story #876\n');

  const result = runAudit(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('audit accepts a shebang and cspell preamble before a story tag', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-shebang-cspell-');
  write(
    cwd,
    'scripts/gh/cspell-shebang.test.mjs',
    '#!/usr/bin/env node\n// cspell:ignore TOCTOU\n// @story #876\n'
  );

  const result = runAudit(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('audit accepts a CRLF cspell preamble followed by a story tag', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-cspell-crlf-');
  write(cwd, 'scripts/gh/cspell-crlf.test.mjs', '// cspell:ignore metachar\r\n// @story #876\r\n');

  const result = runAudit(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('audit accepts CRLF shebang and cspell preambles before a story tag', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-shebang-cspell-crlf-');
  write(
    cwd,
    'scripts/gh/cspell-shebang-crlf.test.mjs',
    '#!/usr/bin/env node\r\n// cspell:ignore TOCTOU\r\n// @story #876\r\n'
  );

  const result = runAudit(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('audit rejects a shebang after cspell and story header lines', () => {
  const cwd = mkdtempOutsideRepo('audit-story-tags-shebang-late-');
  write(
    cwd,
    'scripts/gh/shebang-late.test.mjs',
    '// cspell:ignore metachar\n// @story #876\n#!/usr/bin/env node\n'
  );

  const result = runAudit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /scripts\/gh\/shebang-late\.test\.mjs/);
});
