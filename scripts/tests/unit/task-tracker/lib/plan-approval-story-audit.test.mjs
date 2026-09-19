// @story #1711
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as audits from '../../../../task-tracker/lib/plan-approval-audit.mjs';
const approved = {
  ts: '2026-09-19T12:00:00Z',
  mode: 'human',
  trunkSha: 'c'.repeat(40),
  storyDigest: 'a'.repeat(64),
  storyIntentDigest: 'b'.repeat(64),
  storyIntentSource: 'deep-dive',
};
test('repair audit records prior evidence and the current human actor without Full-Auto declaration', () => {
  assert.equal(typeof audits.buildStoryBindingRepairAudit, 'function');
  const body = audits.buildStoryBindingRepairAudit({
    issueNumber: 1711,
    previousApproval: { ts: 'old', mode: 'full-auto' },
    approved,
  });
  assert.match(body, /Story-Binding Repair Audit/);
  assert.match(body, /old/);
  assert.match(body, /human/);
  assert.match(body, /a{64}/);
  assert.match(body, /c{40}/);
  assert.doesNotMatch(body, /under explicit `TT_FULL_AUTO=1`/);
});
test('repair audit retries recognize issue, timestamp and digests and report unavailable history honestly', async () => {
  assert.equal(typeof audits.ensureStoryBindingRepairAudit, 'function');
  const comments = [];
  const args = {
    issueNumber: 1711,
    repo: 'o/r',
    approved,
    listComments: async () => comments,
    postComment: async ({ body }) => comments.push({ body }),
  };
  const first = await audits.ensureStoryBindingRepairAudit(args);
  assert.equal(first.auditPosted, true);
  assert.match(comments[0].body, /prior evidence unavailable/i);
  assert.doesNotMatch(comments[0].body, /this retry|superseded approval/i);
  assert.match(comments[0].body, /cannot establish whether a repair occurred/i);
  const retry = await audits.ensureStoryBindingRepairAudit(args);
  assert.equal(retry.alreadyPresent, true);
  assert.equal(comments.length, 1);
  await audits.ensureStoryBindingRepairAudit({
    ...args,
    approved: { ...approved, storyDigest: 'd'.repeat(64) },
  });
  assert.equal(comments.length, 2);
});
test('known prior evidence cannot be suppressed by a different or unavailable prior payload', async () => {
  const previousApproval = { ts: '2026-01-01T00:00:00Z', mode: 'human' };
  for (const wrongPrior of [undefined, { ts: '2025-01-01T00:00:00Z', mode: 'full-auto' }]) {
    const comments = [
      {
        body: audits.buildStoryBindingRepairAudit({
          issueNumber: 1711,
          approved,
          previousApproval: wrongPrior,
        }),
      },
    ];
    const args = {
      issueNumber: 1711,
      repo: 'o/r',
      approved,
      previousApproval,
      listComments: async () => comments,
      postComment: async ({ body }) => comments.push({ body }),
    };
    assert.equal((await audits.ensureStoryBindingRepairAudit(args)).auditPosted, true);
    assert.match(comments[1].body, /2026-01-01T00:00:00Z/);
    assert.equal((await audits.ensureStoryBindingRepairAudit(args)).alreadyPresent, true);
    assert.equal(
      (await audits.ensureStoryBindingRepairAudit({ ...args, previousApproval: undefined }))
        .alreadyPresent,
      true
    );
    assert.equal(comments.length, 2);
  }
});
test('an evidence key without the matching approved payload does not suppress repair', async () => {
  const canonical = audits.buildStoryBindingRepairAudit({ issueNumber: 1711, approved });
  const comments = [{ body: canonical.replace('mode: human', 'mode: full-auto') }];
  const result = await audits.ensureStoryBindingRepairAudit({
    issueNumber: 1711,
    repo: 'o/r',
    approved,
    listComments: async () => comments,
    postComment: async ({ body }) => comments.push({ body }),
  });
  assert.equal(result.auditPosted, true);
  assert.equal(comments.length, 2);
});
test('both listing and posting failures retain known prior and new approval evidence', async () => {
  const previousApproval = { ts: '2026-01-01T00:00:00Z', mode: 'human' };
  for (const stage of ['list', 'post']) {
    await assert.rejects(
      () =>
        audits.ensureStoryBindingRepairAudit({
          issueNumber: 1711,
          repo: 'o/r',
          previousApproval,
          approved,
          listComments: async () => {
            if (stage === 'list') throw new Error('offline');
            return [];
          },
          postComment: async () => {
            throw new Error('offline');
          },
        }),
      (error) => {
        assert.equal(error.message, 'offline');
        assert.deepEqual(error.storyBindingRepair?.previousApproval, previousApproval);
        assert.deepEqual(error.storyBindingRepair?.approved, approved);
        assert.match(error.storyBindingRepair.body, /2026-01-01T00:00:00Z/);
        return true;
      }
    );
  }
});
