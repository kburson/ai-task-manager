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

test('repository Codex skill matches the scoped installer stub', () => {
  const repositoryStub = readFileSync('.agents/skills/task/SKILL.md', 'utf8');
  assert.equal(repositoryStub, codexStub());
  assert.match(
    repositoryStub,
    /node_modules\/@kburson\/ai-task-manager\/skill\/adapters\/codex\/SKILL\.md/
  );
  assert.doesNotMatch(repositoryStub, /ensure-worktree-seeded|link:self/);
});
