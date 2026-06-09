// Tests for the #362 CheckboxProofMissingError invariant inside mutateIssueBody.
//
// Every `- [ ]` → `- [x]` transition must carry a same-line proof marker —
// either `aitm-verified-at` (canonical) or `aitm-dod-evidence` (grandfathered
// close-pipeline auto-stamp). The marker must live on the changed line; a
// marker on the next line does not validate the tick.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mutateIssueBody, CheckboxProofMissingError } from '../lib/issue-body-mutate.mjs';

function fakeDeps(initialBody) {
  let body = initialBody;
  return {
    fetchBody: async () => body,
    pushBody: async (_repo, _n, next) => {
      body = next;
    },
    getBody: () => body,
  };
}

const BASE = '## DoD\n- [ ] verify behavior\n<!-- aitm-body-version: 1 -->\n';

test('bare tick (no proof marker) is rejected with CheckboxProofMissingError', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 101,
      repo: 'fake/fake',
      mutate: (b) => b.replace('- [ ] verify behavior', '- [x] verify behavior'),
      deps,
    }),
    (err) => {
      assert.ok(
        err instanceof CheckboxProofMissingError,
        `expected CheckboxProofMissingError, got ${err?.name}`
      );
      assert.equal(err.lines.length, 1);
      assert.match(err.message, /proof marker/);
      assert.match(err.message, /allowUnverifiedTicks/);
      return true;
    }
  );
  // Push never ran — body unchanged.
  assert.match(deps.getBody(), /- \[ \] verify behavior/);
});

test('tick with same-line aitm-verified-at marker is accepted', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 102,
    repo: 'fake/fake',
    mutate: (b) =>
      b.replace(
        '- [ ] verify behavior',
        '- [x] verify behavior <!-- aitm-verified-at: 2026-06-09T00:00:00Z evidence:"npm test" sha=abc proof=#1 -->'
      ),
    deps,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /- \[x\] verify behavior/);
  assert.match(deps.getBody(), /aitm-verified-at/);
});

test('tick with same-line aitm-dod-evidence marker is accepted (close-pipeline shape)', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 103,
    repo: 'fake/fake',
    mutate: (b) =>
      b.replace(
        '- [ ] verify behavior',
        '- [x] verify behavior <!-- aitm-dod-evidence: sandbox exit 0 -->'
      ),
    deps,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /- \[x\] verify behavior/);
  assert.match(deps.getBody(), /aitm-dod-evidence/);
});

test('allowUnverifiedTicks: true bypasses the guard for legitimate edge cases', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 104,
    repo: 'fake/fake',
    mutate: (b) => b.replace('- [ ] verify behavior', '- [x] verify behavior'),
    deps,
    allowUnverifiedTicks: true,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /- \[x\] verify behavior/);
});

test('marker on line N+1 does NOT validate a tick on line N (co-location required)', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 105,
      repo: 'fake/fake',
      mutate: (b) =>
        b.replace(
          '- [ ] verify behavior\n',
          '- [x] verify behavior\n<!-- aitm-verified-at: 2026-06-09T00:00:00Z evidence:"x" sha=abc proof=#1 -->\n'
        ),
      deps,
    }),
    (err) => {
      assert.ok(err instanceof CheckboxProofMissingError);
      assert.equal(err.lines.length, 1);
      // The offender is the tick line itself, not the marker line.
      assert.match(err.lines[0].text, /- \[x\] verify behavior/);
      return true;
    }
  );
});
