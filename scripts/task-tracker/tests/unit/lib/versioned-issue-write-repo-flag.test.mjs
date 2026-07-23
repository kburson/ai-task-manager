// @story #696
// Regression: gh spawns in versioned-issue-write.mjs must target the declared
// repo via `-R <repo>` instead of silently resolving from the process CWD.
// The argv builders are pure exports so the contract is directly testable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ghFetchArgs, ghPushArgs } from '../../../lib/versioned-issue-write.mjs';

const REPO = 'kburson/ai-task-manager';

test('ghFetchArgs threads -R <repo> when a repo is provided', () => {
  const argv = ghFetchArgs(REPO, 696);
  assert.deepEqual(argv, ['issue', 'view', '696', '-R', REPO, '--json', 'body', '-q', '.body']);
});

test('ghPushArgs threads -R <repo> when a repo is provided', () => {
  const argv = ghPushArgs(REPO, 696);
  assert.deepEqual(argv, ['issue', 'edit', '696', '-R', REPO, '--body-file', '-']);
});

test('null/undefined repo omits -R from both argv lists (CWD fallback preserved)', () => {
  for (const repo of [null, undefined, '']) {
    assert.deepEqual(ghFetchArgs(repo, 42), [
      'issue',
      'view',
      '42',
      '--json',
      'body',
      '-q',
      '.body',
    ]);
    assert.deepEqual(ghPushArgs(repo, 42), ['issue', 'edit', '42', '--body-file', '-']);
  }
});

test('no gh spawn inside versioned-issue-write.mjs bypasses the argv builders (audit)', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../../../lib/versioned-issue-write.mjs', import.meta.url)),
    'utf8'
  );
  const spawnCalls = src.match(/spawn\(\s*'gh',\s*[^,]+/g) ?? [];
  assert.ok(spawnCalls.length >= 2, `expected >=2 gh spawns, saw ${spawnCalls.length}`);
  for (const call of spawnCalls) {
    assert.match(
      call,
      /spawn\(\s*'gh',\s*gh(Fetch|Push)Args\(/,
      `gh spawn does not route through an argv builder: ${call}`
    );
  }
});
