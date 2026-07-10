// @story #728
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import {
  parseMemorySeedFlag,
  parseMemoryBullets,
  filesForMode,
  writeMemorySeed,
} from '../../../../bin/lib/memory-seed-install.mjs';

function tmp() {
  return mkdtempSync(join(projectScratchDir('test'), 'aitm-menu-'));
}

test('parseMemorySeedFlag accepts both = and space forms, rejects garbage', () => {
  assert.equal(parseMemorySeedFlag(['--memory-seed=all']), 'all');
  assert.equal(parseMemorySeedFlag(['--memory-seed=choose']), 'choose');
  assert.equal(parseMemorySeedFlag(['--memory-seed', 'none']), 'none');
  assert.equal(parseMemorySeedFlag(['--memory-seed=bogus']), null);
  assert.equal(parseMemorySeedFlag(['--memory-seed']), null);
  assert.equal(parseMemorySeedFlag(['--other', 'x']), null);
});

test('parseMemoryBullets extracts title/file/hook, filtered to durable members', () => {
  const md = [
    '# Index',
    '',
    '- [First fact](feedback_first.md) — the hook text',
    '- [Second](reference_second.md) — another hook',
    '- [Not durable](MEMORY.md) — meta doc link',
    'not a bullet line',
  ].join('\n');
  const items = parseMemoryBullets(md, ['feedback_first.md', 'reference_second.md']);
  assert.deepEqual(
    items.map((i) => i.file),
    ['feedback_first.md', 'reference_second.md'],
    'only durable-member bullets survive'
  );
  assert.equal(items[0].title, 'First fact');
  assert.equal(items[0].hook, 'the hook text');
});

test('filesForMode: all → durable set, none → empty', () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'feedback_a.md'), 'x');
    writeFileSync(join(dir, 'reference_b.md'), 'x');
    writeFileSync(join(dir, 'MEMORY.md'), 'x');
    writeFileSync(join(dir, 'project_drive_9_tree.md'), 'x');
    assert.deepEqual(filesForMode(dir, 'all'), ['feedback_a.md', 'reference_b.md']);
    assert.deepEqual(filesForMode(dir, 'none'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeMemorySeed copies selected files + writes a filtered MEMORY.md', () => {
  const seedDir = tmp();
  const dest = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_a.md'), 'AAA');
    writeFileSync(join(seedDir, 'reference_b.md'), 'BBB');
    writeFileSync(join(seedDir, 'feedback_c.md'), 'CCC');
    writeFileSync(
      join(seedDir, 'MEMORY.md'),
      [
        '# Index',
        '- [A](feedback_a.md) — hook a',
        '- [B](reference_b.md) — hook b',
        '- [C](feedback_c.md) — hook c',
      ].join('\n')
    );

    const memoryDir = join(dest, 'memory');
    const res = writeMemorySeed({
      seedDir,
      memoryDir,
      selectedFiles: ['feedback_a.md', 'feedback_c.md'],
    });
    assert.equal(res.count, 2);
    assert.ok(existsSync(join(memoryDir, 'feedback_a.md')));
    assert.ok(existsSync(join(memoryDir, 'feedback_c.md')));
    assert.ok(!existsSync(join(memoryDir, 'reference_b.md')), 'unselected file must not copy');

    const filtered = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf8');
    assert.match(filtered, /feedback_a\.md/);
    assert.match(filtered, /feedback_c\.md/);
    assert.doesNotMatch(filtered, /reference_b\.md/, 'unaccepted bullet must be dropped');
    assert.match(filtered, /# Index/, 'non-bullet header lines are preserved');
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
});

test('writeMemorySeed with empty selection writes nothing and reports 0', () => {
  const seedDir = tmp();
  const dest = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_a.md'), 'AAA');
    const memoryDir = join(dest, 'memory');
    const res = writeMemorySeed({ seedDir, memoryDir, selectedFiles: [] });
    assert.equal(res.count, 0);
    assert.ok(!existsSync(memoryDir), 'no memory dir is created for an empty selection');
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
});

test('writeMemorySeed skips a selected file that does not exist on disk', () => {
  const seedDir = tmp();
  const dest = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_a.md'), 'AAA');
    writeFileSync(join(seedDir, 'MEMORY.md'), '- [A](feedback_a.md) — hook');
    const memoryDir = join(dest, 'memory');
    mkdirSync(dest, { recursive: true });
    const res = writeMemorySeed({
      seedDir,
      memoryDir,
      selectedFiles: ['feedback_a.md', 'ghost.md'],
    });
    assert.equal(res.count, 1, 'the phantom file is filtered out');
    assert.deepEqual(res.accepted, ['feedback_a.md']);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
});
