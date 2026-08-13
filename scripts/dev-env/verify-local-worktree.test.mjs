#!/usr/bin/env node
// @story #309
// Local Codex-worktree environment contract tests.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../task-tracker/lib/scratch-dir.mjs';
import { RUNTIME_REL } from '../task-tracker/paths.mjs';

const VERIFIER_URL = new URL('./verify-local-worktree.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const SETUP_SCRIPT = path.join(REPO_ROOT, 'scripts/dev-env/setup-local-worktree.sh');
const OPERATOR_GUIDE = path.join(REPO_ROOT, 'docs/guides/codex-local-worktree-environment.md');

let verifierModule = null;
try {
  verifierModule = await import(VERIFIER_URL);
} catch {
  verifierModule = null;
}

function makeProject() {
  const projectDir = mkdtempSync(path.join(projectScratchDir('test'), 'local-worktree-env-'));
  const trackedFiles = ['.agents/skills/task/SKILL.md', '.codex/hooks.json', RUNTIME_REL.config];

  for (const relativePath of trackedFiles) {
    const absolutePath = path.join(projectDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, '{}\n');
  }

  mkdirSync(path.join(projectDir, 'node_modules'), { recursive: true });
  symlinkSync('..', path.join(projectDir, 'node_modules/ai-task-manager'), 'dir');
  return projectDir;
}

function inspect(projectDir, overrides = {}) {
  assert.equal(
    typeof verifierModule?.inspectLocalWorktreeEnvironment,
    'function',
    'verify-local-worktree.mjs must export inspectLocalWorktreeEnvironment'
  );
  return verifierModule.inspectLocalWorktreeEnvironment({
    projectDir,
    nodeVersion: '25.6.0',
    commandExists: () => true,
    ...overrides,
  });
}

test('exports the local-worktree environment inspector', () => {
  assert.equal(
    typeof verifierModule?.inspectLocalWorktreeEnvironment,
    'function',
    'verify-local-worktree.mjs must export inspectLocalWorktreeEnvironment'
  );
});

test('prints package-lifecycle self-documentation for --help', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(VERIFIER_URL), '--help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verify-local-worktree/);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /Node\.js 22/);
});

test('accepts a complete Node 25 dogfood worktree', () => {
  const projectDir = makeProject();
  try {
    const result = inspect(projectDir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.details.selfLinkTarget, projectDir);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('rejects Node versions below 22', () => {
  const projectDir = makeProject();
  try {
    const result = inspect(projectDir, { nodeVersion: '21.7.3' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes('Node.js 22 or newer')));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('reports every missing required command', () => {
  const projectDir = makeProject();
  try {
    const result = inspect(projectDir, {
      commandExists: (command) => !['gh', 'jq'].includes(command),
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes('gh')));
    assert.ok(result.errors.some((message) => message.includes('jq')));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('reports missing tracked AITM configuration', () => {
  const projectDir = makeProject();
  try {
    rmSync(path.join(projectDir, '.codex/hooks.json'));
    const result = inspect(projectDir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes('.codex/hooks.json')));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('rejects a dogfood link that resolves outside the current worktree', () => {
  const projectDir = makeProject();
  const foreignDir = mkdtempSync(path.join(projectScratchDir('test'), 'foreign-worktree-'));
  try {
    const linkPath = path.join(projectDir, 'node_modules/ai-task-manager');
    rmSync(linkPath);
    symlinkSync(foreignDir, linkPath, 'dir');

    const result = inspect(projectDir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes('current worktree')));
    assert.equal(result.details.selfLinkTarget, foreignDir);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(foreignDir, { recursive: true, force: true });
  }
});

test('setup script installs, repairs, and verifies without binding task work', () => {
  assert.equal(existsSync(SETUP_SCRIPT), true, 'setup-local-worktree.sh must exist');

  const source = readFileSync(SETUP_SCRIPT, 'utf8');
  assert.match(source, /^#!\/usr\/bin\/env bash/);
  assert.ok(statSync(SETUP_SCRIPT).mode & 0o111, 'setup-local-worktree.sh must be executable');

  const installIndex = source.indexOf('npm ci');
  const linkIndex = source.indexOf('npm run link:self');
  const verifyIndex = source.indexOf('node scripts/dev-env/verify-local-worktree.mjs');
  assert.ok(installIndex >= 0, 'setup must run npm ci');
  assert.ok(linkIndex > installIndex, 'self-link repair must run after npm ci');
  assert.ok(verifyIndex > linkIndex, 'environment verification must run after self-link repair');

  assert.doesNotMatch(source, /npx aitm (?:start|resume)/);
  assert.doesNotMatch(source, /npm (?:run )?test/);
});

test('operator guide is standalone for navigating Codex environment settings', () => {
  assert.equal(existsSync(OPERATOR_GUIDE), true, 'codex-local-worktree-environment.md must exist');

  const guide = readFileSync(OPERATOR_GUIDE, 'utf8');
  const requiredPatterns = [
    /Settings[\s\S]*Local environments/i,
    /select.*Worktree/i,
    /scripts\/dev-env\/setup-local-worktree\.sh/,
    /AITM Status/i,
    /Repair Self-Link/i,
    /Fast Tests/i,
    /Full Quality/i,
    /npx aitm start <issue-number>/,
    /git status --short \.codex scripts\/dev-env/,
    /\.worktreeinclude/,
    /node_modules/,
    /\.tmp\/aitm/,
    /detached HEAD/i,
    /Create branch here/i,
    /setup-cloud\.sh/,
    /maintenance-cloud\.sh/,
  ];

  for (const pattern of requiredPatterns) {
    assert.match(guide, pattern);
  }
});
