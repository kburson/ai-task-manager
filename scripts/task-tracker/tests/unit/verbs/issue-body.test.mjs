// @story #1210
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyIssueBodyOperation,
  parseIssueBodyArgs,
  parseIssueBodyOperation,
  runIssueBodyOperation,
} from '../../../verbs/issue-body.mjs';

const VERSION = '<!-- aitm-body-version version="7" -->';

test('issue-body parses one target and one operation file strictly', () => {
  assert.deepEqual(parseIssueBodyArgs(['#42', '--operation-file', '.tmp/gh/op.json']), {
    issueNumber: 42,
    operationFile: '.tmp/gh/op.json',
  });
  assert.throws(() => parseIssueBodyArgs(['42']), /operation-file/);
  assert.throws(
    () => parseIssueBodyArgs(['42', '--operation-file', 'op.json', '--raw']),
    /unknown/
  );
});

test('issue-body accepts only the versioned declarative schemas', () => {
  assert.deepEqual(
    parseIssueBodyOperation({
      schema: 'aitm.issue-body-operation/v1',
      kind: 'replace-exact',
      expected: 'old',
      replacement: 'new',
      expectedVersion: 7,
    }),
    {
      schema: 'aitm.issue-body-operation/v1',
      kind: 'replace-exact',
      expected: 'old',
      replacement: 'new',
      expectedVersion: 7,
    }
  );
  assert.throws(
    () =>
      parseIssueBodyOperation({
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'old',
        replacement: 'new',
        allowMarkerLoss: true,
      }),
    /unknown key/
  );
  assert.throws(
    () => parseIssueBodyOperation({ schema: 'aitm.issue-body-operation/v2' }),
    /schema/
  );
});

test('exact replacement is evaluated against the fresh body and requires one match', () => {
  const op = parseIssueBodyOperation({
    schema: 'aitm.issue-body-operation/v1',
    kind: 'replace-exact',
    expected: 'before',
    replacement: 'after',
  });
  assert.equal(
    applyIssueBodyOperation(`prefix before suffix\n${VERSION}`, op),
    `prefix after suffix\n${VERSION}`
  );
  assert.throws(() => applyIssueBodyOperation(`no match\n${VERSION}`, op), /zero matches/);
  assert.throws(() => applyIssueBodyOperation(`before before\n${VERSION}`, op), /ambiguous/);
});

test('named section replacement obeys heading boundaries and explicit preconditions', () => {
  const body = `# Story\n\n## Scope\n\nold scope\n\n### Detail\n\nkept with scope\n\n## Plan Metadata\n\n- **Size**: M\n\n${VERSION}`;
  const op = parseIssueBodyOperation({
    schema: 'aitm.issue-body-operation/v1',
    kind: 'replace-section',
    heading: '## Scope',
    expected: '\n\nold scope\n\n### Detail\n\nkept with scope\n\n',
    replacement: '\n\nnew scope\n\n',
  });
  assert.equal(
    applyIssueBodyOperation(body, op),
    `# Story\n\n## Scope\n\nnew scope\n\n## Plan Metadata\n\n- **Size**: M\n\n${VERSION}`
  );
  assert.throws(
    () => applyIssueBodyOperation(body.replace('old scope', 'drifted'), op),
    /stale section precondition/
  );
  assert.throws(
    () => applyIssueBodyOperation(`${body}\n\n## Scope\n\nsecond`, op),
    /ambiguous heading/
  );
});

test('expectedVersion is checked inside the fresh-base transformation', () => {
  const operation = parseIssueBodyOperation({
    schema: 'aitm.issue-body-operation/v1',
    kind: 'replace-exact',
    expected: 'before',
    replacement: 'after',
    expectedVersion: 6,
  });
  assert.throws(
    () => applyIssueBodyOperation(`before\n${VERSION}`, operation),
    /expected version 6.*found 7/
  );
});

test('declarative operations preserve every AITM marker byte-for-byte', () => {
  const marker = '<!-- aitm-last-known-state state="develop" ts="2026-08-12T00:00:00Z" -->';
  assert.throws(
    () =>
      applyIssueBodyOperation(`${marker}\n${VERSION}`, {
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'state="develop"',
        replacement: 'state="plan"',
      }),
    /protected AITM markers changed/
  );
  assert.throws(
    () =>
      applyIssueBodyOperation(`prose\n${VERSION}`, {
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'prose',
        replacement: 'prose\n<!-- aitm-fabricated value="true" -->',
      }),
    /protected AITM markers changed/
  );
});

test('runIssueBodyOperation uses canonical mutate and verifies returned live body', async () => {
  let call;
  const operation = parseIssueBodyOperation({
    schema: 'aitm.issue-body-operation/v1',
    kind: 'replace-exact',
    expected: 'before',
    replacement: 'after',
  });
  const result = await runIssueBodyOperation({
    issueNumber: 42,
    repo: 'o/r',
    operation,
    deps: {
      mutateIssueBody: async (input) => {
        call = input;
        const body = input.mutate(`before\n${VERSION}`);
        return {
          status: 'ok',
          version: 8,
          body: body.replace('version="7"', 'version="8"'),
        };
      },
    },
  });
  assert.equal(result.body, `after\n<!-- aitm-body-version version="8" -->`);
  assert.equal(typeof call.mutate, 'function');
  for (const forbidden of ['body', 'allowMarkerLoss', 'allowUnverifiedTicks', 'evidenceStamp']) {
    assert.equal(Object.hasOwn(call, forbidden), false, `${forbidden} must not be exposed`);
  }

  await assert.rejects(
    () =>
      runIssueBodyOperation({
        issueNumber: 42,
        repo: 'o/r',
        operation,
        deps: {
          mutateIssueBody: async (input) => ({
            status: 'ok',
            version: 8,
            body: input
              .mutate(`before\n${VERSION}`)
              .replace('version="7"', 'version="8"')
              .replace('after', 'remote drift'),
          }),
        },
      }),
    /read-back mismatch/
  );
});

test('canonical write enforces expected version and protected-marker invariants', async () => {
  let remote = `<!-- aitm-last-known-state state="develop" ts="2026-08-12T00:00:00Z" -->\nbefore\n${VERSION}`;
  const writeDeps = {
    fetchBody: async () => remote,
    pushBody: async (_repo, _issue, body) => {
      remote = body;
    },
  };
  await assert.rejects(
    () =>
      runIssueBodyOperation({
        issueNumber: 42,
        repo: 'o/r',
        operation: parseIssueBodyOperation({
          schema: 'aitm.issue-body-operation/v1',
          kind: 'replace-exact',
          expected: 'before',
          replacement: 'after',
          expectedVersion: 6,
        }),
        deps: { writeDeps },
      }),
    /expected body version 6, found 7/
  );

  await assert.rejects(
    () =>
      runIssueBodyOperation({
        issueNumber: 42,
        repo: 'o/r',
        operation: parseIssueBodyOperation({
          schema: 'aitm.issue-body-operation/v1',
          kind: 'replace-exact',
          expected: '<!-- aitm-last-known-state state="develop" ts="2026-08-12T00:00:00Z" -->',
          replacement: '',
          expectedVersion: 7,
        }),
        deps: { writeDeps },
      }),
    /protected AITM markers changed/
  );
});
