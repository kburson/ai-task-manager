#!/usr/bin/env node
// @story #1408
// Contract tests for the offline `gh` double in scripts/tests/fixtures/stub-gh.mjs.
//
// The double is what every other suite will lean on to stop paying for live
// `gh` traffic, so its own guarantees — both layers intercept, the census is
// accurate, the default refuses, registered responses win, and restore is
// complete — need to be pinned here rather than inferred from a caller.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { gh, gql, deps as liveSeam } from '../../../gh/lib/github-projects.mjs';
import { installStubGh, refusalFor } from '../../fixtures/stub-gh.mjs';

const pexec = promisify(execFile);

test('layer 1 intercepts seam execFile traffic without spawning', async () => {
  const stub = installStubGh({ responses: [{ match: 'gh issue view', stdout: 'body-text' }] });
  try {
    const out = await gh(['issue', 'view', '42', '-R', 'o/r', '--json', 'body']);
    assert.equal(out, 'body-text');
    assert.deepEqual(stub.calls(), ['gh issue view 42 -R o/r --json body']);
    assert.equal(stub.count(), 1);
  } finally {
    stub.restore();
  }
});

test('layer 1 intercepts seam spawn traffic (the graphql path)', async () => {
  const payload = JSON.stringify({ data: { viewer: { login: 'octocat' } } });
  const stub = installStubGh({ responses: [{ match: 'gh api graphql', stdout: payload }] });
  try {
    const data = await gql('query { viewer { login } }', {});
    assert.deepEqual(data, { viewer: { login: 'octocat' } });
    assert.deepEqual(stub.calls(), ['gh api graphql --input -']);
  } finally {
    stub.restore();
  }
});

test('layer 2 intercepts a gh child process the seam cannot reach', async () => {
  // This is the shape of the two confirmed leak sites: a module-level
  // `promisify(execFile)` that spawns `gh` directly, bypassing the seam.
  const stub = installStubGh();
  try {
    await assert.rejects(
      () => pexec('gh', ['issue', 'view', '111', '-R', 'o/r', '--json', 'body']),
      (err) => {
        assert.match(err.stderr, /stub-gh: refused issue view 111/);
        return true;
      }
    );
    assert.deepEqual(stub.calls(), ['gh issue view 111 -R o/r --json body']);
    assert.equal(stub.count(), 1);
  } finally {
    stub.restore();
  }
});

test('the census counts both layers together', async () => {
  const stub = installStubGh({ responses: [{ match: 'gh issue view', stdout: 'seam' }] });
  try {
    await gh(['issue', 'view', '1']);
    await pexec('gh', ['issue', 'view', '2']).catch(() => {});
    assert.equal(stub.count(), 2);
    assert.deepEqual(stub.calls(), ['gh issue view 1', 'gh issue view 2']);
  } finally {
    stub.restore();
  }
});

test('an unmatched invocation refuses rather than reaching the network', async () => {
  const stub = installStubGh();
  try {
    await assert.rejects(
      () => gh(['issue', 'view', '99']),
      (err) => {
        assert.match(err.message, /gh exited 1/);
        assert.match(err.stderr, /stub-gh: refused gh issue view 99/);
        return true;
      }
    );
  } finally {
    stub.restore();
  }
});

test('refusalFor is the shared refusal shape', () => {
  assert.deepEqual(refusalFor(['gh', 'issue', 'view', '7']), {
    code: 1,
    stdout: '',
    stderr: 'stub-gh: refused gh issue view 7\n',
  });
});

test('the first matching response wins and a match-less entry is a catch-all', async () => {
  const stub = installStubGh({
    responses: [
      { match: ['gh', 'issue', 'view', '5'], stdout: 'specific' },
      { stdout: 'catch-all' },
    ],
  });
  try {
    assert.equal(await gh(['issue', 'view', '5']), 'specific');
    assert.equal(await gh(['issue', 'view', '6']), 'catch-all');
    assert.equal(await gh(['pr', 'list']), 'catch-all');
  } finally {
    stub.restore();
  }
});

test('a response may declare a nonzero exit code', async () => {
  const stub = installStubGh({ responses: [{ code: 4, stderr: 'boom' }] });
  try {
    await assert.rejects(
      () => gh(['issue', 'view', '8']),
      (err) => {
        assert.equal(err.code, 4);
        assert.equal(err.stderr, 'boom');
        return true;
      }
    );
  } finally {
    stub.restore();
  }
});

test('restore puts the seam and PATH back and removes the shim', async () => {
  const seamExecFile = liveSeam.execFile;
  const seamSpawn = liveSeam.spawn;
  const originalPath = process.env.PATH;

  const stub = installStubGh();
  assert.notEqual(liveSeam.execFile, seamExecFile);
  assert.notEqual(liveSeam.spawn, seamSpawn);
  assert.ok(process.env.PATH.startsWith(stub.binDir));

  stub.restore();

  assert.equal(liveSeam.execFile, seamExecFile);
  assert.equal(liveSeam.spawn, seamSpawn);
  assert.equal(process.env.PATH, originalPath);
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(stub.binDir), false);
});

test('an isolated seam object can be stubbed instead of the live one', async () => {
  const seam = { execFile: null, spawn: null };
  const stub = installStubGh({ seam, responses: [{ stdout: 'ok' }] });
  try {
    assert.equal(typeof seam.execFile, 'function');
    // The live seam is untouched when an explicit one is supplied.
    assert.notEqual(liveSeam.execFile, seam.execFile);
  } finally {
    stub.restore();
  }
  assert.equal(seam.execFile, null);
});
