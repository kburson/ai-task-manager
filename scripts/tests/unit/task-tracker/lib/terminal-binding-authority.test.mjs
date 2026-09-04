#!/usr/bin/env node
// @story #1490
//
// The terminal binding step (item 2).
//
// `close` refused every `conflict` from `inspectTerminalIssueBindingRelease`. For a
// recovery-backed replacement that refusal is unconditional: performing the
// corrective delivery REQUIRES rebinding the issue after the old close, and that
// rebind is exactly what makes the inspector report `conflict`. The saga completed
// seven steps and then refused its own eighth on the evidence of its own work.
//
// These tests pin the forgiveness as NARROW. The previous repair attempt in this
// area proved a predicate while the wiring feeding it was fabricated, so every
// input below is either a production-rendered record or a shape taken from the
// production inspector.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TERMINAL_CLOSE_STEPS } from '../../../../task-tracker/lib/close-convergence.mjs';
import {
  authorizeTerminalBindingRelease,
  createReopenedCloseRecoveryRecord,
  findRecoveryBackedReplacement,
  renderReopenedCloseRecoveryComment,
} from '../../../../task-tracker/lib/reopened-close-recovery.mjs';

const REPO = 'kburson/ai-task-manager';
const ISSUE = 1490;
const OLD_SHA = 'd'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const OLD_TX = 'ad96d1e1-8c17-471e-a060-279975761e50';
const NEW_TX = '11111111-2222-3333-4444-555555555555';

// A REAL record through the production factory and renderer — not a hand-written
// marker. If the grammar changes, these tests fail rather than quietly passing on a
// shape production no longer emits.
const RECORD = createReopenedCloseRecoveryRecord(
  {
    repository: REPO,
    issueNumber: ISSUE,
    oldTransaction: {
      schema: 'aitm.delivered-close/v1',
      transactionId: OLD_TX,
      issueNumber: ISSUE,
      acceptedSha: OLD_SHA,
      reviewAuthority: 'human-gate',
      completedSteps: [...TERMINAL_CLOSE_STEPS],
    },
    newAcceptedSha: NEW_SHA,
    newReviewAuthority: 'human-gate',
    actor: 'kburson',
  },
  { now: '2026-09-03T06:30:00.000Z', randomUUIDFn: () => NEW_TX }
);

const COMMENT = {
  id: 900,
  issue_url: `https://api.github.com/repos/${REPO}/issues/${ISSUE}`,
  body: renderReopenedCloseRecoveryComment(RECORD),
};

function bodyWith({ transactionId, acceptedSha, completedSteps }) {
  const completed = JSON.stringify(completedSteps).split('"').join('&quot;');
  const props = [
    'schema="aitm.delivered-close/v1"',
    `tx="${transactionId}"`,
    `issue="${ISSUE}"`,
    `accepted-sha="${acceptedSha}"`,
    'review-authority="human-gate"',
    `completed="${completed}"`,
  ].join(' ');
  return `issue body\n\n<!-- aitm-delivered-close ${props} -->\n`;
}

const REPLACEMENT_BODY = bodyWith({
  transactionId: NEW_TX,
  acceptedSha: NEW_SHA,
  completedSteps: TERMINAL_CLOSE_STEPS.slice(0, 7),
});
const OWN = { disposition: 'own-post-close-claim', authorized: true };

const lookup = (body, comments) =>
  findRecoveryBackedReplacement({ body, comments, repository: REPO, issueNumber: ISSUE });

test('#1490: durable evidence identifies the replacement at its seven-step prefix', () => {
  const found = lookup(REPLACEMENT_BODY, [COMMENT]);
  assert.equal(found.status, 'found');
  assert.equal(found.record.replacementTransactionId, NEW_TX);
  assert.deepEqual(found.transaction.completedSteps, TERMINAL_CLOSE_STEPS.slice(0, 7));
});

test('#1490: an ordinary close has no recovery evidence and is reported as absence', () => {
  // The completed ORIGINAL is not named as anyone's replacement.
  const found = lookup(
    bodyWith({
      transactionId: OLD_TX,
      acceptedSha: OLD_SHA,
      completedSteps: [...TERMINAL_CLOSE_STEPS],
    }),
    [COMMENT]
  );
  assert.equal(found.status, 'none');
});

test('#1490: two records naming one replacement are ambiguous, never picked between', () => {
  const found = lookup(REPLACEMENT_BODY, [COMMENT, { ...COMMENT, id: 901 }]);
  assert.equal(found.status, 'ambiguous');
  assert.equal(found.record, null);
});

test('#1490: a record whose accepted SHA disagrees with the body is not a match', () => {
  const found = lookup(
    bodyWith({ transactionId: NEW_TX, acceptedSha: 'c'.repeat(40), completedSteps: [] }),
    [COMMENT]
  );
  assert.equal(found.status, 'none');
});

test('#1490: a record rendered for a DIFFERENT issue REFUSES rather than being ignored', () => {
  // Loud refusal, not silent absence: evidence addressed to another issue means the
  // caller is reading the wrong thread, and treating that as "no recovery" would
  // hide the mistake behind an ordinary-looking close.
  assert.throws(
    () =>
      findRecoveryBackedReplacement({
        body: REPLACEMENT_BODY,
        comments: [COMMENT],
        repository: REPO,
        issueNumber: 1491,
      }),
    /malformed-comment/
  );
});

test('#1490: the verb treats that refusal as "unproven", so the binding step still refuses', () => {
  // The verb wraps the lookup in try/catch; the resulting `null` replacement must
  // land on the ordinary refusal rather than on any permissive default.
  const verdict = authorizeTerminalBindingRelease({
    bindingRelease: { status: 'conflict' },
    replacement: null,
    ownership: OWN,
  });
  assert.equal(verdict.authorized, false);
  assert.equal(verdict.reason, 'no-recovery-backed-replacement');
});

test('#1490: every non-conflict status stays exactly as the inspector permitted it', () => {
  // The repair must not widen or narrow what already worked.
  for (const status of ['pending', 'released', 'incomplete']) {
    const verdict = authorizeTerminalBindingRelease({ bindingRelease: { status } });
    assert.equal(verdict.authorized, true, status);
    assert.equal(verdict.reason, 'inspector-permitted', status);
  }
});

test('#1490: conflict on an ORDINARY close still refuses — the default is unchanged', () => {
  const verdict = authorizeTerminalBindingRelease({
    bindingRelease: { status: 'conflict' },
    replacement: null,
    ownership: OWN,
  });
  assert.equal(verdict.authorized, false);
  assert.equal(verdict.reason, 'no-recovery-backed-replacement');
});

test('#1490: conflict on a recovery-backed replacement with its OWN claim proceeds', () => {
  const verdict = authorizeTerminalBindingRelease({
    bindingRelease: { status: 'conflict' },
    replacement: RECORD,
    ownership: OWN,
  });
  assert.equal(verdict.authorized, true);
  assert.equal(verdict.reason, 'own-post-close-claim');
});

test('#1490: a recovery-backed replacement does NOT forgive a foreign or stale claim', () => {
  // Recovery backing alone must never be sufficient: both halves are required, or
  // the recovery would become a blanket override of the contention guard.
  for (const ownership of [
    { disposition: 'foreign-claim', authorized: false },
    { disposition: 'foreign-worktree', authorized: false },
    { disposition: 'stale-claim', authorized: false },
    { disposition: 'live-binding', authorized: false },
    { disposition: 'no-claim', authorized: false },
    null,
    // Authorized under an unrecognized disposition: both fields are checked, so a
    // future disposition cannot pass by setting the boolean alone.
    { disposition: 'own-post-close-claim-v2', authorized: true },
  ]) {
    const verdict = authorizeTerminalBindingRelease({
      bindingRelease: { status: 'conflict' },
      replacement: RECORD,
      ownership,
    });
    assert.equal(verdict.authorized, false, JSON.stringify(ownership));
    assert.match(verdict.reason, /^binding-ownership:/, JSON.stringify(ownership));
  }
});

// ---------------------------------------------------------------------------
// Wiring pinned by source shape.
//
// There is no `verbClose` harness that reaches the terminal binding step, so the
// policy above is unit-tested and its INTEGRATION is pinned here. This is weaker
// than a full drive and is recorded as such: it proves the verb calls the policy
// and that the authorized arm heads the status chain, not that a real close
// completes. Replacing it with a full `verbClose` reproduction is outstanding work.

const CLOSE_SOURCE = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../task-tracker/verbs/close.mjs'
  ),
  'utf8'
);

test('#1490: the verb decides the binding step through the shared policy', () => {
  assert.match(CLOSE_SOURCE, /bindingAuthority = authorizeTerminalBindingRelease\(\{/);
  assert.match(CLOSE_SOURCE, /replacement = findRecoveryBackedReplacement\(\{/);
  // The refusal reports WHY, so an operator sees which half failed.
  assert.match(
    CLOSE_SOURCE,
    /supersedes the terminal cleanup authority \(\$\{bindingAuthority\.reason\}\)/
  );
});

test('#1490: the authorized conflict arm HEADS the status chain', () => {
  // Regression pin. Written as a standalone `if`, an authorized `conflict` fell
  // through to the chain's `else if (status !== \'pending\')` arm and was refused as
  // an "unknown state" one branch after being authorized — the authorization was
  // granted and then discarded.
  // `lastIndexOf` on both ends: `status === 'conflict'` also appears earlier, in the
  // authority block, and `needsDeliveredCloseStep('binding')` appears earlier as the
  // step guard that opens the whole block.
  const chain = CLOSE_SOURCE.slice(
    CLOSE_SOURCE.lastIndexOf("if (bindingRelease?.status === 'conflict') {"),
    CLOSE_SOURCE.lastIndexOf("if (needsDeliveredCloseStep('binding')) {")
  );
  assert.ok(chain.length > 0, 'the binding status chain must be locatable');
  for (const arm of ["'incomplete'", "'released'", "!== 'pending'"]) {
    assert.ok(
      chain.includes(`} else if (bindingRelease?.status === ${arm}) {`) ||
        chain.includes(`} else if (bindingRelease?.status ${arm}) {`),
      `the ${arm} arm must be chained to the conflict arm, not a separate statement`
    );
  }
});
