// @story #2009
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSubIssueNodes } from '../../../../gh/lib/wave-admission.mjs';
import { freezeRankGraph } from '../../../../task-tracker/lib/epic-rank-wave-policy.mjs';
import {
  rankWaveRefinementIdentity,
  reconcileRankWaveRefinement,
} from '../../../../task-tracker/lib/epic-rank-wave-refinement.mjs';

// Frozen with the pre-normalization helper at 909e35f1; includes the original pointer.
const body =
  '## Scope\n\n- [x] Preserve substantive obligations. <!-- aitm-reviewed-scope-evidence comment="123" sha256="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" lineage="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" -->\n\n## Acceptance Criteria\n\n- [x] Admit only unchanged semantics. <!-- aitm-verified vc-list="vc:1" -->\n\n## Metadata\n\n<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"S","estimate":2,"rank":2}} -->\n<!-- aitm-refinement-rationale: {"size":"S","estimate":2,"priority":"P1","rank":2} -->\n<!-- aitm-refinement-snapshot schema="3" digest="d1f08a8ddfccce47ec4c2ab835ec5832159872d65d3c80772a8d645a7e83af01" provenance="6adb4ad6c767e9f2ceb6e408e39bb204f911a5efc09071e6b120bd477c13e5f9" priority="P1" size="S" estimate="2" rank="2" ts="2026-10-14T01:54:53.804Z" -->\n';
const legacyDigest = '5f32d0f63c40fc8c73c3c903de98eeab838cded689029bfce81a785ac0e93b1c';
const labels = ['enhancement'];
const graph = [{ number: 3, rank: 2, blockedBy: [], refinementDigest: legacyDigest }];
const records = [{ graph }];
function mapped(content = body, childLabels = labels) {
  const child = mapSubIssueNodes(
    [
      {
        number: 3,
        state: 'CLOSED',
        stateReason: 'COMPLETED',
        body: content,
        labels: { nodes: childLabels.map((name) => ({ name })), pageInfo: { hasNextPage: false } },
        projectItems: {
          nodes: [
            {
              project: { id: 'P' },
              fieldValues: {
                nodes: [
                  { name: 'Done', field: { name: 'Status' } },
                  { number: 2, field: { name: 'Rank' } },
                ],
              },
            },
          ],
        },
      },
    ],
    { projectId: 'P' }
  )[0];
  return { ...child, blockedBy: [] };
}
test('completed historical pointer identity matches the frozen complete member', () => {
  const child = mapped();
  assert.notEqual(child.refinementDigest, legacyDigest);
  assert.deepEqual(freezeRankGraph(reconcileRankWaveRefinement([child], records)), graph);
  assert.equal(child.legacyRefinementDigest, legacyDigest);
  assert.notEqual(rankWaveRefinementIdentity(body, { labels }), legacyDigest);
});

test('new normalized graphs win even when an older legacy graph is retained', () => {
  const child = mapped();
  const normalized = freezeRankGraph([child]);
  assert.deepEqual(
    freezeRankGraph(reconcileRankWaveRefinement([child], [...records, { graph: normalized }])),
    normalized
  );
  assert.deepEqual(freezeRankGraph(reconcileRankWaveRefinement([child], [])), normalized);
});

test('historical compatibility requires strict completion and exact rank and dependencies', () => {
  const child = mapped();
  for (const override of [
    { boardState: 'review' },
    { issueState: 'open' },
    { closeReason: 'not_planned' },
    { recoveryPhase: 'intent' },
    { childEvidenceError: 'labels incomplete' },
    { rank: 4 },
    { blockedBy: [13] },
    { blockedBy: [13, 13] },
    { blockedBy: null },
    { refinementDigest: null },
    { refinementDigest: 'invalid' },
    { legacyRefinementDigest: null },
  ]) {
    const changed = { ...child, ...override };
    assert.equal(
      reconcileRankWaveRefinement([changed], records)[0].refinementDigest,
      changed.refinementDigest,
      JSON.stringify(override)
    );
  }
  for (const member of [
    { ...graph[0], rank: 4 },
    { ...graph[0], blockedBy: [13] },
    { ...graph[0], blockedBy: [13, 13] },
    { ...graph[0], blockedBy: null },
    { ...graph[0], number: 13 },
  ]) {
    assert.equal(
      reconcileRankWaveRefinement([child], [{ graph: [member] }])[0].refinementDigest,
      child.refinementDigest
    );
  }
});

test('complete current semantic inputs must still match the immutable legacy digest', () => {
  for (const [content, childLabels = labels] of [
    [body.replace('substantive obligations', 'different obligations')],
    [body.replace('unchanged semantics', 'changed semantics')],
    [body.replace('vc:1', 'vc:2')],
    [body.replace(/digest="[a-f0-9]{64}"/, 'digest="' + 'e'.repeat(64) + '"')],
    [body.replace(/provenance="[a-f0-9]{64}"/, 'provenance="' + 'f'.repeat(64) + '"')],
    [body, ['enhancement', 'security']],
    [body.replace('comment="123"', 'comment="456"')],
  ]) {
    const child = mapped(content, childLabels);
    assert.notEqual(child.legacyRefinementDigest, legacyDigest);
    assert.notEqual(
      reconcileRankWaveRefinement([child], records)[0].refinementDigest,
      legacyDigest
    );
  }
});

test('malformed and duplicate pointers fail closed even when retained raw legacy identity matches', () => {
  const pointer = body.match(/<!-- aitm-reviewed-scope-evidence[^]*?-->/)[0];
  for (const content of [
    body.replace('sha256="a', 'sha256="z'),
    body.replace(pointer, pointer + ' ' + pointer),
  ]) {
    const child = mapped(content);
    assert.equal(child.refinementDigest, null);
    assert.equal(child.legacyRefinementDigest, null);
    const forged = { ...child, legacyRefinementDigest: legacyDigest };
    assert.equal(reconcileRankWaveRefinement([forged], records)[0].refinementDigest, null);
    assert.throws(
      () => freezeRankGraph(reconcileRankWaveRefinement([child], records)),
      /graph identity incomplete/
    );
  }
});
