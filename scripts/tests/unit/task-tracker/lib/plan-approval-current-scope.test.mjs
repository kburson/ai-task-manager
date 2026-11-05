// @story #2153
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPlanApprovedMarker,
  parsePlanApprovedMarker,
} from '../../../../task-tracker/lib/markers.mjs';
import {
  renderPlanTransitionAuthorityComment,
  resolvePlanTransitionAuthority,
} from '../../../../task-tracker/lib/plan-transition-authority.mjs';
import { renderTransitionCommitComment } from '../../../../task-tracker/lib/move-state/transition-commit.mjs';
import { fingerprint } from '../../../../task-tracker/lib/resident-action-ledger-codec.mjs';
import {
  buildPlanApprovalAuditComment,
  isCanonicalPlanApprovalAuditComment,
} from '../../../../task-tracker/lib/plan-approval-audit.mjs';

const api = await import('../../../../task-tracker/lib/plan-approval-current-scope.mjs').catch(
  (error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return null;
  }
);
const repository = 'kburson/ai-task-manager';
const issue = 2147;
const transitionId = 'move:bbec1b1c-b113-4ae3-8037-9db4ea1152b0';
const historicalScopeIdentity = `sha256:${'4'.repeat(64)}`;
const visitMarker = `<!-- aitm-entered-develop ts="2026-11-04T01:51:59.359Z" move="${transitionId}" -->`;
const authority = resolvePlanTransitionAuthority({
  repository,
  issue,
  transitionId,
  scopeIdentity: historicalScopeIdentity,
  recordedAt: '2026-11-04T01:51:48.142Z',
  sessionPolicy: { gates: { analysisToDevelopment: false } },
});
const commit = {
  schema: 'aitm.transition-commit/v1',
  repository,
  issue,
  transitionId,
  source: 'plan',
  target: 'develop',
  visitMarker,
  actor: 'kpburson',
  sentinelFingerprint: `sha256:${'a'.repeat(64)}`,
};
function observation(id, body, createdAt) {
  return {
    id,
    body,
    createdAt,
    updatedAt: createdAt,
    author: { login: 'kburson' },
    authorAssociation: 'OWNER',
  };
}
function fixture() {
  return {
    repository,
    issue,
    body: [
      visitMarker,
      '<!-- aitm-move-complete state=review ts=2026-11-05T06:01:54.018Z move=move:97389e5b-c278-4371-aaaf-31b03b6f90f2 -->',
    ].join('\n'),
    comments: [
      observation(
        '6620373277',
        renderPlanTransitionAuthorityComment(authority),
        '2026-11-04T01:51:50Z'
      ),
      observation('6620377056', renderTransitionCommitComment(commit), '2026-11-04T01:52:06Z'),
    ],
  };
}
function evaluate(input) {
  assert.ok(api?.evaluateCurrentScopeAdmission, 'current-scope admission reader is implemented');
  return api.evaluateCurrentScopeAdmission(input);
}

test('current approval digest survives marker round-trip so audit retries bind original evidence', () => {
  const currentApprovalDigest = `sha256:${'b'.repeat(64)}`;
  const marker = buildPlanApprovedMarker('2026-11-05T07:00:00Z', {
    mode: 'full-auto',
    currentApprovalDigest,
  });
  assert.equal(parsePlanApprovedMarker(marker).currentApprovalDigest, currentApprovalDigest);
});
test('invalid current approval digest cannot be written', () => {
  assert.throws(
    () => buildPlanApprovedMarker('2026-11-05T07:00:00Z', { currentApprovalDigest: 'unbound' }),
    /currentApprovalDigest/
  );
});
test('immutable incident completion admits present approval after Review replaces singleton', () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const result = evaluate(input);
  assert.equal(result.status, 'available');
  assert.equal(result.admission.transitionId, transitionId);
  assert.equal(result.admission.authorityCommentId, '6620373277');
  assert.equal(result.admission.commitCommentId, '6620377056');
  assert.equal(result.admission.historicalScopeIdentity, historicalScopeIdentity);
  assert.equal(result.admission.authorityFingerprint, fingerprint(authority));
  assert.equal(JSON.stringify(input), before);
});
const refusals = {
  'missing completion': (x) => x.comments.pop(),
  'orphan authority': (x) => {
    x.body = 'unrelated';
  },
  'duplicate authority': (x) => x.comments.push({ ...x.comments[0], id: 'duplicate' }),
  'duplicate completion': (x) => x.comments.push({ ...x.comments[1], id: 'duplicate' }),
  'edited authority': (x) => {
    x.comments[0].updatedAt = '2026-11-04T01:51:51Z';
  },
  'edited completion': (x) => {
    x.comments[1].updatedAt = '2026-11-04T01:52:07Z';
  },
  'untrusted author': (x) => {
    x.comments[0].authorAssociation = 'NONE';
  },
  'mismatched authors': (x) => {
    x.comments[1].author.login = 'different';
  },
  'missing comment ID': (x) => {
    delete x.comments[1].id;
  },
  'missing provenance': (x) => {
    delete x.comments[0].createdAt;
  },
  'wrong issue': (x) => {
    x.issue = 2153;
  },
  'wrong repository': (x) => {
    x.repository = 'other/repo';
  },
  'future authority': (x) => {
    x.comments[0].createdAt = x.comments[0].updatedAt = '2026-11-04T01:52:00Z';
  },
  'completion before entry second': (x) => {
    x.comments[1].createdAt = x.comments[1].updatedAt = '2026-11-04T01:51:58Z';
  },
  'duplicate historical entry': (x) => {
    x.body += '\n' + visitMarker;
  },
  'malformed authority collision': (x) => {
    x.comments.push(
      observation(
        'bad',
        `<!-- aitm-plan-transition-authority id="${transitionId}" data="bad" -->`,
        '2026-11-04T01:51:50Z'
      )
    );
  },
  'malformed completion collision': (x) => {
    x.comments.push(
      observation(
        'bad',
        `<!-- aitm-transition-commit id="${transitionId}" data="bad" -->`,
        '2026-11-04T01:52:06Z'
      )
    );
  },
  'commit mismatched exact visit bytes': (x) => {
    x.comments[1].body = renderTransitionCommitComment({
      ...commit,
      visitMarker: visitMarker.replace('.359Z', '.360Z'),
    });
  },
  'waiver is not a policy exemption': (x) => {
    x.comments[0].body = renderPlanTransitionAuthorityComment({
      ...authority,
      outcome: 'satisfied',
      evidence: {
        kind: 'plan-approved-marker',
        markerFingerprint: `sha256:${'c'.repeat(64)}`,
        mode: 'full-auto',
        trunkSha: null,
        ts: '2026-11-04T01:51:48Z',
      },
    });
  },
};
for (const [name, alter] of Object.entries(refusals))
  test(`admission refuses ${name}`, () => {
    const input = fixture();
    alter(input);
    assert.equal(evaluate(input).status, 'unavailable');
  });
test('same-second GitHub precision does not reject a later completion', () => {
  const input = fixture();
  input.comments[1].createdAt = input.comments[1].updatedAt = '2026-11-04T01:51:59Z';
  assert.equal(evaluate(input).status, 'available');
});
test('later Develop visit retains admission from the original immutable completion', () => {
  const input = fixture();
  input.body +=
    '\n<!-- aitm-entered-develop-2 ts="2026-11-05T07:00:00Z" move="move:22222222-2222-4222-8222-222222222222" -->';
  assert.equal(evaluate(input).status, 'available');
});

function evidenceInput() {
  return {
    repository,
    issue,
    scopeIdentity: `sha256:${'d'.repeat(64)}`,
    sourceHead: 'e'.repeat(40),
    trunkSha: 'f'.repeat(40),
    planPath: 'docs/superpowers/plans/current.md',
    planContentSha256: 'a'.repeat(64),
    storyBinding: {
      storyDigest: 'b'.repeat(64),
      storyIntentDigest: 'c'.repeat(64),
      storyIntentSource: 'linked-plan',
    },
    forecastRecordId: null,
    admission: evaluate(fixture()).admission,
  };
}
test('closed current evidence binds current scope independently from historical exemption', () => {
  const input = evidenceInput();
  const record = api.createCurrentPlanApprovalEvidence(input);
  assert.equal(record.schema, 'aitm.current-plan-approval/v1');
  assert.equal(record.scopeIdentity, input.scopeIdentity);
  assert.notEqual(record.scopeIdentity, record.admission.historicalScopeIdentity);
  assert.ok(Object.isFrozen(record));
  const digest = api.currentPlanApprovalDigest(record);
  for (const delta of [
    { scopeIdentity: `sha256:${'e'.repeat(64)}` },
    { sourceHead: 'a'.repeat(40) },
    { trunkSha: 'b'.repeat(40) },
    { planContentSha256: 'c'.repeat(64) },
  ])
    assert.notEqual(
      api.currentPlanApprovalDigest(api.createCurrentPlanApprovalEvidence({ ...input, ...delta })),
      digest
    );
});
for (const [name, delta] of Object.entries({
  head: { sourceHead: 'short' },
  scope: { scopeIdentity: 'unbound' },
  plan: { planPath: '../outside.md' },
  digest: { planContentSha256: 'short' },
  forecast: { forecastRecordId: 'not-a-record' },
  extra: { unsealed: true },
}))
  test(`current evidence refuses invalid ${name}`, () => {
    const input = evidenceInput();
    assert.throws(
      () => api.createCurrentPlanApprovalEvidence({ ...input, ...delta }),
      /current-plan-approval/
    );
  });
for (const [name, alter] of Object.entries({
  'unclosed authority collision': (x) =>
    x.comments.push(
      observation(
        'bad',
        `<!-- aitm-plan-transition-authority id="${transitionId}" data="bad"`,
        '2026-11-04T01:51:50Z'
      )
    ),
  'nested authority collision': (x) => {
    x.comments[0].body =
      `<!-- aitm-plan-transition-authority id="${transitionId}" broken ` + x.comments[0].body;
  },
  'unclosed completion collision': (x) =>
    x.comments.push(
      observation(
        'bad',
        `<!-- aitm-transition-commit id="${transitionId}" data="bad"`,
        '2026-11-04T01:52:06Z'
      )
    ),
  'malformed matching Develop entry': (x) => {
    x.body += `\n<!-- aitm-entered-develop-2 move="${transitionId}" -->`;
  },
  'unknown completion fields': (x) => {
    x.comments[1].body = renderTransitionCommitComment({ ...commit, unsealed: true });
  },
}))
  test(`admission refuses ${name}`, () => {
    const input = fixture();
    alter(input);
    assert.equal(evaluate(input).status, 'unavailable');
  });

const approvalTs = '2026-11-05T07:00:00Z';
test('ordinary audit cannot attest a current-evidence approval at the same timestamp', () => {
  const currentEvidence = api.createCurrentPlanApprovalEvidence(evidenceInput());
  const ordinary = buildPlanApprovalAuditComment({ issueNumber: issue, ts: approvalTs });
  assert.equal(
    isCanonicalPlanApprovalAuditComment(ordinary, {
      issueNumber: issue,
      ts: approvalTs,
      currentEvidence,
    }),
    false
  );
});
test('current audit validates its exact current evidence and rejects substituted source', () => {
  const currentEvidence = api.createCurrentPlanApprovalEvidence(evidenceInput());
  const comment = buildPlanApprovalAuditComment({
    issueNumber: issue,
    ts: approvalTs,
    currentEvidence,
  });
  assert.equal(
    isCanonicalPlanApprovalAuditComment(comment, {
      issueNumber: issue,
      ts: approvalTs,
      currentEvidence,
    }),
    true
  );
  const different = api.createCurrentPlanApprovalEvidence({
    ...evidenceInput(),
    sourceHead: 'a'.repeat(40),
  });
  assert.equal(
    isCanonicalPlanApprovalAuditComment(comment, {
      issueNumber: issue,
      ts: approvalTs,
      currentEvidence: different,
    }),
    false
  );
  assert.notEqual(comment, buildPlanApprovalAuditComment({ issueNumber: issue, ts: approvalTs }));
});
test('current audit rejects mixed waiver evidence and wrong issue', () => {
  const currentEvidence = api.createCurrentPlanApprovalEvidence(evidenceInput());
  assert.throws(
    () =>
      buildPlanApprovalAuditComment({
        issueNumber: issue,
        ts: approvalTs,
        currentEvidence,
        repairEvidence: {},
      }),
    /current|exclusive/
  );
  assert.throws(
    () => buildPlanApprovalAuditComment({ issueNumber: 2153, ts: approvalTs, currentEvidence }),
    /issue/
  );
});

for (const [name, alter] of Object.entries({
  'array scope': (x) => {
    x.scopeIdentity = [x.scopeIdentity];
  },
  'array head': (x) => {
    x.sourceHead = [x.sourceHead];
  },
  'non-string comment ID': (x) => {
    x.admission = { ...x.admission, authorityCommentId: { id: 'untrusted' } };
  },
}))
  test(`closed current evidence rejects ${name}`, () => {
    const input = evidenceInput();
    alter(input);
    assert.throws(() => api.createCurrentPlanApprovalEvidence(input), /current-plan-approval/);
  });
test('array current approval digest cannot be serialized as a valid marker', () => {
  assert.throws(
    () =>
      buildPlanApprovedMarker(approvalTs, { currentApprovalDigest: [`sha256:${'a'.repeat(64)}`] }),
    /currentApprovalDigest/
  );
});
