#!/usr/bin/env node
// @story #1412
// Contract tests for mkdtempProjectIsolated's prototype-and-copy sandbox (#1412).
//
// The helper used to spawn `git init`, `git add` and `git commit` per call —
// ~540 subprocesses across a unit-lane run, the largest single contributor to
// the 1976 git spawns that were saturating the process table and tripping the
// 10s GIT_TIMEOUT_MS in unrelated tests.
//
// It now builds one prototype per process and copies it. That is only safe if
// the copies are genuinely independent repositories rather than second
// references to one, so the independence cases below are the load-bearing part
// of this file — not the spawn-count case.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  mkdtempProjectIsolated,
  sandboxPrototypeBuildCount,
} from '../../../../task-tracker/lib/scratch-dir.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'aitm-test',
  GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
  GIT_COMMITTER_NAME: 'aitm-test',
  GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
};

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV }).trim();
}

test('the sandbox is its own git worktree root', () => {
  const dir = mkdtempProjectIsolated('proto-root-');
  // This is why the helper exists at all: without it, a walker resolving
  // `--show-toplevel` escapes the sandbox and hits the real repo, corrupting
  // live .ai-task-manager state.
  assert.equal(git(dir, ['rev-parse', '--show-toplevel']), realpathSync(dir));
});

test('the sandbox carries exactly one commit on trunk', () => {
  const dir = mkdtempProjectIsolated('proto-commit-');
  assert.equal(git(dir, ['rev-list', '--count', 'HEAD']), '1');
  assert.equal(git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), 'trunk');
});

test('the sandbox carries the package.json and .gitignore the contract promises', () => {
  const dir = mkdtempProjectIsolated('proto-files-');
  assert.equal(readFileSync(path.join(dir, 'package.json'), 'utf8'), '{}\n');
  assert.equal(readFileSync(path.join(dir, '.gitignore'), 'utf8'), '*\n!.gitignore\n');
});

test('two sandboxes are independent repositories, not two views of one', () => {
  const a = mkdtempProjectIsolated('proto-independent-a-');
  const b = mkdtempProjectIsolated('proto-independent-b-');

  assert.notEqual(realpathSync(a), realpathSync(b));
  assert.notEqual(
    git(a, ['rev-parse', '--show-toplevel']),
    git(b, ['rev-parse', '--show-toplevel'])
  );

  // Committing into one must leave the other alone. If the copy shared object
  // storage or a worktree link with the prototype, this is where it shows.
  writeFileSync(path.join(a, '.gitignore'), '*\n!.gitignore\n!only-in-a\n');
  git(a, ['add', '.gitignore']);
  git(a, ['commit', '-q', '--no-verify', '-m', 'second']);

  assert.equal(git(a, ['rev-list', '--count', 'HEAD']), '2');
  assert.equal(
    git(b, ['rev-list', '--count', 'HEAD']),
    '1',
    'sibling sandbox must not see the commit'
  );
});

test('a sandbox is writable and stages files normally after the copy', () => {
  const dir = mkdtempProjectIsolated('proto-write-');
  writeFileSync(path.join(dir, 'tracked.txt'), 'hello\n');
  git(dir, ['add', '-f', 'tracked.txt']);
  git(dir, ['commit', '-q', '--no-verify', '-m', 'add tracked']);
  assert.match(git(dir, ['show', '--name-only', '--pretty=format:', 'HEAD']), /tracked\.txt/);
});

test('the prototype is built at most once per process', () => {
  // Several sandboxes have been created above; the count must still be one.
  // This is the actual saving — every call after the first spawns no git.
  const before = sandboxPrototypeBuildCount();
  mkdtempProjectIsolated('proto-count-a-');
  mkdtempProjectIsolated('proto-count-b-');
  mkdtempProjectIsolated('proto-count-c-');
  assert.equal(sandboxPrototypeBuildCount(), before);
  assert.equal(before, 1);
});

test('the sandbox directory actually exists on disk', () => {
  const dir = mkdtempProjectIsolated('proto-exists-');
  assert.equal(existsSync(dir), true);
  assert.equal(existsSync(path.join(dir, '.git')), true);
});
