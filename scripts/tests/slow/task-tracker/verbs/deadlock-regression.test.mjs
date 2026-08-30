#!/usr/bin/env node
// @story #438
// #438 AC5 — Deadlock regression (the #436/#437 shape).
//
// Reproduce two mutually-entangled issues — one whose body could not be
// rewritten (Bug B), the other unable to traverse a broken state (Bug A) —
// joined by a blocked-by annotation, and assert the tooling exposes a
// NON-MANUAL recovery: the drift-escape verb `reconcile` exists and is
// importable, there is NO `doctor` verb, and the entanglement is cleared
// purely through body-level recovery verbs (`unblock`) without any board or
// state-file hand-edit — exactly the manual rule-breaking this story exists to
// make unnecessary.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runReconcile } from '../../../../task-tracker/verbs/reconcile.mjs';
import { runUnblock } from '../../../../task-tracker/verbs/unblock.mjs';
import { blockedByGuard } from '../../../../task-tracker/lib/blocked-by-guard.mjs';
import { addBlockedBy, parseBlockedBy } from '../../../../task-tracker/lib/blocked-marker.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const VERBS_DIR = path.resolve(__dir, '../../../task-tracker/verbs');
const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

test('AC5: a non-manual drift-escape verb (reconcile) exists; no doctor verb', () => {
  assert.equal(typeof runReconcile, 'function', 'reconcile must export a runnable core');
  assert.ok(
    existsSync(path.join(VERBS_DIR, 'reconcile.mjs')),
    'reconcile verb module must exist (the non-manual escape)'
  );
  assert.ok(
    !existsSync(path.join(VERBS_DIR, 'doctor.mjs')),
    'there is no doctor verb — reconcile is the escape (pin the actual surface)'
  );
});

test('AC5: reconcile rejects a missing/unknown mode without touching the network', async () => {
  const noMode = await runReconcile({ issueNumber: 700, cfg, deps: {} });
  assert.equal(noMode.status, 'error');
  assert.match(noMode.message, /mode is required/);

  const badMode = await runReconcile({ issueNumber: 700, mode: 'nonexistent', cfg, deps: {} });
  assert.equal(badMode.status, 'error');
  assert.match(badMode.message, /unknown mode/);
});

test('AC5: reconcile accept-live resolves board/body drift via DI (no hand-edit)', async () => {
  // #700: body records "test" but the board live state is "develop" — the
  // drift that previously could only be fixed by editing the state file.
  let writtenBody = null;
  const persisted = [];
  const res = await runReconcile({
    issueNumber: 700,
    mode: 'accept-live',
    cfg,
    now: () => '2026-06-17T00:00:00Z',
    deps: {
      fetchIssueBody: async () => ({
        body: '<!-- aitm-last-known-state: test -->\n\n## Body\n',
      }),
      getLiveState: async () => 'develop',
      writeIssueBody: async ({ body }) => {
        writtenBody = body;
        return { status: 'ok' };
      },
      persistTrackerState: ({ state }) => persisted.push(state),
      postTimingRow: async () => {},
    },
  });
  assert.equal(res.status, 'reconciled');
  assert.equal(res.to, 'develop');
  assert.ok(writtenBody && /aitm-last-known-state/.test(writtenBody), 'body re-stamped to live');
  assert.deepEqual(persisted, ['develop'], 'tracker state persisted to live — no manual edit');
});

test('AC5: entanglement clears via unblock alone (no board/state-file edit)', async () => {
  // #701 (blocked) ── blocked-by ──▶ #702 (the stuck issue whose body cannot be rewritten).
  // While #702 is open, #701 cannot exit. The non-manual escape: `unblock`
  // drops the stale ref purely in #701's body, and the exit guard then passes.
  let body701 = addBlockedBy('<!-- aitm-last-known-state: test -->\n\n## Body\n', 702);
  assert.deepEqual(parseBlockedBy(body701), [702]);

  // Before: guard refuses #701's exit because #702 is open.
  const before = await blockedByGuard.run({
    issueNumber: 701,
    repo: 'o/r',
    body: body701,
    fetchBlockerState: async () => 'develop',
  });
  assert.equal(before.ok, false, 'entangled: #701 cannot exit while #702 open');

  // Recovery: unblock #701, purely via body mutation (DI — no board, no file).
  const r = await runUnblock({
    target: 701,
    refs: null,
    cfg,
    deps: {
      mutateIssueBody: async ({ mutate }) => {
        body701 = mutate(body701);
        return { status: 'ok' };
      },
      runLabel: async () => {},
      postComment: async () => {},
      writeFieldValue: async () => {},
    },
  });
  assert.equal(r.status, 'removed');

  // After: the marker is gone and the guard now permits the exit.
  assert.deepEqual(parseBlockedBy(body701), []);
  const after = await blockedByGuard.run({
    issueNumber: 701,
    repo: 'o/r',
    body: body701,
    fetchBlockerState: async () => 'develop',
  });
  assert.equal(after.ok, true, 'after unblock, #701 may exit — entanglement broken non-manually');
});
