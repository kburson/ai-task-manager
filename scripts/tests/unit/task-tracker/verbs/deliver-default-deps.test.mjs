#!/usr/bin/env node
// @story #939

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createDefaultDeliverDeps } from '../../../../task-tracker/verbs/deliver.mjs';

const HEAD = 'a'.repeat(40);
const MERGE_HEAD = 'c'.repeat(40);
const MERGED_AT = '2026-08-22T14:01:00.000Z';

function commitConnection(
  commits,
  {
    totalCount = commits.length,
    hasNextPage = false,
    endCursor = null,
    headRefOid = commits.at(-1)?.oid,
  } = {}
) {
  return {
    data: {
      repository: {
        pullRequest: {
          headRefOid,
          commits: {
            totalCount,
            nodes: commits.map(({ oid, messageHeadline, message, parents, tree }) => ({
              commit: {
                oid,
                messageHeadline,
                message: message ?? messageHeadline,
                parents: {
                  totalCount: (parents ?? ['d'.repeat(40)]).length,
                  nodes: (parents ?? ['d'.repeat(40)]).map((parentOid) => ({ oid: parentOid })),
                  pageInfo: { hasNextPage: false },
                },
                tree: { oid: tree ?? '1'.repeat(40) },
              },
            })),
            pageInfo: { hasNextPage, endCursor },
          },
        },
      },
    },
  };
}

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
    if (args[0] === 'api' && args[1] === 'graphql') {
      return {
        stdout: JSON.stringify(
          commitConnection([{ oid: HEAD, messageHeadline: '[#939] PR source evidence' }])
        ),
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
  assert.equal(pullRequest.sourceCommitsComplete, true);
  assert.deepEqual(pullRequest.sourceCommitSubjects, ['[#939] PR source evidence']);
  assert.deepEqual(pullRequest.sourceCommitEvidence, [
    {
      oid: HEAD,
      message: '[#939] PR source evidence',
      parents: ['d'.repeat(40)],
      tree: '1'.repeat(40),
    },
  ]);
  assert.deepEqual(commands[2], [
    'gh',
    ['api', 'repos/kburson/ai-task-manager/git/ref/heads/codex/939-full-auto-merge'],
  ]);
});

test('default PR adapter proves a complete paginated commit inventory', async () => {
  const commands = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    oid: (index + 1).toString(16).padStart(40, '0'),
    messageHeadline: `[#939] source ${index + 1}`,
  }));
  const finalCommit = { oid: 'f'.repeat(40), messageHeadline: '[#939] source 101' };
  const exec = async (_command, args) => {
    commands.push(args);
    if (args[0] === 'pr') {
      return {
        stdout: JSON.stringify({
          number: 1400,
          state: 'OPEN',
          isDraft: false,
          baseRefName: 'trunk',
          headRefName: 'codex/939-full-auto-merge',
          headRefOid: finalCommit.oid,
          mergeable: 'MERGEABLE',
          mergedAt: null,
          mergeCommit: null,
          headRepository: { name: 'ai-task-manager' },
          headRepositoryOwner: { login: 'kburson' },
        }),
      };
    }
    if (args[0] === 'api' && args[1] === 'graphql') {
      const cursorArgument = args.find((value) => value.startsWith('cursor='));
      return {
        stdout: JSON.stringify(
          cursorArgument === undefined
            ? commitConnection(firstPage, {
                totalCount: 101,
                hasNextPage: true,
                endCursor: 'page-2',
                headRefOid: finalCommit.oid,
              })
            : commitConnection([finalCommit], {
                totalCount: 101,
                headRefOid: finalCommit.oid,
              })
        ),
      };
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
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

  assert.equal(pullRequest.sourceCommitsComplete, true);
  assert.equal(pullRequest.sourceCommits.length, 101);
  assert.equal(pullRequest.sourceCommits.at(-1).oid, finalCommit.oid);
  assert.equal(commands.filter((args) => args[0] === 'api' && args[1] === 'graphql').length, 2);
});

for (const scenario of ['initial head mismatch', 'head drift between pages']) {
  test(`default PR adapter rejects ${scenario}`, async () => {
    const firstCommit = { oid: '1'.repeat(40), messageHeadline: '[#939] source 1' };
    const finalCommit = { oid: HEAD, messageHeadline: '[#939] source 2' };
    const exec = async (_command, args) => {
      if (args[0] === 'pr') {
        return {
          stdout: JSON.stringify({
            number: 1400,
            state: 'OPEN',
            isDraft: false,
            baseRefName: 'trunk',
            headRefName: 'codex/939-full-auto-merge',
            headRefOid: HEAD,
            mergeable: 'MERGEABLE',
            mergedAt: null,
            mergeCommit: null,
            headRepository: { name: 'ai-task-manager' },
            headRepositoryOwner: { login: 'kburson' },
          }),
        };
      }
      if (args[0] === 'api' && args[1] === 'graphql') {
        const secondPage = args.some((value) => value === 'cursor=page-2');
        if (scenario === 'initial head mismatch') {
          return {
            stdout: JSON.stringify(commitConnection([finalCommit], { headRefOid: 'b'.repeat(40) })),
          };
        }
        return {
          stdout: JSON.stringify(
            secondPage
              ? commitConnection([finalCommit], {
                  totalCount: 2,
                  headRefOid: 'b'.repeat(40),
                })
              : commitConnection([firstCommit], {
                  totalCount: 2,
                  hasNextPage: true,
                  endCursor: 'page-2',
                  headRefOid: HEAD,
                })
          ),
        };
      }
      throw new Error(`unexpected command: ${args.join(' ')}`);
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

    await assert.rejects(deps.fetchPullRequest({ prNumber: 1400 }), /deliver:pull-request-commits/);
  });
}

test('#1390 default PR adapter canonicalizes live GitHub second-precision mergedAt', async () => {
  const exec = async (_command, args) => {
    if (args[0] === 'pr') {
      return {
        stdout: JSON.stringify({
          number: 1385,
          state: 'MERGED',
          isDraft: false,
          baseRefName: 'trunk',
          headRefName: 'codex/939-full-auto-merge',
          headRefOid: HEAD,
          mergeable: 'UNKNOWN',
          mergedAt: '2026-08-23T03:57:33Z',
          mergeCommit: { oid: MERGE_HEAD },
          statusCheckRollup: [],
          commits: [{ messageHeadline: '[#1390] provider evidence' }],
          headRepository: { name: 'ai-task-manager' },
          headRepositoryOwner: { login: 'kburson' },
        }),
      };
    }
    if (args[0] === 'api' && args[1] === 'graphql') {
      return {
        stdout: JSON.stringify(
          commitConnection([{ oid: HEAD, messageHeadline: '[#1390] provider evidence' }])
        ),
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

  const pullRequest = await deps.fetchPullRequest({ prNumber: 1385 });

  assert.equal(pullRequest.mergedAt, '2026-08-23T03:57:33.000Z');
});

test('#1390 default PR adapter rejects missing or malformed mergedAt', async () => {
  for (const mergedAt of [null, 'not-an-instant']) {
    const exec = async (_command, args) => {
      if (args[0] === 'pr') {
        return {
          stdout: JSON.stringify({
            number: 1385,
            state: 'MERGED',
            isDraft: false,
            baseRefName: 'trunk',
            headRefName: 'codex/939-full-auto-merge',
            headRefOid: HEAD,
            mergeable: 'UNKNOWN',
            mergedAt,
            mergeCommit: { oid: MERGE_HEAD },
            statusCheckRollup: [],
            commits: [{ messageHeadline: '[#1390] provider evidence' }],
            headRepository: { name: 'ai-task-manager' },
            headRepositoryOwner: { login: 'kburson' },
          }),
        };
      }
      if (args[0] === 'api' && args[1] === 'graphql') {
        return {
          stdout: JSON.stringify(
            commitConnection([{ oid: HEAD, messageHeadline: '[#1390] provider evidence' }])
          ),
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

    await assert.rejects(
      deps.fetchPullRequest({ prNumber: 1385 }),
      /deliver:pull-request-merged-at/
    );
  }
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
      tree: '1'.repeat(40),
      commitTitle: '[#939] Governed PR delivery',
      commitMessage: `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939]`,
    }
  );
});

test('#1389 default comment adapter canonicalizes live GitHub second-precision timestamps', async () => {
  const exec = async (command, args) => {
    assert.equal(command, 'gh');
    assert.deepEqual(args, [
      'api',
      '--paginate',
      '--slurp',
      'repos/kburson/ai-task-manager/issues/1389/comments',
    ]);
    return {
      stdout: JSON.stringify([
        [
          {
            id: 42,
            created_at: '2026-08-23T03:12:38Z',
            body: 'ordinary issue comment',
          },
        ],
      ]),
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

  assert.deepEqual(await deps.listIssueComments({ issueNumber: 1389 }), [
    {
      id: '42',
      createdAt: '2026-08-23T03:12:38.000Z',
      body: 'ordinary issue comment',
    },
  ]);
});

test('#1389 default comment adapter rejects malformed GitHub timestamps', async () => {
  const deps = createDefaultDeliverDeps(
    {
      cfg: cfg(),
      projectDir: '/injected/project',
      async getIssueBoardState() {
        return 'Review';
      },
    },
    {
      async exec() {
        return {
          stdout: JSON.stringify([
            [
              {
                id: 42,
                created_at: 'not-an-instant',
                body: 'ordinary issue comment',
              },
            ],
          ]),
        };
      },
    }
  );

  await assert.rejects(deps.listIssueComments({ issueNumber: 1389 }), /deliver:comment-created-at/);
});

test('#1413 default delivery adapter excludes optional and historical PR checks', async () => {
  const commands = [];
  const exec = async (command, args) => {
    commands.push([command, args]);
    if (args[0] === 'pr' && args[1] === 'checks') {
      return {
        stdout: JSON.stringify([{ name: 'Fast lane', state: 'SUCCESS' }]),
      };
    }
    if (args[0] === 'pr' && args[1] === 'view' && args.at(-1) === 'headRefOid') {
      return { stdout: JSON.stringify({ headRefOid: HEAD }) };
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      return {
        stdout: JSON.stringify({
          number: 1418,
          state: 'OPEN',
          isDraft: false,
          baseRefName: 'trunk',
          headRefName: 'claude/pull-branch-trunk-origin-c647e3',
          headRefOid: HEAD,
          mergeable: 'MERGEABLE',
          mergedAt: null,
          mergeCommit: null,
          statusCheckRollup: [
            { name: 'Fast lane', status: 'COMPLETED', conclusion: 'SUCCESS' },
            { name: 'Slow lane', status: 'COMPLETED', conclusion: 'SKIPPED' },
            { name: 'Fast lane', status: 'COMPLETED', conclusion: 'FAILURE' },
          ],
          commits: [{ oid: HEAD, messageHeadline: '[#1413] Required checks' }],
          headRepository: { name: 'ai-task-manager' },
          headRepositoryOwner: { login: 'kburson' },
        }),
      };
    }
    if (args[0] === 'api' && args[1] === 'graphql') {
      return {
        stdout: JSON.stringify(
          commitConnection([{ oid: HEAD, messageHeadline: '[#1413] Required checks' }])
        ),
      };
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
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

  await deps.fetchPullRequest({ prNumber: 1418 });

  assert.deepEqual(await deps.fetchRequiredChecks({ prNumber: 1418, expectedHeadSha: HEAD }), {
    readable: true,
    required: [
      {
        name: 'Fast lane',
        headSha: HEAD,
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
      },
    ],
  });
  assert.ok(
    commands.some(
      ([command, args]) =>
        command === 'gh' &&
        args.join(' ') === 'pr checks 1418 -R kburson/ai-task-manager --required --json name,state'
    )
  );
});

test('#1413 default delivery adapter preserves pending required checks as non-green', async () => {
  const exec = async (_command, args) => {
    if (args[0] === 'pr' && args[1] === 'checks') {
      const error = new Error('checks pending');
      error.code = 8;
      error.stdout = JSON.stringify([{ name: 'Fast lane', state: 'PENDING' }]);
      throw error;
    }
    if (args[0] === 'pr' && args[1] === 'view' && args.at(-1) === 'headRefOid') {
      return { stdout: JSON.stringify({ headRefOid: HEAD }) };
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      return {
        stdout: JSON.stringify({
          number: 1418,
          state: 'OPEN',
          isDraft: false,
          baseRefName: 'trunk',
          headRefName: 'claude/pull-branch-trunk-origin-c647e3',
          headRefOid: HEAD,
          mergeable: 'MERGEABLE',
          mergedAt: null,
          mergeCommit: null,
          statusCheckRollup: [],
          commits: [{ oid: HEAD, messageHeadline: '[#1413] Required checks' }],
          headRepository: { name: 'ai-task-manager' },
          headRepositoryOwner: { login: 'kburson' },
        }),
      };
    }
    if (args[0] === 'api' && args[1] === 'graphql') {
      return {
        stdout: JSON.stringify(
          commitConnection([{ oid: HEAD, messageHeadline: '[#1413] Required checks' }])
        ),
      };
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
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

  await deps.fetchPullRequest({ prNumber: 1418 });

  assert.deepEqual(await deps.fetchRequiredChecks({ prNumber: 1418, expectedHeadSha: HEAD }), {
    readable: true,
    required: [
      {
        name: 'Fast lane',
        headSha: HEAD,
        status: 'PENDING',
        conclusion: 'PENDING',
      },
    ],
  });
});
