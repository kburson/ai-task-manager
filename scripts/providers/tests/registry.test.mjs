#!/usr/bin/env node
// Tests for the ProviderAdapter registry (#201).
//
// Scope:
//   - lookup by name returns the expected adapter
//   - unknown lookup throws
//   - listProviders enumerates both registered adapters
//   - detectProvider honors session-id env signals with a sane default
//   - parity: claude.skillAdapterPath / codex.skillAdapterPath match the
//     hard-coded values that previously lived in bin/* and scripts/*
//   - migrated call sites (bin/cli.mjs, bin/lib/stamp-skill-version.mjs)
//     import skill adapter paths from the registry, not as bare literals

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProvider, listProviders, detectProvider } from '../index.mjs';
import { claudeAdapter } from '../claude.mjs';
import { codexAdapter } from '../codex.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '..', '..', '..');

// Values previously hard-coded across bin/cli.mjs and bin/lib/stamp-skill-version.mjs.
const EXPECTED_CLAUDE_SKILL_PATH = 'skill/adapters/claude/SKILL.md';
const EXPECTED_CODEX_SKILL_PATH = 'skill/adapters/codex/SKILL.md';

// Values previously hard-coded at provider-fork call sites (migrated in #203).
const EXPECTED_CLAUDE_INSTALL_TARGET = '.claude/skills/task';
const EXPECTED_CODEX_INSTALL_TARGET = '.agents/skills/task';
const EXPECTED_CLAUDE_STATE_DIR = '.ai-task-manager/claude';
const EXPECTED_CODEX_STATE_DIR = '.ai-task-manager/codex';
const EXPECTED_CLAUDE_TRANSCRIPT_LOCATOR = '.claude/projects';
const EXPECTED_CODEX_TRANSCRIPT_LOCATOR = null;
const EXPECTED_CLAUDE_SESSION_ID_ENV_KEYS = ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'];
const EXPECTED_CODEX_SESSION_ID_ENV_KEYS = ['CODEX_SESSION_ID'];
const EXPECTED_CLAUDE_DETECTION_ENV_KEYS = ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'];
const EXPECTED_CODEX_DETECTION_ENV_KEYS = ['CODEX_SESSION_ID', 'CODEX_HOME'];
const EXPECTED_CLAUDE_HOOK_CAPABILITY = true;
const EXPECTED_CODEX_HOOK_CAPABILITY = false;

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('getProvider("claude") returns the claude adapter', () => {
  assert.equal(getProvider('claude'), claudeAdapter);
});

test('getProvider("codex") returns the codex adapter', () => {
  assert.equal(getProvider('codex'), codexAdapter);
});

test('getProvider("nope") throws a descriptive error', () => {
  assert.throws(() => getProvider('nope'), /Unknown provider 'nope'/);
});

test('listProviders enumerates both registered names', () => {
  assert.deepEqual(listProviders().sort(), ['claude', 'codex']);
});

test('detectProvider returns codex when CODEX_SESSION_ID is set', () => {
  const adapter = detectProvider({ env: { CODEX_SESSION_ID: 'abc' } });
  assert.equal(adapter.name, 'codex');
});

test('detectProvider returns claude when CLAUDE_SESSION_ID is set', () => {
  const adapter = detectProvider({ env: { CLAUDE_SESSION_ID: 'abc' } });
  assert.equal(adapter.name, 'claude');
});

test('#224: detectProvider returns claude when CLAUDE_CODE_SESSION_ID is set', () => {
  const adapter = detectProvider({ env: { CLAUDE_CODE_SESSION_ID: 'abc' } });
  assert.equal(adapter.name, 'claude');
});

test('detectProvider defaults to claude with no signals', () => {
  const adapter = detectProvider({ env: {} });
  assert.equal(adapter.name, 'claude');
});

test('claude adapter enumerates all six capabilities', () => {
  for (const key of [
    'installTarget',
    'stateDir',
    'transcriptLocator',
    'sessionIdEnvKeys',
    'hookCapability',
    'skillAdapterPath',
  ]) {
    assert.ok(key in claudeAdapter, `claude adapter missing capability: ${key}`);
  }
});

test('codex adapter enumerates all six capabilities', () => {
  for (const key of [
    'installTarget',
    'stateDir',
    'transcriptLocator',
    'sessionIdEnvKeys',
    'hookCapability',
    'skillAdapterPath',
  ]) {
    assert.ok(key in codexAdapter, `codex adapter missing capability: ${key}`);
  }
});

test('parity: claude.skillAdapterPath matches previous hard-coded value', () => {
  assert.equal(claudeAdapter.skillAdapterPath, EXPECTED_CLAUDE_SKILL_PATH);
  assert.equal(getProvider('claude').skillAdapterPath, EXPECTED_CLAUDE_SKILL_PATH);
});

test('parity: codex.skillAdapterPath matches previous hard-coded value', () => {
  assert.equal(codexAdapter.skillAdapterPath, EXPECTED_CODEX_SKILL_PATH);
  assert.equal(getProvider('codex').skillAdapterPath, EXPECTED_CODEX_SKILL_PATH);
});

test('migrated call site: bin/lib/stamp-skill-version.mjs imports getProvider', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'bin', 'lib', 'stamp-skill-version.mjs'), 'utf8');
  assert.match(src, /from ['"].*scripts\/providers\/index\.mjs['"]/);
  assert.ok(
    !/pkgRelPath:\s*['"]skill\/adapters\/claude\/SKILL\.md['"]/.test(src),
    'stamp-skill-version.mjs still hard-codes the claude skill adapter path literal'
  );
});

test('migrated call site: bin/cli.mjs imports getProvider and has no bare adapter literal', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'bin', 'cli.mjs'), 'utf8');
  assert.match(src, /from ['"]\.\.\/scripts\/providers\/index\.mjs['"]/);
  // Bare string literals (not template substitutions) for the adapter paths
  // should be gone. Allow them inside template substitutions / dynamic uses.
  assert.ok(
    !/['"]skill\/adapters\/claude\/SKILL\.md['"]/.test(src),
    'bin/cli.mjs still hard-codes the claude skill adapter path literal'
  );
  assert.ok(
    !/['"]skill\/adapters\/codex\/SKILL\.md['"]/.test(src),
    'bin/cli.mjs still hard-codes the codex skill adapter path literal'
  );
});

// --- #203 capability parity tests ---

test('parity: claude.installTarget matches previous hard-coded value', () => {
  assert.equal(claudeAdapter.installTarget, EXPECTED_CLAUDE_INSTALL_TARGET);
  assert.equal(getProvider('claude').installTarget, EXPECTED_CLAUDE_INSTALL_TARGET);
});

test('parity: codex.installTarget matches previous hard-coded value', () => {
  assert.equal(codexAdapter.installTarget, EXPECTED_CODEX_INSTALL_TARGET);
  assert.equal(getProvider('codex').installTarget, EXPECTED_CODEX_INSTALL_TARGET);
});

test('migrated call site: bin/cli.mjs has no bare install-target literals', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'bin', 'cli.mjs'), 'utf8');
  // The bare literal `.claude/skills/task` and `.agents/skills/task` should
  // no longer appear at call sites (only the registry encodes them).
  assert.ok(
    !/join\([^)]*['"]\.claude['"]\s*,\s*['"]skills['"]\s*,\s*['"]task['"]/.test(src),
    'bin/cli.mjs still constructs .claude/skills/task via bare join() literals'
  );
  assert.ok(
    !/join\([^)]*['"]\.agents['"]\s*,\s*['"]skills['"]\s*,\s*['"]task['"]/.test(src),
    'bin/cli.mjs still constructs .agents/skills/task via bare join() literals'
  );
});

test('parity: claude.stateDir matches previous hard-coded value', () => {
  assert.equal(claudeAdapter.stateDir, EXPECTED_CLAUDE_STATE_DIR);
  assert.equal(getProvider('claude').stateDir, EXPECTED_CLAUDE_STATE_DIR);
});

test('parity: codex.stateDir matches previous hard-coded value', () => {
  assert.equal(codexAdapter.stateDir, EXPECTED_CODEX_STATE_DIR);
  assert.equal(getProvider('codex').stateDir, EXPECTED_CODEX_STATE_DIR);
});

test('parity: claude.transcriptLocator matches previous hard-coded homedir-relative dir', () => {
  assert.equal(claudeAdapter.transcriptLocator, EXPECTED_CLAUDE_TRANSCRIPT_LOCATOR);
});

test('parity: codex.transcriptLocator is null (no homedir fallback)', () => {
  assert.equal(codexAdapter.transcriptLocator, EXPECTED_CODEX_TRANSCRIPT_LOCATOR);
});

test('parity: claude.sessionIdEnvKeys matches previous hard-coded list', () => {
  assert.deepEqual(claudeAdapter.sessionIdEnvKeys, EXPECTED_CLAUDE_SESSION_ID_ENV_KEYS);
});

test('parity: codex.sessionIdEnvKeys matches previous hard-coded list', () => {
  assert.deepEqual(codexAdapter.sessionIdEnvKeys, EXPECTED_CODEX_SESSION_ID_ENV_KEYS);
});

test('parity: claude.detectionEnvKeys matches previous hard-coded list', () => {
  assert.deepEqual(claudeAdapter.detectionEnvKeys, EXPECTED_CLAUDE_DETECTION_ENV_KEYS);
});

test('parity: codex.detectionEnvKeys includes CODEX_HOME (pre-#203 behavior)', () => {
  assert.deepEqual(codexAdapter.detectionEnvKeys, EXPECTED_CODEX_DETECTION_ENV_KEYS);
});

test('detectProvider returns codex when only CODEX_HOME is set (pre-#203 parity)', () => {
  const adapter = detectProvider({ env: { CODEX_HOME: '/tmp/codex' } });
  assert.equal(adapter.name, 'codex');
});

test('parity: claude.hookCapability is true', () => {
  assert.equal(claudeAdapter.hookCapability, EXPECTED_CLAUDE_HOOK_CAPABILITY);
});

test('parity: codex.hookCapability is false', () => {
  assert.equal(codexAdapter.hookCapability, EXPECTED_CODEX_HOOK_CAPABILITY);
});

test('migrated call site: scripts/task-tracker/word-counter.mjs imports from providers registry', () => {
  const src = readFileSync(
    path.join(REPO_ROOT, 'scripts', 'task-tracker', 'word-counter.mjs'),
    'utf8'
  );
  assert.match(src, /from ['"]\.\.\/providers\/index\.mjs['"]/);
  // The bare detection literal `process.env.CODEX_HOME` should no longer
  // appear at the call site (only the registry encodes it).
  assert.ok(
    !/process\.env\.CODEX_HOME/.test(src),
    'word-counter.mjs still hard-codes CODEX_HOME detection'
  );
  // Same for the unified env-key list.
  assert.ok(
    !/['"]CODEX_SESSION_ID['"]\s*,\s*['"]CLAUDE_SESSION_ID['"]/.test(src),
    'word-counter.mjs still hard-codes the unified provider env-key list'
  );
});

test('migrated call site: bin/cli.mjs gates hook install on adapter.hookCapability', () => {
  const src = readFileSync(path.join(REPO_ROOT, 'bin', 'cli.mjs'), 'utf8');
  assert.match(src, /hookCapability/);
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`  ok  ${t.name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${t.name}`);
    console.log(err.stack || err.message);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${tests.length} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} registry tests passed.`);
