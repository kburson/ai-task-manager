#!/usr/bin/env node
// @story #1512
// Public help, shared policy, and provider adapters must describe one review model.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { VERB_REFERENCE } from '../../../../task-tracker/verbs/help-data.mjs';

const read = (path) => readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('auto help exposes Full-Auto default plus independent manual review choices', () => {
  const auto = VERB_REFERENCE.auto;
  assert.match(auto.summary, /Full-Auto is the default/i);
  assert.match(auto.usage, /manual-plan/);
  assert.match(auto.usage, /manual-code/);
  assert.match(auto.usage, /manual-task/);
  assert.match(
    VERB_REFERENCE.deliver.exitCodes.find(({ code }) => code === 21)?.meaning ?? '',
    /manual code review/i
  );
});

test('shared Full-Auto policy translates the three exact user phrases', () => {
  const policy = read('skill/shared/rules/full-auto.md');
  assert.match(policy, /manual plan review/);
  assert.match(policy, /manual code review/);
  assert.match(policy, /manual task review/);
  assert.match(policy, /CI.*green[\s\S]*request.*reviewer/i);
  assert.match(policy, /do not spawn.*implementation-review agent/i);
  assert.match(policy, /exact.*head.*approval/i);

  const router = read('skill/shared/router.md');
  assert.match(router, /manual plan review.*rules\/full-auto\.md/i);
  assert.match(router, /manual code review.*rules\/full-auto\.md/i);
  assert.match(router, /manual task review.*rules\/full-auto\.md/i);
});

test('all provider adapters point at the canonical Full-Auto policy', () => {
  for (const provider of ['claude', 'codex', 'grok']) {
    assert.match(read(`skill/adapters/${provider}/SKILL.md`), /rules\/full-auto\.md/);
  }
});

test('workflow and settings document the three default-auto gates and reviewer config', () => {
  const workflow = read('docs/guides/workflow.md');
  assert.match(workflow, /three review boundaries/i);
  assert.match(workflow, /gatePullRequestReview/);
  assert.match(workflow, /built-in defaults \(all gates OFF/i);
  assert.doesNotMatch(workflow, /Per-parent prompt/);

  const settings = read('docs/guides/settings-guide.md');
  assert.match(settings, /gatePullRequestReview/);
  assert.match(settings, /manualCodeReviewer/);
  assert.match(settings, /default.*@me/i);
});
