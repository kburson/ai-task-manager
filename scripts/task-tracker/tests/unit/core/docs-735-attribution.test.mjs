#!/usr/bin/env node
// @story #735
// Content assertions for the topology-agnostic / message-based commit-attribution
// documentation (#735, last child of epic #727). Verifies that `workflow.md` and
// `CLAUDE.md` describe message-based (not SHA-reachability) attribution and the
// `[#N]` commit-message prefix format, and that `workflow.md` cross-links the epic
// and all six sub-issues. Backs AC38 (docs describe attribution + prefix) and
// AC40 (epic + six sub-issues cross-linked) via `vc-list="vc:1"`.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)) + '/..';
const REPO_ROOT = resolve(HERE, '../../../..');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const workflow = read('docs/guides/workflow.md');
const claudeMd = read('CLAUDE.md');

test('workflow.md documents message-based, topology-agnostic attribution', () => {
  assert.match(workflow, /^##\s+Commit Attribution\s*$/m, 'has a `## Commit Attribution` section');
  assert.match(workflow, /message-based/i, 'names message-based attribution');
  assert.match(workflow, /topology-agnostic/i, 'frames attribution as topology-agnostic');
  assert.match(
    workflow,
    /(not\s+SHA-reachability|not\s+by\s+SHA\s+reachability)/i,
    'contrasts against SHA-reachability'
  );
});

test('workflow.md documents the `[#N]` prefix format + stable grep regex', () => {
  assert.match(workflow, /\[#N\]/, 'names the `[#N]` prefix token');
  assert.match(workflow, /\\\[#\(\\d\+\)\\\]/, 'documents the stable grep regex \\[#(\\d+)\\]');
});

test('workflow.md cross-links epic #727 and all six sub-issues', () => {
  for (const n of [727, 730, 731, 732, 733, 734, 735]) {
    const link = new RegExp(`https://github\\.com/kburson/ai-task-manager/issues/${n}\\b`);
    assert.match(workflow, link, `cross-links issue #${n}`);
  }
});

test('CLAUDE.md describes the message-based `[#N]` attribution prefix', () => {
  assert.match(claudeMd, /^##\s+Commit Attribution\s*$/m, 'has a `## Commit Attribution` section');
  assert.match(claudeMd, /\[#N\]/, 'names the `[#N]` prefix token');
  assert.match(claudeMd, /message-based/i, 'names message-based attribution');
});
