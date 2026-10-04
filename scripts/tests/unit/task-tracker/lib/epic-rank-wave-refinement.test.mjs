// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { rankWaveRefinementIdentity } from '../../../../task-tracker/lib/epic-rank-wave-refinement.mjs';
const labels = ['enhancement'];
const body = stampRefinementSnapshot(
  `## Scope\n\nDeliver independent stories with authentic authority.\n\n## Acceptance Criteria\n\n- [ ] Ready child admits under its wave. <!-- aitm-verified vc-list="vc:1" -->\n\n<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"S","estimate":2,"rank":2}} -->\n<!-- aitm-refinement-rationale: {"size":"S","estimate":2,"priority":"P1","rank":2} -->`,
  { labels }
);
test('rank-wave identity excludes ordinary AC completion and verification runs but detects semantic and declaration drift', () => {
  const first = rankWaveRefinementIdentity(body, { labels });
  assert.match(first, /^[a-f0-9]{64}$/);
  const progressed = body
    .replace('- [ ]', '- [x]')
    .replace(
      'vc-list="vc:1"',
      'vc-list="vc:1" exit="0" sha="abcdef" ts="2026-10-04T01:00:00Z" key="abc"'
    );
  assert.equal(rankWaveRefinementIdentity(progressed, { labels }), first);
  assert.notEqual(
    rankWaveRefinementIdentity(progressed.replace('Ready child', 'Different child'), { labels }),
    first
  );
  assert.notEqual(
    rankWaveRefinementIdentity(progressed.replace('vc:1', 'vc:2'), { labels }),
    first
  );
  assert.notEqual(rankWaveRefinementIdentity(progressed, { labels: ['defect'] }), first);
});

test('only an adopted matching identity permits historical lifecycle projection; staging and changed semantics refuse', async () => {
  const { reconcileRankWaveRefinement } =
    await import('../../../../task-tracker/lib/epic-rank-wave-refinement.mjs');
  const digest = rankWaveRefinementIdentity(body, { labels });
  const records = [{ graph: [{ number: 144, refinementDigest: digest }] }];
  const current = {
    number: 144,
    boardState: 'review',
    refinementDigest: digest,
    childEvidenceError: 'stale refinement snapshot',
    hasCurrentRefinement: false,
  };
  const adopted = reconcileRankWaveRefinement([current], records)[0];
  assert.equal(adopted.hasCurrentRefinement, true);
  assert.equal(adopted.childEvidenceError, undefined);
  for (const child of [
    { ...current, boardState: 'ready-for-plan' },
    { ...current, refinementDigest: 'b'.repeat(64) },
    { ...current, childEvidenceError: 'configured project membership missing' },
  ]) {
    assert.equal(reconcileRankWaveRefinement([child], records)[0].hasCurrentRefinement, false);
  }
  assert.equal(reconcileRankWaveRefinement([current], [])[0].hasCurrentRefinement, false);
});

test('real child mapping retains adopted graph identity through AC stamping, Review and governed completion', async () => {
  const { mapSubIssueNodes } = await import('../../../../gh/lib/wave-admission.mjs');
  const { freezeRankGraph, isStrictCompletedDone } =
    await import('../../../../task-tracker/lib/epic-rank-wave-policy.mjs');
  const { reconcileRankWaveRefinement } =
    await import('../../../../task-tracker/lib/epic-rank-wave-refinement.mjs');
  const node = (state, content = body) => ({
    number: 144,
    state: state === 'Done' ? 'CLOSED' : 'OPEN',
    stateReason: state === 'Done' ? 'COMPLETED' : null,
    body: content,
    labels: { nodes: labels.map((name) => ({ name })), pageInfo: { hasNextPage: false } },
    projectItems: {
      nodes: [
        {
          project: { id: 'P' },
          fieldValues: {
            nodes: [
              { name: state, field: { name: 'Status' } },
              { number: 2, field: { name: 'Rank' } },
            ],
          },
        },
      ],
    },
  });
  const mapped = mapSubIssueNodes([node('Ready for Planning')], { projectId: 'P' });
  mapped.forEach((c) => (c.blockedBy = []));
  const graph = freezeRankGraph(mapped),
    records = [{ graph }];
  assert.equal(mapped[0].hasCurrentRefinement, true);
  for (const state of ['Plan', 'Develop', 'Test', 'Review', 'Done']) {
    const progressed = mapSubIssueNodes(
      [
        node(
          state,
          body
            .replace('- [ ]', '- [x]')
            .replace(
              'vc-list="vc:1"',
              'vc-list="vc:1" exit="0" sha="abcdef" ts="2026-10-04T01:00:00Z"'
            )
        ),
      ],
      { projectId: 'P' }
    );
    progressed.forEach((c) => (c.blockedBy = []));
    const current = reconcileRankWaveRefinement(progressed, records);
    assert.deepEqual(freezeRankGraph(current), graph, state);
    assert.ok(!current[0].childEvidenceError, state);
    if (state === 'Done') assert.equal(isStrictCompletedDone(current[0]), true);
    else assert.equal(current[0].hasCurrentRefinement, true, state);
  }
  const changed = mapSubIssueNodes(
    [node('Review', body.replace('Ready child', 'Changed obligation'))],
    { projectId: 'P' }
  );
  assert.equal(reconcileRankWaveRefinement(changed, records)[0].hasCurrentRefinement, false);
});
