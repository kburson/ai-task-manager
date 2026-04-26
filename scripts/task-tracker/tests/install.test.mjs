#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', '..', '..', 'bin', 'cli.mjs');

const target = mkdtempSync(path.join(tmpdir(), 'install-test-'));

try {
  await pexec('node', [CLI, 'install', '--target', target]);

  // Skill files copied
  assert.ok(existsSync(path.join(target, '.claude', 'skills', 'task', 'SKILL.md')), 'SKILL.md missing');
  assert.ok(existsSync(path.join(target, '.claude', 'skills', 'task', 'DESIGN.md')), 'DESIGN.md missing');

  // Stub written, not the original hook
  const stub = path.join(target, '.claude', 'hooks', 'task-tracker.sh');
  assert.ok(existsSync(stub), 'hook stub missing');
  const stubContent = readFileSync(stub, 'utf8');
  assert.ok(stubContent.includes('node_modules'), 'stub must reference node_modules');
  assert.ok(!stubContent.includes('CLAUDE_PROJECT_DIR'), 'stub must not reference CLAUDE_PROJECT_DIR');

  // settings.json patched
  const settings = JSON.parse(readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8'));
  assert.ok(settings.hooks?.SessionStart?.some(h => h.hooks?.some(inner => inner.command?.includes('task-tracker.sh'))), 'SessionStart hook missing');

  // .gitignore entries written
  const gitignore = readFileSync(path.join(target, '.gitignore'), 'utf8');
  assert.ok(gitignore.includes('.claude/task-tracker-state.json'), 'state gitignore entry missing');
  assert.ok(gitignore.includes('.claude/task-tracker-queue.json'), 'queue gitignore entry missing');

  // scripts NOT copied to project
  assert.ok(!existsSync(path.join(target, 'scripts', 'task-tracker')), 'scripts/task-tracker must NOT be copied');
  assert.ok(!existsSync(path.join(target, 'scripts', 'gh')), 'scripts/gh must NOT be copied');

  console.log('install.test.mjs: all assertions passed');
} finally {
  rmSync(target, { recursive: true });
}
