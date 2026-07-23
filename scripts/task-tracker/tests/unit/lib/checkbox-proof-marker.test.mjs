// @story #362
// Tests for the #362 CheckboxProofMissingError invariant inside mutateIssueBody.
//
// Every `- [ ]` → `- [x]` transition must carry a same-line proof marker —
// either `aitm-verified-at` (canonical) or `aitm-dod-evidence` (grandfathered
// close-pipeline auto-stamp). The marker must live on the changed line; a
// marker on the next line does not validate the tick.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mutateIssueBody, CheckboxProofMissingError } from '../../../lib/issue-body-mutate.mjs';

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
        '- [x] verify behavior <!-- aitm-verified-at: 2026-06-09T00:00:00Z evidence:"npm test" sha=abc1234 proof=#1 -->'
      ),
    deps,
    // #522 — simulates the sanctioned stamp path that mints proof; the
    // proof-introduction guard is bypassed here so this test stays focused on
    // the #362 checkbox-proof invariant.
    evidenceStamp: true,
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
    // #522 — sanctioned-stamp simulation; bypass the proof-introduction guard.
    evidenceStamp: true,
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

// #383 — reconcile the #345 evidence gate with the #362 checkbox-proof
// invariant: a canonical `aitm-ac-evidence` marker (carrying cmd/exit/sha/ts
// execution evidence, produced by `/task ac-stamp`) is the marker the
// sanctioned tick workflow already emits, so #362 must accept it as proof.
test('tick with same-line canonical aitm-ac-evidence marker is accepted (#383)', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 106,
    repo: 'fake/fake',
    mutate: (b) =>
      b.replace(
        '- [ ] verify behavior',
        '- [x] verify behavior <!-- aitm-ac-evidence:da1b55f9 cmd="npm test" exit=0 sha=abc1234 ts=2026-06-10T00:00:00.000Z -->'
      ),
    deps,
    // #522 — sanctioned-stamp simulation; bypass the proof-introduction guard.
    evidenceStamp: true,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /- \[x\] verify behavior/);
  assert.match(deps.getBody(), /aitm-ac-evidence:/);
});

// No blanket weakening: an AC that merely DECLARES a verifier (aitm-verified-by)
// but carries no execution-evidence marker is still rejected. The reconciliation
// only admits the canonical ac-evidence form, not the bare declaration.
test('verifier DECLARATION (aitm-verified-by) alone is still rejected (#383 no-weakening)', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 107,
      repo: 'fake/fake',
      mutate: (b) =>
        b.replace(
          '- [ ] verify behavior',
          '- [x] verify behavior <!-- aitm-verified-by: `npm test` -->'
        ),
      deps,
    }),
    (err) => {
      assert.ok(
        err instanceof CheckboxProofMissingError,
        `expected CheckboxProofMissingError, got ${err?.name}`
      );
      assert.equal(err.lines.length, 1);
      assert.match(err.lines[0].text, /- \[x\] verify behavior/);
      return true;
    }
  );
});

// #391 — a cmd-only consolidated `aitm-verified cmd="..."` is a DECLARATION,
// not execution proof. After the #369 migration it is name-indistinguishable
// from a proof stamp, so the invariant must reject a tick backed only by it
// (content-based `hasExecutionProof`), exactly as it rejects bare
// `aitm-verified-by`.
test('cmd-only consolidated aitm-verified declaration alone is rejected (#391)', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 111,
      repo: 'fake/fake',
      mutate: (b) =>
        b.replace(
          '- [ ] verify behavior',
          '- [x] verify behavior <!-- aitm-verified cmd="`npm test`" -->'
        ),
      deps,
    }),
    (err) => {
      assert.ok(
        err instanceof CheckboxProofMissingError,
        `expected CheckboxProofMissingError, got ${err?.name}`
      );
      assert.equal(err.lines.length, 1);
      assert.match(err.lines[0].text, /- \[x\] verify behavior/);
      return true;
    }
  );
});

// #391 — a consolidated `aitm-verified` carrying a record-of-run key (ts/sha)
// IS execution proof and validates the tick.
test('consolidated aitm-verified with ts/sha is accepted as proof (#391)', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 112,
    repo: 'fake/fake',
    mutate: (b) =>
      b.replace(
        '- [ ] verify behavior',
        '- [x] verify behavior <!-- aitm-verified cmd="`npm test`" sha="abc1234" ts="2026-06-12T00:00:00.000Z" -->'
      ),
    deps,
    // #522 — sanctioned-stamp simulation; bypass the proof-introduction guard.
    evidenceStamp: true,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /- \[x\] verify behavior/);
});

// #379 — the proof invariant accepts the NEW fully-quoted dod-evidence grammar
// (`aitm-dod-evidence key="..." ...`) as valid checkbox proof, mirroring the
// legacy colon form accepted above.
test('tick with same-line NEW fully-quoted aitm-dod-evidence marker is accepted (#379)', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 109,
    repo: 'fake/fake',
    mutate: (b) =>
      b.replace(
        '- [ ] verify behavior',
        '- [x] verify behavior <!-- aitm-dod-evidence key="tests" cmd="npm test" exit="0" sha="abc1234" ts="2026-06-10T00:00:00.000Z" -->'
      ),
    deps,
    // #522 — sanctioned-stamp simulation; bypass the proof-introduction guard.
    evidenceStamp: true,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /- \[x\] verify behavior/);
  assert.match(deps.getBody(), /aitm-dod-evidence key="tests"/);
});

// #379 — the proof invariant accepts the NEW fully-quoted ac-evidence grammar
// (covered transitively by the widened `parseAcEvidence`).
test('tick with same-line NEW fully-quoted aitm-ac-evidence marker is accepted (#379)', async () => {
  const deps = fakeDeps(BASE);
  const r = await mutateIssueBody({
    issueNumber: 110,
    repo: 'fake/fake',
    mutate: (b) =>
      b.replace(
        '- [ ] verify behavior',
        '- [x] verify behavior <!-- aitm-ac-evidence key="da1b55f9" cmd="npm test" exit="0" sha="abc1234" ts="2026-06-10T00:00:00.000Z" -->'
      ),
    deps,
    // #522 — sanctioned-stamp simulation; bypass the proof-introduction guard.
    evidenceStamp: true,
  });
  assert.equal(r.status, 'ok');
  assert.match(deps.getBody(), /- \[x\] verify behavior/);
  assert.match(deps.getBody(), /aitm-ac-evidence key="da1b55f9"/);
});

// A malformed/partial ac-evidence fragment (missing the execution fields the
// strict parser requires) is NOT proof — only the full canonical form qualifies.
test('partial aitm-ac-evidence fragment (no exec fields) is still rejected (#383 strictness)', async () => {
  const deps = fakeDeps(BASE);
  await assert.rejects(
    mutateIssueBody({
      issueNumber: 108,
      repo: 'fake/fake',
      mutate: (b) =>
        b.replace(
          '- [ ] verify behavior',
          '- [x] verify behavior <!-- aitm-ac-evidence:da1b55f9 -->'
        ),
      deps,
    }),
    (err) => {
      assert.ok(
        err instanceof CheckboxProofMissingError,
        `expected CheckboxProofMissingError, got ${err?.name}`
      );
      assert.equal(err.lines.length, 1);
      return true;
    }
  );
});
