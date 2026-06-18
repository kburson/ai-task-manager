// @story #168
// #168 / #295 — writeIssueBodyWithRetry: succeed-1st (1 attempt), succeed-
// on-retry (2 attempts + stderr warn, no audit), fail (audit comment posted).
// noop when the mutate closure returns base unchanged.
//
// Post-#295 the helper is a shim over `mutateIssueBody` → `versionedWriteBody`.
// Tests inject `fetchBody` / `pushBody` at the versionedWriteBody layer via
// `deps` so no real `gh` process spawns. The mutate closure is injected
// directly so we don't need to fake the `<!-- aitm-last-known-state -->`
// transform.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeIssueBodyWithRetry } from '../../lib/state-recording.mjs';
import { BODY_VERSION_MARKER_RE, stampBodyVersion } from '../../lib/body-version.mjs';

function makeWarn() {
  const lines = [];
  return { warn: (m) => lines.push(m), lines };
}

// Build an in-memory fetch/push pair. `script` is an array of pre-push hooks
// indexed by push attempt number (1-based); each hook may throw to simulate
// transient failure. The remote body is updated only on successful push.
function makeRemote({ initialBody = '', script = [] } = {}) {
  let remote = initialBody;
  const calls = { fetches: 0, pushes: 0 };
  return {
    state: () => remote,
    calls,
    fetchBody: async () => {
      calls.fetches++;
      return remote;
    },
    pushBody: async (_repo, _n, body) => {
      calls.pushes++;
      const hook = script[calls.pushes - 1];
      if (typeof hook === 'function') hook({ attempt: calls.pushes });
      remote = body;
    },
  };
}

const repo = 'o/r';

test('identity mutate still pushes a version bump (post-#295 contract)', async () => {
  // Pre-#295 the helper compared `body === bodyBefore` and returned `noop`.
  // Post-#295 the closure decides — and an identity mutate still produces a
  // version-bumped body, which is a legitimate write.
  const remote = makeRemote({ initialBody: stampBodyVersion('same body', 1) });
  const r = await writeIssueBodyWithRetry({
    issueNumber: 1,
    repo,
    target: 'plan',
    mutate: (base) => base,
    deps: { fetchBody: remote.fetchBody, pushBody: remote.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.attempts, 1);
  assert.equal(remote.calls.pushes, 1);
});

test('succeeds on first attempt — 1 push, no warn, no audit', async () => {
  const remote = makeRemote({ initialBody: stampBodyVersion('old', 1) });
  let comments = 0;
  const { warn, lines } = makeWarn();
  const r = await writeIssueBodyWithRetry({
    issueNumber: 1,
    repo,
    target: 'plan',
    mutate: (base) => base.replace('old', 'new'),
    postComment: async () => {
      comments++;
    },
    warn,
    deps: { fetchBody: remote.fetchBody, pushBody: remote.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.attempts, 1);
  assert.equal(remote.calls.pushes, 1);
  assert.equal(comments, 0);
  assert.equal(lines.length, 0);
  // landed body carries a bumped aitm-body-version marker
  assert.match(remote.state(), BODY_VERSION_MARKER_RE);
  assert.match(remote.state(), /new/);
});

test('succeeds on retry — 2 pushes + stderr warn, no audit comment', async () => {
  const remote = makeRemote({
    initialBody: stampBodyVersion('old', 1),
    script: [
      () => {
        throw new Error('transient');
      },
    ],
  });
  let comments = 0;
  const { warn, lines } = makeWarn();
  const r = await writeIssueBodyWithRetry({
    issueNumber: 1,
    repo,
    target: 'plan',
    mutate: (base) => base.replace('old', 'new'),
    postComment: async () => {
      comments++;
    },
    warn,
    deps: { fetchBody: remote.fetchBody, pushBody: remote.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.attempts, 2);
  assert.equal(remote.calls.pushes, 2);
  assert.equal(comments, 0);
  assert.match(lines.join('\n'), /succeeded on attempt 2/);
});

test('fails — stderr + audit comment posted', async () => {
  const remote = makeRemote({
    initialBody: stampBodyVersion('old', 1),
    script: [
      () => {
        throw new Error('rate-limited');
      },
      () => {
        throw new Error('rate-limited');
      },
    ],
  });
  let comments = 0;
  const { warn, lines } = makeWarn();
  const r = await writeIssueBodyWithRetry({
    issueNumber: 168,
    repo,
    target: 'plan',
    mutate: (base) => base.replace('old', 'new'),
    postComment: async ({ body }) => {
      comments++;
      assert.match(body, /state-recording-failed/);
      assert.match(body, /plan/);
    },
    warn,
    deps: { fetchBody: remote.fetchBody, pushBody: remote.pushBody },
  });
  assert.equal(r.status, 'failed');
  assert.equal(comments, 1);
  assert.equal(r.auditPosted, true);
  assert.match(lines.join('\n'), /FAILED/);
});

test('audit-post failure does not throw — auditPosted=false', async () => {
  const remote = makeRemote({
    initialBody: stampBodyVersion('old', 1),
    script: [
      () => {
        throw new Error('rate-limited');
      },
      () => {
        throw new Error('rate-limited');
      },
    ],
  });
  const { warn } = makeWarn();
  const r = await writeIssueBodyWithRetry({
    issueNumber: 168,
    repo,
    target: 'plan',
    mutate: (base) => base.replace('old', 'new'),
    postComment: async () => {
      throw new Error('also-down');
    },
    warn,
    deps: { fetchBody: remote.fetchBody, pushBody: remote.pushBody },
  });
  assert.equal(r.status, 'failed');
  assert.equal(r.auditPosted, false);
});
