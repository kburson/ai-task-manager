// @story #279
// Parity test for the review → done guard-registry migration (#279).
//
// Before #279, review → done was gated by inline checks at one call site
// (scripts/task-tracker/verbs/close.mjs: marker regex + runCloseGates).
// After #279, the same rules live in `STATES.review.exitGuards` and surface
// through `runGuards('review','done', ctx)` — invoked both by the close verb
// and by the promote-direct path via move-state.mjs. This test pins the
// refusal contract end-to-end:
//
//   - The registry refusal IDs are stable.
//   - The state-object walk (`STATES.review.exitGuards`) agrees with the
//     registry walk (`runGuards`) on which guards fire.
//   - Missing-approved-marker / missing-dod-marker / clean fixtures
//     produce the documented refusal mix.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runGuards } from '../../../lib/guard-registry.mjs';
import { STATES } from '../../../states/index.mjs';
import '../../../lib/guard-bootstrap.mjs';

// See guard-registry-review-exit for the rationale on
// `lifecycleCheckboxesRequired: false` — the body-gates-entry-done lifecycle
// gate has its own dedicated suite.
const CFG = { repo: 'owner/name', projectId: 'PVT', lifecycleCheckboxesRequired: false };
const HEAD_SHA = 'abcdef1234567';

function makeApprovedBody({ withApproved = true, withDod = true } = {}) {
  return [
    '## Scope',
    '',
    '<!-- aitm-entered-backlog: 2026-06-07T05:00:00Z -->',
    '<!-- aitm-entered-refine: 2026-06-07T05:30:00Z -->',
    '<!-- aitm-entered-plan: 2026-06-07T05:45:00Z -->',
    '<!-- aitm-entered-develop: 2026-06-07T06:00:00Z -->',
    '<!-- aitm-entered-test: 2026-06-07T06:30:00Z -->',
    '<!-- aitm-entered-review: 2026-06-07T07:00:00Z -->',
    '<!-- aitm-plan-approved: 2026-06-07T06:00:00Z -->',
    withDod ? `<!-- aitm-dod-verified: ${HEAD_SHA}:2026-06-07T07:30:00Z -->` : '',
    withApproved ? '<!-- aitm-review-approved: 2026-06-07T08:00:00Z -->' : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

function makeCtx({ body }) {
  return {
    issueNumber: 279,
    repo: 'owner/name',
    fromState: 'review',
    toState: 'done',
    body,
    cfg: CFG,
    deps: {
      // #877 — review exit now runs reviewExitEpicChildrenDoneGuard. This
      // fixture is a leaf issue, so stub the children fetch to empty; without
      // the stub the gate would reach the live GraphQL client.
      epicChildren: { fetchSiblings: async () => [] },
      closeGates: {
        getHeadSha: async () => HEAD_SHA,
        commitsSince: async () => [],
        listComments: async () => [
          {
            id: 'cmt_commits',
            body: ['### 🔗 Commits', '', `<!-- aitm-commits: ${HEAD_SHA} -->`, ''].join('\n'),
          },
        ],
        filesForSha: async () => ['scripts/example.mjs'],
        dirtyFiles: async () => new Set(),
        resolveTrunkRef: async () => 'refs/heads/main',
        // #733 — trunk-scoped message attribution: a [#279] commit is on trunk.
        attributingCommits: async () => [{ sha: HEAD_SHA, subject: '[#279] feat', ts: 't' }],
      },
    },
    fetchBlockerState: async () => null,
  };
}

async function runStateObjectGuards(from, to, ctx) {
  const refusals = [];
  const sequence = [
    ...STATES[from].exitGuards.map((g) => ({ slot: 'exit', guard: g })),
    ...STATES[to].entryGuards.map((g) => ({ slot: 'entry', guard: g })),
  ];
  for (const { guard } of sequence) {
    let result;
    try {
      result = await guard.run(ctx);
    } catch (err) {
      result = { ok: false, reason: String(err?.message ?? err) };
    }
    if (!result || result.ok === false) {
      refusals.push({ id: guard.id, reason: result?.reason ?? '(no reason)' });
    }
  }
  return { ok: refusals.length === 0, refusals };
}

describe('guard-parity-review-done: registry == state-object walk', () => {
  it('accept: approved + clean deps passes both paths', async () => {
    const ctx = makeCtx({ body: makeApprovedBody() });
    const reg = await runGuards('review', 'done', ctx);
    const obj = await runStateObjectGuards('review', 'done', ctx);
    assert.equal(reg.ok, true, `registry refused: ${JSON.stringify(reg.refusals)}`);
    assert.equal(obj.ok, true, `state-object refused: ${JSON.stringify(obj.refusals)}`);
  });

  it('refuse: missing review-approved marker — both paths refuse with review-exit-review-approved', async () => {
    const ctx = makeCtx({ body: makeApprovedBody({ withApproved: false }) });
    const reg = await runGuards('review', 'done', ctx);
    const obj = await runStateObjectGuards('review', 'done', ctx);
    assert.equal(reg.ok, false);
    assert.equal(obj.ok, false);
    const regIds = new Set(reg.refusals.map((x) => x.id));
    const objIds = new Set(obj.refusals.map((x) => x.id));
    assert.ok(regIds.has('review-exit-review-approved'), JSON.stringify(reg.refusals));
    assert.ok(objIds.has('review-exit-review-approved'), JSON.stringify(obj.refusals));
    assert.deepEqual(regIds, objIds);
  });

  it('refuse: missing dod-verified marker — both paths refuse with review-exit-close-gates', async () => {
    const ctx = makeCtx({ body: makeApprovedBody({ withDod: false }) });
    const reg = await runGuards('review', 'done', ctx);
    const obj = await runStateObjectGuards('review', 'done', ctx);
    assert.equal(reg.ok, false);
    assert.equal(obj.ok, false);
    const regIds = new Set(reg.refusals.map((x) => x.id));
    const objIds = new Set(obj.refusals.map((x) => x.id));
    assert.ok(regIds.has('review-exit-close-gates'), JSON.stringify(reg.refusals));
    assert.ok(objIds.has('review-exit-close-gates'), JSON.stringify(obj.refusals));
    assert.deepEqual(regIds, objIds);
  });

  it('refuse: missing both markers — both refusals surface together', async () => {
    const ctx = makeCtx({
      body: makeApprovedBody({ withApproved: false, withDod: false }),
    });
    const reg = await runGuards('review', 'done', ctx);
    assert.equal(reg.ok, false);
    const ids = new Set(reg.refusals.map((x) => x.id));
    assert.ok(ids.has('review-exit-review-approved'));
    assert.ok(ids.has('review-exit-close-gates'));
  });

  it('rollback: review → test bypasses review-exit-done guards', async () => {
    const ctx = {
      ...makeCtx({ body: makeApprovedBody({ withApproved: false, withDod: false }) }),
      toState: 'test',
    };
    const reg = await runGuards('review', 'test', ctx);
    assert.equal(reg.ok, true, JSON.stringify(reg.refusals));
  });
});
