// @story #978
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { classifySeed } from '../../../../../bin/lib/memory-resync-classify.mjs';
import { recordSeedState } from '../../../../../bin/lib/memory-resync-state.mjs';

function tmp() {
  return mkdtempSync(join(projectScratchDir('test'), 'aitm-resync-classify-'));
}

test('classifySeed: file only upstream is new', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_a.md'), 'AAA');
    const results = classifySeed({ seedDir, memoryDir });
    assert.deepEqual(results, [{ file: 'feedback_a.md', status: 'new' }]);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('classifySeed: file only local is deprecated', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(memoryDir, 'feedback_a.md'), 'AAA');
    const results = classifySeed({ seedDir, memoryDir });
    assert.deepEqual(results, [{ file: 'feedback_a.md', status: 'deprecated' }]);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('classifySeed: identical content on both sides is unchanged', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_a.md'), 'AAA');
    writeFileSync(join(memoryDir, 'feedback_a.md'), 'AAA');
    const results = classifySeed({ seedDir, memoryDir });
    assert.deepEqual(results, [{ file: 'feedback_a.md', status: 'unchanged' }]);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('classifySeed: local matches baseline, upstream diverges → changed', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(memoryDir, 'feedback_a.md'), 'ORIGINAL');
    recordSeedState({ memoryDir, files: ['feedback_a.md'] });
    writeFileSync(join(seedDir, 'feedback_a.md'), 'UPDATED');
    const results = classifySeed({ seedDir, memoryDir });
    assert.deepEqual(results, [{ file: 'feedback_a.md', status: 'changed' }]);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('classifySeed: local diverges from baseline → locally-modified, even when upstream also changed', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(memoryDir, 'feedback_a.md'), 'ORIGINAL');
    recordSeedState({ memoryDir, files: ['feedback_a.md'] });
    writeFileSync(join(memoryDir, 'feedback_a.md'), 'USER EDITED');
    writeFileSync(join(seedDir, 'feedback_a.md'), 'UPDATED UPSTREAM');
    const results = classifySeed({ seedDir, memoryDir });
    assert.deepEqual(results, [{ file: 'feedback_a.md', status: 'locally-modified' }]);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('classifySeed: diff with no recorded baseline conservatively falls back to locally-modified', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_a.md'), 'UPSTREAM');
    writeFileSync(join(memoryDir, 'feedback_a.md'), 'LOCAL, NO BASELINE RECORDED');
    const results = classifySeed({ seedDir, memoryDir });
    assert.deepEqual(results, [{ file: 'feedback_a.md', status: 'locally-modified' }]);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('classifySeed: results are sorted by file name', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_z.md'), 'Z');
    writeFileSync(join(seedDir, 'feedback_a.md'), 'A');
    const results = classifySeed({ seedDir, memoryDir });
    assert.deepEqual(
      results.map((r) => r.file),
      ['feedback_a.md', 'feedback_z.md']
    );
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});
