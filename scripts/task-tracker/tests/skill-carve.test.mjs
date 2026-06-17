#!/usr/bin/env node
// @story #115
// Asserts the structural invariants of the JIT skill loader carved in #115.
// Each assertion corresponds to an Acceptance Criterion.

import { strict as assert } from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, '..', '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const lines = (rel) => read(rel).split('\n').length;

// AC: router exists, ≤120 lines, contains hard rules + routing table.
assert.ok(existsSync(path.join(REPO, 'skill/shared/router.md')), 'router.md exists');
assert.ok(lines('skill/shared/router.md') <= 120, 'router ≤120 lines');
const router = read('skill/shared/router.md');
assert.match(router, /Hard cross-cutting rules/i);
assert.match(router, /Verb.*rule.?file routing/i);
assert.match(router, /aitm-skill-version/);

// AC: rules/ directory with all expected files, each carrying a sentinel.
const expectedRules = [
  'bind.md',
  'review.md',
  'close.md',
  'state-walk.md',
  'plan-mode-backlog.md',
  'config-init.md',
  'parallel.md',
  'preferences.md',
  'commit-trail.md',
  'hooks.md',
];
const rulesDir = path.join(REPO, 'skill/shared/rules');
const ruleFiles = readdirSync(rulesDir);
for (const f of expectedRules) {
  assert.ok(ruleFiles.includes(f), `rule file ${f} exists`);
  const body = read(`skill/shared/rules/${f}`);
  assert.match(body, /aitm-skill-version/, `${f} carries aitm-skill-version sentinel`);
  assert.match(body, /aitm-skill-loaded:rules\//, `${f} emits aitm-skill-loaded sentinel`);
}

// AC: shared/SKILL.md reduced to redirect stub.
assert.ok(lines('skill/shared/SKILL.md') <= 20, 'shared/SKILL.md ≤20 lines (redirect stub)');
assert.match(read('skill/shared/SKILL.md'), /router\.md/);

// AC: both adapters point at shared/router.md and resolve same Tier-2 rules.
const claudeAdapter = read('skill/adapters/claude/SKILL.md');
const codexAdapter = read('skill/adapters/codex/SKILL.md');
assert.match(claudeAdapter, /shared\/router\.md/);
assert.match(codexAdapter, /shared\/router\.md/);
// Neither adapter forks Tier-2 contracts (no rules/*.md path references unique to one side).
const claudeRuleRefs = [...claudeAdapter.matchAll(/skill\/shared\/rules\/[^\s)]+/g)].map(
  (m) => m[0]
);
const codexRuleRefs = [...codexAdapter.matchAll(/skill\/shared\/rules\/[^\s)]+/g)].map((m) => m[0]);
assert.deepEqual(claudeRuleRefs.sort(), codexRuleRefs.sort(), 'adapters reference same rule files');

// AC: Tier-0 shim has aitm-skill-version marker.
assert.match(read('skill/SKILL.md'), /<!--\s*aitm-skill-version:\s*\d+\.\d+\.\d+\s*-->/);

// AC: measure-context.mjs exists and exposes --idle, --invoked, --active flags.
const mc = read('scripts/task-tracker/measure-context.mjs');
assert.match(mc, /--idle/);
assert.match(mc, /--invoked/);
assert.match(mc, /--active/);

// AC: measure-context budgets pass (delegates to programmatic API).
const { measure, BUDGETS } = await import('../measure-context.mjs');
assert.equal(measure({ mode: 'idle' }).status, 'OK');
assert.ok(measure({ mode: 'idle' }).total <= BUDGETS.idle);
assert.equal(measure({ mode: 'invoked', adapter: 'claude' }).status, 'OK');
assert.equal(measure({ mode: 'invoked', adapter: 'codex' }).status, 'OK');
assert.equal(measure({ mode: 'active' }).status, 'OK');

// AC: docs/DESIGN.md describes the three-tier loading model.
const design = read('docs/DESIGN.md');
assert.match(design, /Skill loading model/);
assert.match(design, /Tier 0/);
assert.match(design, /Tier 1/);
assert.match(design, /Tier 2/);

console.log('skill-carve.test.mjs OK');
