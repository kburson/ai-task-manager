// @story #869
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claudeStub, codexStub } from '../../../../../bin/cli.mjs';

test('consumer skill stubs omit dogfood worktree seeding instructions', () => {
  for (const stub of [claudeStub(), codexStub()]) {
    assert.doesNotMatch(stub, /ensure-worktree-seeded/);
    assert.doesNotMatch(stub, /link:self/);
    assert.doesNotMatch(stub, /node_modules\/ai-task-manager\//);
  }
});

test('repository Codex skill retains its Step 0 dogfood bootstrap', () => {
  const repositoryStub = readFileSync('.agents/skills/task/SKILL.md', 'utf8');
  assert.match(repositoryStub, /## Step 0[\s\S]{0,800}ensure-worktree-seeded/);
});
