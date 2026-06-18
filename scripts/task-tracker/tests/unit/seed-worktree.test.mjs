#!/usr/bin/env node
// @story #27
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { projectScratchDir, mkdtempOutsideRepo } from '../../lib/scratch-dir.mjs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { seedWorktree, seedMissingTemplates, findMainWorktree } from '../../seed-worktree.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', '..', 'seed-worktree.mjs');

function makeRepo() {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'seed-src-'));
  const cfgDir = path.join(root, '.ai-task-manager');
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(path.join(cfgDir, 'task-tracker.json'), '{"repo":"o/r"}\n');
  writeFileSync(path.join(cfgDir, 'pickup-directive.md'), '# directive\n');
  writeFileSync(path.join(cfgDir, 'definition-of-done.md'), '# dod\n');
  return root;
}

function makeTarget() {
  return mkdtempSync(path.join(projectScratchDir('test'), 'seed-tgt-'));
}

// 1. Success path
{
  const src = makeRepo();
  const tgt = makeTarget();
  const r = seedWorktree({ source: src, target: tgt });
  assert.equal(r.ok, true);
  assert.ok(existsSync(path.join(tgt, '.ai-task-manager', 'task-tracker.json')));
  assert.ok(existsSync(path.join(tgt, '.ai-task-manager', 'pickup-directive.md')));
  assert.ok(existsSync(path.join(tgt, '.ai-task-manager', 'definition-of-done.md')));
  assert.ok(existsSync(path.join(tgt, '.ai-task-manager', 'task-tracker-state.json')));
  const cfg = readFileSync(path.join(tgt, '.ai-task-manager', 'task-tracker.json'), 'utf8');
  assert.match(cfg, /"repo":"o\/r"/);
  rmSync(src, { recursive: true, force: true });
  rmSync(tgt, { recursive: true, force: true });
}

// 2. Refuses to overwrite a populated target
{
  const src = makeRepo();
  const tgt = makeTarget();
  mkdirSync(path.join(tgt, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(tgt, '.ai-task-manager', 'task-tracker.json'), '{"repo":"x/y"}\n');
  assert.throws(() => seedWorktree({ source: src, target: tgt }), /refusing to overwrite/);
  // existing content untouched
  const cfg = readFileSync(path.join(tgt, '.ai-task-manager', 'task-tracker.json'), 'utf8');
  assert.match(cfg, /"repo":"x\/y"/);
  rmSync(src, { recursive: true, force: true });
  rmSync(tgt, { recursive: true, force: true });
}

// 3. Failure on missing source files
{
  const src = makeRepo();
  rmSync(path.join(src, '.ai-task-manager', 'pickup-directive.md'));
  const tgt = makeTarget();
  assert.throws(() => seedWorktree({ source: src, target: tgt }), /missing source file/);
  rmSync(src, { recursive: true, force: true });
  rmSync(tgt, { recursive: true, force: true });
}

// 3b. Failure when source dir missing entirely
{
  const src = mkdtempSync(path.join(projectScratchDir('test'), 'seed-empty-'));
  const tgt = makeTarget();
  assert.throws(
    () => seedWorktree({ source: src, target: tgt }),
    /source \.ai-task-manager not found/
  );
  rmSync(src, { recursive: true, force: true });
  rmSync(tgt, { recursive: true, force: true });
}

// 4. Idempotence: rerun against empty .ai-task-manager dir succeeds
{
  const src = makeRepo();
  const tgt = makeTarget();
  mkdirSync(path.join(tgt, '.ai-task-manager'), { recursive: true });
  const r = seedWorktree({ source: src, target: tgt });
  assert.equal(r.ok, true);
  assert.ok(existsSync(path.join(tgt, '.ai-task-manager', 'task-tracker.json')));
  rmSync(src, { recursive: true, force: true });
  rmSync(tgt, { recursive: true, force: true });
}

// 5. CLI: success exit 0, populated dir exit 1
{
  const src = makeRepo();
  const tgt = makeTarget();
  const r = await pexec('node', [CLI, tgt, '--source', src]);
  assert.match(r.stdout, /seeded/);
  // second run fails
  await assert.rejects(pexec('node', [CLI, tgt, '--source', src]), /Command failed/);
  rmSync(src, { recursive: true, force: true });
  rmSync(tgt, { recursive: true, force: true });
}

// 6. seedMissingTemplates: copies only missing .md files, preserves existing
{
  const src = makeRepo();
  const tgt = makeTarget();
  mkdirSync(path.join(tgt, '.ai-task-manager'), { recursive: true });
  // task-tracker.json already present (mimics git-tracked carry-over in fresh worktree)
  writeFileSync(path.join(tgt, '.ai-task-manager', 'task-tracker.json'), '{"repo":"keep/me"}\n');
  const r = seedMissingTemplates({ source: src, target: tgt });
  assert.equal(r.ok, true);
  assert.deepEqual(r.copied.sort(), ['definition-of-done.md', 'pickup-directive.md']);
  // existing task-tracker.json untouched
  assert.match(
    readFileSync(path.join(tgt, '.ai-task-manager', 'task-tracker.json'), 'utf8'),
    /"repo":"keep\/me"/
  );
  // markdown files seeded
  assert.match(
    readFileSync(path.join(tgt, '.ai-task-manager', 'pickup-directive.md'), 'utf8'),
    /# directive/
  );
  rmSync(src, { recursive: true, force: true });
  rmSync(tgt, { recursive: true, force: true });
}

// 7. seedMissingTemplates: idempotent — no copies when target already populated
{
  const src = makeRepo();
  const tgt = makeTarget();
  mkdirSync(path.join(tgt, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(tgt, '.ai-task-manager', 'pickup-directive.md'), '# user version\n');
  writeFileSync(path.join(tgt, '.ai-task-manager', 'definition-of-done.md'), '# user dod\n');
  const r = seedMissingTemplates({ source: src, target: tgt });
  assert.equal(r.ok, true);
  assert.deepEqual(r.copied, []);
  assert.match(
    readFileSync(path.join(tgt, '.ai-task-manager', 'pickup-directive.md'), 'utf8'),
    /# user version/
  );
  rmSync(src, { recursive: true, force: true });
  rmSync(tgt, { recursive: true, force: true });
}

// 8. seedMissingTemplates: no-op when source missing (does not throw)
{
  const tgt = makeTarget();
  const r = seedMissingTemplates({ source: '/nonexistent/path/xyz', target: tgt });
  assert.equal(r.ok, false);
  rmSync(tgt, { recursive: true, force: true });
}

// 9. findMainWorktree: returns a string for a real git repo, null on non-repo
{
  const r = findMainWorktree(__dir);
  assert.equal(typeof r, 'string', 'returns main worktree path inside a repo');
  // Must be outside any git repo for this assertion. `.tmp/test/` lives
  // inside *this* repo, so use the OS temp dir as the escape hatch.
  const nonRepo = mkdtempOutsideRepo('no-git-');
  assert.equal(findMainWorktree(nonRepo), null, 'returns null outside a git repo');
  rmSync(nonRepo, { recursive: true, force: true });
}

console.log('seed-worktree.test.mjs: all tests passed');
