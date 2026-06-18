// @story #310
// Tests for scripts/task-tracker/lib/versioned-issue-write.mjs (#290 / epic #288).
//
// All scenarios use fake `fetchBody` / `pushBody` deps — no real GitHub I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Readable } from 'node:stream';

import {
  versionedWriteBody,
  BodyWriteRefusalError,
  collectStreamUtf8,
} from '../../lib/versioned-issue-write.mjs';
import { parseBodyVersion, stampBodyVersion } from '../../lib/body-version.mjs';

function makeServer(initialBody) {
  // Tiny in-memory issue. `fetchBody` returns the current body; `pushBody`
  // accepts any body (last writer wins). Tests can also `inject(body)`
  // between operations to simulate a concurrent writer.
  let body = initialBody;
  return {
    fetchBody: async () => body,
    pushBody: async (_repo, _issue, next) => {
      body = next;
    },
    inject: (next) => {
      body = next;
    },
    get current() {
      return body;
    },
  };
}

// ── happy path ───────────────────────────────────────────────────────────────

// ── deps injection contract ──────────────────────────────────────────────────

test('deps: mutate function is required (throws if missing)', async () => {
  await assert.rejects(
    versionedWriteBody({
      issueNumber: 1,
      repo: 'o/r',
      deps: { fetchBody: async () => '', pushBody: async () => {} },
    }),
    TypeError
  );
});

test('deps: issueNumber is required', async () => {
  await assert.rejects(
    versionedWriteBody({
      repo: 'o/r',
      mutate: (b) => b,
      deps: { fetchBody: async () => '', pushBody: async () => {} },
    }),
    /issueNumber is required/
  );
});

test('non-overlapping rebase preserves both edits even with multi-line splits', async () => {
  // Base: 3 paragraphs separated by blank lines.
  const base = ['para A line 1', 'para A line 2', '', 'para B line 1', '', 'para C line 1'].join(
    '\n'
  );
  const srv = makeServer(stampBodyVersion(base, 1));

  let firstPushSeen = false;
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    if (!firstPushSeen) {
      firstPushSeen = true;
      // Concurrent writer (based on the ORIGINAL base, NOT our pushed body)
      // modifies paragraph C only.
      const after = [
        'para A line 1',
        'para A line 2',
        '',
        'para B line 1',
        '',
        'para C line 1 EDITED',
      ].join('\n');
      srv.inject(stampBodyVersion(after, 2));
    }
  };

  const r = await versionedWriteBody({
    issueNumber: 33,
    repo: 'o/r',
    mutate: (b) => b.replace('para A line 1', 'para A line 1 OURS'),
    deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
  });
  assert.equal(r.status, 'ok');
  assert.ok(srv.current.includes('para A line 1 OURS'));
  assert.ok(srv.current.includes('para C line 1 EDITED'));
});

// ── stale-input refusal (#293 / #292 replay) ─────────────────────────────────

test('stale-input refusal: mutate returns snapshot with older aitm-body-version', async () => {
  // Simulates the #292 clobber: a heal script captured a v4 snapshot, the
  // live body advanced to v16 (markers added), then the script pushed the
  // v4 snapshot back via `pushIssueBody({ body: <snapshot> })` — internally
  // `versionedWriteBody({ mutate: () => snapshot })`. Pre-fix this silently
  // clobbered every marker added between v4 and v16. Post-fix it refuses.
  const remote = stampBodyVersion('current body with markers added', 16);
  const staleSnapshot = stampBodyVersion('old body without those markers', 4);
  const srv = makeServer(remote);

  let pushed = false;
  await assert.rejects(
    () =>
      versionedWriteBody({
        issueNumber: 292,
        repo: 'o/r',
        mutate: () => staleSnapshot, // arrow ignores `base` — the bug class.
        deps: {
          fetchBody: srv.fetchBody,
          pushBody: async (...args) => {
            pushed = true;
            return srv.pushBody(...args);
          },
        },
      }),
    (err) => {
      assert.ok(err instanceof BodyWriteRefusalError);
      assert.equal(err.reason, 'stale-input');
      assert.match(err.message, /version=4/);
      assert.match(err.message, /version=16/);
      assert.match(err.message, /mutateIssueBody/);
      return true;
    }
  );
  assert.equal(pushed, false, 'must refuse before pushing');
  assert.equal(srv.current, remote, 'remote body must be untouched');
});

test('stale-input gate: mutate returning current remote version passes', async () => {
  // Boundary: a mutate that retains the SAME version marker as remote (a
  // weird but possible no-op) is not stale — the check fires only on
  // strictly older versions.
  const remote = stampBodyVersion('body', 7);
  const srv = makeServer(remote);
  const r = await versionedWriteBody({
    issueNumber: 1,
    repo: 'o/r',
    mutate: () => stampBodyVersion('edited body', 7), // same version, edited content
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 8);
});

test('stale-input gate: mutate with no version marker passes (normal path)', async () => {
  // The normal pattern: mutate operates on `base` (already stripped) and
  // returns a stripped result. parseBodyVersion(ourLocal) is null → gate is
  // a no-op.
  const srv = makeServer(stampBodyVersion('hello', 5));
  const r = await versionedWriteBody({
    issueNumber: 1,
    repo: 'o/r',
    mutate: (base) => `${base} world`,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 6);
});

// ── #347: mutate-return type guard ───────────────────────────────────────────
//
// The corruption shape we are catching: a `mutate` that returns a non-string
// value (object, array, null, undefined, number). Without the guard, the
// runtime would coerce via `String(obj) → "[object Object]"` and ship that as
// the new body. With the guard, we throw a TypeError BEFORE pushBody runs.

function makeGuardServer() {
  const srv = makeServer(stampBodyVersion('original body', 1));
  let pushCount = 0;
  const wrappedPush = async (repo, issue, body) => {
    pushCount++;
    return srv.pushBody(repo, issue, body);
  };
  return {
    fetchBody: srv.fetchBody,
    pushBody: wrappedPush,
    get pushCount() {
      return pushCount;
    },
    get current() {
      return srv.current;
    },
  };
}
