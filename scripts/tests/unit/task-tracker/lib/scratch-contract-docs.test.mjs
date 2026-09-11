// @story #1181

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { SCRATCH_REL_PREFIX } from '../../../../task-tracker/paths.mjs';

const root = new URL('../../../../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), 'utf8');

test('scratch ignore boundary tracks only the contract README', () => {
  assert.equal(SCRATCH_REL_PREFIX, '.scratch/');
  const rules = read('.gitignore').split(/\r?\n/);
  assert.ok(rules.includes('.scratch/*'));
  assert.ok(rules.includes('!.scratch/README.md'));
});

test('scratch README declares disposability and helper graduation', () => {
  const contract = read('.scratch/README.md');
  assert.match(contract, /disposable/i);
  assert.match(contract, /nothing in (?:this|the) (?:repository|project) depends on/i);
  assert.match(contract, /scripts\/maintenance\//);
  assert.match(contract, /one[- ]off/i);
});

test('operator guidance distinguishes disposable scratch from runtime output', () => {
  const claude = read('CLAUDE.md');
  assert.match(claude, /\.scratch\/.*disposable/is);
  assert.match(claude, /\.tmp\/.*runtime.*generated/is);
  assert.match(claude, /scripts\/maintenance\//);
  assert.match(claude, /\.tmp\/coverage\//);

  for (const relative of ['docs/guides/settings-guide.md', 'docs/guides/parallel-agents.md']) {
    const guidance = read(relative);
    assert.doesNotMatch(guidance, /canonical scratch directory[^\n]*\.tmp\//i);
    assert.match(guidance, /\.scratch\//);
  }
});

test('governed issue-record and plan guidance follows the two-bucket contract', () => {
  const operatorSurfaces = [
    'README.md',
    'skill/shared/rules/preferences.md',
    'skill/shared/rules/scratch-dirs.md',
    'skill/shared/rules/issue-records.md',
    'skill/shared/rules/review.md',
    'skill/shared/rules/create-issue.md',
    'skill/shared/rules/block.md',
    'skill/shared/rules/plan-mode-backlog.md',
    'skill/adapters/claude/SKILL.md',
    'skill/adapters/codex/SKILL.md',
    'skill/adapters/grok/SKILL.md',
    '.ai-task-manager/templates/references/deep-dive-procedure.md',
    'docs/guides/workflow.md',
    'docs/guides/cloud-development-environments.md',
    'docs/guides/ai-value-framework.md',
    'docs/guides/sub-issue-nesting.md',
  ];
  for (const relative of operatorSurfaces) {
    const guidance = read(relative);
    assert.doesNotMatch(
      guidance,
      /\.tmp\/(?:gh|plan|inspect)\//,
      `${relative} routes disposable operator work into .tmp`
    );
  }

  const claude = read('CLAUDE.md');
  assert.match(claude, /npx aitm issue-body[^\n]*\.scratch\/gh\//);
  assert.match(claude, /\.tmp\/.*runtime.*generated/is);

  const config = read('scripts/task-tracker/config.mjs');
  const scratchHelper = read('scripts/task-tracker/lib/scratch-dir.mjs');
  const help = read('scripts/task-tracker/verbs/help-data.mjs');
  assert.match(config, /scratchDir:\s*['"]\.\/\.scratch\/['"]/);
  assert.match(scratchHelper, /path\.join\(root, ['"]\.scratch['"], slug\)/);
  assert.match(help, /issue-body[^\n]*\.scratch\/gh\//);

  const deepDive = read('.ai-task-manager/templates/references/deep-dive-procedure.md');
  assert.match(deepDive, /npx aitm comment/);
  assert.match(deepDive, /npx aitm mirror-deep-dive/);
  assert.doesNotMatch(deepDive, /^gh issue edit\b/m);
});

test('durable memory points disposable work to .scratch', () => {
  const feedback = read('docs/ai-memory/feedback_scratch_dir_canonical.md');
  const index = read('docs/ai-memory/MEMORY.md');
  assert.match(feedback, /\.scratch\/.*canonical scratch/is);
  assert.match(feedback, /\.tmp\/.*runtime.*generated/is);
  assert.doesNotMatch(feedback, /\.tmp\/.*canonical scratch/i);
  assert.match(index, /\.scratch\/ is the canonical scratch directory/);
  assert.doesNotMatch(index, /\.tmp\/ is the canonical scratch directory/);

  for (const relative of [
    'docs/ai-memory/reference_deep_dive_heading_trap.md',
    'docs/ai-memory/project_259_child_recreate_plan.md',
  ]) {
    const memory = read(relative);
    assert.doesNotMatch(memory, /\.tmp\/[^\n]*(?:scratch|deep-dive scratch)/i);
    assert.match(memory, /\.scratch\//);
  }
});
