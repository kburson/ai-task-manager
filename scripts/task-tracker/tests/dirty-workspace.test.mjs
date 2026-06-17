#!/usr/bin/env node
// @story #46
// Unit tests for scripts/gh/lib/dirty-workspace.mjs

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import { join } from 'node:path';
import {
  checkDirty,
  formatSummary,
  shortAuditDescription,
  DEFAULT_TRUNCATE_LINES,
  DEFAULT_AUDIT_LINES,
} from '../../gh/lib/dirty-workspace.mjs';

const tmp = mkdtempSync(join(projectScratchDir('test'), 'aitm-dirty-'));

try {
  // 1. checkDirty: clean (empty stdout)
  {
    const r = await checkDirty({ cwd: tmp, runner: async () => '' });
    assert.equal(r.dirty, false);
    assert.equal(r.total, 0);
    assert.deepEqual(r.lines, []);
  }

  // 2. checkDirty: dirty with multiple porcelain entry types
  {
    const out =
      ' M scripts/foo.mjs\n?? tmp/scratch.md\n D src/old.ts\nA  src/new.ts\nR  src/a.ts -> src/b.ts\n';
    const r = await checkDirty({ cwd: tmp, runner: async () => out });
    assert.equal(r.dirty, true);
    assert.equal(r.total, 5);
    assert.equal(r.lines[0], ' M scripts/foo.mjs');
    assert.equal(r.lines[4], 'R  src/a.ts -> src/b.ts');
  }

  // 3. checkDirty: missing cwd returns skipped
  {
    const r = await checkDirty({
      cwd: '/nonexistent/path/zzz-aitm',
      runner: async () => 'should not run',
    });
    assert.equal(r.dirty, false);
    assert.equal(r.skipped, true);
  }

  // 4. checkDirty: runner throws -> skipped (best-effort)
  {
    const r = await checkDirty({
      cwd: tmp,
      runner: async () => {
        throw new Error('git missing');
      },
    });
    assert.equal(r.dirty, false);
    assert.equal(r.skipped, true);
  }

  // 5. checkDirty: handles CR line endings
  {
    const r = await checkDirty({ cwd: tmp, runner: async () => ' M a.ts\r\n?? b.ts\r\n' });
    assert.equal(r.total, 2);
    assert.equal(r.lines[0], ' M a.ts');
  }

  // 6. formatSummary: under cap shows all
  {
    const lines = Array.from({ length: 3 }, (_, i) => ` M file${i}.ts`);
    const s = formatSummary({ lines, total: 3 });
    assert.equal(s.split('\n').length, 3);
    assert.ok(!s.includes('more'));
  }

  // 7. formatSummary: at cap (10) shows all without footer
  {
    const lines = Array.from({ length: 10 }, (_, i) => ` M file${i}.ts`);
    const s = formatSummary({ lines, total: 10 });
    assert.equal(s.split('\n').length, 10);
    assert.ok(!s.includes('more'));
  }

  // 8. formatSummary: over cap (15) shows 10 + truncation footer
  {
    const lines = Array.from({ length: 15 }, (_, i) => ` M file${i}.ts`);
    const s = formatSummary({ lines, total: 15 });
    const parts = s.split('\n');
    assert.equal(parts.length, 11);
    assert.match(parts[10], /\+5 more.*total 15/);
  }

  // 9. formatSummary: respects custom max
  {
    const lines = Array.from({ length: 6 }, (_, i) => ` M file${i}.ts`);
    const s = formatSummary({ lines, total: 6 }, { max: 3 });
    assert.equal(s.split('\n').length, 4);
    assert.match(s, /\+3 more/);
  }

  // 10. shortAuditDescription: under audit cap
  {
    const lines = [' M a.ts', ' M b.ts'];
    const d = shortAuditDescription({ lines, total: 2 });
    assert.equal(d, 'dirty=2: M a.ts; M b.ts');
  }

  // 11. shortAuditDescription: over audit cap appends remainder
  {
    const lines = Array.from({ length: 8 }, (_, i) => ` M f${i}.ts`);
    const d = shortAuditDescription({ lines, total: 8 });
    assert.match(d, /^dirty=8:/);
    assert.match(d, /\+3 more/);
  }

  // 12. exports sensible defaults
  {
    assert.equal(DEFAULT_TRUNCATE_LINES, 10);
    assert.equal(DEFAULT_AUDIT_LINES, 5);
  }

  console.log('dirty-workspace: ok');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
