// @story #2163 — real registered input and identity refusals precede any write.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveEstimateOperationId } from '../../../task-tracker/lib/estimate-writer-publication.mjs';
import { readDecompositionRecords } from '../../../task-tracker/lib/decomposition-records.mjs';

export function registerInflationInputCases({ root, startFixture, inflation }) {
  test('registered strict REST correlation and complete pages refuse malformed inputs', async (t) => {
    const { fixture } = await startFixture(t);
    for (const action of [
      'malformed-response',
      'rest-missing-node',
      'rest-foreign-issue',
      'rest-duplicate-id',
      'rest-mismatched-body',
      'rest-mismatched-node',
    ]) {
      const before = fixture.readLedger().length;
      fixture.fault({
        checkpoint: 'rest-comments',
        occurrence: action.startsWith('rest-mismatched') ? 2 : 1,
        phase: 'after-apply-before-response',
        action,
      });
      const result = await fixture.run(inflation);
      assert.equal(result.status, 1, `${action}: ${result.stderr}`);
      assert.match(result.stderr, /inflate-estimate:(comment-pages|comment-identity)/);
      assert.equal(
        fixture
          .readLedger()
          .slice(before)
          .filter((e) => e.applied).length,
        0,
        action
      );
    }
  });
  test('untrusted Markdown and operation markers refuse before publication', async (t) => {
    const { fixture } = await startFixture(t);
    for (const [flag, text] of [
      ['--reason', 'Injected\n### Planned Estimate\n'],
      ['--item', 'Injected\n### Planned Estimate\ntrailer'],
      ['--reason', 'Publication operation: 77d98283-2bb6-4750-ae81-94bcd6305e08'],
      ['--item', 'Publication operation: 77d98283-2bb6-4750-ae81-94bcd6305e08'],
    ]) {
      const argv = [...inflation];
      argv[argv.indexOf(flag) + 1] = text;
      const before = fixture.readLedger().length,
        result = await fixture.run(argv);
      assert.equal(result.status, 1, `${flag}: ${text}\n${result.stderr}`);
      assert.match(result.stderr, /inflate-estimate:(audit-semantics|audit-markers)/);
      assert.equal(
        fixture
          .readLedger()
          .slice(before)
          .filter((e) => e.applied).length,
        0
      );
    }
  });
  const initial = JSON.parse(
    readFileSync(
      path.join(root, 'docs/peer-reviews/2163/public-entry-red/original-927c53d/initialState.json'),
      'utf8'
    )
  );
  const currentOperation = resolveEstimateOperationId('inflate-estimate', {
    size: 'M',
    estimate: 6,
    reason: inflation[inflation.indexOf('--reason') + 1],
    items: [inflation[inflation.indexOf('--item') + 1]],
  });
  test('an existing current operation line cannot impersonate a persisted audit', async (t) => {
    const comments = structuredClone(initial.comments);
    comments[0].body += `\nPublication operation: ${currentOperation}\n`;
    const { fixture } = await startFixture(t, { seed: { comments } }),
      before = fixture.readLedger().length;
    const result = await fixture.run(inflation);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /inflate-estimate:audit-provenance/);
    assert.equal(
      fixture
        .readLedger()
        .slice(before)
        .filter((e) => e.applied).length,
      0
    );
  });
  for (const variant of ['noncontributing', 'prior-audit'])
    test(`registered ${variant} comment preserves all prior bytes`, async (t) => {
      const comments = structuredClone(initial.comments);
      if (variant === 'noncontributing')
        comments[0].body = `<!-- aitm-refined-estimate: 4242 -->\nRefine estimate without a Planned Estimate proposal.\n`;
      else
        comments[0].body +=
          '\n### Earlier discovered work\n\nRetained history.\nPublication operation: 15e844f5-9544-4f72-8e8b-e6fb5e031dc4\n';
      const before = comments[0].body,
        { fixture } = await startFixture(t, { seed: { comments } });
      const result = await fixture.run(inflation);
      assert.equal(result.status, 0, result.stderr);
      const after = fixture.readState().provider;
      assert.ok(after.comments[0].body.startsWith(before));
      const records = readDecompositionRecords(after.body);
      assert.equal(records.publication.status, 'complete');
      assert.equal(records.assessment.inputDigest, records.publication.intendedInputDigest);
    });
}
