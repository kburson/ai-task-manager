#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { seedWorktree } from '../seed-worktree.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'seed-worktree.mjs');

function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'seed-src-'));
  const cfgDir = path.join(root, '.ai-task-manager');
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(path.join(cfgDir, 'task-tracker.json'), '{"repo":"o/r"}\n');
  writeFileSync(path.join(cfgDir, 'pickup-directive.md'), '# directive\n');
  writeFileSync(path.join(cfgDir, 'definition-of-done.md'), '# dod\n');
  return root;
}

function makeTarget() {
  return mkdtempSync(path.join(tmpdir(), 'seed-tgt-'));
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
  const src = mkdtempSync(path.join(tmpdir(), 'seed-empty-'));
  const tgt = makeTarget();
  assert.throws(() => seedWorktree({ source: src, target: tgt }), /source \.ai-task-manager not found/);
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

console.log('seed-worktree.test.mjs: all tests passed');
