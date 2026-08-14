#!/usr/bin/env node
// @story #854
// #854 — coverage for the assert-file-excludes.mjs VC evidence helper.
//
// AC/VC evidence commands run through shell-free executors that support
// neither shell negation nor inline eval, so this script is the sanctioned
// "assert this string is gone from this file" primitive. Coverage: absent
// pattern exits 0, present pattern exits 1, missing file exits 1, missing
// args exits 1.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const SCRIPT = new URL('../../../../task-tracker/assert-file-excludes.mjs', import.meta.url)
  .pathname;

function run(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], { stdio: 'pipe' });
    return 0;
  } catch (err) {
    return err.status;
  }
}

test('exits 0 when the pattern is absent from the file', () => {
  const dir = mkdtempSync(join(projectScratchDir('assert-file-excludes'), 'run-'));
  const file = join(dir, 'sample.txt');
  writeFileSync(file, 'nothing relevant here');
  try {
    assert.equal(run(['needle', file]), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 when the pattern is present in the file', () => {
  const dir = mkdtempSync(join(projectScratchDir('assert-file-excludes'), 'run-'));
  const file = join(dir, 'sample.txt');
  writeFileSync(file, 'contains needle right here');
  try {
    assert.equal(run(['needle', file]), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 when the target file does not exist', () => {
  assert.equal(run(['needle', '/nonexistent/path/for/854.txt']), 1);
});

test('exits 1 when arguments are missing', () => {
  assert.equal(run([]), 1);
  assert.equal(run(['only-pattern']), 1);
});
