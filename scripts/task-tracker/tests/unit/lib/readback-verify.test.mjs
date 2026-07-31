#!/usr/bin/env node
// @story #655
// Read-back verification: a stamp write must prove its marker persisted before
// any verb reports success. Before #655 the verified live body was fetched on
// every write path (the `ok`-path verify-fetch, the `no-op`-path top-of-loop
// fetch) and then thrown away — callers saw only `{status, version}` and so
// assumed success from a non-throwing call. That is the #652 silent-success
// failure: `approve` stamped `aitm-review-approved`, the marker never persisted,
// and `close` then emitted a `review:approved` audit row on faith.
//
// The fix surfaces the already-fetched body (`versionedWriteBody` →
// `mutateIssueBody` now return `body`), adds a reusable `assertMarkerPersisted`
// helper that `approve` wires in, and gates `close`'s `review:approved` row on a
// pure `shouldEmitReviewApprovedRow` decision. No new GitHub round-trips.
//
// versioned-issue-write is exercised directly with injected `deps` fakes (no
// network); the close/approve wiring follows close-gate-order.test.mjs —
// pure-helper behavior plus source-shape anchoring where side-effects make
// direct invocation impractical.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { versionedWriteBody } from '../../../lib/versioned-issue-write.mjs';
import { mutateIssueBody } from '../../../lib/issue-body-mutate.mjs';
import { assertMarkerPersisted, StampMarkerNotPersistedError } from '../../../lib/stamp-verify.mjs';
import { shouldEmitReviewApprovedRow } from '../../../lib/close-convergence.mjs';
import { hasReviewApprovedMarker } from '../../../lib/markers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const closeSrc = readFileSync(path.resolve(__dirname, '..', '..', 'verbs/close.mjs'), 'utf8');
const approveSrc = readFileSync(path.resolve(__dirname, '..', '..', 'verbs/approve.mjs'), 'utf8');

const VERSIONED = (n) => `<!-- aitm-body-version version="${n}" -->`;
const CURRENT_APPROVAL_BODY = [
  '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T00:00:00Z" -->',
  '<!-- aitm-entered-review ts="2026-07-29T00:00:01Z" -->',
  '<!-- aitm-agent-review-proof schema="1" epoch="review:1:2026-07-29T00:00:01Z" sha="abc1234" ts="2026-07-29T00:00:02Z" validators="unit" result="pass" -->',
  '<!-- aitm-review-approved schema="1" epoch="review:1:2026-07-29T00:00:01Z" proof-sha="abc1234" ts="2026-07-29T00:00:03Z" provenance="human" -->',
].join('\n');

// A stateful GitHub-body fake. `fetchBody` returns the current stored body and
// counts calls; `pushBody` stores what was pushed (a write that lands). For the
// lost-write scenarios, swap in a no-op `pushBody`.
function makeStore(initialBody) {
  let body = initialBody;
  let fetches = 0;
  return {
    deps: {
      withGovernedEffect: async (_options, callback) => callback({ reverify: async () => {} }),
      fetchBody: async () => {
        fetches++;
        return body;
      },
      pushBody: async (_repo, _issue, stamped) => {
        body = stamped;
      },
    },
    get fetches() {
      return fetches;
    },
    get body() {
      return body;
    },
  };
}

// ── AC1: versionedWriteBody returns the verified live body on BOTH paths, with
// no GitHub round-trip beyond the fetch each path already performs ────────────

test('AC1 ok-path: versionedWriteBody returns the post-write verify-fetch as `body`', async () => {
  const store = makeStore(`Hello world\n\n${VERSIONED(1)}\n`);
  const res = await versionedWriteBody({
    issueNumber: 1,
    repo: 'o/r',
    mutate: (base) => `${base}\nNEW-LINE`,
    deps: store.deps,
  });
  assert.equal(res.status, 'ok');
  assert.equal(typeof res.body, 'string', 'ok path must surface a verified body');
  assert.ok(res.body.includes('NEW-LINE'), 'returned body must reflect the landed write');
  assert.equal(res.body, store.body, '`body` must equal the verified live body (the verify-fetch)');
  // Round-trip budget: exactly the two fetches the ok path already performs —
  // the initial read and the post-write verify. No EXTRA fetch was added to
  // surface `body`.
  assert.equal(store.fetches, 2, 'ok path performs exactly 2 fetches (initial + verify), no more');
});

test('AC1 no-op-path: versionedWriteBody returns the top-of-loop `remote` as `body`', async () => {
  // An identity mutate now short-circuits on the FIRST attempt (#697), before
  // any push — the pushBody spy proves nothing was written.
  const fixed = `Stable body\n\n${VERSIONED(1)}\n`;
  let fetches = 0;
  let pushes = 0;
  const res = await versionedWriteBody({
    issueNumber: 2,
    repo: 'o/r',
    mutate: (base) => base,
    deps: {
      fetchBody: async () => {
        fetches++;
        return fixed;
      },
      pushBody: async () => {
        pushes++;
      },
    },
  });
  assert.equal(res.status, 'no-op');
  assert.equal(res.body, fixed, 'no-op path must surface the top-of-loop remote as `body`');
  assert.equal(pushes, 0, 'no-op path must not push');
  // The no-op `body` is the `remote` already fetched at the top of the loop —
  // not a fresh fetch tacked on to surface it.
  assert.equal(fetches, 1, 'no-op path reuses the single loop fetch; none added to surface `body`');
});

// ── AC2: mutateIssueBody threads the verified body through its return ─────────

test('AC2: mutateIssueBody passes `body` through alongside status/version', async () => {
  const store = makeStore(`Doc\n\n${VERSIONED(3)}\n`);
  const res = await mutateIssueBody({
    issueNumber: 7,
    repo: 'o/r',
    mutate: (base) => `${base}\nappended`,
    deps: {
      ...store.deps,
      withGovernedEffect: async (_options, callback) => callback({ reverify: async () => {} }),
    },
  });
  assert.equal(res.status, 'ok');
  assert.equal(typeof res.version, 'number');
  assert.equal(typeof res.body, 'string', 'mutateIssueBody must thread `body` through');
  assert.ok(res.body.includes('appended'));
  assert.equal(res.body, store.body);
});

// ── AC3 / AC5: the reusable assertion helper + the #652 regression ────────────

const APPROVED_BODY = `Title\n\n<!-- aitm-review-approved ts="2026-06-29T00:00:00Z" -->\n`;
const UNAPPROVED_BODY = `Title\n\nno marker here\n`;

test('AC3 helper: assertMarkerPersisted returns the result when the marker is present', () => {
  const result = { status: 'ok', version: 4, body: APPROVED_BODY };
  const back = assertMarkerPersisted({
    result,
    predicate: hasReviewApprovedMarker,
    marker: 'aitm-review-approved',
    issueNumber: 9,
  });
  assert.equal(back, result, 'helper returns the result for chaining on success');
});

test('AC5 regression: a stamp write whose marker did NOT persist surfaces an error', () => {
  // Reproduce #652 at the assertion boundary `approve` now uses: the write
  // "succeeded" (status ok, body in hand) but the approval marker is absent.
  // The caller MUST surface an error instead of reporting success.
  const lostWrite = { status: 'ok', version: 4, body: UNAPPROVED_BODY };
  assert.throws(
    () =>
      assertMarkerPersisted({
        result: lostWrite,
        predicate: hasReviewApprovedMarker,
        marker: 'aitm-review-approved',
        issueNumber: 652,
      }),
    (err) => {
      assert.ok(err instanceof StampMarkerNotPersistedError, 'must throw the typed error');
      assert.equal(err.reason, 'marker-absent');
      assert.equal(err.issueNumber, 652);
      return true;
    }
  );
});

test('AC5 helper: a write result carrying no `body` is treated as unverified', () => {
  assert.throws(
    () =>
      assertMarkerPersisted({
        result: { status: 'ok', version: 4 }, // pre-#655 shape, no body
        predicate: hasReviewApprovedMarker,
        marker: 'aitm-review-approved',
      }),
    (err) => err instanceof StampMarkerNotPersistedError && err.reason === 'no-body'
  );
});

test('AC3 source: approve captures the write result and asserts marker persistence before success', () => {
  assert.ok(
    /const writeResult = await mutateBody\(/.test(approveSrc),
    'approve must capture the write result (not discard it)'
  );
  const assertIdx = approveSrc.indexOf('assertMarkerPersisted({');
  assert.ok(assertIdx >= 0, 'approve must call assertMarkerPersisted');
  const block = approveSrc.slice(assertIdx, assertIdx + 300);
  assert.ok(
    /deriveAuthorityForBody\(persistedBody\)/.test(block),
    'the assertion must derive current persisted authority as the predicate'
  );
  // The assertion must precede the `status: 'approved'` success return.
  const approvedIdx = approveSrc.indexOf("status: 'approved'");
  assert.ok(approvedIdx > assertIdx, 'marker assertion must run BEFORE approve reports success');
});

// ── AC4 / AC6: close gates the review:approved row on marker-or-bypass ────────

test('AC4 emit: review:approved row is emitted when current persisted authority is present', () => {
  assert.equal(
    shouldEmitReviewApprovedRow({ body: CURRENT_APPROVAL_BODY, reviewGateBypassed: false }),
    true
  );
});

test('AC4 emit: review:approved row is emitted when the review gate was explicitly bypassed', () => {
  // Bypass carries its own aitm-gate-bypassed audit row, so the approval row is
  // still the honest record of the (waived) gate.
  assert.equal(shouldEmitReviewApprovedRow({ body: '', reviewGateBypassed: true }), true);
});

test('AC6 regression: review:approved row is SUPPRESSED when no marker and the gate is active', () => {
  // The #652 half-state: gate active, marker never persisted. The row must NOT
  // be emitted — close may not fabricate a record of an approval that did not
  // happen.
  assert.equal(shouldEmitReviewApprovedRow({ body: '', reviewGateBypassed: false }), false);
});

test('AC4 source: close gates ONLY the review:approved row on the decision; issue:wrap stays unconditional', () => {
  // #801 refactor: the emit is centralized in the `emitReviewToDoneClosePair`
  // helper, invoked from BOTH the converge/noop fast-path and the full close
  // pipeline. Each call site supplies its live body (closeBody / convergeBody)
  // so the shared authority projection prevents fabrication.
  const guardIdx = closeSrc.indexOf('shouldEmitReviewApprovedRow({');
  assert.ok(guardIdx >= 0, 'close must gate the row through shouldEmitReviewApprovedRow');
  const guardBlock = closeSrc.slice(guardIdx, guardIdx + 200);
  assert.ok(
    /reviewGateBypassed/.test(guardBlock),
    'the gate must honor the explicit review-gate bypass'
  );

  // Both call sites supply a live body, never a constant — the converge path
  // off convergeBody, the full path off closeBody.
  assert.ok(
    /body: convergeBody/.test(closeSrc),
    'the converge-path call site must read the live convergeBody for authority'
  );
  assert.ok(
    /body: closeBody/.test(closeSrc),
    'the full-path call site must read the live closeBody for authority'
  );

  // Inside the helper: the approved row is inside the shouldEmit guard; the wrap
  // row is posted after, gated only on pendingClosePairState (idempotency), NOT
  // on approval — it records the terminal close, not an approval claim.
  const approvedPost = closeSrc.indexOf('safePostTiming(closeTarget, reviewApprovedRow)', guardIdx);
  const wrapPost = closeSrc.indexOf('safePostTiming(closeTarget, issueWrapRow)', guardIdx);
  assert.ok(
    approvedPost > guardIdx && wrapPost > approvedPost,
    'the gated approved row sits inside the shouldEmit guard; the wrap row follows it, outside'
  );
});
