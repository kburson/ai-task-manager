// @story #1671
// @story #2084

import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';

import { resolveDocumentationReference } from '../../../../../guidance/documentation.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

test('documentation references resolve explicit anchors and duplicate heading slugs', () => {
  const packageRoot = mkdtempProjectIsolated('guidance-docs-');
  const docs = path.join(packageRoot, 'docs', 'guides');
  mkdirSync(docs, { recursive: true });
  writeFileSync(
    path.join(docs, 'sample.md'),
    '# Repeated Heading\n\n# Repeated Heading\n\n<a id="manual-anchor"></a>\n'
  );
  for (const anchor of ['repeated-heading', 'repeated-heading-1', 'manual-anchor']) {
    assert.equal(
      resolveDocumentationReference({ path: 'docs/guides/sample.md', anchor }, { packageRoot }).ok,
      true,
      anchor
    );
  }
  assert.equal(
    resolveDocumentationReference(
      { path: 'docs/guides/sample.md', anchor: 'repeated-heading-2' },
      { packageRoot }
    ).code,
    'documentation-anchor-missing'
  );
});

test('documentation references reject symlinks escaping the package', () => {
  const packageRoot = mkdtempProjectIsolated('guidance-docs-');
  const docs = path.join(packageRoot, 'docs', 'guides');
  mkdirSync(docs, { recursive: true });
  symlinkSync(path.join(process.cwd(), 'README.md'), path.join(docs, 'escape.md'));
  assert.equal(
    resolveDocumentationReference({ path: 'docs/guides/escape.md' }, { packageRoot }).code,
    'documentation-path-escape'
  );
});

test('fenced Markdown headings do not create documentation anchors', () => {
  const packageRoot = mkdtempProjectIsolated('guidance-docs-');
  const docs = path.join(packageRoot, 'docs', 'guides');
  mkdirSync(docs, { recursive: true });
  writeFileSync(path.join(docs, 'sample.md'), '```md\n# Example Only\n```\n# Actual\n');
  assert.equal(
    resolveDocumentationReference(
      { path: 'docs/guides/sample.md', anchor: 'example-only' },
      { packageRoot }
    ).code,
    'documentation-anchor-missing'
  );
  assert.equal(
    resolveDocumentationReference(
      { path: 'docs/guides/sample.md', anchor: 'actual' },
      { packageRoot }
    ).ok,
    true
  );
});

test('documentation references preserve canonical roots through directory aliases', () => {
  const fixture = mkdtempProjectIsolated('guidance-docs-alias-');
  const packageRoot = path.join(fixture, 'package');
  const alias = path.join(fixture, 'alias');
  mkdirSync(path.join(packageRoot, 'docs', 'guides'), { recursive: true });
  writeFileSync(path.join(packageRoot, 'docs', 'guides', 'sample.md'), '# Allowed\n');
  symlinkSync(packageRoot, alias, 'dir');
  try {
    assert.equal(
      resolveDocumentationReference({ path: 'docs/guides/sample.md' }, { packageRoot: alias }).ok,
      true
    );
    symlinkSync(
      path.join(process.cwd(), 'README.md'),
      path.join(packageRoot, 'docs', 'guides', 'escape.md')
    );
    assert.equal(
      resolveDocumentationReference({ path: 'docs/guides/escape.md' }, { packageRoot: alias }).code,
      'documentation-path-escape'
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('symlink parent roots cannot gain the exact shipped-root permission boundary', () => {
  const root = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/[\\/]$/, '');
  const fixture = mkdtempProjectIsolated('guidance-docs-parent-');
  const sandbox = createSandbox();
  const link = path.join(fixture, 'alias');
  symlinkSync(sandbox.root, link, 'dir');
  const depth = path.relative(root, link).split(path.sep).length;
  const alias = [link, ...Array(depth).fill('..')].join(path.sep);
  try {
    assert.equal(path.resolve(alias), root);
    const result = sandbox.probe(`
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const native = fs.realpathSync.native;
      fs.realpathSync = Object.assign((...args) => native(...args), { native });
      syncBuiltinESMExports();
      const { resolveDocumentationReference } = await import(${JSON.stringify(new URL('../../../../../guidance/documentation.mjs', import.meta.url).href)});
      assert.equal(resolveDocumentationReference({ path: 'docs/guides/workflow.md' }, { packageRoot: ${JSON.stringify(alias)} }).code, 'documentation-path-missing');
    `);
    assert.equal(result.exitCode, 0, result.stderr);
  } finally {
    sandbox.dispose();
    rmSync(fixture, { recursive: true, force: true });
  }
});
