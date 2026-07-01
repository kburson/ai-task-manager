// @story #675 (AC3)
// `refine` verb atomicity: the pre-Refine entry path stamps
// `aitm-refine-complete` (+ rationale) BEFORE calling `verbPromote` to walk
// backlog/on-deck up to Refine. If that promote call throws (a refused
// promote), the body must not be left claiming refine-complete without the
// state having actually advanced — the marker must be rolled back.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runRefine, REFINE_COMPLETE_MARKER_RE } from '../../verbs/refine.mjs';

const baseCfg = { repo: 'owner/repo', projectId: 'PVT_FAKE' };

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n## Issue\n\nbody.\n`;
}

test('a refused promote during pre-Refine entry rolls back the refine-complete marker', async () => {
  let currentBody = bodyWithState('backlog');
  const mutateCalls = [];
  const deps = {
    assertBound: () => {},
    tetherIssueToProject: async () => ({ itemId: 'X' }),
    fetchBody: async () => currentBody,
    mutateBody: async ({ mutate }) => {
      const next = mutate(currentBody);
      mutateCalls.push(next);
      currentBody = next;
      return { status: 'ok' };
    },
    verbPromote: async () => {
      throw new Error('refine-exit-refused: some gate blocked the hop');
    },
  };

  await assert.rejects(
    runRefine({
      args: { issueNumber: 800, size: 'S', estimate: '2', priority: 'p1', reason: 'entry' },
      cfg: baseCfg,
      deps,
    }),
    /some gate blocked the hop/
  );

  // The first mutateBody call (step 2c/2d) stamped refine-complete; the
  // second (rollback) must have stripped it back out.
  assert.equal(mutateCalls.length, 2, 'expected the initial stamp + the rollback write');
  assert.match(mutateCalls[0], REFINE_COMPLETE_MARKER_RE, 'marker present after initial stamp');
  assert.doesNotMatch(
    currentBody,
    REFINE_COMPLETE_MARKER_RE,
    'refine-complete marker must be rolled back after a refused promote'
  );
});

test('rationale marker and field-db values survive a rolled-back promote', async () => {
  let currentBody = bodyWithState('backlog');
  const deps = {
    assertBound: () => {},
    tetherIssueToProject: async () => ({ itemId: 'X' }),
    fetchBody: async () => currentBody,
    mutateBody: async ({ mutate }) => {
      currentBody = mutate(currentBody);
      return { status: 'ok' };
    },
    verbPromote: async () => {
      throw new Error('refine-exit-refused');
    },
  };

  await assert.rejects(
    runRefine({
      args: {
        issueNumber: 801,
        size: 'M',
        estimate: '4',
        priority: 'p1',
        reason: 'keep rationale',
      },
      cfg: baseCfg,
      deps,
    })
  );

  assert.match(
    currentBody,
    /aitm-refinement-rationale/,
    'rationale marker is not part of the AC3 rollback — only refine-complete rolls back'
  );
});

test('a successful promote leaves the refine-complete marker in place', async () => {
  let currentBody = bodyWithState('backlog');
  const deps = {
    assertBound: () => {},
    tetherIssueToProject: async () => ({ itemId: 'X' }),
    fetchBody: async () => currentBody,
    mutateBody: async ({ mutate }) => {
      currentBody = mutate(currentBody);
      return { status: 'ok' };
    },
    verbPromote: async () => {},
  };

  const result = await runRefine({
    args: { issueNumber: 802, size: 'S', estimate: '2', priority: 'p1', reason: 'happy path' },
    cfg: baseCfg,
    deps,
  });

  assert.equal(result.promoted, true);
  assert.match(currentBody, REFINE_COMPLETE_MARKER_RE);
});
