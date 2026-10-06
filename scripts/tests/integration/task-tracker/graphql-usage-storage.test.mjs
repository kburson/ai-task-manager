// @story #1836
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as usage from '../../../task-tracker/lib/graphql-usage/index.mjs';
import { repository } from '../../helpers/graphql-usage/fixture.mjs';
const exec = promisify(execFile);

test('gitdir worktrees and symlink aliases share canonical root, old git fallback resolves against consumer cwd', async (t) => {
  const { cwd, base, git } = await repository(t);
  const linked = path.join(base, 'linked');
  git('worktree', 'add', '-b', 'linked', linked);
  const main = await usage.resolveUsageRoot(cwd);
  const secondary = await usage.resolveUsageRoot(linked);
  assert.equal(main.available, true);
  assert.equal(main.root, secondary.root);
  assert.notEqual(main.worktreeId, secondary.worktreeId);
  const alias = path.join(base, 'alias');
  await fs.symlink(cwd, alias);
  assert.equal((await usage.resolveUsageRoot(alias)).commonRootId, main.commonRootId);
  const old = await usage.resolveUsageRoot(linked, {
    runGit: async (args, commandCwd) => {
      assert.equal(commandCwd, linked);
      if (args.includes('--path-format=absolute')) throw new Error('unsupported');
      return (await exec('git', args, { cwd: commandCwd })).stdout;
    },
  });
  assert.equal(old.root, main.root);
  assert.equal(
    (await usage.resolveUsageRoot(cwd, { runGit: async () => '--unsupported\n' })).available,
    false
  );
  const nonGit = await usage.resolveUsageRoot(base, {
    runGit: async (args, commandCwd) =>
      (
        await exec('git', args, {
          cwd: commandCwd,
          env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(base) },
        })
      ).stdout,
  });
  assert.equal(nonGit.available, false);
});

test('two worktrees, multiple sessions and short-lived process writers preserve every complete observation', async (t) => {
  const { cwd, base, git } = await repository(t);
  const linked = path.join(base, 'linked');
  git('worktree', 'add', '-b', 'linked', linked);
  const a = await usage.enrollUsage({ cwd, permissionContext: 'fixture' });
  const b = await usage.enrollUsage({ cwd, permissionContext: 'fixture' });
  const c = await usage.enrollUsage({ cwd: linked, permissionContext: 'fixture' });
  const moduleURL = new URL('../../../task-tracker/lib/graphql-usage/index.mjs', import.meta.url)
    .href;
  const fixtureURL = new URL('../../helpers/graphql-usage/observation.mjs', import.meta.url).href;
  const program = `import { enrollUsage, createUsageWriter } from ${JSON.stringify(moduleURL)};
    import { observation } from ${JSON.stringify(fixtureURL)};
    const e = await enrollUsage({ cwd: process.cwd(), permissionContext: 'fixture', descendant: true, env: process.env });
    const w = await createUsageWriter(e);
    await Promise.all(Array.from({length: 20}, (_, i) => w.append(observation(e.context, process.env.CALL_PREFIX + i))));
    await w.close();`;
  await Promise.all(
    [a, b, c].flatMap((e, i) =>
      Array.from({ length: 3 }, (_, j) =>
        exec(process.execPath, ['--input-type=module', '-e', program], {
          cwd: i === 2 ? linked : cwd,
          env: { ...process.env, ...e.env, CALL_PREFIX: `${i}-${j}-` },
        })
      )
    )
  );
  const read = await usage.readUsage(a.root);
  assert.equal(read.observations.length, 180);
  assert.equal(new Set(read.observations.map((r) => r.sessionId)).size, 3);
  assert.equal(new Set(read.observations.map((r) => r.worktreeId)).size, 2);
  assert.equal(read.diagnostics.filter((r) => r.code === 'writer-start').length, 9);
  assert.equal(read.diagnostics.filter((r) => r.code === 'writer-close').length, 9);
  assert.equal(read.participants.length, 3);
  for (const row of read.observations)
    assert.ok(
      read.participants.some(
        (p) => p.enrollmentId === row.enrollmentId && p.sessionId === row.sessionId
      )
    );
  assert.ok(read.fileOpenCount >= 12);
  assert.ok(read.elapsedMs >= 0);
});

test('consumer root resolution ignores inherited Git directory overrides', async (t) => {
  const a = await repository(t);
  const b = await repository(t);
  const previous = process.env.GIT_DIR;
  try {
    process.env.GIT_DIR = path.join(b.cwd, '.git');
    const resolved = await usage.resolveUsageRoot(a.cwd);
    assert.equal(resolved.commonDir, path.join(a.cwd, '.git'));
  } finally {
    if (previous === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previous;
  }
});
