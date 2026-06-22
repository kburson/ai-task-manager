// @story #494
// gateCodeComplete audit-lane branch (#494): an audit-kind issue swaps the
// commit-trail requirement for an `aitm-deliverable-posted` marker and lets an
// analytical AC be audited-waived. The code-kind path must be byte-for-byte
// unchanged — covered here by an explicit regression assertion (AC4).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gateCodeComplete } from '../../lib/code-complete-gate.mjs';

const cfg = { repo: 'o/r' };

// Deps that, if reached, would supply a commit trail. The audit-lane assertions
// below also pass deps that THROW on listComments to prove the audit branch
// never touches the trail.
const NO_TRAIL_DEPS = {
  listComments: async () => [],
  filesForSha: async () => [],
  dirtyFiles: async () => new Set(),
};
const THROW_DEPS = {
  listComments: async () => {
    throw new Error('audit lane must not fetch the commit trail');
  },
  filesForSha: async () => {
    throw new Error('audit lane must not inspect SHAs');
  },
  dirtyFiles: async () => {
    throw new Error('audit lane must not check dirty files');
  },
};

const AUDIT_MARKER = '<!-- aitm-issue-kind kind="audit" -->';

test('audit + deliverable + waived ACs ⇒ ok, no trail fetch', async () => {
  const body = `${AUDIT_MARKER}
<!-- aitm-deliverable-posted url="https://example/decision" -->

## Acceptance Criteria

- [x] Analysis recorded <!-- aitm-ac-waived by="audit" -->
- [x] Recommendation posted <!-- aitm-ac-waived by="audit" -->
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, true, `blockers: ${r.blockers.join(' | ')}`);
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.shas, []);
});

test('audit + deliverable + a normally-verified AC ⇒ ok (verified-by still honored)', async () => {
  const body = `${AUDIT_MARKER}
<!-- aitm-deliverable-posted -->

## Acceptance Criteria

- [x] Verified AC <!-- aitm-verified cmd="\`gh issue view 1\`" exit="0" sha="abc1234" ts="2026-06-22T00:00:00Z" -->
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, true, `blockers: ${r.blockers.join(' | ')}`);
});

test('audit but MISSING deliverable ⇒ blocked on deliverable-missing', async () => {
  const body = `${AUDIT_MARKER}

## Acceptance Criteria

- [x] Analysis recorded <!-- aitm-ac-waived by="audit" -->
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-deliverable-missing')),
    `expected deliverable-missing, got: ${r.blockers.join(' | ')}`
  );
});

test('audit: a ticked AC that is neither verified nor waived is still blocked', async () => {
  const body = `${AUDIT_MARKER}
<!-- aitm-deliverable-posted -->

## Acceptance Criteria

- [x] Bare ticked AC with no evidence
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-ac-unverified')),
    `expected ac-unverified, got: ${r.blockers.join(' | ')}`
  );
});

test('audit: a waived-but-UNTICKED AC is still blocked (waive ≠ tick)', async () => {
  const body = `${AUDIT_MARKER}
<!-- aitm-deliverable-posted -->

## Acceptance Criteria

- [ ] Not done yet <!-- aitm-ac-waived by="audit" -->
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-ac-unticked')),
    `expected ac-unticked, got: ${r.blockers.join(' | ')}`
  );
});

test('AC4 REGRESSION: code-kind body with NO commit trail is still refused', async () => {
  // No issue-kind marker ⇒ code lane. A deliverable marker + waived AC must NOT
  // buy a pass: the commit-trail requirement and per-AC verified-by still bind.
  const body = `<!-- aitm-deliverable-posted -->

## Acceptance Criteria

- [x] Some AC <!-- aitm-ac-waived by="audit" -->
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: NO_TRAIL_DEPS });
  assert.equal(r.ok, false);
  // ac-waived is inert on the code lane → AC reads as unverified.
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-ac-unverified')),
    `expected ac-unverified on code lane, got: ${r.blockers.join(' | ')}`
  );
  // commit trail still required.
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-commits-missing')),
    `expected commits-missing on code lane, got: ${r.blockers.join(' | ')}`
  );
});

test('#500 epic-kind: deliverable + waived ACs ⇒ ok, no trail fetch', async () => {
  // An epic is delivered by its children; it has no commits of its own. The
  // no-commit lane must accept it on posted-deliverable evidence alone.
  const body = `<!-- aitm-issue-kind kind="epic" -->
<!-- aitm-deliverable-posted note="children #496 #497 #498 #499 closed" -->

## Acceptance Criteria

- [x] All sub-issues Done <!-- aitm-ac-waived by="epic-rollup" -->
- [x] Channel reachable end-to-end <!-- aitm-ac-waived by="epic-rollup" -->
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, true, `blockers: ${r.blockers.join(' | ')}`);
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.shas, []);
});

test('#500 epic-kind: MISSING deliverable ⇒ blocked on deliverable-missing', async () => {
  const body = `<!-- aitm-issue-kind kind="epic" -->

## Acceptance Criteria

- [x] All sub-issues Done <!-- aitm-ac-waived by="epic-rollup" -->
`;
  const r = await gateCodeComplete({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-deliverable-missing')),
    `expected deliverable-missing, got: ${r.blockers.join(' | ')}`
  );
});

test('code-kind regression: properly verified AC + valid trail still passes', async () => {
  const body = `## Acceptance Criteria

- [x] Verified AC <!-- aitm-verified cmd="\`npm test\`" exit="0" sha="abc1234" ts="2026-06-22T00:00:00Z" -->
`;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc1234 -->' }],
      filesForSha: async () => ['src/foo.js'],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, true, `blockers: ${r.blockers.join(' | ')}`);
});
