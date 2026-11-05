// @story #2146
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  allocateValidationRoot,
  reconstructHistoricalSource,
} from '../../../../research/2146-native-recovery/reconstruct.mjs';
const carrier = process.cwd();
const git = (args) =>
  execFileSync('git', ['--no-pager', ...args], { cwd: carrier, encoding: 'utf8', timeout: 10000 });
const identity = () => ({
  head: git(['rev-parse', 'HEAD']),
  index: readFileSync(git(['rev-parse', '--git-path', 'index']).trim()),
  refs: git(['show-ref']),
});
const snapshot = (value) => ({
  head: value.head.trim(),
  indexSha256: createHash('sha256').update(value.index).digest('hex'),
  refsSha256: createHash('sha256').update(value.refs).digest('hex'),
});
test('reconstructs the available historical object without changing carrier HEAD/index/refs', async () => {
  const before = identity();
  const allocation = await allocateValidationRoot(carrier);
  const result = reconstructHistoricalSource(carrier, allocation);
  assert.equal(result.sourceCommit, '2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0');
  assert.equal(result.sourceTree, '36a4b5ba652094df909b05b4a99352bb7e41233d');
  assert.equal(result.sourceGit(['status', '--porcelain', '--untracked-files=all']), '');
  assert.ok(result.commands.every((entry) => entry.args[0] === '--no-pager'));
  assert.ok(
    result.commands.some(
      (entry) => entry.args[1] === 'clone' && entry.args.includes('--no-checkout')
    )
  );
  assert.equal(
    result.commands.some((entry) =>
      entry.args.some((arg) =>
        ['fetch', 'push', 'pull', 'checkout', 'restore', 'commit'].includes(arg)
      )
    ),
    false
  );
  const after = identity();
  assert.deepEqual(after, before);
  console.log(
    JSON.stringify({
      schema: 'aitm.archival-positive-candidate/v1',
      before: snapshot(before),
      after: snapshot(after),
      historicalSourceCommit: result.sourceCommit,
      historicalSourceTree: result.sourceTree,
      commands: result.commands,
    })
  );
  rmSync(allocation.ownedRoot, { recursive: true });
});

test('real reconstruction inherits CI identity metadata and preserves the carrier and environment', () => {
  const beforeEnv = { ...process.env };
  const childEnv = { ...beforeEnv };
  const workflow = readFileSync(path.join(carrier, '.github/workflows/ci.yml'), 'utf8');
  for (const name of [
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL',
  ]) {
    const declaration = workflow.split('\n').find((line) => line.startsWith('  ' + name + ': '));
    assert.ok(declaration, name + ' workflow declaration missing');
    if (!Object.hasOwn(childEnv, name))
      childEnv[name] = declaration.slice(('  ' + name + ': ').length);
  }
  // Labeled test-only CI fixture: fill absent metadata, preserve every inherited value.
  const program = `
    import assert from 'node:assert/strict';
    import childProcess, { execFileSync } from 'node:child_process';
    import { createHash } from 'node:crypto';
    import { readFileSync, rmSync } from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import path from 'node:path';
    import { mock } from 'node:test';
    import { allocateValidationRoot, reconstructHistoricalSource } from './scripts/research/2146-native-recovery/reconstruct.mjs';
    const carrier = process.cwd();
    const inherited = { ...process.env };
    const execute = execFileSync;
    const git = (args) => execute('git', ['--no-pager', '--no-optional-locks', ...args], {
      cwd: carrier, encoding: 'utf8', timeout: 10000
    }).trim();
    const snapshot = () => ({
      head: git(['rev-parse', 'HEAD']),
      index: readFileSync(git(['rev-parse', '--git-path', 'index'])),
      refs: git(['show-ref']),
      reflog: readFileSync(git(['rev-parse', '--git-path', 'logs/HEAD']))
    });
    const before = snapshot();
    let calls = 0;
    const intercepted = mock.method(childProcess, 'execFileSync', (command, args, options) => {
      assert.equal(command, 'git');
      assert.equal(Object.hasOwn(options, 'env'), false);
      assert.equal(Object.hasOwn(options, 'shell'), false);
      assert.deepEqual({ ...process.env }, inherited);
      calls++;
      return execute(command, args, options);
    });
    syncBuiltinESMExports();
    let allocation, result;
    try {
      allocation = await allocateValidationRoot(carrier);
      result = reconstructHistoricalSource(carrier, allocation);
      assert.equal(result.sourceCommit, '2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0');
      assert.equal(result.sourceTree, '36a4b5ba652094df909b05b4a99352bb7e41233d');
      assert.equal(result.sourceGit(['status', '--porcelain', '--untracked-files=all']), '');
      const log = readFileSync(path.join(result.sourceRoot, '.git/logs/HEAD'), 'utf8');
      assert.ok(log.includes(inherited.GIT_COMMITTER_NAME + ' <' + inherited.GIT_COMMITTER_EMAIL + '>'));
    } finally {
      intercepted.mock.restore();
      syncBuiltinESMExports();
    }
    const after = snapshot();
    assert.deepEqual(after, before);
    assert.deepEqual({ ...process.env }, inherited);
    assert.equal(calls, result.commands.length);
    const digest = (value) => createHash('sha256').update(value).digest('hex');
    const evidence = (value) => ({ head: value.head, indexSha256: digest(value.index), refsSha256: digest(value.refs), reflogSha256: digest(value.reflog) });
    console.log(JSON.stringify({ fixture: 'CI identity metadata', before: evidence(before), after: evidence(after), calls, commands: result.commands }));
    rmSync(allocation.ownedRoot, { recursive: true });
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: carrier,
    env: childEnv,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.deepEqual({ ...process.env }, beforeEnv);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.deepEqual(result.before, result.after);
  assert.ok(result.calls > 0);
  console.log(JSON.stringify(result));
});
