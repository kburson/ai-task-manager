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

  // Agent stubs installed
  const claudeSkill = path.join(target, '.claude', 'skills', 'task', 'SKILL.md');
  const codexSkill = path.join(target, '.agents', 'skills', 'task', 'SKILL.md');
  assert.ok(existsSync(claudeSkill), 'Claude SKILL.md missing');
  assert.ok(existsSync(codexSkill), 'Codex SKILL.md missing');
  assert.match(readFileSync(claudeSkill, 'utf8'), /skill\/adapters\/claude\/SKILL\.md/, 'Claude stub must point to adapter');
  assert.match(readFileSync(codexSkill, 'utf8'), /skill\/adapters\/codex\/SKILL\.md/, 'Codex stub must point to adapter');

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
  assert.ok(gitignore.includes('.ai-task-manager/task-tracker-state.json'), 'shared state gitignore entry missing');
  assert.ok(gitignore.includes('.ai-task-manager/task-tracker-queue.json'), 'shared queue gitignore entry missing');
  assert.ok(gitignore.includes('.claude/task-tracker-state.json'), 'state gitignore entry missing');
  assert.ok(gitignore.includes('.claude/task-tracker-queue.json'), 'queue gitignore entry missing');

  // Templates written to shared runtime folder
  assert.ok(existsSync(path.join(target, '.ai-task-manager', 'pickup-directive.md')), 'pickup directive missing');
  assert.ok(existsSync(path.join(target, '.ai-task-manager', 'definition-of-done.md')), 'definition of done missing');

  // scripts NOT copied to project
  assert.ok(!existsSync(path.join(target, 'scripts', 'task-tracker')), 'scripts/task-tracker must NOT be copied');
  assert.ok(!existsSync(path.join(target, 'scripts', 'gh')), 'scripts/gh must NOT be copied');

  console.log('install.test.mjs: all assertions passed');
} finally {
  rmSync(target, { recursive: true });
}
