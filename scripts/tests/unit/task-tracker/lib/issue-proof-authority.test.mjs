// @story #2096
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureIssueProofAuthority,
  assertIssueProofAuthority,
} from '../../../../task-tracker/lib/issue-proof-authority.mjs';
const body =
  '## Scope\nExact source\n## Acceptance Criteria\n- [ ] accepted\n## Verification Commands\n- [ ] `npm run lint` <!-- id=1 -->\n## Definition of Done\n- [ ] lint\n## AITM Progress Markers\n<!-- aitm-last-known-state state="test" ts="2026-10-26T20:00:00Z" -->\n<!-- aitm-entered-test ts="2026-10-26T20:00:00Z" -->\n';
test('protected authority ignores body version/timing but rejects declarations and visit changes', () => {
  const expected = captureIssueProofAuthority(body);
  assert.doesNotThrow(() =>
    assertIssueProofAuthority(
      body + '\n<!-- aitm-body-version version="7" -->\n<!-- timing-rollup: changed -->',
      expected
    )
  );
  for (const fresh of [
    body.replace('npm run lint', 'npm run format:check'),
    body.replace('Exact source', 'Different source'),
    body.replaceAll('20:00:00Z', '20:01:00Z'),
  ])
    assert.throws(() => assertIssueProofAuthority(fresh, expected), /proof authority changed/);
});
test('proof already published by this attempt is permitted only as a complete known snapshot', () => {
  const next = body.replace(
    '- [ ] accepted',
    '- [x] accepted <!-- aitm-verified exit="0" sha="source" -->'
  );
  const expected = [captureIssueProofAuthority(body), captureIssueProofAuthority(next)];
  assert.doesNotThrow(() => assertIssueProofAuthority(next, expected));
  assert.throws(
    () => assertIssueProofAuthority(next.replace('npm run lint', 'npm run format:check'), expected),
    /proof authority changed/
  );
});
test('receipt removal, retirement, replacement and payload changes invalidate authority', () => {
  const receipt = { stage: 'test', receiptId: 'current', commands: [], commitSha: 'a'.repeat(40) };
  const marker = (r) =>
    '<!-- aitm-verification-receipt stage="test" data="' +
    Buffer.from(JSON.stringify(r)).toString('base64url') +
    '" -->';
  const original = body + marker(receipt);
  const expected = captureIssueProofAuthority(original);
  for (const fresh of [
    body,
    body + marker({ ...receipt, receiptId: 'replacement' }),
    body + marker({ ...receipt, commands: [{ exitCode: 1 }] }),
    original.replace('aitm-verification-receipt', 'aitm-retired-verification-receipt'),
  ])
    assert.throws(() => assertIssueProofAuthority(fresh, expected), /proof authority changed/);
});

test('authority comparison follows native body-version whitespace normalization', () => {
  const before = body.replace('Exact source', 'Exact\n\n\nsource');
  assert.doesNotThrow(() =>
    assertIssueProofAuthority(
      before.replace('Exact\n\n\nsource', 'Exact\n\nsource'),
      captureIssueProofAuthority(before)
    )
  );
});

test('review declaration digest survives native proof/ticks but rejects semantic and verifier edits', async () => {
  const { reviewDeclarationDigest, assertReviewedDeclarations } =
    await import('../../../../task-tracker/lib/issue-proof-authority.mjs');
  const { stampAgentReviewPassed } =
    await import('../../../../task-tracker/lib/agent-review/review-gate.mjs');
  const source = body.replace(
    '## AITM Progress Markers',
    '### Lifecycle (verified at Review)\n- [ ] Agent Review Passed\n- [ ] Final Review Passed\n## AITM Progress Markers'
  );
  const reviewed = stampAgentReviewPassed(source, {
    ts: '2026-10-26T20:00:00Z',
    validators: ['body-sections'],
  });
  assert.equal(typeof reviewDeclarationDigest(source), 'string');
  assert.doesNotThrow(() =>
    assertReviewedDeclarations(
      reviewed.replace('- [ ] Final Review Passed', '- [x] Final Review Passed')
    )
  );
  for (const changed of [
    reviewed.replace('Exact source', 'New scope'),
    reviewed.replace('npm run lint', 'npm run format:check'),
    reviewed.replace('- [ ] lint', '- [ ] Different DoD'),
  ])
    assert.throws(() => assertReviewedDeclarations(changed), /Review declarations/);
});
