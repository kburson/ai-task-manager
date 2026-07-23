// @story #604
// Coverage leaf for `scripts/task-tracker/lib/apply-reevaluate.mjs`.
//
// `applyReevaluate` is a pure-ish async orchestrator with every external
// dependency injectable via `deps`, so it is exercised in-process — no child
// spawn needed. Each test drives one branch (guard, skip-env, epic-skip,
// unchanged, human-attention, applied, and the best-effort catch paths) with
// stub deps so no real `gh` call is made.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyReevaluate } from '../../../lib/apply-reevaluate.mjs';

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

test('falls back to project field values when field-DB lacks size/estimate', async () => {
  const { deps } = recordingDeps({
    projectValuesForIssue: async () => ({ size: 'XS', estimate: 1.5 }),
  });
  // no aitm-fields block, projectId set → fetchProjectValues path
  const r = await applyReevaluate({
    cfg: { repo: REPO, projectId: 'PID' },
    issueNumber: 2,
    body: 'no field db here',
    deps,
  });
  assert.equal(r.status, 'unchanged');
});

test('tolerates a projectValuesForIssue failure', async () => {
  const { deps } = recordingDeps({
    projectValuesForIssue: async () => {
      throw new Error('graphql down');
    },
  });
  const r = await applyReevaluate({
    cfg: { repo: REPO, projectId: 'PID' },
    issueNumber: 2,
    body: 'no field db',
    deps,
  });
  // fetch threw → current size/estimate stay null → reevaluate treats null as a
  // change, so this lands on the applied path (no field ids → warn, no writes).
  assert.equal(r.status, 'applied');
});

test('≥2-tier jump requires human attention and is not auto-applied', async () => {
  const { deps, calls } = recordingDeps();
  const body = `${fieldsBlock({ size: 'XS', estimate: 1.5 })}\n${deepDiveWithFiles(14)}`; // → XL
  const r = await applyReevaluate({ cfg: { repo: REPO }, issueNumber: 3, body, deps });
  assert.equal(r.status, 'human-attention');
  assert.equal(r.result.requiresHuman, true);
  assert.equal(calls.writeField.length, 0);
  assert.match(calls.postComment[0].body, /HUMAN ATTENTION/);
});

test('human-attention tolerates a postComment failure', async () => {
  const { deps } = recordingDeps({
    postComment: async () => {
      throw new Error('nope');
    },
  });
  const body = `${fieldsBlock({ size: 'XS', estimate: 1.5 })}\n${deepDiveWithFiles(14)}`;
  const r = await applyReevaluate({ cfg: { repo: REPO }, issueNumber: 3, body, deps });
  assert.equal(r.status, 'human-attention');
});

test('applied path writes both fields, patches body, and posts audit', async () => {
  const { deps, calls } = recordingDeps();
  const body = `${fieldsBlock({ size: 'S', estimate: 3.5 })}\n${deepDiveWithFiles(5)}`; // 7.5 → M
  const cfg = { repo: REPO, projectId: 'PID', fieldIds: { size: 'F_SIZE', estimate: 'F_EST' } };
  const r = await applyReevaluate({ cfg, issueNumber: 4, body, deps });
  assert.equal(r.status, 'applied');
  assert.equal(r.result.size, 'M');
  assert.equal(calls.fetchItem, 1);
  assert.equal(calls.writeField.length, 2);
  assert.equal(calls.mutateBody.length, 1);
  assert.equal(calls.postComment.length, 1);
});

test('applied path warns when field ids are missing (no writes)', async () => {
  const { deps, calls } = recordingDeps();
  const body = `${fieldsBlock({ size: 'S', estimate: 3.5 })}\n${deepDiveWithFiles(5)}`;
  const cfg = { repo: REPO, projectId: 'PID' }; // no fieldIds → fieldIdFor('')
  const r = await applyReevaluate({ cfg, issueNumber: 4, body, deps });
  assert.equal(r.status, 'applied');
  assert.equal(calls.writeField.length, 0);
  assert.equal(calls.mutateBody.length, 1);
});

test('applied path tolerates a project-item write failure', async () => {
  const { deps, calls } = recordingDeps({
    projectItemForIssue: async () => {
      throw new Error('item lookup failed');
    },
  });
  const body = `${fieldsBlock({ size: 'S', estimate: 3.5 })}\n${deepDiveWithFiles(5)}`;
  const cfg = { repo: REPO, projectId: 'PID', fieldIds: { size: 'F_SIZE', estimate: 'F_EST' } };
  const r = await applyReevaluate({ cfg, issueNumber: 4, body, deps });
  assert.equal(r.status, 'applied');
  assert.equal(calls.writeField.length, 0); // threw before writing
  assert.equal(calls.mutateBody.length, 1); // still patches body
});

test('applied path tolerates a body-patch failure', async () => {
  const { deps } = recordingDeps({
    mutateIssueBody: async () => {
      throw new Error('patch conflict');
    },
  });
  const body = `${fieldsBlock({ size: 'S', estimate: 3.5 })}\n${deepDiveWithFiles(5)}`;
  const cfg = { repo: REPO, projectId: 'PID', fieldIds: { size: 'F_SIZE', estimate: 'F_EST' } };
  const r = await applyReevaluate({ cfg, issueNumber: 4, body, deps });
  assert.equal(r.status, 'applied');
});

test('applied path with no projectId skips field writes but patches body', async () => {
  const { deps, calls } = recordingDeps();
  const body = `${fieldsBlock({ size: 'S', estimate: 3.5 })}\n${deepDiveWithFiles(5)}`;
  const r = await applyReevaluate({ cfg: { repo: REPO }, issueNumber: 4, body, deps });
  assert.equal(r.status, 'applied');
  assert.equal(calls.fetchItem, 0);
  assert.equal(calls.mutateBody.length, 1);
});
