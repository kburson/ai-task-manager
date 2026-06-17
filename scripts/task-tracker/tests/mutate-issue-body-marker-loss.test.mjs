// @story #361
// Tests for the #361 MarkerLossError invariant inside mutateIssueBody.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mutateIssueBody, MarkerLossError } from '../lib/issue-body-mutate.mjs';

function fakeDeps(initialBody) {
  let body = initialBody;
  return {
    fetchBody: async () => body,
    pushBody: async (_repo, _n, next) => {
      body = next;
    },
    getBody: () => body,
  };
}

test('mutateIssueBody throws MarkerLossError when mutate drops aitm-fields', async () => {
  const deps = fakeDeps(
    '## AC\n<!-- aitm-fields: {"size":"M"} -->\n<!-- aitm-body-version: 1 -->\n'
  );
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 999,
      repo: 'fake/fake',
      mutate: () => '## AC\n<!-- aitm-body-version: 1 -->\n', // drops aitm-fields
      deps,
    }),
    (err) => {
      assert.ok(err instanceof MarkerLossError, `expected MarkerLossError, got ${err?.name}`);
      assert.equal(err.issueNumber, 999);
      assert.deepEqual(err.lostMarkers, ['aitm-fields']);
      assert.match(err.message, /aitm-fields/);
      assert.match(err.message, /#999/);
      return true;
    }
  );
  // Body unchanged — push never ran.
  assert.match(deps.getBody(), /aitm-fields/);
});

test('mutateIssueBody allows the same drop with allowMarkerLoss: true', async () => {
  const deps = fakeDeps(
    '## AC\n<!-- aitm-fields: {"size":"M"} -->\n<!-- aitm-body-version: 1 -->\n'
  );
  const r = await mutateIssueBody({
    issueNumber: 999,
    repo: 'fake/fake',
    mutate: () => '## AC\nintentional reset\n',
    deps,
    allowMarkerLoss: true,
  });
  assert.equal(r.status, 'ok');
  // Push happened; aitm-fields is gone by design.
  assert.doesNotMatch(deps.getBody(), /aitm-fields/);
});

test('MarkerLossError message lists each lost marker name', async () => {
  // Note: versionedWriteBody strips `aitm-body-version` from `base` before
  // handing it to mutate, then re-stamps the next version on the way out. So
  // even though aitm-body-version is an invariant marker, the guarded mutate
  // sees a base WITHOUT it — only the other invariants can be observed lost
  // at this layer. The bash-level diff guard backstops aitm-body-version
  // drops on external `gh issue edit` invocations (covered by
  // tests/gh-edit-guard.test.mjs).
  const deps = fakeDeps(
    '## AC\n<!-- aitm-fields: {} -->\n<!-- aitm-stage-rollup: refine=1 -->\n<!-- aitm-plan-approved: 2026-06-01 -->\n<!-- aitm-body-version: 2 -->\n'
  );
  try {
    await mutateIssueBody({
      issueNumber: 42,
      repo: 'fake/fake',
      mutate: () => '## AC\nstripped\n',
      deps,
    });
    assert.fail('expected MarkerLossError');
  } catch (err) {
    assert.ok(err instanceof MarkerLossError);
    assert.deepEqual(err.lostMarkers.sort(), [
      'aitm-fields',
      'aitm-plan-approved',
      'aitm-stage-rollup',
    ]);
    for (const name of ['aitm-fields', 'aitm-stage-rollup', 'aitm-plan-approved']) {
      assert.ok(err.message.includes(name), `message missing marker name: ${name}`);
    }
  }
});

test('mutateIssueBody passes through clean mutate that preserves markers', async () => {
  const deps = fakeDeps(
    '## AC\n- [ ] x\n<!-- aitm-fields: {} -->\n<!-- aitm-body-version: 3 -->\n'
  );
  const r = await mutateIssueBody({
    issueNumber: 7,
    repo: 'fake/fake',
    mutate: (base) => base.replace('- [ ] x', '- [x] x'),
    deps,
    // This test exercises marker preservation, not the #362 checkbox-proof
    // invariant, so the tick is intentionally bare.
    allowUnverifiedTicks: true,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /aitm-fields/);
  assert.match(deps.getBody(), /- \[x\] x/);
});
