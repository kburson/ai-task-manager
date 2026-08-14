#!/usr/bin/env node
// @story #486
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  getDiscussLabel,
  syncDiscussLabel,
  reconcileDiscuss,
} from '../../../../task-tracker/lib/discuss-label.mjs';
import {
  hasDiscussMarker,
  hasDiscussRequest,
} from '../../../../task-tracker/lib/discuss-marker.mjs';

// --- getDiscussLabel ---------------------------------------------------------

test('getDiscussLabel: returns the configured label', () => {
  assert.equal(getDiscussLabel({ discussLabel: 'Needs Discussion' }), 'Needs Discussion');
});

test('getDiscussLabel: falls back to "Discuss" when unset/blank/absent', () => {
  assert.equal(getDiscussLabel({}), 'Discuss', 'absent key → default');
  assert.equal(getDiscussLabel({ discussLabel: '' }), 'Discuss', 'blank → default');
  assert.equal(getDiscussLabel({ discussLabel: '   ' }), 'Discuss', 'whitespace → default');
  assert.equal(getDiscussLabel(undefined), 'Discuss', 'no cfg → default');
});

// --- syncDiscussLabel: add path ---------------------------------------------

test('syncDiscussLabel: present=true issues --add-label', async () => {
  const calls = [];
  const pexec = async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: '', stderr: '' };
  };
  const res = await syncDiscussLabel({
    issueNumber: 486,
    repo: 'o/r',
    label: 'Discuss',
    present: true,
    deps: { pexec },
  });
  assert.equal(res.ok, true);
  assert.equal(res.action, 'added');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['issue', 'edit', '486', '-R', 'o/r', '--add-label', 'Discuss']);
});

// --- syncDiscussLabel: remove path ------------------------------------------

test('syncDiscussLabel: present=false issues --remove-label', async () => {
  const calls = [];
  const pexec = async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: '', stderr: '' };
  };
  const res = await syncDiscussLabel({
    issueNumber: 486,
    repo: 'o/r',
    label: 'Discuss',
    present: false,
    deps: { pexec },
  });
  assert.equal(res.ok, true);
  assert.equal(res.action, 'removed');
  assert.deepEqual(calls[0].args, [
    'issue',
    'edit',
    '486',
    '-R',
    'o/r',
    '--remove-label',
    'Discuss',
  ]);
});

// --- syncDiscussLabel: swallow missing-label on remove ----------------------

test('syncDiscussLabel: remove swallows a repo-missing label', async () => {
  const pexec = async () => {
    throw new Error("failed to update: 'Discuss' not found");
  };
  const res = await syncDiscussLabel({
    issueNumber: 486,
    repo: 'o/r',
    label: 'Discuss',
    present: false,
    deps: { pexec },
  });
  assert.equal(res.ok, true);
  assert.equal(res.action, 'noop');
  assert.match(res.swallowed, /not found/);
});

test('syncDiscussLabel: a non-missing error on remove still throws', async () => {
  const pexec = async () => {
    throw new Error('network unreachable');
  };
  await assert.rejects(
    () =>
      syncDiscussLabel({
        issueNumber: 486,
        repo: 'o/r',
        label: 'Discuss',
        present: false,
        deps: { pexec },
      }),
    /network unreachable/
  );
});

test('syncDiscussLabel: an add of a missing label is NOT swallowed (misconfig)', async () => {
  const pexec = async () => {
    throw new Error("'Discuss' not found");
  };
  await assert.rejects(
    () =>
      syncDiscussLabel({
        issueNumber: 486,
        repo: 'o/r',
        label: 'Discuss',
        present: true,
        deps: { pexec },
      }),
    /not found/
  );
});

test('syncDiscussLabel: blank label is a no-op skip', async () => {
  let called = false;
  const pexec = async () => {
    called = true;
    return { stdout: '', stderr: '' };
  };
  const res = await syncDiscussLabel({
    issueNumber: 486,
    repo: 'o/r',
    label: '   ',
    present: true,
    deps: { pexec },
  });
  assert.equal(res.ok, false);
  assert.equal(res.skipped, 'no-label');
  assert.equal(called, false, 'no gh call for a blank label');
});

// --- reconcileDiscuss: converge body + sync label ---------------------------
// mutateIssueBody is mocked via injected fetchBody/pushBody; the label exec via
// pexec. A token-bearing body converges to pending → label is added.

function mockBodyIo(initialBody) {
  const state = { body: initialBody };
  return {
    state,
    fetchBody: async () => state.body,
    pushBody: async (_repo, _n, body) => {
      state.body = body;
    },
  };
}

test('reconcileDiscuss: token-bearing body → marker added, token stripped, label added', async () => {
  const io = mockBodyIo('idea\n\n{discuss}\n');
  const labelCalls = [];
  const pexec = async (cmd, args) => {
    labelCalls.push(args);
    return { stdout: '', stderr: '' };
  };
  const res = await reconcileDiscuss({
    issueNumber: 486,
    repo: 'o/r',
    cfg: { discussLabel: 'Discuss' },
    deps: { fetchBody: io.fetchBody, pushBody: io.pushBody, pexec, ts: 'T' },
  });
  assert.equal(res.pending, true);
  assert.ok(hasDiscussRequest(io.state.body), 'request marker stamped');
  assert.ok(!hasDiscussMarker(io.state.body), 'visible token stripped');
  assert.equal(labelCalls.length, 1);
  assert.deepEqual(labelCalls[0], ['issue', 'edit', '486', '-R', 'o/r', '--add-label', 'Discuss']);
});

test('reconcileDiscuss: already-discussed body → unchanged, label removed', async () => {
  const io = mockBodyIo('idea\n<!-- aitm-discussed ts="T" -->\n');
  const labelCalls = [];
  const pexec = async (cmd, args) => {
    labelCalls.push(args);
    return { stdout: '', stderr: '' };
  };
  const res = await reconcileDiscuss({
    issueNumber: 486,
    repo: 'o/r',
    cfg: { discussLabel: 'Discuss' },
    deps: { fetchBody: io.fetchBody, pushBody: io.pushBody, pexec, ts: 'T' },
  });
  assert.equal(res.pending, false);
  assert.equal(labelCalls[0][5], '--remove-label', 'label removed when not pending');
});
