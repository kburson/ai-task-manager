// @story #1410
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { ghClient, pexec } from '../../../gh/lib/gh-client.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

function withSkipNetwork(run) {
  const previous = process.env.TT_SKIP_NETWORK;
  process.env.TT_SKIP_NETWORK = '1';
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previous === undefined) delete process.env.TT_SKIP_NETWORK;
      else process.env.TT_SKIP_NETWORK = previous;
    });
}

function assertActionable(error, expectedArgs) {
  assert.match(error.message, /TT_SKIP_NETWORK=1/);
  assert.match(error.message, /gh-fail-closed-guard\.test\.mjs:\d+/);
  assert.ok(error.message.includes(JSON.stringify(['gh', ...expectedArgs])));
  assert.match(error.message, /installStubGh\(\)/);
  return true;
}

test('real default pexec refuses gh with the call site, argv, and offline-double guidance', async () => {
  await withSkipNetwork(async () => {
    const args = ['issue', 'view', '1410', '--json', 'body'];
    await assert.rejects(
      () => pexec('gh', args),
      (error) => assertActionable(error, args)
    );
  });
});

test('real default callback, promisified execFile, and spawn refuse before spawning', async () => {
  await withSkipNetwork(async () => {
    const callbackArgs = ['api', 'rate_limit'];
    assert.throws(
      () => ghClient.execFile('gh', callbackArgs, () => {}),
      (error) => assertActionable(error, callbackArgs)
    );

    const promiseArgs = ['issue', 'list', '--limit', '1'];
    await assert.rejects(
      () => promisify(ghClient.execFile)('gh', promiseArgs),
      (error) => assertActionable(error, promiseArgs)
    );

    const spawnArgs = ['api', 'graphql', '--input', '-'];
    assert.throws(
      () => ghClient.spawn('gh', spawnArgs),
      (error) => assertActionable(error, spawnArgs)
    );
  });
});

test('injected client properties remain authoritative under the test signal', async () => {
  const previous = { ...ghClient };
  const calls = [];
  ghClient.pexec = async (...args) => {
    calls.push(['pexec', ...args]);
    return { stdout: 'promise', stderr: '' };
  };
  ghClient.execFile = (file, args, callback) => {
    calls.push(['execFile', file, args]);
    callback(null, 'callback', '');
  };
  ghClient.spawn = (...args) => {
    calls.push(['spawn', ...args]);
    return { injected: true };
  };
  try {
    await withSkipNetwork(async () => {
      assert.equal((await pexec('gh', ['issue', 'view', '1'])).stdout, 'promise');
      await new Promise((resolve, reject) => {
        ghClient.execFile('gh', ['api', 'rate_limit'], (error, stdout) => {
          if (error) reject(error);
          else {
            assert.equal(stdout, 'callback');
            resolve();
          }
        });
      });
      assert.deepEqual(ghClient.spawn('gh', ['api', 'graphql']), { injected: true });
    });
    assert.equal(calls.length, 3);
  } finally {
    Object.assign(ghClient, previous);
  }
});

test('a declared PATH double remains authoritative under the test signal', async () => {
  const previousPath = process.env.PATH;
  const previousDoubleBin = process.env.AITM_GH_TEST_DOUBLE_BIN;
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'guard-double-'));
  const bin = path.join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const executable = path.join(bin, 'gh');
  writeFileSync(executable, '#!/bin/sh\nprintf "double:%s\\n" "$*"\n');
  chmodSync(executable, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ''}`;
  process.env.AITM_GH_TEST_DOUBLE_BIN = bin;
  try {
    await withSkipNetwork(async () => {
      assert.equal(
        (await pexec('gh', ['issue', 'view', '1410'])).stdout,
        'double:issue view 1410\n'
      );
    });
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousDoubleBin === undefined) delete process.env.AITM_GH_TEST_DOUBLE_BIN;
    else process.env.AITM_GH_TEST_DOUBLE_BIN = previousDoubleBin;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('signal-unset defaults preserve real child-process behavior on every surface', async () => {
  const previousSkip = process.env.TT_SKIP_NETWORK;
  const previousPath = process.env.PATH;
  delete process.env.TT_SKIP_NETWORK;
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'guard-production-'));
  const bin = path.join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const executable = path.join(bin, 'gh');
  writeFileSync(executable, '#!/bin/sh\nprintf "forwarded:%s\\n" "$*"\n');
  chmodSync(executable, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ''}`;
  try {
    const pending = pexec('gh', ['promise', 'one']);
    assert.ok(pending.child, 'production promise retains the child handle used for stdin writes');
    assert.equal((await pending).stdout, 'forwarded:promise one\n');
    assert.equal(
      (await promisify(ghClient.execFile)('gh', ['callback', 'two'])).stdout,
      'forwarded:callback two\n'
    );
    const child = ghClient.spawn('gh', ['spawn', 'three']);
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
    assert.equal(stdout, 'forwarded:spawn three\n');
  } finally {
    if (previousSkip === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = previousSkip;
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
