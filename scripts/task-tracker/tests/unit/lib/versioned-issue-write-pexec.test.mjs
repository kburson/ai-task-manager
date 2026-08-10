// @story #763
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { versionedWriteBody } from '../../../lib/versioned-issue-write.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

function rejectingGhShim() {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-763-gh-guard-'));
  const marker = join(dir, 'spawned');
  const gh = join(dir, 'gh');
  writeFileSync(gh, `#!/bin/sh\nprintf spawned > "${marker}"\nexit 88\n`);
  chmodSync(gh, 0o755);
  return { dir, marker };
}

function bodyPexec(initialBody) {
  let body = initialBody;
  const calls = [];
  const pexec = (bin, args, options = {}) => {
    calls.push({ bin, args: [...args], options: { ...options } });
    if (args[0] === 'issue' && args[1] === 'view') {
      return Promise.resolve({ stdout: body, stderr: '' });
    }
    if (args[0] === 'issue' && args[1] === 'edit') {
      const pending = Promise.resolve({ stdout: '', stderr: '' });
      pending.child = {
        stdin: {
          end(value) {
            body = String(value);
          },
        },
      };
      return pending;
    }
    return Promise.reject(new Error(`unexpected command: ${bin} ${args.join(' ')}`));
  };
  return { pexec, calls, body: () => body };
}

test('versionedWriteBody uses injected pexec for fetch, stdin push, and verify fetch', async () => {
  const guard = rejectingGhShim();
  const previousPath = process.env.PATH;
  process.env.PATH = `${guard.dir}:${previousPath || ''}`;
  const fake = bodyPexec('## Body\n\nBefore\n');
  try {
    const result = await versionedWriteBody({
      issueNumber: 763,
      repo: 'o/r',
      mutate: (body) => body.replace('Before', 'After'),
      deps: { pexec: fake.pexec },
    });

    assert.equal(result.status, 'ok');
    assert.equal(fake.calls.length, 3, 'fetch, push, and verify fetch all use pexec');
    assert.deepEqual(
      fake.calls.map(({ bin }) => bin),
      ['gh', 'gh', 'gh']
    );
    assert.deepEqual(fake.calls[0].args, [
      'issue',
      'view',
      '763',
      '-R',
      'o/r',
      '--json',
      'body',
      '-q',
      '.body',
    ]);
    assert.deepEqual(fake.calls[1].args, ['issue', 'edit', '763', '-R', 'o/r', '--body-file', '-']);
    assert.match(fake.body(), /After/);
    assert.match(fake.body(), /aitm-body-version version="1"/);
    assert.equal(result.body, fake.body(), 'verified result is the exact stdin body');
    assert.equal(
      await import('node:fs').then(({ existsSync }) => existsSync(guard.marker)),
      false,
      'no direct gh spawn escaped the injected seam'
    );
  } finally {
    process.env.PATH = previousPath;
    rmSync(guard.dir, { recursive: true, force: true });
  }
});

test('explicit fetchBody and pushBody overrides retain precedence over pexec', async () => {
  let pexecCalls = 0;
  let body = 'Base\n';
  const result = await versionedWriteBody({
    issueNumber: 763,
    repo: 'o/r',
    mutate: (value) => `${value}Changed\n`,
    deps: {
      pexec: async () => {
        pexecCalls++;
        throw new Error('pexec must not run');
      },
      fetchBody: async () => body,
      pushBody: async (_repo, _issue, value) => {
        body = value;
      },
    },
  });
  assert.equal(result.status, 'ok');
  assert.equal(pexecCalls, 0);
});
