// @story #494
// End-to-end of the audit/research lane through the live guard registry (#494).
//
// Drives a no-commit, deliverable-only audit body through the REAL develop-exit
// and test-exit guard sets via `runGuards`, then through the close-side
// `uncheckedPreCloseCheckboxes`, asserting the lane reaches Done with no
// audit-lane refusal (AC2/AC6).
//
// Scope note: the cross-cutting `contiguity-entry` and `body-gates-entry` guards
// are intentionally NOT registered here — they gate stage-marker contiguity and
// structural body shape, which are orthogonal to the audit lane and covered by
// their own suites. Registering them would test those subsystems, not this lane.
// Every other develop/test exit guard the lane must pass IS registered, with
// injected deps neutralizing the orthogonal ones (parent admission, epic
// children, blockers).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import { GUARDS, registerGuard, runGuards } from '../../lib/guard-registry.mjs';
import { blockedByGuard } from '../../lib/blocked-by-guard.mjs';
import { developExitCodeCompleteGuard } from '../../lib/develop-exit-code-complete-guard.mjs';
import { developExitSandboxProofGuard } from '../../lib/develop-exit-sandbox-proof-guard.mjs';
import { developExitCommitTrailHeadGuard } from '../../lib/develop-exit-commit-trail-head-guard.mjs';
import { developExitEpicChildrenDoneGuard } from '../../lib/develop-epic-children-done-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../../lib/child-cannot-lead-epic-exit-guard.mjs';
import { testExitDodVerifiedGuard } from '../../lib/test-exit-dod-verified-guard.mjs';
import { testExitPreCloseCompletenessGuard } from '../../lib/test-exit-pre-close-completeness-guard.mjs';
import { uncheckedPreCloseCheckboxes } from '../../close-gate.mjs';

const cfg = { repo: 'o/r', projectId: 'PVT_test' };

// A no-commit audit issue: kind=audit, a posted deliverable, a sandbox/dod
// proof marker, and all ACs ticked + audited-waived. No `### 🔗 Commits` trail.
const AUDIT_BODY = `# EPIC-free audit issue

<!-- aitm-issue-kind kind="audit" -->
<!-- aitm-deliverable-posted url="https://example/decision-record" -->
<!-- aitm-dod-verified sha="abc1234" ts="2026-06-22T00:00:00Z" -->

## Acceptance Criteria

- [x] Findings documented <!-- aitm-ac-waived by="audit" -->
- [x] Recommendation recorded <!-- aitm-ac-waived by="audit" -->
`;

// Deps that prove the audit lane never touches the commit trail / SHAs, and
// that neutralize the orthogonal (parent / epic-children) guards.
const DEPS = {
  // child-cannot-lead-epic: solo issue (no parent).
  fetchParentIssue: async () => null,
  // epic-children-done: treat as a leaf that passes.
  developEpicTestChildrenGate: async () => ({ ok: true }),
  // code-complete: if the audit branch wrongly fetched the trail, these throw.
  codeComplete: {
    listComments: async () => {
      throw new Error('audit lane must not fetch the commit trail');
    },
    filesForSha: async () => {
      throw new Error('audit lane must not inspect SHAs');
    },
    dirtyFiles: async () => {
      throw new Error('audit lane must not check dirty files');
    },
  },
};

before(() => {
  // Register the real lane-relevant exit guards. registerGuard is idempotent.
  registerGuard('develop', 'exit', blockedByGuard);
  registerGuard('develop', 'exit', developExitCodeCompleteGuard);
  registerGuard('develop', 'exit', developExitSandboxProofGuard);
  registerGuard('develop', 'exit', developExitCommitTrailHeadGuard);
  registerGuard('develop', 'exit', developExitEpicChildrenDoneGuard);
  registerGuard('develop', 'exit', childCannotLeadEpicExitGuard);
  registerGuard('test', 'exit', blockedByGuard);
  registerGuard('test', 'exit', testExitDodVerifiedGuard);
  registerGuard('test', 'exit', testExitPreCloseCompletenessGuard);
  registerGuard('test', 'exit', childCannotLeadEpicExitGuard);
});

test('audit body clears develop→test with no audit-lane refusal', async () => {
  const r = await runGuards('develop', 'test', {
    fromState: 'develop',
    toState: 'test',
    cfg,
    issueNumber: 494,
    body: AUDIT_BODY,
    deps: DEPS,
  });
  assert.equal(r.ok, true, `unexpected refusals: ${JSON.stringify(r.refusals)}`);
});

test('audit body clears test→review with no audit-lane refusal', async () => {
  const r = await runGuards('test', 'review', {
    fromState: 'test',
    toState: 'review',
    cfg,
    issueNumber: 494,
    body: AUDIT_BODY,
    deps: DEPS,
  });
  assert.equal(r.ok, true, `unexpected refusals: ${JSON.stringify(r.refusals)}`);
});

test('audit body has no blocking pre-close checkboxes (clean path to Done)', () => {
  assert.deepEqual(uncheckedPreCloseCheckboxes(AUDIT_BODY), []);
});

test('contrast: a code-kind no-commit body IS refused at develop→test', async () => {
  // Same harness, code lane: drop the kind/deliverable/waive markers. The
  // code-complete + commit-trail guards must bite — proving the lane is the
  // only thing that relaxed the gate.
  const CODE_BODY = `# Code issue

<!-- aitm-dod-verified -->

## Acceptance Criteria

- [x] Some AC with no evidence
`;
  const r = await runGuards('develop', 'test', {
    fromState: 'develop',
    toState: 'test',
    cfg,
    issueNumber: 495,
    body: CODE_BODY,
    deps: {
      fetchParentIssue: async () => null,
      developEpicTestChildrenGate: async () => ({ ok: true }),
      codeComplete: {
        listComments: async () => [], // no trail
        filesForSha: async () => [],
        dirtyFiles: async () => new Set(),
      },
    },
  });
  assert.equal(r.ok, false);
  const allBlockers = r.refusals.flatMap((x) => x.blockers || [x.reason]);
  assert.ok(
    allBlockers.some((b) => b.startsWith('code-complete-')),
    `expected a code-complete-* refusal, got: ${allBlockers.join(' | ')}`
  );
});

// #500 — an epic body (no commits, delivered by children) travels the same
// no-commit lane and reaches Done with no lane refusal.
const EPIC_BODY = `# EPIC: coordination issue

<!-- aitm-issue-kind kind="epic" -->
<!-- aitm-deliverable-posted note="children #496 #497 #498 #499 closed" -->
<!-- aitm-dod-verified sha="abc1234" ts="2026-06-22T00:00:00Z" -->

## Acceptance Criteria

- [x] All sub-issues Done <!-- aitm-ac-waived by="epic-rollup" -->
- [x] Channel reachable end-to-end <!-- aitm-ac-waived by="epic-rollup" -->
`;

test('#500 epic body clears develop→test with no no-commit-lane refusal', async () => {
  const r = await runGuards('develop', 'test', {
    fromState: 'develop',
    toState: 'test',
    cfg,
    issueNumber: 500,
    body: EPIC_BODY,
    deps: DEPS,
  });
  assert.equal(r.ok, true, `unexpected refusals: ${JSON.stringify(r.refusals)}`);
});

test('#500 epic body clears test→review with no no-commit-lane refusal', async () => {
  const r = await runGuards('test', 'review', {
    fromState: 'test',
    toState: 'review',
    cfg,
    issueNumber: 500,
    body: EPIC_BODY,
    deps: DEPS,
  });
  assert.equal(r.ok, true, `unexpected refusals: ${JSON.stringify(r.refusals)}`);
});

// Guard against a future edit that drops a lane guard from the registry.
test('registry has the lane exit guards wired', () => {
  const devIds = GUARDS.develop.exit.map((g) => g.id);
  assert.ok(devIds.includes('develop-exit-code-complete'));
  assert.ok(devIds.includes('develop-exit-commit-trail-head'));
});
