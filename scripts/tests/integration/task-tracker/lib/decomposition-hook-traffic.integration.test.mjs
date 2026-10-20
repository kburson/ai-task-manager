// @story #2073 — genuine leaf admission must not select nested child authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSourceBoundary } from '../../../fixtures/refinement-traffic-runner.mjs';

test('a legitimate complete empty leaf admits in one shallow request', () => {
  const result = runSourceBoundary({
    sourceRoot: process.cwd(),
    fixtureId: 'empty-leaf',
    boundary: 'hook',
  });
  assert.equal(result.outcome.decision, 'allow', JSON.stringify(result.outcome));
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].selectedChildProjectFields, false);
});
for (const fixtureId of ['empty-unmarked-leaf', 'two-page-comments-leaf'])
  test('complete leaf admits: ' + fixtureId, () => {
    const result = runSourceBoundary({ sourceRoot: process.cwd(), fixtureId, boundary: 'hook' });
    assert.equal(result.outcome.decision, 'allow', JSON.stringify(result.outcome));
    assert.equal(result.ledger.length, fixtureId.includes('comments') ? 3 : 1);
    assert.ok(result.ledger.every((entry) => !entry.selectedChildProjectFields));
  });
for (const fixtureId of [
  'unknown-kind',
  'duplicate-kind',
  'misplaced-kind',
  'non-epic-child',
  'four-page-comments',
  'drift-body',
  'drift-owner',
  'drift-item',
  'drift-field',
  'drift-children',
  'empty-epic',
  'unready-epic',
])
  test('unsafe hook snapshot refuses: ' + fixtureId, () => {
    const result = runSourceBoundary({ sourceRoot: process.cwd(), fixtureId, boundary: 'hook' });
    assert.equal(result.outcome.decision, 'block', JSON.stringify(result.outcome));
    assert.ok(!result.ledger.some((entry) => entry.family.includes('write')));
  });
for (const [fixtureId, count] of [
  ['two-child-ready-epic', 3],
  ['51-child-ready-epic', 5],
])
  test('ready parent observes graph and complete fence: ' + fixtureId, () => {
    const result = runSourceBoundary({ sourceRoot: process.cwd(), fixtureId, boundary: 'hook' });
    assert.equal(
      result.outcome.decision,
      fixtureId.startsWith('51-') ? 'block' : 'allow',
      JSON.stringify(result.outcome)
    );
    if (fixtureId.startsWith('51-')) assert.match(result.outcome.reason, /readiness-children/);
    assert.equal(result.ledger.length, count);
    assert.ok(result.ledger.some((entry) => entry.selectedChildProjectFields));
    assert.equal(result.ledger[0].selectedChildProjectFields, false);
  });

test('shared kind grammar preserves absent and fenced markers while rejecting malformed declarations', async () => {
  const { classifyDecompositionKind } =
    await import('../../../../task-tracker/lib/decomposition-kind.mjs');
  for (const body of [
    'legitimate unmarked issue',
    '```md\n<!-- aitm-issue-kind kind="unknown" -->\n```',
  ])
    assert.deepEqual(classifyDecompositionKind(body), { kind: 'code', reasons: [] });
  for (const body of [
    '<!-- aitm-issue-kind kind="epic" -->',
    '## AITM Progress Markers\n<!-- aitm-issue-kind kind=code -->',
    '## AITM Progress Markers\n<!-- aitm-issue-kind kind="unknown" -->',
  ])
    assert.deepEqual(classifyDecompositionKind(body), { kind: 'code', reasons: ['kind-invalid'] });
  assert.deepEqual(
    classifyDecompositionKind(
      '## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->\n<!-- aitm-issue-kind kind="code" -->'
    ),
    { kind: 'code', reasons: ['kind-duplicate'] }
  );
});
