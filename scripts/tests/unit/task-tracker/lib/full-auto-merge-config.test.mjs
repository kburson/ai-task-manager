#!/usr/bin/env node
// @story #908 (epic #912)
// vc:2 — config resolution + actionable failure when settings are absent.
//
// resolveMergeMechanism must fail CLOSED with a message that names the missing
// key and points at settings-guide.md, so a Full-Auto batch halts actionably
// rather than dying on a mid-drive classifier denial.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  planFullAutoMerge,
  resolveMergeMechanism,
} from '../../../../task-tracker/lib/full-auto-merge.mjs';

test('no fullAutoMerge block → unconfigured refusal naming the key + guide', () => {
  const r = resolveMergeMechanism({});
  assert.equal(r.ok, false);
  assert.match(r.message, /full-auto-merge-unconfigured/);
  assert.match(r.message, /fullAutoMerge\.mechanism/);
  assert.match(r.message, /settings-guide\.md/);
});

test('undefined cfg → unconfigured refusal (fail closed)', () => {
  const r = resolveMergeMechanism();
  assert.equal(r.ok, false);
  assert.match(r.message, /full-auto-merge-unconfigured/);
});

test('unknown mechanism → bad-mechanism refusal listing valid values', () => {
  const r = resolveMergeMechanism({ fullAutoMerge: { mechanism: 'yolo-force-push' } });
  assert.equal(r.ok, false);
  assert.match(r.message, /full-auto-merge-bad-mechanism/);
  assert.match(r.message, /provider-action/);
  assert.match(r.message, /local-trunk-lane/);
});

test('provider-action with no method → defaults to merge', () => {
  const r = resolveMergeMechanism({ fullAutoMerge: { mechanism: 'provider-action' } });
  assert.deepEqual(r, { ok: true, mechanism: 'provider-action', mergeMethod: 'merge' });
});

test('gh-auto-merge → retired-mechanism refusal with migration guidance', () => {
  const r = resolveMergeMechanism({ fullAutoMerge: { mechanism: 'gh-auto-merge' } });
  assert.equal(r.ok, false);
  assert.match(r.message, /full-auto-merge-retired-mechanism/);
  assert.match(r.message, /provider-action/);
  assert.match(r.message, /settings-guide\.md/);
});

test('retired gh-auto-merge cannot bypass migration guidance through the command planner', () => {
  const r = planFullAutoMerge({
    prNumber: 1400,
    cfg: { fullAutoMerge: { mechanism: 'gh-auto-merge' } },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /full-auto-merge-retired-mechanism/);
  assert.match(r.message, /provider-action/);
  assert.match(r.message, /settings-guide\.md/);
  assert.equal(Object.hasOwn(r, 'argv'), false);
});

test('provider-action with bad method → bad-method refusal', () => {
  const r = resolveMergeMechanism({
    fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'fast-forward' },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /full-auto-merge-bad-method/);
});

for (const mergeMethod of ['merge', 'squash', 'rebase']) {
  test(`provider-action permits ${mergeMethod}`, () => {
    assert.deepEqual(
      resolveMergeMechanism({
        fullAutoMerge: { mechanism: 'provider-action', mergeMethod },
      }),
      { ok: true, mechanism: 'provider-action', mergeMethod }
    );
  });
}

test('local-trunk-lane without operatorAuthorized → unauthorized refusal', () => {
  const r = resolveMergeMechanism({ fullAutoMerge: { mechanism: 'local-trunk-lane' } });
  assert.equal(r.ok, false);
  assert.match(r.message, /full-auto-merge-lane-unauthorized/);
  assert.match(r.message, /operatorAuthorized=true/);
});

test('local-trunk-lane with operatorAuthorized=true → ok', () => {
  const r = resolveMergeMechanism({
    fullAutoMerge: { mechanism: 'local-trunk-lane', operatorAuthorized: true },
  });
  assert.equal(r.ok, true);
  assert.equal(r.mechanism, 'local-trunk-lane');
});

test('local-trunk-lane with operatorAuthorized truthy-but-not-true → still refused', () => {
  const r = resolveMergeMechanism({
    fullAutoMerge: { mechanism: 'local-trunk-lane', operatorAuthorized: 'yes' },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /full-auto-merge-lane-unauthorized/);
});
