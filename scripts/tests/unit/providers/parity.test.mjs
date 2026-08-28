#!/usr/bin/env node
// @story #205
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
//   3. confirm `node scripts/tests/unit/providers/parity.test.mjs` exits 0
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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProvider } from '../../../providers/index.mjs';
import { claudeAdapter } from '../../../providers/claude.mjs';
import { codexAdapter } from '../../../providers/codex.mjs';
import { claudeStub, codexStub } from '../../../../bin/cli.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// ---- Expected values (canonical baseline; update only when a capability
// intentionally changes for that provider). ----

const EXPECTED_CLAUDE = Object.freeze({
  name: 'claude',
  installTarget: '.claude/skills/task',
  stateDir: '.tmp/aitm/app/claude',
  transcriptLocator: '.claude/projects',
  transcriptHomeEnv: null,
  transcriptHomeDefault: null,
  transcriptLayout: 'flat',
  transcriptSchema: 'claude-message-v1',
  sessionIdEnvKeys: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'],
  detectionEnvKeys: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID'],
  sessionIdFallback: 'legacy',
  hookCapability: true,
  skillAdapterPath: 'skill/adapters/claude/SKILL.md',
  installRecipe: {
    writer: 'claude-settings',
    hookTarget: '.claude/settings.json',
    commandTarget: '.claude/commands/task.md',
  },
  externalActions: {
    'github.merge-pull-request': {
      adapterContract: 'skill',
      expectedHeadSha: true,
    },
  },
});

const EXPECTED_CODEX = Object.freeze({
  name: 'codex',
  installTarget: '.agents/skills/task',
  stateDir: '.tmp/aitm/app/codex',
  transcriptLocator: '.codex/sessions',
  transcriptHomeEnv: null,
  transcriptHomeDefault: null,
  transcriptLayout: 'date-bucketed',
  transcriptSchema: 'codex-rollout-v1',
  sessionIdEnvKeys: ['CODEX_THREAD_ID', 'CODEX_SESSION_ID'],
  detectionEnvKeys: ['CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CODEX_HOME'],
  sessionIdFallback: 'legacy',
  hookCapability: true,
  skillAdapterPath: 'skill/adapters/codex/SKILL.md',
  installRecipe: {
    writer: 'codex-hooks',
    hookTarget: '.codex/hooks.json',
    commandTarget: null,
  },
  externalActions: {
    'github.merge-pull-request': {
      adapterContract: 'skill',
      expectedHeadSha: true,
    },
  },
});

const CAPABILITIES = [
  'installTarget',
  'stateDir',
  'transcriptLocator',
  'transcriptHomeEnv',
  'transcriptHomeDefault',
  'transcriptLayout',
  'transcriptSchema',
  'sessionIdEnvKeys',
  'detectionEnvKeys',
  'sessionIdFallback',
  'hookCapability',
  'skillAdapterPath',
  'installRecipe',
  'externalActions',
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

test('#939: shared router discovers the deliver JIT rule and installed stubs reach it', () => {
  const router = readFileSync(path.join(REPO_ROOT, 'skill/shared/router.md'), 'utf8');
  const rule = readFileSync(path.join(REPO_ROOT, 'skill/shared/rules/deliver.md'), 'utf8');
  assert.match(router, /`\/task deliver #N`\s*\|\s*`rules\/deliver\.md`/);
  assert.match(rule, /aitm-skill-loaded:rules\/deliver:1\.1\.0/);
  for (const installed of ['.agents/skills/task/SKILL.md', '.claude/skills/task/SKILL.md']) {
    assert.match(
      readFileSync(path.join(REPO_ROOT, installed), 'utf8'),
      /node_modules\/ai-task-manager\/skill\/adapters\/(?:codex|claude)\/SKILL\.md/
    );
  }
});

test('#1381: shared router discovers the provider-neutral incident-ledger rule', () => {
  const router = readFileSync(path.join(REPO_ROOT, 'skill/shared/router.md'), 'utf8');
  const rule = readFileSync(path.join(REPO_ROOT, 'skill/shared/rules/incident-ledger.md'), 'utf8');
  assert.match(router, /`\/task incident-ledger #1381`\s*\|\s*`rules\/incident-ledger\.md`/);
  assert.match(rule, /aitm-skill-loaded:rules\/incident-ledger:1\.0\.0/);
  assert.match(
    rule,
    /verify-delivery-incident-reconciliation\.mjs --issue 1381 \[--phase pre-close\|terminal\]/
  );
  assert.match(rule, /terminal[\s\S]*default/i);
  assert.match(rule, /does not approve the ledger or close anything/i);
  assert.match(rule, /human explicitly approves those exact immutable values/i);
  assert.match(rule, /Never use either mode to create delivery intent, delivery receipt/i);
});

test('#939: checked-in Claude and Codex skills equal installer-generated stubs', () => {
  assert.equal(
    readFileSync(path.join(REPO_ROOT, '.claude/skills/task/SKILL.md'), 'utf8'),
    claudeStub()
  );
  assert.equal(
    readFileSync(path.join(REPO_ROOT, '.agents/skills/task/SKILL.md'), 'utf8'),
    codexStub()
  );
});

test('#939: provider adapters own sanctioned integration wording', () => {
  const codex = readFileSync(path.join(REPO_ROOT, 'skill/adapters/codex/SKILL.md'), 'utf8');
  const claude = readFileSync(path.join(REPO_ROOT, 'skill/adapters/claude/SKILL.md'), 'utf8');
  const grok = readFileSync(path.join(REPO_ROOT, 'skill/adapters/grok/SKILL.md'), 'utf8');
  assert.match(codex, /github\.merge-pull-request[\s\S]*merge_pull_request/);
  assert.match(claude, /github\.merge-pull-request[\s\S]*merge_pull_request/);
  assert.match(grok, /github\.merge-pull-request[\s\S]*missing-capability/);
});

test('#939: delivery rule is an exact, fail-closed host contract', () => {
  const rule = readFileSync(path.join(REPO_ROOT, 'skill/shared/rules/deliver.md'), 'utf8');
  assert.match(
    rule,
    /provider-action envelope[\s\S]*exit `20`[\s\S]*exactly one[\s\S]*at most one\s+provider call/i
  );
  assert.match(
    rule,
    /non-action envelope[\s\S]*non-`20`[\s\S]*zero action lines[\s\S]*never\s+invokes a provider[\s\S]*obey/i
  );
  assert.match(
    rule,
    /mismatched envelope[\s\S]*exit `20` with zero or multiple action lines[\s\S]*non-`20` with one or multiple action lines/i
  );
  assert.match(rule, /retry\s+once[\s\S]*fail closed/i);
  assert.match(
    rule,
    /exit\s+`0`[\s\S]*AITM_DELIVERY_RESULT:[\s\S]*verified[\s\S]*continue to `npx aitm close #N`/i
  );
  assert.match(rule, /parse only the single `AITM_PROVIDER_ACTION_REQUIRED:` line/i);
  const actionKeys = [
    'action',
    'baseRef',
    'commitMessage',
    'commitTitle',
    'expectedHeadSha',
    'headRef',
    'intentId',
    'issueNumber',
    'mergeMethod',
    'prNumber',
    'repository',
    'schema',
  ];
  for (const key of actionKeys) assert.match(rule, new RegExp(`\\b${key}\\b`));
  assert.match(rule, /exactly (?:these|the following) 12 keys/i);
  assert.match(rule, /`schema`[\s\S]*integer[\s\S]*exactly `1`/i);
  assert.match(rule, /`issueNumber` and `prNumber`[\s\S]*positive safe integers/i);
  assert.match(rule, /remaining[\s\S]*strings/i);
  assert.match(rule, /unknown[\s\S]*missing[\s\S]*refuse/i);
  assert.ok(rule.includes('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'));
  assert.match(rule, /equal its own `trim\(\)`[\s\S]*result/i);
  assert.match(rule, /must not start or end with `\/`/i);
  assert.match(rule, /must not contain `\/\/` or `\.\.`/i);
  for (const forbidden of ['`~`', '`^`', '`:`', '`?`', '`*`', '`[`', '`\\`']) {
    assert.match(rule, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(rule, /whitespace/);
  assert.match(rule, /`commitTitle`[\s\S]*starts with exactly\s+`\[#\$\{issueNumber\}\]`/i);
  assert.match(
    rule,
    /`commitMessage`[\s\S]*contains both exact tokens\s+`PR #\$\{prNumber\}` and `\$\{expectedHeadSha\}`/i
  );
  assert.doesNotMatch(rule, /pullRequestNumber/);
  assert.match(rule, /never[^\n]*shell/i);
  assert.match(rule, /success, refusal, timeout, or ambiguity/i);
  assert.match(rule, /live-verified delivery receipt/i);
  assert.match(rule, /AITM_DELIVERY_RESULT:/);
  assert.match(rule, /mode="historical-recovery"/);
  assert.match(
    rule,
    /historical\s+receipt\s+recovery[\s\S]{0,180}never\s+permits\s+a\s+provider[\s\S]{0,30}call/i
  );
  assert.match(rule, /current-head[\s\S]*AITM_PROVIDER_ACTION_REQUIRED:/i);
  assert.match(
    rule,
    /already-merged current-head[\s\S]{0,180}mode="current-head"[\s\S]{0,180}never invoke[\s\S]{0,40}provider/i
  );
  assert.match(rule, /accepted SHA/i);
  assert.match(rule, /cumulative inclusion[\s\S]*(?:not|never)[\s\S]*delivery receipt/i);
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
