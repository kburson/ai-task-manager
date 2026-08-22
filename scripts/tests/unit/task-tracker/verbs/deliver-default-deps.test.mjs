#!/usr/bin/env node
// @story #939

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createDefaultDeliverDeps } from '../../../../task-tracker/verbs/deliver.mjs';

const HEAD = 'a'.repeat(40);
const MERGE_HEAD = 'c'.repeat(40);
const MERGED_AT = '2026-08-22T14:01:00.000Z';

function cfg() {
  return {
    repo: 'kburson/ai-task-manager',
    assignee: 'kburson',
    trunkRef: 'origin/trunk',
    fullAutoMerge: {
      mechanism: 'provider-action',
      mergeMethod: 'squash',
    },
  };
}

test('deliver source has no terminal lifecycle dependency', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/deliver.mjs', import.meta.url),
    'utf8'
  );
  for (const forbidden of [
    'flushTerminalTiming',
    'moveBoardToDone',
    'setTerminalDisposition',
    'closeIssue',
    'releaseBinding',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test('default live PR snapshot records a server-confirmed deleted source branch', async () => {
  const commands = [];
  const exec = async (command, args) => {
    commands.push([command, args]);
    if (args[0] === 'pr') {
      return {
        stdout: JSON.stringify({
          number: 1400,
          state: 'MERGED',
          isDraft: false,
          baseRefName: 'trunk',
          headRefName: 'codex/939-full-auto-merge',
          headRefOid: HEAD,
          mergeable: 'UNKNOWN',
          mergedAt: MERGED_AT,
          mergeCommit: { oid: MERGE_HEAD },
          statusCheckRollup: [],
          commits: [{ messageHeadline: '[#939] PR source evidence' }],
          headRepository: { name: 'ai-task-manager' },
          headRepositoryOwner: { login: 'kburson' },
        }),
      };
    }
    const error = new Error('HTTP 404: Not Found');
    error.stderr = 'gh: Not Found (HTTP 404)';
    throw error;
  };
  const deps = createDefaultDeliverDeps(
    {
      cfg: cfg(),
      projectDir: '/injected/project',
      async getIssueBoardState() {
        return 'Review';
      },
    },
    { exec }
  );

  const pullRequest = await deps.fetchPullRequest({ prNumber: 1400 });

  assert.equal(pullRequest.headRefDeleted, true);
  assert.deepEqual(pullRequest.sourceCommitSubjects, ['[#939] PR source evidence']);
  assert.deepEqual(commands[1], [
    'gh',
    ['api', 'repos/kburson/ai-task-manager/git/ref/heads/codex/939-full-auto-merge'],
  ]);
});

test('default merge-history inspector returns exact parents and authorized commit bytes', async () => {
  const exec = async (command, args) => {
    assert.equal(command, 'git');
    assert.deepEqual(args, ['cat-file', 'commit', MERGE_HEAD]);
    return {
      stdout:
        `tree ${'1'.repeat(40)}\n` +
        `parent ${'d'.repeat(40)}\n` +
        `parent ${HEAD}\n` +
        'author Example <example@example.com> 1 +0000\n' +
        'committer Example <example@example.com> 1 +0000\n\n' +
        `[#939] Governed PR delivery\n\nPR #1400\nSource: ${HEAD}\n\nAttribution: [#939]\n`,
    };
  };
  const deps = createDefaultDeliverDeps(
    {
      cfg: cfg(),
      projectDir: '/injected/project',
      async getIssueBoardState() {
        return 'Review';
      },
    },
    { exec }
  );

  assert.deepEqual(
    await deps.inspectMergeCommit({ mergeCommitSha: MERGE_HEAD, expectedHeadSha: HEAD }),
    {
      parents: ['d'.repeat(40), HEAD],
      commitTitle: '[#939] Governed PR delivery',
      commitMessage: `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939]`,
    }
  );
});
