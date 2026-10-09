// @story #1857
// Cache identity must match the full Git HEAD required by durable evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCommittedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
import { runVerifiers } from '../../../../task-tracker/lib/evidence-runner.mjs';
initializeFixtureActor(import.meta.url);
const pexec = promisify(execFile);

test('a real clean Git HEAD publishes reusable full-SHA durable verifier evidence', async () => {
  const root = await createCommittedRuntimeRootFixture('verifier-full-head-');
  try {
    // This fixture contains a single trivial test, never the repository suite.
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        private: true,
        scripts: { test: 'node -e "console.log(123)"' },
      })
    );
    writeFileSync(join(root, '.gitignore'), '.ai-task-manager/\n.tmp/\n');
    await pexec('git', ['add', 'package.json', '.gitignore'], { cwd: root });
    await pexec(
      'git',
      [
        '-c',
        'user.name=fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '-m',
        'fixture verifier',
      ],
      { cwd: root }
    );
    const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { cwd: root });
    const head = stdout.trim();
    const options = {
      commands: ['npm test'],
      pexec,
      cwd: root,
      cache: { dir: join(root, '.ai-task-manager/runtime/store') },
    };
    const first = await runVerifiers(options);
    assert.equal(first.allPassed, true);
    assert.equal(first.sha, head);
    assert.equal(first.ran[0].cached, false);
    const stored = JSON.parse(
      readFileSync(join(root, '.ai-task-manager/runtime/store/cache/verifier-results.json'), 'utf8')
    );
    assert.equal(stored.entries['npm test ' + head].sha, head);
    const repeated = await runVerifiers(options);
    assert.equal(repeated.allPassed, true);
    assert.equal(repeated.ran[0].cached, true);
    assert.equal(repeated.ran[0].ts, first.ran[0].ts);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
