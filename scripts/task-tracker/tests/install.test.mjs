#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', '..', '..', 'bin', 'cli.mjs');

const target = mkdtempSync(path.join(tmpdir(), 'install-test-'));
const codexTarget = mkdtempSync(path.join(tmpdir(), 'install-codex-superpowers-test-'));
const fakeHome = mkdtempSync(path.join(tmpdir(), 'install-codex-superpowers-home-'));

function writeSkill(name) {
  const dir = path.join(
    fakeHome,
    '.claude',
    'plugins',
    'cache',
    'claude-plugins-official',
    'superpowers',
    '5.1.0',
    'skills',
    name
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`, 'utf8');
}

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

  // #70: PreToolUse must include Agent and Edit|Write|NotebookEdit matchers.
  const preToolUse = settings.hooks?.PreToolUse ?? [];
  const hasAgentGuard = preToolUse.some(h =>
    h.matcher === 'Agent' &&
    h.hooks?.some(inner => inner.command?.includes('agent-guard.mjs')));
  assert.ok(hasAgentGuard, 'PreToolUse Agent → agent-guard.mjs missing');
  const hasActivityEdit = preToolUse.some(h =>
    h.matcher === 'Edit|Write|NotebookEdit' &&
    h.hooks?.some(inner => inner.command?.includes('activity-guard.mjs')));
  assert.ok(hasActivityEdit, 'PreToolUse Edit|Write|NotebookEdit → activity-guard.mjs missing');

  // #70: activity-policy.json written with shipped default on first install.
  const policyPath = path.join(target, '.ai-task-manager', 'activity-policy.json');
  assert.ok(existsSync(policyPath), 'activity-policy.json missing on first install');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  assert.ok(Array.isArray(policy.codeGlobs) && policy.codeGlobs.length > 0, 'activity-policy default must include codeGlobs');
  assert.ok(Array.isArray(policy.docGlobs), 'activity-policy default must include docGlobs');

  // #70: Idempotency — re-running install produces zero net change to settings
  // or to activity-policy.json.
  const settingsBefore = readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8');
  const policyBefore = readFileSync(policyPath, 'utf8');
  await pexec('node', [CLI, 'install', '--target', target]);
  const settingsAfter = readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8');
  const policyAfter = readFileSync(policyPath, 'utf8');
  assert.equal(settingsAfter, settingsBefore, 'second install must be a no-op on settings.json');
  assert.equal(policyAfter, policyBefore, 'second install must not touch activity-policy.json');

  // #70: User edits to activity-policy.json must be preserved across re-install.
  const customPolicy = JSON.stringify({ codeGlobs: ['custom/**'], docGlobs: [], testRunners: [], buildCommands: [], codeGlobExcludes: [] }, null, 2);
  writeFileSync(policyPath, customPolicy, 'utf8');
  await pexec('node', [CLI, 'install', '--target', target]);
  assert.equal(readFileSync(policyPath, 'utf8'), customPolicy, 'install must not overwrite an existing activity-policy.json');

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

  assert.ok(!existsSync(path.join(target, 'AGENTS.md')), 'default install must not create AGENTS.md');

  writeSkill('using-superpowers');
  writeSkill('brainstorming');
  writeSkill('verification-before-completion');
  await pexec('node', [CLI, 'install', '--agent', 'codex', '--codex-superpowers', '--target', codexTarget], {
    env: { ...process.env, HOME: fakeHome },
  });
  assert.ok(
    existsSync(path.join(fakeHome, '.codex', 'skills', 'using-superpowers', 'SKILL.md')),
    'Codex Superpowers opt-in must mirror skills to ~/.codex/skills'
  );
  const agents = readFileSync(path.join(codexTarget, 'AGENTS.md'), 'utf8');
  assert.match(agents, /ai-task-manager:codex-superpowers:start/, 'Codex Superpowers opt-in must update repo AGENTS.md');
  assert.match(agents, /using-superpowers/, 'AGENTS.md bootstrap must mention using-superpowers');

  console.log('install.test.mjs: all assertions passed');
} finally {
  rmSync(target, { recursive: true, force: true });
  rmSync(codexTarget, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
}
