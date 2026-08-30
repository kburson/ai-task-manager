// @story #1293
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import { auditTestEntrypointImports } from '../../tools/audit-test-entrypoint-imports.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const AUDIT = path.join(REPO_ROOT, 'scripts/tests/tools/audit-test-entrypoint-imports.mjs');

function writeFixture(projectRoot, relPath, source = '// fixture\n') {
  const target = path.join(projectRoot, relPath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
}

test('audit reports each executable edge to a discovered entrypoint with stable diagnostics', () => {
  const projectRoot = mkdtempProjectIsolated('audit-test-entrypoint-imports-');
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/static-importer.test.mjs',
    "import './static-target.test.mjs';\n"
  );
  writeFixture(projectRoot, 'scripts/tests/unit/core/static-target.test.mjs');
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/dynamic-importer.test.mjs',
    "await import('./dynamic-target.test.mjs');\n"
  );
  writeFixture(projectRoot, 'scripts/tests/unit/core/dynamic-target.test.mjs');
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/named-export-source.test.mjs',
    "export { value } from './named-target.test.mjs';\n"
  );
  writeFixture(projectRoot, 'scripts/tests/unit/core/named-target.test.mjs');
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/star-export-source.test.mjs',
    "export * from './star-target.test.mjs';\n"
  );
  writeFixture(projectRoot, 'scripts/tests/unit/core/star-target.test.mjs');
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/cross-lane-importer.test.mjs',
    "import '../../slow/core/cross-lane-target.test.mjs';\n"
  );
  writeFixture(projectRoot, 'scripts/tests/slow/core/cross-lane-target.test.mjs');

  assert.deepEqual(auditTestEntrypointImports({ projectRoot }).violations, [
    {
      importer: 'scripts/tests/unit/core/cross-lane-importer.test.mjs',
      target: 'scripts/tests/slow/core/cross-lane-target.test.mjs',
      line: 1,
      kind: 'import',
    },
    {
      importer: 'scripts/tests/unit/core/dynamic-importer.test.mjs',
      target: 'scripts/tests/unit/core/dynamic-target.test.mjs',
      line: 1,
      kind: 'dynamic import',
    },
    {
      importer: 'scripts/tests/unit/core/named-export-source.test.mjs',
      target: 'scripts/tests/unit/core/named-target.test.mjs',
      line: 1,
      kind: 're-export',
    },
    {
      importer: 'scripts/tests/unit/core/star-export-source.test.mjs',
      target: 'scripts/tests/unit/core/star-target.test.mjs',
      line: 1,
      kind: 're-export',
    },
    {
      importer: 'scripts/tests/unit/core/static-importer.test.mjs',
      target: 'scripts/tests/unit/core/static-target.test.mjs',
      line: 1,
      kind: 'import',
    },
  ]);
});

test('audit ignores source-like strings and comments and permits non-discovered helpers', () => {
  const projectRoot = mkdtempProjectIsolated('audit-test-entrypoint-imports-ignored-');
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/importer.test.mjs',
    [
      "// import './comment-target.test.mjs';",
      'const source = "export * from \'./string-target.test.mjs\'";',
      "await import('../../fixtures/helper.mjs');",
    ].join('\n')
  );
  writeFixture(projectRoot, 'scripts/tests/unit/core/comment-target.test.mjs');
  writeFixture(projectRoot, 'scripts/tests/unit/core/string-target.test.mjs');
  writeFixture(projectRoot, 'scripts/tests/fixtures/helper.mjs', 'export const helper = true;\n');

  assert.deepEqual(auditTestEntrypointImports({ projectRoot }).violations, []);
});

test('audit resolves relative specifiers with Node ESM file-URL semantics', () => {
  const projectRoot = mkdtempProjectIsolated('audit-test-entrypoint-imports-url-');
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/query-importer.test.mjs',
    "import './target.test.mjs?duplicate';\n"
  );
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/fragment-importer.test.mjs',
    "await import('./target.test.mjs#duplicate');\n"
  );
  writeFixture(
    projectRoot,
    'scripts/tests/unit/core/encoded-importer.test.mjs',
    `export { value } from './target${String.fromCharCode(37, 50, 69)}test.mjs';\n`
  );
  writeFixture(projectRoot, 'scripts/tests/unit/core/target.test.mjs');

  assert.deepEqual(auditTestEntrypointImports({ projectRoot }).violations, [
    {
      importer: 'scripts/tests/unit/core/encoded-importer.test.mjs',
      target: 'scripts/tests/unit/core/target.test.mjs',
      line: 1,
      kind: 're-export',
    },
    {
      importer: 'scripts/tests/unit/core/fragment-importer.test.mjs',
      target: 'scripts/tests/unit/core/target.test.mjs',
      line: 1,
      kind: 'dynamic import',
    },
    {
      importer: 'scripts/tests/unit/core/query-importer.test.mjs',
      target: 'scripts/tests/unit/core/target.test.mjs',
      line: 1,
      kind: 'import',
    },
  ]);
});

test('audit CLI fails with stable importer, target, and source-line diagnostics', () => {
  const projectRoot = mkdtempProjectIsolated('audit-test-entrypoint-imports-cli-');
  writeFixture(
    projectRoot,
    'scripts/tests/integration/core/importer.test.mjs',
    "import './target.test.mjs';\n"
  );
  writeFixture(projectRoot, 'scripts/tests/integration/core/target.test.mjs');

  const result = spawnSync(process.execPath, [AUDIT], { cwd: projectRoot, encoding: 'utf8' });

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /scripts\/tests\/integration\/core\/importer\.test\.mjs:1 import -> scripts\/tests\/integration\/core\/target\.test\.mjs/
  );
});
