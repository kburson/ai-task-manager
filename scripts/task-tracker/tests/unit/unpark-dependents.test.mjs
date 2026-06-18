#!/usr/bin/env node
// @story #249
// Unit tests for scripts/task-tracker/lib/unpark-dependents.mjs (#249).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { unparkDependents } from '../../lib/unpark-dependents.mjs';
import { parseBlockedBy } from '../../lib/blocked-marker.mjs';

// Build an injectable deps surface over an in-memory body map. Records every
// mutateBody write and runLabel call for assertions.
//
// #295 — `mutateBody(n, mutate)` mirrors the production shape: the closure is
// invoked with the FRESH base from the store and the return value replaces it.
// Tests can therefore assert on the post-mutation body without threading a
// pre-baked body through the dep.
function makeDeps(bodies) {
  const store = new Map(Object.entries(bodies).map(([k, v]) => [Number(k), v]));
  const labelCalls = [];
  return {
    store,
    labelCalls,
    deps: {
      listCandidates: async () => [...store.keys()],
      fetchBody: async (n) => {
        if (!store.has(n)) throw new Error(`no body for #${n}`);
        return store.get(n);
      },
      mutateBody: async (n, mutate) => {
        const base = store.get(n);
        const next = mutate(base);
        store.set(n, next);
      },
      runLabel: async (args) => labelCalls.push(args),
    },
  };
}

test('full clear — sole blocker removed → marker gone, BLOCKED label removed', async () => {
  const { store, labelCalls, deps } = makeDeps({
    104: 'Body of 104.\n\n<!-- aitm-blocked-by: #101 -->\n',
  });
  const out = await unparkDependents({ doneIssueNumber: 101, cfg: {}, deps });

  assert.deepEqual(parseBlockedBy(store.get(104)), []);
  assert.equal(labelCalls.length, 1);
  assert.deepEqual(labelCalls[0], ['issue', 'edit', '104', '--remove-label', 'BLOCKED']);
  assert.deepEqual(out, [{ issue: 104, cleared: 'full' }]);
});

test('partial clear — one of two blockers removed → label kept, residual marker', async () => {
  const { store, labelCalls, deps } = makeDeps({
    104: 'Body.\n\n<!-- aitm-blocked-by: #101, #102 -->\n',
  });
  const out = await unparkDependents({ doneIssueNumber: 101, cfg: {}, deps });

  assert.deepEqual(parseBlockedBy(store.get(104)), [102]);
  assert.equal(labelCalls.length, 0, 'label must not be removed on a partial clear');
  assert.deepEqual(out, [{ issue: 104, cleared: 'partial' }]);
});

test('no-op — candidate not referencing the Done issue is untouched', async () => {
  const original = 'Body.\n\n<!-- aitm-blocked-by: #999 -->\n';
  const { store, labelCalls, deps } = makeDeps({ 104: original });
  const out = await unparkDependents({ doneIssueNumber: 101, cfg: {}, deps });

  assert.equal(store.get(104), original, 'body unchanged');
  assert.equal(labelCalls.length, 0);
  assert.deepEqual(out, []);
});

test('non-fatal — a fetch failure on one candidate does not stop the others', async () => {
  const { store, labelCalls, deps } = makeDeps({
    104: 'Body.\n\n<!-- aitm-blocked-by: #101 -->\n',
    105: 'Body.\n\n<!-- aitm-blocked-by: #101 -->\n',
  });
  // Make #104 throw on fetch; #105 should still be released.
  const baseFetch = deps.fetchBody;
  deps.fetchBody = async (n) => {
    if (n === 104) throw new Error('boom');
    return baseFetch(n);
  };
  const out = await unparkDependents({ doneIssueNumber: 101, cfg: {}, deps });

  assert.deepEqual(parseBlockedBy(store.get(105)), []);
  assert.equal(labelCalls.length, 1);
  assert.deepEqual(labelCalls[0], ['issue', 'edit', '105', '--remove-label', 'BLOCKED']);
  const err = out.find((r) => r.issue === 104);
  assert.ok(err && err.error === 'boom', 'errored candidate recorded');
  assert.ok(out.find((r) => r.issue === 105 && r.cleared === 'full'));
});

test('skips the Done issue itself even if listed as a candidate', async () => {
  const { store, deps } = makeDeps({
    101: 'Self.\n\n<!-- aitm-blocked-by: #101 -->\n',
  });
  const out = await unparkDependents({ doneIssueNumber: 101, cfg: {}, deps });
  assert.deepEqual(out, []);
  assert.equal(parseBlockedBy(store.get(101)).length, 1, 'self body untouched');
});

test('invalid doneIssueNumber → empty result, no calls', async () => {
  const { labelCalls, deps } = makeDeps({ 104: 'x' });
  const out = await unparkDependents({ doneIssueNumber: 0, cfg: {}, deps });
  assert.deepEqual(out, []);
  assert.equal(labelCalls.length, 0);
});
