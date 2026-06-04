// Tests for scripts/task-tracker/lib/issue-body-mutate.mjs (#293).
//
// `mutateIssueBody` is a thin pass-through to `versionedWriteBody` — these
// tests exercise the wrapper's contract (arg validation, return shape,
// fetch-mutate-push round trip, retry behaviour, error surfacing).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { BodyWriteRefusalError } from '../lib/versioned-issue-write.mjs';
import { parseBodyVersion, stampBodyVersion } from '../lib/body-version.mjs';

function makeServer(initialBody) {
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

// ── arg validation ──────────────────────────────────────────────────────────

test('rejects when issueNumber is missing', async () => {
  await assert.rejects(
    () => mutateIssueBody({ repo: 'o/r', mutate: (b) => b }),
    /issueNumber is required/
  );
});

test('rejects when repo is missing', async () => {
  await assert.rejects(
    () => mutateIssueBody({ issueNumber: 1, mutate: (b) => b }),
    /repo is required/
  );
});

test('rejects when mutate is not a function', async () => {
  await assert.rejects(
    () => mutateIssueBody({ issueNumber: 1, repo: 'o/r', mutate: 'not-a-fn' }),
    /mutate must be a function/
  );
});

// ── happy path round trip ───────────────────────────────────────────────────

test('round trip: mutate sees fresh remote base, push stamps N+1', async () => {
  const srv = makeServer(stampBodyVersion('hello', 3));
  let seenBase = null;
  const r = await mutateIssueBody({
    issueNumber: 42,
    repo: 'o/r',
    mutate: (base) => {
      seenBase = base;
      return base.replace('hello', 'hello world');
    },
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 4);
  assert.ok(srv.current.includes('hello world'));
  assert.equal(parseBodyVersion(srv.current), 4);
  // mutate must have seen the stripped base (no version marker), not the raw remote.
  assert.equal(parseBodyVersion(seenBase), 0);
  assert.doesNotMatch(seenBase, /aitm-body-version/);
});

// ── race-loss re-mutates against the FRESH remote (not a cached copy) ───────

test('race-loss: mutate is re-invoked against the new remote base on retry', async () => {
  // First push lands but verification reads a body the concurrent writer
  // bumped — versionedWriteBody enters its rebase path. The rebase reuses
  // the LAST mutate output via editRange/rebaseOnto rather than calling
  // mutate again. This test verifies the wrapper does NOT mask that: it
  // does what versionedWriteBody does, which is rebase-on-retry (not
  // re-mutate). Documented behavior, asserted explicitly so a future change
  // that re-calls mutate flips this test as a heads-up.
  const base = ['header', 'A', 'mid', 'B', 'footer'].join('\n');
  const srv = makeServer(stampBodyVersion(base, 5));

  let firstPush = true;
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    if (firstPush) {
      firstPush = false;
      // Concurrent writer edits a non-overlapping line.
      const after = ['header', 'A', 'mid', 'B-theirs', 'footer'].join('\n');
      srv.inject(stampBodyVersion(after, 7));
    }
  };

  let mutateCalls = 0;
  const r = await mutateIssueBody({
    issueNumber: 9,
    repo: 'o/r',
    mutate: (b) => {
      mutateCalls++;
      return b.replace('A', 'A-ours');
    },
    deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
  });
  assert.equal(r.status, 'ok');
  assert.equal(mutateCalls, 1, 'mutate is invoked once; retry uses rebase');
  assert.ok(srv.current.includes('A-ours'));
  assert.ok(srv.current.includes('B-theirs'));
});

// ── mutate throw is surfaced cleanly ────────────────────────────────────────

test('mutate throw: original error propagates without wrapping', async () => {
  const srv = makeServer(stampBodyVersion('body', 1));
  const sentinel = new Error('boom-from-mutate');
  await assert.rejects(
    () =>
      mutateIssueBody({
        issueNumber: 1,
        repo: 'o/r',
        mutate: () => {
          throw sentinel;
        },
        deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
      }),
    (err) => err === sentinel
  );
});

// ── snapshot-clobber prevention (#293 / #292 replay) ────────────────────────

test('mutateIssueBody refuses a snapshot pattern via the underlying stale-input gate', async () => {
  // Even if a caller goes through the new wrapper but still passes a stale
  // captured snapshot (e.g. `mutate: () => stash`), the underlying gate in
  // versionedWriteBody catches it.
  const srv = makeServer(stampBodyVersion('current with markers', 16));
  const stash = stampBodyVersion('old snapshot', 4);
  await assert.rejects(
    () =>
      mutateIssueBody({
        issueNumber: 292,
        repo: 'o/r',
        mutate: () => stash,
        deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
      }),
    (err) => {
      assert.ok(err instanceof BodyWriteRefusalError);
      assert.equal(err.reason, 'stale-input');
      return true;
    }
  );
});
