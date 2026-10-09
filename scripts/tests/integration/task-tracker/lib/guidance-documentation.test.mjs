// @story #1671

import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

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
