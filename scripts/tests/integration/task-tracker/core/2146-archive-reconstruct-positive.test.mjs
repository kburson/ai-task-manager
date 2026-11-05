// @story #2146
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
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
