// @story #604 #1988
// Coverage leaf for `scripts/task-tracker/lib/apply-reevaluate.mjs`.
//
// `applyReevaluate` is a pure-ish async orchestrator with every external
// dependency injectable via `deps`, so it is exercised in-process — no child
// spawn needed. Each test drives one branch (guard, skip-env, epic-skip,
// unchanged, human-attention, applied, and the best-effort catch paths) with
// stub deps so no real `gh` call is made.

import { test } from 'node:test';
import {
  estimationIssueBody,
  estimationPublicationFixture,
  estimationObservation,
} from '../../../fixtures/estimation-publication.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { parseIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import { collectDecompositionCommentProposals } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import assert from 'node:assert/strict';

import { applyReevaluate } from '../../../../task-tracker/lib/apply-reevaluate.mjs';

const REPO = 'owner/repo';

function fieldsBlock(values) {
  return `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values })} -->`;
}

// A Deep-Dive section with N "Files to edit" bullets → score 1.5*N.
function deepDiveWithFiles(n) {
  const bullets = Array.from({ length: n }, (_, i) => `- file-${i}.mjs`).join('\n');
  return `## Deep-Dive Analysis\n\n### Files to edit\n${bullets}\n`;
}

function recordingDeps(overrides = {}) {
  const calls = { postComment: [], writeField: [], mutateBody: [], fetchItem: 0 };
  const deps = {
    loadProjectFieldDefs: () => ({}),
    hasSubIssues: async () => ({ hasSubIssues: false, count: 0 }),
    postComment: async (a) => {
      calls.postComment.push(a);
    },
    projectItemForIssue: async () => {
      calls.fetchItem += 1;
      return { itemId: 'ITEM_1' };
    },
    fieldOptionMap: async () => ({}),
    writeProjectFieldValue: async (a) => {
      calls.writeField.push(a);
    },
    projectValuesForIssue: async () => ({}),
    mutateIssueBody: async ({ mutate }) => {
      // exercise the closure so its body is covered
      if (typeof mutate === 'function') mutate('seed body');
      calls.mutateBody.push(true);
    },
    ...overrides,
  };
  return { deps, calls };
}

test('throws when cfg is missing', async () => {
  await assert.rejects(() => applyReevaluate({ issueNumber: 1 }), /cfg is required/);
});

test('throws when issueNumber is missing', async () => {
  await assert.rejects(() => applyReevaluate({ cfg: { repo: REPO } }), /issueNumber is required/);
});

test('TASK_TRACKER_SKIP_REEVAL=1 short-circuits to skipped + posts bypass note', async () => {
  const { deps, calls } = recordingDeps();
  process.env.TASK_TRACKER_SKIP_REEVAL = '1';
  try {
    const r = await applyReevaluate({ cfg: { repo: REPO }, issueNumber: 5, body: '', deps });
    assert.equal(r.status, 'skipped');
    assert.equal(calls.postComment.length, 1);
    assert.match(calls.postComment[0].body, /Bypassed/);
  } finally {
    delete process.env.TASK_TRACKER_SKIP_REEVAL;
  }
});

test('skip-env tolerates a postComment failure', async () => {
  const { deps } = recordingDeps({
    postComment: async () => {
      throw new Error('network');
    },
  });
  process.env.TASK_TRACKER_SKIP_REEVAL = '1';
  try {
    const r = await applyReevaluate({ cfg: { repo: REPO }, issueNumber: 5, body: '', deps });
    assert.equal(r.status, 'skipped');
  } finally {
    delete process.env.TASK_TRACKER_SKIP_REEVAL;
  }
});

test('epic with sub-issues is skipped', async () => {
  const { deps, calls } = recordingDeps({
    hasSubIssues: async () => ({ hasSubIssues: true, count: 3 }),
  });
  const r = await applyReevaluate({ cfg: { repo: REPO }, issueNumber: 9, body: '', deps });
  assert.equal(r.status, 'skipped-epic');
  assert.equal(r.subIssueCount, 3);
  assert.match(calls.postComment[0].body, /3 sub-issue/);
});

test('epic-skip tolerates a postComment failure', async () => {
  const { deps } = recordingDeps({
    hasSubIssues: async () => ({ hasSubIssues: true, count: 1 }),
    postComment: async () => {
      throw new Error('boom');
    },
  });
  const r = await applyReevaluate({ cfg: { repo: REPO }, issueNumber: 9, body: '', deps });
  assert.equal(r.status, 'skipped-epic');
});

test('returns unchanged when size+estimate already match', async () => {
  const { deps } = recordingDeps();
  const body = fieldsBlock({ size: 'XS', estimate: 1.5 }); // no deep-dive → XS / 1.5
  const r = await applyReevaluate({ cfg: { repo: REPO }, issueNumber: 2, body, deps });
  assert.equal(r.status, 'unchanged');
});

for (const [files, wantSize, wantHours, wantStatus] of [
  [10, 'L', 16, 'applied'],
  [14, 'XL', 24, 'human-attention'],
])
  test(`actual deep-dive ${wantStatus} records its real effects and keeps proposals separate`, async () => {
    const cfg = { repo: REPO, projectId: 'PID', fieldIds: { estimate: 'EST', size: 'SIZE' } };
    let body = estimationIssueBody({ estimate: 10, size: 'M' }) + '\n' + deepDiveWithFiles(files),
      board = { estimate: 10, size: 'M' },
      comments = [],
      posts = 0;
    const subject = { repository: REPO, issue: 1987, projectId: 'PID', projectItemId: 'ITEM_1987' };
    const fixture = estimationPublicationFixture({
      cfg,
      issueNumber: 1987,
      getBody: () => body,
      setBody: (b) => (body = b),
      getProject: () => board,
      getForecast: () => {
        const parsed = collectDecompositionCommentProposals({
          comments,
          subject,
          body,
          published: null,
          board,
          bodyFields: parseIssueFieldDb(body).values,
        });
        return estimationObservation({
          estimate: null,
          size: null,
          recordId: null,
          proposals: parsed.proposals,
          observedProjections: [],
        });
      },
    });
    const deps = {
      ...fixture,
      hasSubIssues: async () => ({ hasSubIssues: false, count: 0 }),
      listComments: async () => comments,
      loadProjectFieldDefs: () => [],
      fieldOptionMap: async () => ({}),
      postComment: async ({ body: next }) => {
        assert.equal(
          readDecompositionRecords(body).publication?.status,
          'pending',
          'intent before audit creation'
        );
        comments.push({ id: 'IC_new', body: next });
        posts++;
      },
      writeProjectFieldValue: async ({ fieldId, value }) => {
        assert.equal(readDecompositionRecords(body).publication.status, 'pending');
        if (fieldId === 'EST') board.estimate = value.number;
        if (fieldId === 'SIZE') board.size = value.singleSelectOptionName;
      },
    };
    const args = { cfg, issueNumber: 1987, body, deps };
    const result = await applyReevaluate(args);
    assert.equal(result.status, wantStatus, result.reason ?? result.error);
    const r = readDecompositionRecords(body);
    assert.equal(r.publication.status, 'complete');
    assert.equal(r.publication.writerId, 'apply-reevaluate');
    assert.equal(r.assessment.estimate.hours, wantHours);
    assert.equal(r.assessment.size, wantSize);
    assert.equal(board.estimate, wantStatus === 'applied' ? 16 : 10);
    assert.equal(board.size, wantStatus === 'applied' ? 'L' : 'M');
    assert.equal(posts, 1);
  });

test('a changed estimate with no configured project refuses before comment or body publication', async () => {
  let writes = 0;
  const result = await applyReevaluate({
    cfg: { repo: REPO },
    issueNumber: 1987,
    body: fieldsBlock({ estimate: 10, size: 'M' }) + '\n' + deepDiveWithFiles(14),
    deps: {
      hasSubIssues: async () => ({ hasSubIssues: false, count: 0 }),
      postComment: async () => {
        writes++;
      },
      mutateIssueBody: async () => {
        writes++;
      },
    },
  });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /configured-membership-required/);
  assert.equal(writes, 0);
});
for (const failedEffect of ['audit', 'estimate', 'size', 'fields'])
  test(`deep-dive reconciles unknown ${failedEffect} and preserves one keyed audit`, async () => {
    const cfg = { repo: REPO, projectId: 'PID', fieldIds: { estimate: 'EST', size: 'SIZE' } };
    let body = estimationIssueBody({ estimate: 10, size: 'M' }) + '\n' + deepDiveWithFiles(10),
      board = { estimate: 10, size: 'M' },
      comments = [],
      failed = false;
    const counts = { audit: 0, estimate: 0, size: 0, fields: 0 };
    const fixture = estimationPublicationFixture({
      cfg,
      issueNumber: 1987,
      getBody: () => body,
      setBody: (b) => {
        const changed =
          parseIssueFieldDb(b).values.estimate !== parseIssueFieldDb(body).values.estimate;
        body = b;
        if (changed) {
          counts.fields++;
          if (failedEffect === 'fields' && !failed) {
            failed = true;
            throw new Error('body outcome unknown');
          }
        }
      },
      getProject: () => board,
      getForecast: () =>
        estimationObservation({
          estimate: null,
          size: null,
          recordId: null,
          proposals: [],
          observedProjections: [],
        }),
    });
    const deps = {
      ...fixture,
      hasSubIssues: async () => ({ hasSubIssues: false, count: 0 }),
      listComments: async () => comments,
      loadProjectFieldDefs: () => [],
      fieldOptionMap: async () => ({}),
      postComment: async ({ body: next }) => {
        comments.push({ id: 'IC_audit', body: next });
        counts.audit++;
        if (failedEffect === 'audit' && !failed) {
          failed = true;
          throw new Error('comment outcome unknown');
        }
      },
      writeProjectFieldValue: async ({ fieldId, value }) => {
        const field = fieldId === 'EST' ? 'estimate' : 'size';
        board[field] = field === 'estimate' ? value.number : value.singleSelectOptionName;
        counts[field]++;
        if (failedEffect === field && !failed) {
          failed = true;
          throw new Error('field outcome unknown');
        }
      },
    };
    const original = body;
    const first = await applyReevaluate({ cfg, issueNumber: 1987, body: original, deps });
    assert.equal(first.status, 'partial', first.reason);
    assert.equal(readDecompositionRecords(body).publication.status, 'pending');
    const retry = await applyReevaluate({ cfg, issueNumber: 1987, body, deps });
    assert.equal(retry.status, 'applied', retry.reason ?? 'pending operation not reconciled');
    assert.equal(readDecompositionRecords(body).publication.status, 'complete');
    assert.equal(comments.length, 1);
    assert.deepEqual(counts, { audit: 1, estimate: 1, size: 1, fields: 1 });
  });
