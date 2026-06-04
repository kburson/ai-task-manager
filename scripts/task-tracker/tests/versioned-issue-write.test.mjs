// Tests for scripts/task-tracker/lib/versioned-issue-write.mjs (#290 / epic #288).
//
// All scenarios use fake `fetchBody` / `pushBody` deps — no real GitHub I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { versionedWriteBody, BodyWriteRefusalError } from '../lib/versioned-issue-write.mjs';
import { parseBodyVersion, stampBodyVersion } from '../lib/body-version.mjs';

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

test('happy path: no remote bump → push with N+1 on first attempt', async () => {
  const srv = makeServer('hello\n\n<!-- aitm-body-version: 3 -->\n');
  const r = await versionedWriteBody({
    issueNumber: 42,
    repo: 'o/r',
    mutate: (base) => `${base.replace('hello', 'hello world')}`,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.attempts, 1);
  assert.equal(r.version, 4);
  assert.equal(parseBodyVersion(srv.current), 4);
  assert.ok(srv.current.includes('hello world'));
});

test('absent marker treated as version 0 → first push stamps 1', async () => {
  const srv = makeServer('plain body, no marker yet');
  const r = await versionedWriteBody({
    issueNumber: 1,
    repo: 'o/r',
    mutate: (base) => `${base}\n\nappended`,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.version, 1);
});

// ── single-conflict retry ────────────────────────────────────────────────────

test('single-conflict retry: race-lose once on a non-overlapping section, then succeed', async () => {
  // Base body has two distinct edit regions.
  const base = ['header', 'A', 'middle', 'B', 'footer'].join('\n');
  const initial = stampBodyVersion(base, 5);
  const srv = makeServer(initial);

  // We edit line A → 'A-ours'. Mid-flight, a concurrent writer edits B → 'B-theirs'.
  let firstPushSeen = false;
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    if (!firstPushSeen) {
      firstPushSeen = true;
      // Concurrent writer's edit is based on the ORIGINAL base — they did
      // not see our 'A-ours'. They edited B → 'B-theirs'.
      const newBase = ['header', 'A', 'middle', 'B-theirs', 'footer'].join('\n');
      srv.inject(stampBodyVersion(newBase, 7));
    }
  };

  const r = await versionedWriteBody({
    issueNumber: 9,
    repo: 'o/r',
    mutate: (b) => b.replace('A', 'A-ours'),
    deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
  });
  assert.equal(r.status, 'ok');
  assert.ok(r.attempts >= 1);
  assert.ok(srv.current.includes('A-ours'));
  assert.ok(srv.current.includes('B-theirs'));
});

// ── overlapping-diff refusal ─────────────────────────────────────────────────

test('overlapping-diff refusal: both edits hit the same lines', async () => {
  const base = ['x', 'shared', 'y'].join('\n');
  const initial = stampBodyVersion(base, 2);
  const srv = makeServer(initial);

  let firstPushSeen = false;
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    if (!firstPushSeen) {
      firstPushSeen = true;
      // Concurrent writer (based on the ORIGINAL base) changes the SAME line
      // our mutate touched.
      srv.inject(stampBodyVersion(['x', 'shared-theirs', 'y'].join('\n'), 3));
    }
  };

  await assert.rejects(
    versionedWriteBody({
      issueNumber: 17,
      repo: 'o/r',
      mutate: (b) => b.replace('shared', 'shared-ours'),
      deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
    }),
    (err) => err instanceof BodyWriteRefusalError && err.reason === 'overlapping-diff'
  );
});

// ── max-retries-exceeded ─────────────────────────────────────────────────────

test('max-retries-exceeded refusal: every push race-loses', async () => {
  const srv = makeServer(stampBodyVersion('base', 0));
  // pushBody completes, but after EVERY push, a concurrent writer races in
  // and bumps the marker before our verify-fetch.
  const wrappedPush = async (repo, issue, body) => {
    await srv.pushBody(repo, issue, body);
    const cur = srv.current;
    const v = parseBodyVersion(cur);
    // Bump again (concurrent writer): non-overlapping append.
    srv.inject(
      stampBodyVersion(
        `${srv.current.replace(/<!-- aitm-body-version: \d+ -->/, '')}\nintruder`,
        v + 1
      )
    );
  };

  await assert.rejects(
    versionedWriteBody({
      issueNumber: 99,
      repo: 'o/r',
      mutate: (b) => `${b}\nours`,
      deps: { fetchBody: srv.fetchBody, pushBody: wrappedPush },
      maxRetries: 2,
    }),
    (err) =>
      err instanceof BodyWriteRefusalError &&
      err.reason === 'max-retries-exceeded' &&
      err.attempts === 2
  );
});

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
