#!/usr/bin/env node
// @story #717 #1615
// #717 — invariant tests that guard the CI action-pin + Node-version
// modernization. These assert the repository-level configuration that the
// issue's acceptance criteria demand, scanning the whole workflow glob and
// package.json as text so they keep guarding after future edits (a later
// workflow added with a stale @v4 pin, or a reverted engines floor, fails here).
//
// Coverage:
//   - No actions/checkout@v4 or actions/setup-node@v4 pin remains under
//     .github/workflows/; every use of those two actions is @v5.
//   - package.json and the root lockfile engines.node are exactly ">=24".
//   - Every setup-node node-version in ci.yml is either the Node 24 floor or
//     the npm compatibility matrix whose members are checked by #1615.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)) + '/..';
// tests/unit → repo root is four levels up (scripts/tests/unit/task-tracker/unit).
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

test('package metadata requires Node.js 24 or newer', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.engines?.node, '>=24');
  assert.equal(lock.packages?.['']?.engines?.node, '>=24');
});

test('ci.yml setup-node uses the Node 24 floor or governed compatibility matrix', () => {
  const text = readFileSync(join(WORKFLOW_DIR, 'ci.yml'), 'utf8');
  const versions = [...text.matchAll(/node-version:\s*(.+?)\s*$/gm)].map((m) => m[1]);
  assert.ok(versions.length > 0, 'expected at least one node-version in ci.yml');
  for (const v of versions) {
    assert.ok(
      v === '24' || v === '${{ matrix.node }}',
      `expected Node 24 or the governed compatibility matrix, got ${v}`
    );
  }
});
