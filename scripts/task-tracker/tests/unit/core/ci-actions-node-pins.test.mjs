#!/usr/bin/env node
// @story #717
// #717 — invariant tests that guard the CI action-pin + Node-version
// modernization. These assert the repository-level configuration that the
// issue's acceptance criteria demand, scanning the whole workflow glob and
// package.json as text so they keep guarding after future edits (a later
// workflow added with a stale @v4 pin, or a reverted engines floor, fails here).
//
// Coverage:
//   - No actions/checkout@v4 or actions/setup-node@v4 pin remains under
//     .github/workflows/; every use of those two actions is @v5.
//   - package.json engines.node is exactly ">=22.15.0".
//   - Fast CI runs the exact floor and current 22.x; slow CI remains on 22.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)) + '/..';
// tests/unit → repo root is four levels up (scripts/task-tracker/tests/unit).
const REPO_ROOT = join(HERE, '..', '..', '..', '..');
const WORKFLOW_DIR = join(REPO_ROOT, '.github', 'workflows');

function workflowFiles() {
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ name: f, text: readFileSync(join(WORKFLOW_DIR, f), 'utf8') }));
}

test('no actions/checkout or actions/setup-node is pinned to @v4', () => {
  const offenders = [];
  for (const { name, text } of workflowFiles()) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/actions\/(checkout|setup-node)@v4\b/.test(line)) {
        offenders.push(`${name}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `stale @v4 action pins found:\n${offenders.join('\n')}`);
});

test('every actions/checkout and actions/setup-node use is pinned to @v5', () => {
  const bad = [];
  for (const { name, text } of workflowFiles()) {
    const uses = text.match(/actions\/(checkout|setup-node)@[\w.-]+/g) || [];
    for (const u of uses) {
      if (!u.endsWith('@v5')) bad.push(`${name}: ${u}`);
    }
  }
  assert.deepEqual(bad, [], `non-@v5 checkout/setup-node pins found:\n${bad.join('\n')}`);
});

test('package.json engines.node is ">=22.15.0"', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.engines?.node, '>=22.15.0');
});

test('ci.yml runs fast at the exact floor and current 22 while slow stays current', () => {
  const text = readFileSync(join(WORKFLOW_DIR, 'ci.yml'), 'utf8');
  assert.match(text, /node-version:\s*\['22\.15\.0', '22'\]/);
  assert.match(text, /node-version:\s*\$\{\{\s*matrix\.node-version\s*\}\}/);
  assert.match(text, /slow:[\s\S]*?node-version:\s*22\b/);
});
