#!/usr/bin/env node
// Parity contract for the ProviderAdapter registry (#205).
//
// Locks in current Claude and Codex behavior across every capability the
// registry owns. Assertions are explicit literal values — no "any string"
// matchers, no shape checks. A future drift must produce a diff that names
// both the changed capability and the changed value.
//
// One file, one place to update when a capability gains a new value:
//   1. update the adapter under `scripts/providers/{claude,codex}.mjs`
//   2. update the matching EXPECTED_* constant below
//   3. confirm `node scripts/providers/tests/parity.test.mjs` exits 0
//
// Scope (capabilities, both adapters):
//   - installTarget          (where the skill installs)
//   - stateDir               (where AITM persists per-provider state)
//   - transcriptLocator      (homedir-relative native-transcript dir, or null)
//   - sessionIdEnvKeys       (env vars carrying the active session id)
//   - detectionEnvKeys       (env vars whose presence indicates this provider)
//   - hookCapability         (lifecycle hooks supported?)
//   - skillAdapterPath       (canonical adapter SKILL.md path inside the package)
//
// Picked explicit deepStrictEqual over a freeze-snapshot per adapter:
// per-capability assertions name the exact field on failure, which is the
// drift signal we want a future contributor to see immediately.

import { strict as assert } from 'node:assert';

import { getProvider } from '../index.mjs';
import { claudeAdapter } from '../claude.mjs';
import { codexAdapter } from '../codex.mjs';

// ---- Expected values (canonical baseline; update only when a capability
// intentionally changes for that provider). ----

const EXPECTED_CLAUDE = Object.freeze({
  name: 'claude',
  installTarget: '.claude/skills/task',
  stateDir: '.ai-task-manager/claude',
  transcriptLocator: '.claude/projects',
  sessionIdEnvKeys: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'],
  detectionEnvKeys: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'],
  hookCapability: true,
  skillAdapterPath: 'skill/adapters/claude/SKILL.md',
});

const EXPECTED_CODEX = Object.freeze({
  name: 'codex',
  installTarget: '.agents/skills/task',
  stateDir: '.ai-task-manager/codex',
  transcriptLocator: null,
  sessionIdEnvKeys: ['CODEX_SESSION_ID'],
  detectionEnvKeys: ['CODEX_SESSION_ID', 'CODEX_HOME'],
  hookCapability: false,
  skillAdapterPath: 'skill/adapters/codex/SKILL.md',
});

const CAPABILITIES = [
  'installTarget',
  'stateDir',
  'transcriptLocator',
  'sessionIdEnvKeys',
  'detectionEnvKeys',
  'hookCapability',
  'skillAdapterPath',
];

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ---- Per-capability parity (Claude). Both the direct export and the
// registry lookup must agree on every literal value. ----

for (const cap of CAPABILITIES) {
  test(`parity: claude.${cap} matches expected baseline`, () => {
    assert.deepStrictEqual(
      claudeAdapter[cap],
      EXPECTED_CLAUDE[cap],
      `claude.${cap} drifted from documented baseline`
    );
    assert.deepStrictEqual(
      getProvider('claude')[cap],
      EXPECTED_CLAUDE[cap],
      `getProvider('claude').${cap} drifted from documented baseline`
    );
  });
}

// ---- Per-capability parity (Codex). ----

for (const cap of CAPABILITIES) {
  test(`parity: codex.${cap} matches expected baseline`, () => {
    assert.deepStrictEqual(
      codexAdapter[cap],
      EXPECTED_CODEX[cap],
      `codex.${cap} drifted from documented baseline`
    );
    assert.deepStrictEqual(
      getProvider('codex')[cap],
      EXPECTED_CODEX[cap],
      `getProvider('codex').${cap} drifted from documented baseline`
    );
  });
}

// ---- Whole-adapter parity. A second, redundant assertion that catches
// the "added a new capability without updating EXPECTED_*" case: deep-equal
// the full adapter object against the expected map. Extra fields cause
// failure here even if the per-capability loop above missed them. ----

test('parity: full claude adapter object matches expected baseline', () => {
  assert.deepStrictEqual({ ...claudeAdapter }, { ...EXPECTED_CLAUDE });
});

test('parity: full codex adapter object matches expected baseline', () => {
  assert.deepStrictEqual({ ...codexAdapter }, { ...EXPECTED_CODEX });
});

// ---- Run. ----

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
  console.error(`\n${failed} of ${tests.length} parity test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} parity tests passed.`);
