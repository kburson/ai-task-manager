// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import {
  sandboxWorktreePath,
  defaultCreateWorktree,
} from '../../../../task-tracker/verbs/test.mjs';
import {
  resolveRuntimeRoot,
  assertRuntimeReadable,
} from '../../../../task-tracker/lib/runtime-storage.mjs';
import { readRuntimeJsonRecord } from '../../../../task-tracker/lib/runtime-writer.mjs';
test('registered Test roots are outside volatile artifacts and remain physically admissible', async () => {
  const root = await createActivatedRuntimeRootFixture('test-root-durable-');
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  let target;
  try {
    writeFileSync(path.join(root, '.gitignore'), '.tmp/\n.ai-task-manager/runtime/\n');
    git('add', '.gitignore');
    git(
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-qm',
      'fixture'
    );
    const sha = git('rev-parse', 'HEAD');
    target = sandboxWorktreePath({ projectDir: root, issueNum: 1857, sha, token: '1234-abcdef12' });
    assert.equal(
      path.dirname(target),
      path.join(root, '.ai-task-manager', 'runtime', 'test-sandboxes')
    );
    await defaultCreateWorktree({ projectDir: root, path: target });
    assert.equal(resolveRuntimeRoot({ cwd: target, env: {} }).projectRoot, target);
    assertRuntimeReadable({ projectRoot: target, mainRoot: root });
    assert.deepEqual(
      readRuntimeJsonRecord(
        path.join(
          target,
          '.ai-task-manager',
          'runtime',
          'store',
          'state',
          'task-tracker-queue.json'
        )
      ),
      []
    );
  } finally {
    if (target) {
      try {
        git('worktree', 'remove', '--force', target);
      } catch {}
    }
    rmSync(root, { recursive: true, force: true });
  }
});
