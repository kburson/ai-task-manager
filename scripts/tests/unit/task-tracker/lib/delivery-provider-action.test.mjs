#!/usr/bin/env node
// @story #939
// cspell:ignore NDEKTSV RRFFQ

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { buildDeliveryIntent } from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  buildProviderAction,
  serializeProviderActionRequired,
} from '../../../../task-tracker/lib/delivery-provider-action.mjs';
import {
  DeliveryPreflightError,
  validateDeliveryPreflight,
} from '../../../../task-tracker/lib/delivery-preflight.mjs';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const COMMIT_MESSAGE = `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939]`;

function snapshot() {
  return {
    issue: {
      number: 939,
      state: 'OPEN',
      projectState: 'Review',
      assignees: ['kburson'],
      agentReviewPassed: true,
      reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    },
    binding: {
      issueNumber: 939,
      branch: 'codex/939-full-auto-merge',
      timerState: 'running',
    },
    lineage: {
      parentIssueNumber: null,
      deliveryTarget: 'trunk',
    },
    pullRequests: [
      {
        number: 1400,
        state: 'OPEN',
        isDraft: false,
        baseRefName: 'trunk',
        headRefName: 'codex/939-full-auto-merge',
        headRefOid: HEAD,
        mergeable: 'MERGEABLE',
      },
    ],
    localHeadSha: HEAD,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    checks: {
      readable: true,
      required: [
        {
          name: 'ci',
          headSha: HEAD,
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
        },
      ],
    },
    dirtyPaths: [],
    config: {
      repo: 'kburson/ai-task-manager',
      assignee: 'kburson',
      trunkRef: 'origin/trunk',
      repositoryMergeMethods: ['merge', 'squash', 'rebase'],
      fullAutoMerge: {
        mechanism: 'provider-action',
        mergeMethod: 'squash',
      },
    },
    commitSubjects: ['[#939] Implement governed PR delivery'],
  };
}

function expectPreflightCategory(input, category) {
  assert.throws(
    () => validateDeliveryPreflight(input),
    (error) =>
      error instanceof DeliveryPreflightError &&
      error.name === 'DeliveryPreflightError' &&
      error.category === category &&
      error.message === `delivery-preflight:${category}`
  );
}

test('preflight returns the exact frozen delivery plan for one accepted head', () => {
  const input = snapshot();
  const result = validateDeliveryPreflight(input);

  assert.deepEqual(result, {
    issue: input.issue,
    pr: input.pullRequests[0],
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    commitText: {
      attributionTokens: ['#939'],
      commitTitle: '[#939] Governed PR delivery',
      commitMessage: COMMIT_MESSAGE,
      commitTitleSha256: '8403702a6e0052447048eb5347de41cbac3cc758bc1b71af2a494ea4971eeeb1',
      commitMessageSha256: '62ec7b323a5f4fc97fe8534cfbcd79eaca9f2f741577cd51317090925ade1483',
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.issue), true);
  assert.equal(Object.isFrozen(result.issue.assignees), true);
  assert.equal(Object.isFrozen(result.pr), true);
  assert.equal(Object.isFrozen(result.commitText), true);
});

test('preflight requires every named snapshot field explicitly', () => {
  for (const key of [
    'issue',
    'binding',
    'lineage',
    'pullRequests',
    'localHeadSha',
    'testReceiptSha',
    'acceptedReviewSha',
    'checks',
    'dirtyPaths',
    'config',
    'commitSubjects',
  ]) {
    const input = snapshot();
    delete input[key];
    expectPreflightCategory(input, 'input');
  }
});

const REFUSALS = [
  {
    name: 'active issue mismatch',
    category: 'active-issue-mismatch',
    mutate: (input) => {
      input.binding.issueNumber = 940;
    },
  },
  {
    name: 'paused timer',
    category: 'timer-not-running',
    mutate: (input) => {
      input.binding.timerState = 'paused';
    },
  },
  {
    name: 'non-Review project state',
    category: 'issue-not-review',
    mutate: (input) => {
      input.issue.projectState = 'Test';
    },
  },
  {
    name: 'closed issue',
    category: 'issue-not-open',
    mutate: (input) => {
      input.issue.state = 'CLOSED';
    },
  },
  {
    name: 'unassigned issue',
    category: 'issue-owner',
    mutate: (input) => {
      input.issue.assignees = [];
    },
  },
  {
    name: 'missing Agent Review Passed evidence',
    category: 'agent-review-evidence',
    mutate: (input) => {
      input.issue.agentReviewPassed = false;
    },
  },
  {
    name: 'missing human or Full-Auto approval evidence',
    category: 'approval-evidence',
    mutate: (input) => {
      input.issue.reviewAuthorization = { mode: 'missing', standing: false, source: 'none' };
    },
  },
  {
    name: 'child lineage',
    category: 'child-lineage',
    mutate: (input) => {
      input.lineage.parentIssueNumber = 938;
    },
  },
  {
    name: 'zero pull requests',
    category: 'pull-request-count',
    mutate: (input) => {
      input.pullRequests = [];
    },
  },
  {
    name: 'multiple pull requests',
    category: 'pull-request-count',
    mutate: (input) => {
      input.pullRequests.push({ ...input.pullRequests[0], number: 1401 });
    },
  },
  {
    name: 'closed pull request',
    category: 'pull-request-not-open',
    mutate: (input) => {
      input.pullRequests[0].state = 'CLOSED';
    },
  },
  {
    name: 'draft pull request',
    category: 'pull-request-draft',
    mutate: (input) => {
      input.pullRequests[0].isDraft = true;
    },
  },
  {
    name: 'wrong pull request base',
    category: 'pull-request-base',
    mutate: (input) => {
      input.pullRequests[0].baseRefName = 'release';
    },
  },
  {
    name: 'wrong pull request head branch',
    category: 'pull-request-head',
    mutate: (input) => {
      input.pullRequests[0].headRefName = 'codex/other';
    },
  },
  {
    name: 'local head mismatch',
    category: 'head-mismatch',
    mutate: (input) => {
      input.localHeadSha = OTHER_HEAD;
    },
  },
  {
    name: 'remote pull request head mismatch leaves zero accepted-head pull requests',
    category: 'pull-request-count',
    mutate: (input) => {
      input.pullRequests[0].headRefOid = OTHER_HEAD;
    },
  },
  {
    name: 'Test receipt head mismatch',
    category: 'head-mismatch',
    mutate: (input) => {
      input.testReceiptSha = OTHER_HEAD;
    },
  },
  {
    name: 'accepted review head mismatch',
    category: 'head-mismatch',
    mutate: (input) => {
      input.acceptedReviewSha = OTHER_HEAD;
    },
  },
  {
    name: 'issue-scoped dirty overlap',
    category: 'dirty-overlap',
    mutate: (input) => {
      input.dirtyPaths = ['scripts/task-tracker/lib/delivery-preflight.mjs'];
    },
  },
  {
    name: 'unknown mergeability',
    category: 'mergeability',
    mutate: (input) => {
      input.pullRequests[0].mergeable = 'UNKNOWN';
    },
  },
  {
    name: 'unreadable required checks',
    category: 'checks-unreadable',
    mutate: (input) => {
      input.checks.readable = false;
    },
  },
  {
    name: 'non-green required check',
    category: 'required-check-not-green',
    mutate: (input) => {
      input.checks.required[0].conclusion = 'FAILURE';
    },
  },
  {
    name: 'required check from another head',
    category: 'required-check-head-mismatch',
    mutate: (input) => {
      input.checks.required[0].headSha = OTHER_HEAD;
    },
  },
  {
    name: 'repository-disallowed merge method',
    category: 'merge-method-not-allowed',
    mutate: (input) => {
      input.config.repositoryMergeMethods = ['merge', 'rebase'];
    },
  },
  {
    name: 'missing commit attribution',
    category: 'attribution',
    mutate: (input) => {
      input.commitSubjects = [];
    },
  },
];

for (const { name, category, mutate } of REFUSALS) {
  test(`preflight fails closed for ${name}`, () => {
    const input = snapshot();
    mutate(input);
    expectPreflightCategory(input, category);
  });
}

test('preflight refuses unknown nested evidence instead of normalizing it', () => {
  for (const mutate of [
    (input) => delete input.issue.agentReviewPassed,
    (input) => delete input.binding.timerState,
    (input) => delete input.pullRequests[0].mergeable,
    (input) => delete input.checks.required[0].status,
    (input) => delete input.config.repo,
    (input) => delete input.config.fullAutoMerge.mergeMethod,
    (input) => delete input.config.repositoryMergeMethods,
  ]) {
    const input = snapshot();
    mutate(input);
    assert.throws(() => validateDeliveryPreflight(input), DeliveryPreflightError);
  }
});

test('provider action preserves the exact authorized intent bytes', () => {
  const preflight = validateDeliveryPreflight(snapshot());
  const intent = buildDeliveryIntent({
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: preflight.issue.number,
    repository: 'kburson/ai-task-manager',
    prNumber: preflight.pr.number,
    baseRef: preflight.pr.baseRefName,
    headRef: preflight.pr.headRefName,
    expectedHeadSha: preflight.expectedHeadSha,
    mergeMethod: preflight.mergeMethod,
    attributionTokens: preflight.commitText.attributionTokens,
    commitTitle: preflight.commitText.commitTitle,
    commitMessage: preflight.commitText.commitMessage,
    provider: 'codex',
    sessionId: 'session-939',
    clientCreatedAt: '2026-08-22T12:00:00.000Z',
  });

  const action = buildProviderAction(intent);
  assert.deepEqual(action, {
    schema: 1,
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    action: 'github.merge-pull-request',
    repository: 'kburson/ai-task-manager',
    issueNumber: 939,
    prNumber: 1400,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    commitTitle: '[#939] Governed PR delivery',
    commitMessage: COMMIT_MESSAGE,
  });
  assert.equal(Object.isFrozen(action), true);
  assert.equal(
    serializeProviderActionRequired(action),
    'AITM_PROVIDER_ACTION_REQUIRED: ' +
      `{"action":"github.merge-pull-request","baseRef":"trunk","commitMessage":${JSON.stringify(COMMIT_MESSAGE)},` +
      `"commitTitle":"[#939] Governed PR delivery","expectedHeadSha":"${HEAD}",` +
      '"headRef":"codex/939-full-auto-merge","intentId":"01ARZ3NDEKTSV4RRFFQ69G5FAV",' +
      '"issueNumber":939,"mergeMethod":"squash","prNumber":1400,' +
      '"repository":"kburson/ai-task-manager","schema":1}'
  );
});

test('provider action accepts every delivery-verifiable merge method authorized by configuration', () => {
  for (const mergeMethod of ['merge', 'squash']) {
    const input = snapshot();
    input.config.fullAutoMerge.mergeMethod = mergeMethod;
    const preflight = validateDeliveryPreflight(input);
    const intent = buildDeliveryIntent({
      intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      supersedesIntentId: null,
      issueNumber: 939,
      repository: 'kburson/ai-task-manager',
      prNumber: 1400,
      baseRef: 'trunk',
      headRef: 'codex/939-full-auto-merge',
      expectedHeadSha: HEAD,
      mergeMethod,
      attributionTokens: preflight.commitText.attributionTokens,
      commitTitle: preflight.commitText.commitTitle,
      commitMessage: preflight.commitText.commitMessage,
      provider: 'codex',
      sessionId: 'session-939',
      clientCreatedAt: '2026-08-22T12:00:00.000Z',
    });

    assert.equal(buildProviderAction(intent).mergeMethod, mergeMethod);
  }
});

test('delivery preflight refuses configured rebase before an action can be authorized', () => {
  const input = snapshot();
  input.config.fullAutoMerge.mergeMethod = 'rebase';

  expectPreflightCategory(input, 'merge-method-unverifiable');
});

test('provider action emission re-hashes intent text and rejects recovered drift', () => {
  const preflight = validateDeliveryPreflight(snapshot());
  const intent = buildDeliveryIntent({
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: 939,
    repository: 'kburson/ai-task-manager',
    prNumber: 1400,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    attributionTokens: preflight.commitText.attributionTokens,
    commitTitle: preflight.commitText.commitTitle,
    commitMessage: preflight.commitText.commitMessage,
    provider: 'codex',
    sessionId: 'session-939',
    clientCreatedAt: '2026-08-22T12:00:00.000Z',
  });
  const drifted = { ...intent, commitMessage: `${intent.commitMessage}\nforged` };
  assert.throws(
    () => buildProviderAction(drifted),
    /delivery-provider-action:commit-hash-mismatch/
  );

  const action = buildProviderAction(intent);
  const recoveredWithoutIntentHashes = { ...action };
  assert.throws(
    () => serializeProviderActionRequired(recoveredWithoutIntentHashes),
    /delivery-provider-action:untrusted-action/
  );
});

test('pure delivery policy modules contain no process execution boundary', () => {
  for (const file of ['delivery-preflight.mjs', 'delivery-provider-action.mjs']) {
    const source = readFileSync(
      new URL(`../../../../task-tracker/lib/${file}`, import.meta.url),
      'utf8'
    );
    assert.doesNotMatch(source, /node:child_process|from ['"]child_process['"]/);
    assert.equal(source.includes(['gh', 'pr', 'merge'].join(' ')), false);
  }
});
