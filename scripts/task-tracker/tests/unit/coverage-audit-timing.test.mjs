#!/usr/bin/env node
// @story #628
// #628 — coverage lift for `lib/move-state/audit-timing.mjs`. The three
// post-move timeline emitters funnel into real `gh` through dynamically
// imported timing helpers and `enforceFullAutoAudit`'s gh-backed defaults, so
// no unit test could reach them. The behavior-preserving `ctx.deps` seam lets
// this suite drive every branch against fakes with ZERO network:
//
//   • emitPhasePairRows    — SKIP_NETWORK guard, demote row, <prev>:complete
//                            row, done.complete row, <next>:enter row, catch.
//   • emitFullAutoReviewAudit — guard, full-auto audit-comment path,
//                            human-reviewer marker-stamp path, catch.
//   • emitOutOfBandAudit   — guard, full comment+timing path, comment-throw
//                            and timing-throw best-effort catches.
//
// Production assembles `ctx` with no `deps` key, so this seam is a pure
// testability affordance — real runs still spawn `gh` exactly as before.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  emitPhasePairRows,
  emitFullAutoReviewAudit,
  emitOutOfBandAudit,
} from '../../lib/move-state/audit-timing.mjs';

// A fake timing-helper surface. `postTimingEvent` records into `posted`.
function makeTimingDeps({ posted, readBody = { status: 'found', body: 'LOG' }, buildThrows } = {}) {
  return {
    ghTimingComment: {
      buildRow: (o) => {
        if (buildThrows) throw new Error('buildRow boom');
        return { __row: o };
      },
      postTimingEvent: async (a) => {
        posted.push(a);
      },
      readTimingCommentBody: async () => readBody,
      bodyOf: (r) => (r == null ? '' : (r.body ?? '')),
    },
    timingRows: {
      deriveStateMoveDelta: () => ({ activeSec: 11, idleSec: 22 }),
    },
  };
}

function phaseEvents(table) {
  return { phaseEvents: { PHASE_EVENTS: table } };
}

// --- emitPhasePairRows ------------------------------------------------------

test('emitPhasePairRows: SKIP_NETWORK short-circuits before any emission', async () => {
  const posted = [];
  await emitPhasePairRows({
    issueArg: '10',
    stateArg: 'develop',
    SKIP_NETWORK: true,
    cfg: { repo: 'o/r' },
    deps: { ...makeTimingDeps({ posted }), ...phaseEvents({}) },
  });
  assert.equal(posted.length, 0);
});

test('emitPhasePairRows: demote emits a `demoted` row then the <next>:enter row', async () => {
  const posted = [];
  await emitPhasePairRows({
    issueArg: '10',
    stateArg: 'refine',
    resolvedFromState: 'develop',
    demoteFlag: true,
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    deps: {
      ...makeTimingDeps({ posted }),
      ...phaseEvents({ refine: { enter: true } }),
    },
  });
  assert.equal(posted.length, 2);
  assert.equal(posted[0].row.__row.event, 'demoted');
  assert.deepEqual(posted[1].row.__row.phase, { state: 'refine', phase: 'enter' });
});

test('emitPhasePairRows: forward move emits <prev>:complete then <next>:enter', async () => {
  const posted = [];
  await emitPhasePairRows({
    issueArg: '10',
    stateArg: 'test',
    resolvedFromState: 'develop',
    demoteFlag: false,
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    deps: {
      ...makeTimingDeps({ posted }),
      ...phaseEvents({ develop: { complete: true }, test: { enter: true } }),
    },
  });
  assert.equal(posted.length, 2);
  assert.deepEqual(posted[0].row.__row.phase, { state: 'develop', phase: 'complete' });
  assert.deepEqual(posted[1].row.__row.phase, { state: 'test', phase: 'enter' });
});

test('emitPhasePairRows: move to done emits a single done.complete row', async () => {
  const posted = [];
  await emitPhasePairRows({
    issueArg: '10',
    stateArg: 'done',
    resolvedFromState: 'review',
    demoteFlag: false,
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    deps: {
      ...makeTimingDeps({ posted }),
      ...phaseEvents({ review: { complete: true }, done: { complete: true } }),
    },
  });
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0].row.__row.phase, { state: 'done', phase: 'complete' });
});

test('emitPhasePairRows: a throwing helper is swallowed (best-effort)', async () => {
  const posted = [];
  await emitPhasePairRows({
    issueArg: '10',
    stateArg: 'develop',
    resolvedFromState: 'plan',
    demoteFlag: true,
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    deps: {
      ...makeTimingDeps({ posted, buildThrows: true }),
      ...phaseEvents({ develop: { enter: true } }),
    },
  });
  // buildRow threw before any post; the outer catch absorbed it.
  assert.equal(posted.length, 0);
});

// --- emitFullAutoReviewAudit ------------------------------------------------

test('emitFullAutoReviewAudit: non-done move short-circuits', async () => {
  let pexecCalls = 0;
  await emitFullAutoReviewAudit({
    issueArg: '10',
    stateArg: 'review',
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    pexec: async () => {
      pexecCalls++;
      return { stdout: '{}' };
    },
  });
  assert.equal(pexecCalls, 0);
});

test('emitFullAutoReviewAudit: full-auto posts the audit comment', async () => {
  const savedReviewer = process.env.TASK_TRACKER_HUMAN_REVIEWER;
  const savedCascade = process.env.AITM_CASCADE;
  delete process.env.TASK_TRACKER_HUMAN_REVIEWER;
  delete process.env.AITM_CASCADE;
  try {
    const posted = [];
    await emitFullAutoReviewAudit({
      issueArg: '10',
      stateArg: 'done',
      SKIP_NETWORK: false,
      cfg: { repo: 'o/r' },
      pexec: async () => ({ stdout: JSON.stringify({ body: 'ISSUE BODY' }) }),
      gh: async () => {},
      deps: {
        listComments: async () => [], // no prior audit comment
        postComment: async (c) => posted.push(c),
      },
    });
    assert.equal(posted.length, 1);
    assert.match(posted[0].body, /aitm-full-auto-approval/);
  } finally {
    if (savedReviewer !== undefined) process.env.TASK_TRACKER_HUMAN_REVIEWER = savedReviewer;
    if (savedCascade !== undefined) process.env.AITM_CASCADE = savedCascade;
  }
});

test('emitFullAutoReviewAudit: human-reviewer stamps a marker via ctx.gh', async () => {
  const savedReviewer = process.env.TASK_TRACKER_HUMAN_REVIEWER;
  const savedCascade = process.env.AITM_CASCADE;
  process.env.TASK_TRACKER_HUMAN_REVIEWER = 'alice';
  delete process.env.AITM_CASCADE;
  try {
    const ghCalls = [];
    await emitFullAutoReviewAudit({
      issueArg: '10',
      stateArg: 'done',
      SKIP_NETWORK: false,
      cfg: { repo: 'o/r' },
      pexec: async () => ({ stdout: JSON.stringify({ body: 'ISSUE BODY no marker' }) }),
      gh: async (args) => ghCalls.push(args),
      deps: {
        postComment: async () => {},
      },
    });
    // The marker stamp routed through ctx.gh (issue edit --body-file).
    assert.ok(ghCalls.length >= 1, 'ctx.gh was invoked to write the marker');
    assert.deepEqual(ghCalls[0].slice(0, 2), ['issue', 'edit']);
  } finally {
    if (savedReviewer !== undefined) process.env.TASK_TRACKER_HUMAN_REVIEWER = savedReviewer;
    else delete process.env.TASK_TRACKER_HUMAN_REVIEWER;
    if (savedCascade !== undefined) process.env.AITM_CASCADE = savedCascade;
  }
});

test('emitFullAutoReviewAudit: a throwing pexec is swallowed', async () => {
  const savedReviewer = process.env.TASK_TRACKER_HUMAN_REVIEWER;
  const savedCascade = process.env.AITM_CASCADE;
  delete process.env.TASK_TRACKER_HUMAN_REVIEWER;
  delete process.env.AITM_CASCADE;
  try {
    await emitFullAutoReviewAudit({
      issueArg: '10',
      stateArg: 'done',
      SKIP_NETWORK: false,
      cfg: { repo: 'o/r' },
      pexec: async () => {
        throw new Error('gh view down');
      },
      gh: async () => {},
      deps: {},
    });
    // no throw = catch absorbed it
    assert.ok(true);
  } finally {
    if (savedReviewer !== undefined) process.env.TASK_TRACKER_HUMAN_REVIEWER = savedReviewer;
    if (savedCascade !== undefined) process.env.AITM_CASCADE = savedCascade;
  }
});

// --- emitOutOfBandAudit -----------------------------------------------------

test('emitOutOfBandAudit: no reason short-circuits', async () => {
  let ghCalls = 0;
  await emitOutOfBandAudit({
    issueArg: '10',
    stateArg: 'develop',
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    gh: async () => {
      ghCalls++;
    },
  });
  assert.equal(ghCalls, 0);
});

test('emitOutOfBandAudit: full path posts the audit comment and a timing row', async () => {
  const posted = [];
  const ghCalls = [];
  await emitOutOfBandAudit({
    issueArg: '10',
    stateArg: 'review',
    resolvedFromState: 'develop',
    outOfBandReason: 'emergency demote',
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    gh: async (args) => ghCalls.push(args),
    deps: makeTimingDeps({ posted }),
  });
  assert.equal(ghCalls[0][0], 'issue');
  assert.equal(ghCalls[0][1], 'comment');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].row.__row.event, 'out-of-band-move');
});

test('emitOutOfBandAudit: comment-throw and timing-throw are both swallowed', async () => {
  const posted = [];
  const deps = makeTimingDeps({ posted });
  // Make the timing emission throw too.
  deps.ghTimingComment.postTimingEvent = async () => {
    throw new Error('timing down');
  };
  await emitOutOfBandAudit({
    issueArg: '10',
    stateArg: 'review',
    resolvedFromState: 'develop',
    outOfBandReason: 'emergency demote',
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    gh: async () => {
      throw new Error('gh comment down');
    },
    deps,
  });
  // Both best-effort catches absorbed their throws.
  assert.equal(posted.length, 0);
});
