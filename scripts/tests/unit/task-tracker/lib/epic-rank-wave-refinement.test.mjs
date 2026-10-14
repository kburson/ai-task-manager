// @story #1872 #2009
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

test('legacy mapping rejects size and estimate drift; scoped rank-wave mapping accepts only Plan-or-later projection', async () => {
  const { mapSubIssueNodes } = await import('../../../../gh/lib/wave-admission.mjs');
  const clean = stampRefinementSnapshot(
    body.replace('<!-- aitm-fields', '## Plan Metadata\n\n<!-- aitm-fields'),
    { labels }
  );
  const changed = clean.replace('"size":"S","estimate":2', '"size":"M","estimate":4');
  const node = (state) => ({
    number: 144,
    state: 'OPEN',
    body: changed,
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
  assert.equal(
    mapSubIssueNodes([node('Develop')], { projectId: 'P' })[0].hasCurrentRefinement,
    false
  );
  assert.equal(
    mapSubIssueNodes([node('Develop')], { projectId: 'P' }, { allowPlanProjection: true })[0]
      .hasCurrentRefinement,
    true,
    JSON.stringify(mapSubIssueNodes([node('Develop')], { projectId: 'P' }))
  );
  assert.equal(
    mapSubIssueNodes(
      [node('Ready for Planning')],
      { projectId: 'P' },
      { allowPlanProjection: true }
    )[0].hasCurrentRefinement,
    false
  );
});

const reviewedScopeBody = stampRefinementSnapshot(
  body.replace(
    'Deliver independent stories with authentic authority.',
    '- [ ] Deliver independent stories with authentic authority.\n- [ ] Preserve changed obligations as stale.'
  ),
  { labels }
);
const scopePointerA =
  '<!-- aitm-reviewed-scope-evidence comment="123" sha256="' +
  'a'.repeat(64) +
  '" lineage="' +
  'b'.repeat(64) +
  '" -->';
const scopePointerB =
  '<!-- aitm-reviewed-scope-evidence comment="456" sha256="' +
  'c'.repeat(64) +
  '" lineage="' +
  'd'.repeat(64) +
  '" -->';
function withScopePointers(content, pointer) {
  return content
    .replace('authentic authority.', `authentic authority. ${pointer}`)
    .replace('changed obligations as stale.', `changed obligations as stale. ${pointer}`);
}

test('rank-wave identity survives reviewed Scope pointer addition, update and removal on multiple rows', () => {
  const frozen = rankWaveRefinementIdentity(reviewedScopeBody, { labels });
  const added = withScopePointers(reviewedScopeBody, scopePointerA);
  const updated = added.replaceAll(scopePointerA, scopePointerB);
  const removed = updated.replaceAll(' ' + scopePointerB, '');
  for (const [action, content] of [
    ['add', added],
    ['update', updated],
    ['remove', removed],
  ]) {
    assert.equal(rankWaveRefinementIdentity(content, { labels }), frozen, action);
  }
});

test('reviewed Scope normalization retains substantive declarations, refinement identity and other comments', () => {
  const frozen = rankWaveRefinementIdentity(reviewedScopeBody, { labels });
  const stamped = withScopePointers(reviewedScopeBody, scopePointerA);
  for (const [change, content, childLabels = labels] of [
    ['Scope prose', stamped.replace('authentic authority', 'standing delegation')],
    ['AC prose', stamped.replace('Ready child', 'Bypassed child')],
    ['verifier citation', stamped.replace('vc:1', 'vc:2')],
    [
      'snapshot digest',
      stamped.replace(/digest="[a-f0-9]{64}"/, 'digest="' + 'e'.repeat(64) + '"'),
    ],
    [
      'snapshot provenance',
      stamped.replace(/provenance="[a-f0-9]{64}"/, 'provenance="' + 'f'.repeat(64) + '"'),
    ],
    ['labels', stamped, ['enhancement', 'security']],
    [
      'other comment',
      stamped.replace('authentic authority.', 'authentic authority. <!-- reviewed note -->'),
    ],
    [
      'Scope policy',
      stamped.replace(
        'authentic authority.',
        'authentic authority. <!-- aitm-scope-evidence-policy required="true" -->'
      ),
    ],
    ['pointer outside Scope', stamped.replace('Ready child', scopePointerB + ' Ready child')],
  ]) {
    assert.notEqual(rankWaveRefinementIdentity(content, { labels: childLabels }), frozen, change);
  }
});

test('malformed or duplicate reviewed Scope pointers cannot normalize into an adopted identity', () => {
  for (const pointer of [
    scopePointerA.replace('sha256="a', 'sha256="z'),
    scopePointerA + ' ' + scopePointerB,
  ]) {
    assert.throws(
      () => rankWaveRefinementIdentity(withScopePointers(reviewedScopeBody, pointer), { labels }),
      /reviewed-scope-pointer-invalid/
    );
  }
});

test('real frozen child graph reconciles reviewed Scope evidence progress and refuses changed obligations', async () => {
  const { mapSubIssueNodes } = await import('../../../../gh/lib/wave-admission.mjs');
  const { freezeRankGraph } =
    await import('../../../../task-tracker/lib/epic-rank-wave-policy.mjs');
  const { reconcileRankWaveRefinement } =
    await import('../../../../task-tracker/lib/epic-rank-wave-refinement.mjs');
  const mapped = (state, content, childLabels = labels) =>
    mapSubIssueNodes(
      [
        {
          number: 144,
          title: 'Reviewed Scope child',
          state: 'OPEN',
          stateReason: null,
          body: content,
          labels: {
            nodes: childLabels.map((name) => ({ name })),
            pageInfo: { hasNextPage: false },
          },
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
        },
      ],
      { projectId: 'P' }
    ).map((child) => ({ ...child, blockedBy: [] }));
  const ready = mapped('Ready for Planning', reviewedScopeBody);
  assert.equal(ready[0].hasCurrentRefinement, true);
  const graph = freezeRankGraph(ready);
  const records = [{ graph }];
  const added = withScopePointers(reviewedScopeBody, scopePointerA);
  const updated = added.replaceAll(scopePointerA, scopePointerB);
  const removed = updated.replaceAll(' ' + scopePointerB, '');
  for (const state of ['Plan', 'Develop', 'Test', 'Review']) {
    for (const content of [added, updated, removed]) {
      const current = reconcileRankWaveRefinement(mapped(state, content), records);
      assert.equal(current[0].hasCurrentRefinement, true, state);
      assert.equal(current[0].childEvidenceError, undefined, state);
      assert.deepEqual(freezeRankGraph(current), graph, state);
    }
  }
  for (const [content, childLabels = labels] of [
    [updated.replace('authentic authority', 'standing delegation')],
    [updated.replace('Ready child', 'Bypassed child')],
    [updated.replace('vc:1', 'vc:2')],
    [updated, ['enhancement', 'security']],
  ]) {
    const current = reconcileRankWaveRefinement(mapped('Review', content, childLabels), records);
    assert.equal(current[0].hasCurrentRefinement, false);
    assert.notEqual(current[0].refinementDigest, graph[0].refinementDigest);
  }
  const malformed = mapped(
    'Review',
    withScopePointers(reviewedScopeBody, scopePointerA.replace('sha256="a', 'sha256="z'))
  );
  assert.equal(malformed[0].refinementDigest, null);
  assert.throws(() => freezeRankGraph(malformed), /graph identity incomplete/);
});
