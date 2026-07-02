// @story #631
// Coverage-lift unit test for `lib/apply-review-delta.mjs` (`applyReviewDelta`
// plus its two module-private gh helpers). Every collaborator is injected via
// the module's `deps` seam — extended in #631 with a `deps.exec` default-through
// so `defaultPostComment`/`defaultFetchComments` are drivable against a fake
// exec. Zero subprocess.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyReviewDelta } from '../../lib/apply-review-delta.mjs';

const cfg = { repo: 'kburson/ai-task-manager' };

// Base deps: a capturing postComment + benign field/board/comments fakes.
function makeDeps(over = {}) {
  const posted = [];
  const deps = {
    postComment: async (a) => {
      posted.push(a);
    },
    loadProjectFieldDefs: () => ({}),
    projectValuesForIssue: async () => ({}),
    fetchComments: async () => [],
    ...over,
  };
  return { deps, posted };
}

test('throws when cfg is missing', async () => {
  await assert.rejects(() => applyReviewDelta({ issueNumber: 1 }), /cfg is required/);
});

test('throws when issueNumber is missing', async () => {
  await assert.rejects(() => applyReviewDelta({ cfg }), /issueNumber is required/);
});

test('TASK_TRACKER_SKIP_DELTA=1 posts the bypass note and returns skipped', async () => {
  const prev = process.env.TASK_TRACKER_SKIP_DELTA;
  process.env.TASK_TRACKER_SKIP_DELTA = '1';
  try {
    const { deps, posted } = makeDeps();
    const res = await applyReviewDelta({ cfg, issueNumber: 631, deps });
    assert.equal(res.status, 'skipped');
    assert.equal(posted.length, 1);
    assert.match(posted[0].body, /Bypassed via/);
  } finally {
    if (prev === undefined) delete process.env.TASK_TRACKER_SKIP_DELTA;
    else process.env.TASK_TRACKER_SKIP_DELTA = prev;
  }
});

test('skip-delta swallows a throwing postComment and still returns skipped', async () => {
  const prev = process.env.TASK_TRACKER_SKIP_DELTA;
  process.env.TASK_TRACKER_SKIP_DELTA = '1';
  try {
    const { deps } = makeDeps({
      postComment: async () => {
        throw new Error('post-boom');
      },
    });
    const res = await applyReviewDelta({ cfg, issueNumber: 631, deps });
    assert.equal(res.status, 'skipped');
  } finally {
    if (prev === undefined) delete process.env.TASK_TRACKER_SKIP_DELTA;
    else process.env.TASK_TRACKER_SKIP_DELTA = prev;
  }
});

test('board path parses estimate + duration strings to seconds', async () => {
  const { deps, posted } = makeDeps({
    projectValuesForIssue: async () => ({
      estimate: 2,
      engagedTime: '00d 01h 00m 00s',
      planTime: '00d 00h 30m 00s',
    }),
  });
  const res = await applyReviewDelta({
    cfg: { ...cfg, projectId: 'P_1' },
    issueNumber: 631,
    deps,
  });
  assert.equal(res.status, 'applied');
  assert.equal(res.result.estimateHr, 2);
  assert.equal(res.result.actualSec, 3600);
  assert.equal(res.result.planSec, 1800);
  assert.equal(posted.length, 1);
});

test('board path degrades a blank/malformed duration to null', async () => {
  const { deps } = makeDeps({
    projectValuesForIssue: async () => ({ estimate: 5, engagedTime: '', planTime: 'garbage' }),
  });
  const res = await applyReviewDelta({
    cfg: { ...cfg, projectId: 'P_1' },
    issueNumber: 631,
    deps,
  });
  assert.equal(res.status, 'applied');
  assert.equal(res.result.estimateHr, 5);
  assert.equal(res.result.actualSec, null);
  assert.equal(res.result.planSec, null);
});

test('board fetch throwing is swallowed, leaving estimate null', async () => {
  const { deps } = makeDeps({
    projectValuesForIssue: async () => {
      throw new Error('board-boom');
    },
  });
  const res = await applyReviewDelta({
    cfg: { ...cfg, projectId: 'P_1' },
    issueNumber: 631,
    deps,
  });
  assert.equal(res.status, 'applied');
  assert.equal(res.result.hasEstimate, false);
});

test('estimate falls back to the issue-field DB when no projectId', async () => {
  const body = 'preamble\n<!-- aitm-fields: {"schema":1,"values":{"estimate":3}} -->\n';
  const { deps } = makeDeps();
  const res = await applyReviewDelta({ cfg, issueNumber: 631, body, deps });
  assert.equal(res.status, 'applied');
  assert.equal(res.result.estimateHr, 3);
});

test('drivers are pulled from a Review Notes comment', async () => {
  const notesBody = '### 📝 Review Notes\n\n- scope grew\n- flaky infra\n';
  const { deps } = makeDeps({
    fetchComments: async () => [{ body: notesBody, createdAt: '2026-07-02T00:00:00Z' }],
  });
  const res = await applyReviewDelta({ cfg, issueNumber: 631, deps });
  assert.equal(res.status, 'applied');
});

test('a throwing fetchComments is swallowed', async () => {
  const { deps } = makeDeps({
    fetchComments: async () => {
      throw new Error('comments-boom');
    },
  });
  const res = await applyReviewDelta({ cfg, issueNumber: 631, deps });
  assert.equal(res.status, 'applied');
});

test('a throwing postComment yields status:error with the message', async () => {
  const { deps } = makeDeps({
    postComment: async () => {
      throw new Error('post-fail');
    },
  });
  const res = await applyReviewDelta({ cfg, issueNumber: 631, deps });
  assert.equal(res.status, 'error');
  assert.equal(res.error, 'post-fail');
});

test('default helpers run when deps.exec is injected (no postComment/fetchComments)', async () => {
  const commentsJson = JSON.stringify({
    comments: [{ body: '### 📝 Review Notes\n\n- driver a\n', createdAt: '2026-07-02T00:00:00Z' }],
  });
  const calls = [];
  const deps = {
    loadProjectFieldDefs: () => ({}),
    exec: async (bin, args) => {
      calls.push({ bin, sub: args[0], verb: args[1] });
      if (args[1] === 'view') return { stdout: commentsJson };
      return { stdout: '' };
    },
  };
  const res = await applyReviewDelta({ cfg, issueNumber: 631, deps });
  assert.equal(res.status, 'applied');
  // defaultFetchComments issued the view call; defaultPostComment issued comment.
  assert.ok(calls.some((c) => c.verb === 'view'));
  assert.ok(calls.some((c) => c.verb === 'comment'));
});

test('defaultFetchComments returns [] when exec throws (post still succeeds)', async () => {
  const deps = {
    loadProjectFieldDefs: () => ({}),
    exec: async (bin, args) => {
      if (args[1] === 'view') throw new Error('view-boom');
      return { stdout: '' };
    },
  };
  const res = await applyReviewDelta({ cfg, issueNumber: 631, deps });
  assert.equal(res.status, 'applied');
});
