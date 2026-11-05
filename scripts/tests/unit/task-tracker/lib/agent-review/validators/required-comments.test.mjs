// @story #811 #2153
// cspell:ignore digestless
// Tests for the V2 required-comments validator (#811).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validate,
  REQUIRED_COMMENTS,
} from '../../../../../../task-tracker/lib/agent-review/validators/required-comments.mjs';
import { buildPlanApprovalAuditComment } from '../../../../../../task-tracker/lib/plan-approval-audit.mjs';
import { buildPlanApprovedMarker } from '../../../../../../task-tracker/lib/markers.mjs';
import {
  createCurrentPlanApprovalEvidence,
  currentPlanApprovalDigest,
} from '../../../../../../task-tracker/lib/plan-approval-current-scope.mjs';
import { computeScopeIdentity } from '../../../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';

// One satisfying comment body per required row. Signals mirror the live
// #810 comment stream.
const SAMPLES = {
  'Timing Log': '⏱ Timing Log\n\n| Row | ... |',
  'Refine Estimate':
    '<!-- aitm-refined-estimate: 811 -->\n### 🛠 Refine estimate\n\n### Planned Estimate\n\n| Field | ... |',
  'Full-Auto plan-approval audit': buildPlanApprovalAuditComment({
    issueNumber: 811,
    ts: '2026-05-16T00:00:00Z',
  }),
  Commits: '### 🔗 Commits\n\n- abc1234 did a thing',
  'New Automated Tests': '## New Automated Tests\n\n- `foo.test.mjs`',
};

// Build a `comments` array (raw gh shape) covering every label except `omit`.
function commentsExcept(omit) {
  return REQUIRED_COMMENTS.filter((r) => r.label !== omit).map((r) => ({ body: SAMPLES[r.label] }));
}

const fullAutoAuditRow = REQUIRED_COMMENTS.find(
  (row) => row.label === 'Full-Auto plan-approval audit'
);

test('#1109 approval provenance conditions the Full-Auto audit row, default-deny', () => {
  assert.equal(
    fullAutoAuditRow.requiredFor(
      buildPlanApprovedMarker('2026-05-16T00:00:00Z', { mode: 'human' })
    ),
    false
  );
  assert.equal(
    fullAutoAuditRow.requiredFor(
      buildPlanApprovedMarker('2026-05-16T00:00:00Z', { mode: 'full-auto' })
    ),
    true
  );
  assert.equal(fullAutoAuditRow.requiredFor(buildPlanApprovedMarker('2026-05-16T00:00:00Z')), true);
  assert.equal(fullAutoAuditRow.requiredFor('no readable approval marker'), true);
});

test('#1109 human-approved plan passes without a false Full-Auto audit comment', () => {
  const res = validate({
    comments: commentsExcept('Full-Auto plan-approval audit'),
    issueNumber: 1109,
    body: buildPlanApprovedMarker('2026-05-16T00:00:00Z', { mode: 'human' }),
    changedPaths: ['scripts/task-tracker/verbs/plan-approve.mjs'],
  });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

for (const [label, body] of [
  ['full-auto', buildPlanApprovedMarker('2026-05-16T00:00:00Z', { mode: 'full-auto' })],
  ['unknown', buildPlanApprovedMarker('2026-05-16T00:00:00Z')],
]) {
  test(`#1109 ${label} plan still requires the canonical Full-Auto audit`, () => {
    const res = validate({
      comments: commentsExcept('Full-Auto plan-approval audit'),
      issueNumber: 1109,
      body,
      changedPaths: ['scripts/task-tracker/verbs/plan-approve.mjs'],
    });
    assert.equal(res.pass, false);
    assert.ok(
      res.failures.some((failure) => /Full-Auto plan-approval audit.*missing/i.test(failure)),
      JSON.stringify(res.failures)
    );
  });
}

test('passes when all five required comments are present', () => {
  const comments = REQUIRED_COMMENTS.map((r) => ({ body: SAMPLES[r.label] }));
  const res = validate({ comments });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('#1021 canonical generated plan-approval audit satisfies the required-comment contract', () => {
  const comments = REQUIRED_COMMENTS.map((row) => ({
    body:
      row.label === 'Full-Auto plan-approval audit'
        ? buildPlanApprovalAuditComment({
            issueNumber: 1021,
            ts: '2026-07-28T03:37:49Z',
          })
        : SAMPLES[row.label],
  }));
  const res = validate({ comments });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
});

for (const impostor of [
  '### Full-Auto Plan-Approval Audit',
  buildPlanApprovalAuditComment({
    issueNumber: 999,
    ts: '2026-07-28T03:37:49Z',
  }),
  '### Full-Auto Plan-Approval Audit — #1021\n\nNo human reviewer.',
]) {
  test('#1021 rejects a non-canonical or wrong-issue plan-approval audit', () => {
    const comments = REQUIRED_COMMENTS.map((row) => ({
      body: row.label === 'Full-Auto plan-approval audit' ? impostor : SAMPLES[row.label],
    }));
    const res = validate({
      comments,
      issueNumber: 1021,
      body: '<!-- aitm-plan-approved ts="2026-07-28T03:37:49Z" -->',
    });
    assert.equal(res.pass, false);
    assert.ok(
      res.failures.some((failure) => /Full-Auto plan-approval audit.*missing/i.test(failure)),
      JSON.stringify(res.failures)
    );
  });
}

// Table-driven: dropping any one required comment fails and names it.
for (const row of REQUIRED_COMMENTS) {
  test(`fails and names the missing '${row.label}' comment`, () => {
    const res = validate({ comments: commentsExcept(row.label) });
    assert.equal(res.pass, false);
    assert.ok(
      res.failures.some((f) => f.includes(row.label) && /missing/.test(f)),
      JSON.stringify(res.failures)
    );
  });
}

test('Refine Estimate marker WITHOUT a Planned Estimate block still fails', () => {
  const comments = REQUIRED_COMMENTS.map((r) => ({ body: SAMPLES[r.label] }));
  // Strip the Planned Estimate block from the refine-estimate comment.
  const idx = comments.findIndex((c) => /aitm-refined-estimate/.test(c.body));
  comments[idx] = {
    body: '<!-- aitm-refined-estimate: 811 -->\n### 🛠 Refine estimate\n\n(no plan)',
  };
  const res = validate({ comments });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Refine Estimate.*missing/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('empty / absent comments context fails and names all five', () => {
  for (const comments of [[], undefined, null, 'not-an-array']) {
    const res = validate({ comments });
    assert.equal(res.pass, false);
    assert.equal(res.failures.length, REQUIRED_COMMENTS.length);
  }
});

test('a comment with no body string is tolerated (treated as empty)', () => {
  const res = validate({ comments: [{ author: 'x' }, {}, { body: null }] });
  assert.equal(res.pass, false);
  assert.equal(res.failures.length, REQUIRED_COMMENTS.length);
});

// --- #835: kind-aware skipping of code-only rows -------------------------------
// The `Commits` and `New Automated Tests` rows are report comments only a
// code-kind deliverable produces. No-commit kinds (epic/audit/spike/research)
// never emit them, so V2 must skip those two rows for such bodies while still
// enforcing the three always-required rows.
const KIND_BODY = (kind, intro = `Some ${kind}.`) =>
  `${intro}\n\n## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="${kind}" -->\n`;
const EPIC_BODY = KIND_BODY('epic');
const ALWAYS_REQUIRED = ['Timing Log', 'Refine Estimate', 'Full-Auto plan-approval audit'];

test('#835 no-commit body: missing all five reports only the three always-required', () => {
  const res = validate({ comments: [], body: EPIC_BODY });
  assert.equal(res.pass, false);
  assert.equal(res.failures.length, ALWAYS_REQUIRED.length, JSON.stringify(res.failures));
  for (const label of ALWAYS_REQUIRED) {
    assert.ok(
      res.failures.some((f) => f.includes(label)),
      `always-required '${label}' not reported: ${JSON.stringify(res.failures)}`
    );
  }
  assert.ok(
    !res.failures.some((f) => /Commits|New Automated Tests/.test(f)),
    `code-only rows must not be reported for a no-commit body: ${JSON.stringify(res.failures)}`
  );
});

test('#835 code-kind body (no marker): missing all five still reports all five', () => {
  const res = validate({ comments: [], body: 'A plain code issue with no kind marker.' });
  assert.equal(res.pass, false);
  assert.equal(res.failures.length, REQUIRED_COMMENTS.length, JSON.stringify(res.failures));
});

test('#835 no-commit body missing one always-required still reports it', () => {
  const comments = ALWAYS_REQUIRED.filter((l) => l !== 'Timing Log').map((l) => ({
    body: SAMPLES[l],
  }));
  const res = validate({ comments, body: EPIC_BODY });
  assert.equal(res.pass, false);
  assert.deepEqual(
    res.failures.map((f) => f),
    ["required comment 'Timing Log' is missing"],
    JSON.stringify(res.failures)
  );
});

test('#835 no-commit body with all three always-required present passes', () => {
  const comments = ALWAYS_REQUIRED.map((l) => ({ body: SAMPLES[l] }));
  const res = validate({ comments, body: EPIC_BODY });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

// --- #923 + #940: docs-only is commit-bearing but testless --------------------
// A `docs-only` body KEEPS the `Commits` row (it commits real doc files) but
// SKIPS the `New Automated Tests` row — NOW ONLY when its diff is provably
// documentation-only (#940 "the kind declares, the diff decides"). #835's single
// `codeKindOnly` flag conflated the two rows; #923 split them; #940 made the NAT
// row diff-aware. These cases thread a docs-only changed-path set so the NAT row
// is skipped; the default-deny case (no diff → NAT required) is covered in
// nat-gate-diff-aware.test.mjs.
const DOCS_ONLY_BODY = KIND_BODY('docs-only', 'Some docs.');
const DOCS_ONLY_DIFF = ['docs/guide.md', 'README.md'];

test('#923/#940 docs-only body + docs-only diff: skips only New Automated Tests', () => {
  const res = validate({ comments: [], body: DOCS_ONLY_BODY, changedPaths: DOCS_ONLY_DIFF });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Commits/.test(f)),
    `docs-only must still require the Commits row: ${JSON.stringify(res.failures)}`
  );
  assert.ok(
    !res.failures.some((f) => /New Automated Tests/.test(f)),
    `docs-only + docs-only diff must skip the NAT row: ${JSON.stringify(res.failures)}`
  );
  assert.equal(res.failures.length, REQUIRED_COMMENTS.length - 1, JSON.stringify(res.failures));
});

test('#923/#940 docs-only body + docs-only diff + Commits + three always-required passes', () => {
  const comments = [...ALWAYS_REQUIRED, 'Commits'].map((l) => ({ body: SAMPLES[l] }));
  const res = validate({ comments, body: DOCS_ONLY_BODY, changedPaths: DOCS_ONLY_DIFF });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('#940 docs-only body + code-touching diff: NAT row is required', () => {
  const comments = [...ALWAYS_REQUIRED, 'Commits'].map((l) => ({ body: SAMPLES[l] }));
  const res = validate({
    comments,
    body: DOCS_ONLY_BODY,
    changedPaths: ['scripts/task-tracker/lib/foo.mjs'],
  });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /New Automated Tests/.test(f)),
    `docs-only + code diff must require the NAT row: ${JSON.stringify(res.failures)}`
  );
});

test('bootstrap registers the validator on the shared singleton', async () => {
  await import('../../../../../../task-tracker/lib/agent-review/bootstrap.mjs');
  const { registry } = await import('../../../../../../task-tracker/lib/agent-review/registry.mjs');
  assert.ok(
    registry.validators().some((v) => v.id === 'required-comments'),
    'required-comments not registered'
  );
});

// @story #2153
function currentAuditFixture() {
  const issueNumber = 2153,
    repo = 'o/r',
    acceptedSourceHead = 'e'.repeat(40),
    ts = '2026-11-05T07:00:00Z';
  const base =
    '## User Story\n\nAs a release operator\nI want to stop partial publication because checks fail\nSo that consumers receive complete releases\n\n## Scope\n\nStop partial publication.\n\n## Plan Metadata\n\n- Implementation-plan: plan.md\n\n## Acceptance Criteria\n\n- [ ] Reject incomplete publication.\n';
  const binding = {
    storyDigest: 'b'.repeat(64),
    storyIntentDigest: 'c'.repeat(64),
    storyIntentSource: 'linked-plan',
  };
  const currentEvidence = createCurrentPlanApprovalEvidence({
    repository: repo,
    issue: issueNumber,
    scopeIdentity: computeScopeIdentity({ repository: repo, issue: issueNumber, body: base }),
    sourceHead: acceptedSourceHead,
    trunkSha: 'f'.repeat(40),
    planPath: 'plan.md',
    planContentSha256: 'a'.repeat(64),
    storyBinding: binding,
    forecastRecordId: null,
    admission: {
      transitionId: 'move:bbec1b1c-b113-4ae3-8037-9db4ea1152b0',
      authorityCommentId: '1',
      commitCommentId: '2',
      historicalScopeIdentity: `sha256:${'4'.repeat(64)}`,
      authorityFingerprint: `sha256:${'5'.repeat(64)}`,
      commitFingerprint: `sha256:${'6'.repeat(64)}`,
    },
  });
  const marker = buildPlanApprovedMarker(ts, {
    ...binding,
    mode: 'full-auto',
    trunkSha: currentEvidence.trunkSha,
    currentApprovalDigest: currentPlanApprovalDigest(currentEvidence),
  });
  const audit = buildPlanApprovalAuditComment({ issueNumber, ts, currentEvidence });
  const withProgress = base + '\n## AITM Progress Markers\n';
  return {
    issueNumber,
    repo,
    acceptedSourceHead,
    ts,
    base: withProgress,
    marker,
    audit,
    currentEvidence,
    body: withProgress + '\n' + marker,
    comments: [...commentsExcept('Full-Auto plan-approval audit'), { body: audit }],
  };
}
test('#2153 matching current audit passes against selected source HEAD without live trunk equality', () => {
  const f = currentAuditFixture();
  assert.equal(validate(f).pass, true);
});
for (const [name, alter] of Object.entries({
  'ordinary audit with same timestamp': (f) => {
    f.comments.at(-1).body = buildPlanApprovalAuditComment({
      issueNumber: f.issueNumber,
      ts: f.ts,
    });
  },
  'waiver audit with same timestamp': (f) => {
    f.comments.at(-1).body = buildPlanApprovalAuditComment({
      issueNumber: f.issueNumber,
      ts: f.ts,
      repairEvidence: {
        approvalPlanRecordId: '01M2Y000000000000000000001',
        revokedRecordId: '01M2Y000000000000000000002',
      },
    });
  },
  'current audit for digestless marker': (f) => {
    f.body = f.base + '\n' + buildPlanApprovedMarker(f.ts, { mode: 'full-auto' });
  },
  'changed accepted HEAD': (f) => {
    f.acceptedSourceHead = 'd'.repeat(40);
  },
  'missing source context': (f) => {
    delete f.acceptedSourceHead;
  },
  'changed scope at same HEAD': (f) => {
    f.body = f.body.replace('Reject incomplete publication.', 'Publish every result.');
  },
  'changed plan path at same HEAD': (f) => {
    f.body = f.body.replace('Implementation-plan: plan.md', 'Implementation-plan: other.md');
  },
  'changed story binding': (f) => {
    f.body = f.body.replace('story-digest="' + 'b'.repeat(64), 'story-digest="' + 'a'.repeat(64));
  },
  'current marker relabeled human': (f) => {
    f.body = f.body.replace('mode="full-auto"', 'mode="human"');
  },
  'malformed current digest': (f) => {
    f.body = f.body.replace(/current-approval-digest="[^"]+"/, 'current-approval-digest="broken"');
  },
  'duplicate current audit': (f) => {
    f.comments.push({ body: f.audit });
  },
}))
  test(`#2153 current approval refuses ${name}`, () => {
    const f = currentAuditFixture();
    alter(f);
    assert.equal(validate(f).pass, false);
  });
