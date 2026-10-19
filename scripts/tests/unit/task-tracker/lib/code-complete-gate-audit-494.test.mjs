// @story #494
// gateCodeComplete audit-lane branch (#494): an audit-kind issue swaps the
// commit-trail requirement for an `aitm-deliverable-posted` marker and lets an
// analytical AC be audited-waived. The code-kind path must be byte-for-byte
// unchanged — covered here by an explicit regression assertion (AC4).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// @story #1990
import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import {
  fixture as decompositionFixture,
  observed,
  freshUnitDir,
} from './decomposition-authority-fixtures.mjs';
import { currentUnitAuthority } from './decomposition-unit-admission-fixture.mjs';
import { developExitCodeCompleteGuard } from '../../../../task-tracker/lib/develop-exit-code-complete-guard.mjs';
import { gateCodeComplete } from '../../../../task-tracker/lib/code-complete-gate.mjs';

async function currentGate(input) {
  if (!input.cfg.projectId && !input.deps?.decomposition && /kind="audit"/.test(input.body)) {
    const f = await currentUnitAuthority({
      body: input.body,
      issue: Number(input.issueNumber),
      repository: input.cfg.repo,
    });
    return gateCodeComplete({
      ...input,
      body: f.body,
      cfg: f.cfg,
      deps: { ...input.deps, decomposition: { subject: f.subject, runtime: f.runtime } },
    });
  }
  return gateCodeComplete(input);
}

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

const MARKERS = (...markers) => `## AITM Progress Markers\n\n${markers.join('\n')}`;
const KIND = (kind) => `<!-- aitm-issue-kind kind="${kind}" -->`;
const DELIVERABLE = '<!-- aitm-deliverable-posted -->';
const AUDIT_MARKERS = MARKERS(KIND('audit'), DELIVERABLE);

test('audit + deliverable + waived ACs ⇒ ok, no trail fetch', async () => {
  const body = `${MARKERS(KIND('audit'), '<!-- aitm-deliverable-posted url="https://example/decision" -->')}

## Acceptance Criteria

- [x] Analysis recorded <!-- aitm-ac-waived by="audit" -->
- [x] Recommendation posted <!-- aitm-ac-waived by="audit" -->
`;
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, true, `blockers: ${r.blockers.join(' | ')}`);
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.shas, []);
});

test('audit + deliverable + a normally-verified AC ⇒ ok (verified-by still honored)', async () => {
  const body = `${AUDIT_MARKERS}

## Acceptance Criteria

- [x] Verified AC <!-- aitm-verified cmd="\`gh issue view 1\`" exit="0" sha="abc1234" ts="2026-06-22T00:00:00Z" -->
`;
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, true, `blockers: ${r.blockers.join(' | ')}`);
});

test('audit but MISSING deliverable ⇒ blocked on deliverable-missing', async () => {
  const body = `${MARKERS(KIND('audit'))}

## Acceptance Criteria

- [x] Analysis recorded <!-- aitm-ac-waived by="audit" -->
`;
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-deliverable-missing')),
    `expected deliverable-missing, got: ${r.blockers.join(' | ')}`
  );
});

test('audit: a ticked AC that is neither verified nor waived is still blocked', async () => {
  const body = `${AUDIT_MARKERS}

## Acceptance Criteria

- [x] Bare ticked AC with no evidence
`;
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-ac-unverified')),
    `expected ac-unverified, got: ${r.blockers.join(' | ')}`
  );
});

test('audit: a waived-but-UNTICKED AC is still blocked (waive ≠ tick)', async () => {
  const body = `${AUDIT_MARKERS}

## Acceptance Criteria

- [ ] Not done yet <!-- aitm-ac-waived by="audit" -->
`;
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
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
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: NO_TRAIL_DEPS });
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

test('#1990 epic-kind: reconciliation without current readiness authority cannot grant completion', async () => {
  // An epic is delivered by its children; it has no commits of its own. The
  // no-commit lane must accept it on posted-deliverable evidence alone.
  //
  // #887 added a SECOND epic-only requirement to this lane: the reconciliation
  // marker. The deliverable marker attests that the children shipped; the
  // reconciliation marker attests that the epic's own ACs were re-read against
  // what they actually shipped. Neither absorbs the other, so this case — the
  // fully-clean epic — now carries both.
  const body = `${MARKERS(
    KIND('epic'),
    '<!-- aitm-deliverable-posted note="children #496 #497 #498 #499 closed" -->',
    '<!-- aitm-epic-ac-reconciled ts="2026-07-19T12:00:00.000Z" -->'
  )}

## Acceptance Criteria

- [x] All sub-issues Done <!-- aitm-ac-waived by="epic-rollup" -->
- [x] Channel reachable end-to-end <!-- aitm-ac-waived by="epic-rollup" -->
`;
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, false, `blockers: ${r.blockers.join(' | ')}`);
  assert.ok(r.blockers.some((item) => item.startsWith('decomposition-authority-unavailable')));
  assert.deepEqual(r.shas, []);
});

test('#887 epic-kind: deliverable present but NOT reconciled ⇒ blocked', async () => {
  // The complement of the case above, pinned here rather than only in the #887
  // suite so a future reader of THIS file sees both epic-lane requirements
  // together and does not "restore" the old single-requirement shape.
  const body = `${MARKERS(
    KIND('epic'),
    '<!-- aitm-deliverable-posted note="children #496 #497 #498 #499 closed" -->'
  )}

## Acceptance Criteria

- [x] All sub-issues Done <!-- aitm-ac-waived by="epic-rollup" -->
`;
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-epic-unreconciled')),
    `expected epic-unreconciled, got: ${r.blockers.join(' | ')}`
  );
});

test('#500 epic-kind: MISSING deliverable ⇒ blocked on deliverable-missing', async () => {
  const body = `${MARKERS(KIND('epic'))}

## Acceptance Criteria

- [x] All sub-issues Done <!-- aitm-ac-waived by="epic-rollup" -->
`;
  const r = await currentGate({ cfg, issueNumber: 1, body, deps: THROW_DEPS });
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
  const r = await currentGate({
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

test('actual no-commit code-complete gate observes current oversized authority before accepting completion evidence', async () => {
  const f = decompositionFixture(25);
  f.body +=
    '\n<!-- aitm-issue-kind kind="audit" -->\n<!-- aitm-deliverable-posted url="https://example/decision" -->\n';
  const subject = { repository: 'o/r', issue: 1, projectId: 'PVT_a', projectItemId: 'PVTI_a' };
  f.deps.readIssue = async () => observed({ number: 1, body: f.body });
  f.deps.readBackIssue = f.deps.readIssue;
  const config = { repo: 'o/r', projectId: 'PVT_a' };
  const runtime = createDecompositionRuntime({
    cfg: config,
    projectDir: freshUnitDir('complete-current-'),
    deps: f.deps,
  });
  await runtime.refresh(subject);
  const result = await currentGate({
    cfg: config,
    issueNumber: 1,
    body: f.body,
    deps: { ...NO_TRAIL_DEPS, decomposition: { subject, runtime } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.startsWith('decomposition-required')));
});

test('actual Test guard does not let an accepted old Test projection bypass current no-commit restriction', async () => {
  const f = await currentUnitAuthority({
    body: MARKERS(KIND('audit'), DELIVERABLE) + '\n## Acceptance Criteria\n- [ ] Current scope.\n',
    issue: 1,
    hours: 25,
  });
  const sha = 'a'.repeat(40);
  const lifecycleEvidence = {
    sourceKind: 'github-records/v1',
    expectedSha: sha,
    acceptedRecordIds: ['R1'],
    authority: { contractEpoch: 'E1', coordinatorGrantId: 'G1', authorityEpoch: 1 },
    evidence: [
      {
        recordId: 'R1',
        evidenceKind: 'test',
        result: 'passed',
        provenance: 'agent',
        commitSha: sha,
        contractEpoch: 'E1',
        authority: { grantId: 'G1', epoch: 1 },
      },
    ],
  };
  const result = await developExitCodeCompleteGuard.run({
    toState: 'test',
    cfg: f.cfg,
    issueNumber: 1,
    body: f.body,
    lifecycleEvidence,
    deps: { codeComplete: { decomposition: { subject: f.subject, runtime: f.runtime } } },
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.refusals.some(
      (refusal) => refusal.code === 'decomposition-required' && refusal.args.issue === 1
    )
  );
});
