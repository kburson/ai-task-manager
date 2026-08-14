// @story #697
// Regression: a first-attempt mutate that returns the base unchanged must
// short-circuit to 'no-op' without pushing. Before the fix only the retry
// path had this check, so idempotent heal sweeps pushed pure version-bump
// edits (observed live 2026-07-04: 13 issues polluted, e.g. #1 version 7→8).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { versionedWriteBody } from '../../../../task-tracker/lib/versioned-issue-write.mjs';
import { parseBodyVersion, stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';

// In-memory issue server (same shape as versioned-issue-write-core.test.mjs)
// plus a push counter — the defect is invisible without counting writes.
function makeServer(initialBody) {
  let body = initialBody;
  let pushes = 0;
  return {
    fetchBody: async () => body,
    pushBody: async (_repo, _issue, next) => {
      pushes++;
      body = next;
    },
    get current() {
      return body;
    },
    get pushes() {
      return pushes;
    },
  };
}

test('identity mutate on first attempt returns no-op with zero pushes', async () => {
  const initial = 'stable body\n\n<!-- aitm-body-version: 7 -->\n';
  const srv = makeServer(initial);
  const r = await versionedWriteBody({
    issueNumber: 1,
    repo: 'o/r',
    mutate: (base) => base,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'no-op');
  assert.equal(r.attempts, 1);
  assert.equal(srv.pushes, 0, 'no push may occur for an unchanged body');
  assert.equal(srv.current, initial, 'remote body must be byte-identical');
  assert.equal(parseBodyVersion(srv.current), 7, 'version marker must not bump');
});

test('no-op result surfaces the fetched remote body and current version', async () => {
  const initial = 'content\n\n<!-- aitm-body-version: 3 -->\n';
  const srv = makeServer(initial);
  const r = await versionedWriteBody({
    issueNumber: 2,
    repo: 'o/r',
    mutate: (base) => base,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.version, 3, 'version reports the current remote, not N+1');
  assert.equal(r.body, initial, 'body is the top-of-loop fetched remote (#655 read-back)');
});

test('unmarked body with identity mutate stays unmarked (no first version stamp)', async () => {
  const initial = 'never touched by aitm';
  const srv = makeServer(initial);
  const r = await versionedWriteBody({
    issueNumber: 3,
    repo: 'o/r',
    mutate: (base) => base,
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'no-op');
  assert.equal(srv.pushes, 0);
  assert.ok(!srv.current.includes('aitm-body-version'), 'no version="1" marker may appear');
});

test('genuine first-attempt change still pushes and stamps N+1 (regression)', async () => {
  const srv = makeServer('hello\n\n<!-- aitm-body-version: 3 -->\n');
  const r = await versionedWriteBody({
    issueNumber: 4,
    repo: 'o/r',
    mutate: (base) => base.replace('hello', 'hello world'),
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'ok');
  assert.equal(srv.pushes, 1);
  assert.equal(r.version, 4);
  assert.equal(parseBodyVersion(srv.current), 4);
  assert.ok(srv.current.includes('hello world'));
});

test('version-marker-only difference in mutate output is a no-op', async () => {
  const srv = makeServer('content\n\n<!-- aitm-body-version: 5 -->\n');
  const r = await versionedWriteBody({
    issueNumber: 5,
    repo: 'o/r',
    // Misbehaving mutate re-stamps a marker over otherwise-identical content.
    // Stamping the CURRENT remote version (5) also keeps the #293 stale-input
    // guard quiet — this test targets only the content comparison.
    mutate: (base) => stampBodyVersion(base, 5),
    deps: { fetchBody: srv.fetchBody, pushBody: srv.pushBody },
  });
  assert.equal(r.status, 'no-op');
  assert.equal(srv.pushes, 0);
  assert.equal(parseBodyVersion(srv.current), 5);
});
