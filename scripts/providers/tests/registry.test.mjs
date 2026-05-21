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
