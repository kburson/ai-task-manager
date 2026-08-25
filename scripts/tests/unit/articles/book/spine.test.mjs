// @chore
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { isOnSpine, listSpine } from '../../../../articles/lib/book/spine.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

test('isOnSpine requires a Series Link section', () => {
  assert.equal(isOnSpine('# T\n\n## Series Link\n\nnext.\n'), true);
  assert.equal(isOnSpine('# T\n\n## Drafting Notes\n\nstub.\n'), false);
  assert.equal(isOnSpine('# T\n\nprose about the Series Link idea.\n'), false);
});

test('listSpine returns drafted articles in filename order', async () => {
  const dir = await mkdtemp(path.join(projectScratchDir('test'), 'spine-'));
  try {
    await writeFile(path.join(dir, '02-second.md'), '# Second\n\n## Series Link\n\nx\n');
    await writeFile(path.join(dir, '01-first.md'), '# First\n\n## Series Link\n\nx\n');
    await writeFile(path.join(dir, '16-outline.md'), '# Outline\n\n## Drafting Notes\n\nx\n');
    await writeFile(path.join(dir, 'README.md'), '# Readme\n\n## Series Link\n\nx\n');

    const spine = await listSpine(dir);
    assert.deepEqual(
      spine.map((a) => a.slug),
      ['01-first', '02-second']
    );
    assert.deepEqual(
      spine.map((a) => a.number),
      [1, 2]
    );
    assert.match(spine[0].source, /^# First/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
