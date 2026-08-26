// @chore
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { lintBookMarkers } from '../../../../../maintenance/lint-book-markers.mjs';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

async function repo(files) {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'markerlint-'));
  const dir = path.join(root, 'docs', 'articles', 'assets', 'book', 'fragments');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'known.md'), 'bridge\n');
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(root, 'docs', 'articles', name), body);
  }
  return root;
}

test('a clean corpus reports nothing', async () => {
  const root = await repo({
    '01-a.md': '# A\n\n<!-- book:part title="P" -->\n\n## Series Link\n\nx\n',
  });
  try {
    assert.deepEqual(await lintBookMarkers(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an unknown verb is reported with file and line', async () => {
  const root = await repo({
    '01-a.md': '# A\n\n<!-- book:chaptr title="x" -->\n\n## Series Link\n\ny\n',
  });
  try {
    const findings = await lintBookMarkers(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, '01-a.md');
    assert.equal(findings[0].line, 3);
    assert.match(findings[0].message, /unknown marker verb/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an unclosed exclude span is reported', async () => {
  const root = await repo({
    '01-a.md': '# A\n\n<!-- book:exclude -->\n\ndropped\n\n## Series Link\n\ny\n',
  });
  try {
    const findings = await lintBookMarkers(root);
    assert.match(findings[0].message, /unclosed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an include pointing at a missing fragment is reported', async () => {
  const root = await repo({
    '01-a.md': '# A\n\n<!-- book:include path=fragments/gone.md -->\n\n## Series Link\n\ny\n',
  });
  try {
    const findings = await lintBookMarkers(root);
    assert.match(findings[0].message, /fragments\/gone\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unsafe and non-regular include paths are all reported by marker lint', async () => {
  const root = await repo({ '01-a.md': '# placeholder\n' });
  const articlesDir = path.join(root, 'docs', 'articles');
  const bookDir = path.join(articlesDir, 'assets', 'book');
  const fragmentDir = path.join(bookDir, 'fragments');
  try {
    const absolute = path.join(root, 'absolute.md');
    const outside = path.resolve(bookDir, 'fragments/../../outside.md');
    const symlinkTarget = path.join(root, 'symlink-target.md');
    await writeFile(absolute, 'secret');
    await writeFile(outside, 'secret');
    await writeFile(symlinkTarget, 'secret');
    await writeFile(path.join(bookDir, 'glossary.md'), 'sibling');
    await writeFile(path.join(bookDir, 'fragments\\known.md'), 'backslash');
    await mkdir(path.join(fragmentDir, 'directory.md'));
    await symlink(symlinkTarget, path.join(fragmentDir, 'link.md'));
    await writeFile(
      path.join(articlesDir, '01-a.md'),
      `# A

<!-- book:include path=fragments/../../outside.md -->
<!-- book:include path=${absolute} -->
<!-- book:include path=fragments\\known.md -->
<!-- book:include path=glossary.md -->
<!-- book:include path=fragments/./known.md -->
<!-- book:include path=fragments/link.md -->
<!-- book:include path=fragments/directory.md -->

## Series Link

y
`
    );

    const findings = await lintBookMarkers(root);
    assert.equal(findings.length, 7);
    assert.deepEqual(
      findings.map((finding) => finding.line),
      [3, 4, 5, 6, 7, 8, 9]
    );
    for (const finding of findings) {
      assert.match(finding.message, /unsafe book:include path|regular file/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('articles off the spine are not linted', async () => {
  const root = await repo({
    '16-outline.md': '# O\n\n<!-- book:chaptr -->\n\n## Drafting Notes\n\nx\n',
  });
  try {
    assert.deepEqual(await lintBookMarkers(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
