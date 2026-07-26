// @story #978
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { classifySeed } from '../../../../../bin/lib/memory-resync-classify.mjs';
import { applyResync } from '../../../../../bin/lib/memory-resync-apply.mjs';
import { readSeedState } from '../../../../../bin/lib/memory-resync-state.mjs';

function tmp() {
  return mkdtempSync(join(projectScratchDir('test'), 'aitm-resync-apply-'));
}

test('applyResync: accepted new/changed files are copied, declined items untouched', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_new.md'), 'NEW CONTENT');
    writeFileSync(join(seedDir, 'feedback_skip.md'), 'SKIPPED CONTENT');
    writeFileSync(
      join(seedDir, 'MEMORY.md'),
      [
        '# Index',
        '- [New](feedback_new.md) — new hook',
        '- [Skip](feedback_skip.md) — skip hook',
      ].join('\n')
    );

    const classification = classifySeed({ seedDir, memoryDir });
    const decisions = { 'feedback_new.md': 'accept', 'feedback_skip.md': 'skip' };
    const result = applyResync({ seedDir, memoryDir, classification, decisions });

    assert.deepEqual(result.copied, ['feedback_new.md']);
    assert.ok(existsSync(join(memoryDir, 'feedback_new.md')));
    assert.equal(readFileSync(join(memoryDir, 'feedback_new.md'), 'utf8'), 'NEW CONTENT');
    assert.ok(!existsSync(join(memoryDir, 'feedback_skip.md')), 'declined new file must not copy');
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('applyResync: accepted deprecated files are removed, declined ones kept', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(memoryDir, 'feedback_remove_me.md'), 'X');
    writeFileSync(join(memoryDir, 'feedback_keep_me.md'), 'Y');

    const classification = classifySeed({ seedDir, memoryDir });
    const decisions = { 'feedback_remove_me.md': 'remove', 'feedback_keep_me.md': 'keep' };
    const result = applyResync({ seedDir, memoryDir, classification, decisions });

    assert.deepEqual(result.removed, ['feedback_remove_me.md']);
    assert.ok(!existsSync(join(memoryDir, 'feedback_remove_me.md')));
    assert.ok(existsSync(join(memoryDir, 'feedback_keep_me.md')));
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('applyResync: MEMORY.md is rewritten from upstream bullets to the resulting accepted set', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_new.md'), 'NEW');
    writeFileSync(
      join(seedDir, 'MEMORY.md'),
      ['# Index', '- [New](feedback_new.md) — a brand new lesson'].join('\n')
    );
    writeFileSync(join(memoryDir, 'feedback_old.md'), 'OLD');
    writeFileSync(
      join(memoryDir, 'MEMORY.md'),
      ['# Index', '- [Old](feedback_old.md) — stale link'].join('\n')
    );

    const classification = classifySeed({ seedDir, memoryDir });
    const decisions = { 'feedback_new.md': 'accept' };
    applyResync({ seedDir, memoryDir, classification, decisions });

    const finalMd = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf8');
    assert.match(
      finalMd,
      /feedback_new\.md/,
      'newly-accepted file gets a bullet from upstream MEMORY.md'
    );
    assert.match(finalMd, /# Index/);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});

test('applyResync: baseline manifest is refreshed to match post-apply on-disk content', () => {
  const seedDir = tmp();
  const memoryDir = tmp();
  try {
    writeFileSync(join(seedDir, 'feedback_new.md'), 'NEW CONTENT');
    writeFileSync(join(seedDir, 'MEMORY.md'), '- [New](feedback_new.md) — hook');

    const classification = classifySeed({ seedDir, memoryDir });
    applyResync({ seedDir, memoryDir, classification, decisions: { 'feedback_new.md': 'accept' } });

    const state = readSeedState(memoryDir);
    assert.ok(state['feedback_new.md'], 'baseline records the newly-accepted file');

    const reclassified = classifySeed({ seedDir, memoryDir });
    assert.deepEqual(reclassified, [{ file: 'feedback_new.md', status: 'unchanged' }]);
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
    rmSync(memoryDir, { recursive: true, force: true });
  }
});
