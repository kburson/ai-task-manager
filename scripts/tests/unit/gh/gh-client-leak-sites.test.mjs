// @story #1409
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ghClient } from '../../../gh/lib/gh-client.mjs';
import { mkdtempOutsideRepo } from '../../../task-tracker/lib/scratch-dir.mjs';
import { pushIssueBody } from '../../../task-tracker/lib/issue-body-push.mjs';

test('issue-body-push uses the shared client without changing gh arguments', async () => {
  const original = ghClient.pexec;
  const calls = [];
  let stagedBody = '';
  const tmp = mkdtempOutsideRepo('aitm-gh-client-');
  const scratchPath = path.join(tmp, 'body.md');
  ghClient.pexec = async (file, args, options) => {
    calls.push({ file, args, options });
    if (args[1] === 'view') return { stdout: stagedBody, stderr: '' };
    stagedBody = readFileSync(scratchPath, 'utf8');
    assert.equal(stagedBody.includes('new'), true);
    return { stdout: '', stderr: '' };
  };
  try {
    await pushIssueBody({
      issueNumber: 1409,
      repo: 'o/r',
      body: '<!-- aitm-body-version version="1" -->\nnew',
      scratchPath,
      quiet: true,
    });
    assert.deepEqual(calls, [
      {
        file: 'gh',
        args: ['issue', 'view', '1409', '-R', 'o/r', '--json', 'body', '-q', '.body'],
        options: { timeout: 30000 },
      },
      {
        file: 'gh',
        args: ['issue', 'edit', '1409', '-R', 'o/r', '--body-file', scratchPath],
        options: { timeout: 30000 },
      },
      {
        file: 'gh',
        args: ['issue', 'view', '1409', '-R', 'o/r', '--json', 'body', '-q', '.body'],
        options: { timeout: 30000 },
      },
    ]);
    assert.equal(existsSync(scratchPath), false, 'successful pushes remove their scratch file');
  } finally {
    ghClient.pexec = original;
    rmSync(tmp, { recursive: true, force: true });
  }
});
