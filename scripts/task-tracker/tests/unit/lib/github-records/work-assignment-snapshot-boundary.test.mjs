// @story #1077
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  replaceCoordinator,
  resolveCoordinatorAuthority,
} from '../../../../lib/github-records/coordination-authority.mjs';
import { createAitmRecordEnvelope } from '../../../../lib/github-records/record-envelope.mjs';
import {
  acceptSubmission,
  adoptOutstandingSubmissions,
} from '../../../../lib/github-records/work-assignment.mjs';

const repository = 'kburson/ai-task-manager';
const parentIssue = 1067;
const issue = 1077;
const siblingIssue = 1078;
const branch = 'feature/child/1077';
const siblingBranch = 'feature/child/1078';
const coordinator = { actor: 'claude/coordinator', platform: 'claude', session: 'boundary' };
const replacementCoordinator = {
  actor: 'codex/replacement',
  platform: 'codex',
  session: 'boundary',
};
const worker = { actor: 'codex/worker', platform: 'codex', session: 'boundary' };

function id(number) {
  return `01J0000000000000000005${String(number).padStart(4, '0')}`;
}

function grant({
  grantId = id(9001),
  epoch = 1,
  grantCoordinator = coordinator,
  issuer = null,
  scope = { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
  branches = [branch],
} = {}) {
  return {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope,
    coordinator: grantCoordinator,
    parentGrantId: null,
    issuer,
    epoch,
    operations: ['assign-work', 'dispose-submission', 'adopt-submissions'],
    branchBoundary: branches,
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
    activatedAt: '2026-08-03T20:00:00.000Z',
    expiresAt: null,
  };
}

function record(
  { recordId, recordType, payload, actor, epoch, grantId, supersedes = null },
  predecessor = null
) {
  return Object.freeze({
    commentNodeId: `IC_kwDOBoundary${recordId.slice(-4)}`,
    envelope: createAitmRecordEnvelope({
      recordId,
      recordType,
      repository,
      issue,
      payload,
      actor,
      epoch,
      grantId,
      predecessor,
      supersedes,
      createdAt: '2026-08-03T20:05:00.000Z',
    }),
  });
}

function assignmentSpec(recordId = id(10), payload = {}, supersedes = null) {
  return {
    recordId,
    recordType: 'work-assignment',
    payload: {
      schema: 'aitm.work-assignment/v1',
      issue,
      branch,
      files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
      subsystem: 'github-records',
      dependency: {
        baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172',
        recordIds: [],
      },
      verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
      worker,
      coordinator,
      grantId: id(9001),
      epoch: 1,
      ...payload,
    },
    actor: coordinator.actor,
    epoch: 1,
    grantId: id(9001),
    supersedes,
  };
}

function submissionSpec({
  recordId = id(20),
  assignmentRecordId = id(10),
  payload = {},
  grantId = id(9001),
  supersedes = null,
} = {}) {
  return {
    recordId,
    recordType: 'execution-result',
    payload: {
      ...orphanSubmissionSpec(recordId).payload,
      assignmentRecordId,
      result: { summary: 'gap submission' },
      ...payload,
    },
    actor: worker.actor,
    epoch: 1,
    grantId,
    supersedes,
  };
}

function dispositionSpec({
  recordId = id(30),
  assignmentRecordId = id(10),
  submissionRecordId = id(20),
  replacement = true,
  supersedes = null,
} = {}) {
  const dispositionCoordinator = replacement ? replacementCoordinator : coordinator;
  return {
    recordId,
    recordType: 'record-disposition',
    payload: {
      schema: 'aitm.record-disposition/v1',
      decision: 'accepted',
      issue,
      assignmentRecordId,
      assignmentCommentNodeId: `IC_kwDOBoundary${assignmentRecordId.slice(-4)}`,
      submissionRecordId,
      submissionCommentNodeId: `IC_kwDOBoundary${submissionRecordId.slice(-4)}`,
      grantId: replacement ? id(9002) : id(9001),
      epoch: replacement ? 2 : 1,
      decidedBy: dispositionCoordinator,
      reason: null,
    },
    actor: dispositionCoordinator.actor,
    epoch: replacement ? 2 : 1,
    grantId: replacement ? id(9002) : id(9001),
    supersedes,
  };
}

function resolve(records, projection) {
  return resolveCoordinatorAuthority({
    issueHierarchy: [
      { issue: parentIssue, parentIssue: null },
      { issue, parentIssue },
      { issue: siblingIssue, parentIssue },
    ],
    records,
    repository,
    issue,
    coordinationProjection: projection,
    now: '2026-08-03T20:06:00.000Z',
  });
}

function orphanSubmissionSpec(recordId = id(42)) {
  return {
    recordId,
    recordType: 'execution-result',
    payload: {
      schema: 'aitm.worker-submission/v1',
      status: 'submitted',
      assignmentRecordId: id(70),
      issue,
      branch,
      files: ['scripts/task-tracker/lib/github-records/work-assignment.mjs'],
      subsystem: 'github-records',
      dependency: {
        baselineSha: 'c2ae3db785468fb496f2be1f54aca144e636b172',
        recordIds: [],
      },
      verification: { contractEpoch: 1, verifierIds: ['vc-6'] },
      worker,
      result: { summary: 'unrelated submission' },
    },
    actor: worker.actor,
    epoch: 1,
    grantId: id(9001),
  };
}

function zeroOutstandingHistory({ preBoundaryOrphanSubmission = false } = {}) {
  const originalGrant = grant();
  const root = record({
    recordId: id(1),
    recordType: 'coordinator-grant',
    payload: originalGrant,
    actor: coordinator.actor,
    epoch: 1,
    grantId: id(8000),
  });
  const active = resolve([root], {
    schema: 'aitm.coordination-projection/v1',
    grantId: originalGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  const replacementGrant = grant({
    grantId: id(9002),
    epoch: 2,
    grantCoordinator: replacementCoordinator,
    issuer: coordinator,
  });
  const replacement = replaceCoordinator({
    authority: active,
    expectedGrantId: originalGrant.grantId,
    expectedEpoch: 1,
    replacementGrant,
  });
  const orphanSubmission = preBoundaryOrphanSubmission
    ? record(orphanSubmissionSpec(), root.envelope.recordId)
    : null;
  const revocation = record(
    {
      recordId: id(40),
      recordType: 'coordinator-revocation',
      payload: replacement.revocation,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    (orphanSubmission ?? root).envelope.recordId
  );
  const replacementRecord = record(
    {
      recordId: id(41),
      recordType: 'coordinator-grant',
      payload: replacementGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    revocation.envelope.recordId
  );
  return {
    records: [
      root,
      ...(orphanSubmission === null ? [] : [orphanSubmission]),
      revocation,
      replacementRecord,
    ],
    replacement,
    replacementRecord,
  };
}

function adopt(authority, records, expectedHeadRecordId) {
  return adoptOutstandingSubmissions({
    authority,
    snapshot: { repository, issue, expectedHeadRecordId, records },
  });
}

function gapHistory({ beforeRevocation = [], gap = [], afterReplacement = [] }) {
  const current = zeroOutstandingHistory();
  const [root, revocationTemplate, replacementTemplate] = current.records;
  const records = [root];
  for (const spec of beforeRevocation) {
    records.push(record(spec, records.at(-1).envelope.recordId));
  }
  const revocation = record(
    {
      recordId: revocationTemplate.envelope.recordId,
      recordType: revocationTemplate.envelope.recordType,
      payload: revocationTemplate.envelope.payload,
      actor: revocationTemplate.envelope.authority.actor,
      epoch: revocationTemplate.envelope.authority.epoch,
      grantId: revocationTemplate.envelope.authority.grantId,
    },
    records.at(-1).envelope.recordId
  );
  records.push(revocation);
  for (const spec of gap) records.push(record(spec, records.at(-1).envelope.recordId));
  const replacementRecord = record(
    {
      recordId: replacementTemplate.envelope.recordId,
      recordType: replacementTemplate.envelope.recordType,
      payload: replacementTemplate.envelope.payload,
      actor: replacementTemplate.envelope.authority.actor,
      epoch: replacementTemplate.envelope.authority.epoch,
      grantId: replacementTemplate.envelope.authority.grantId,
    },
    records.at(-1).envelope.recordId
  );
  records.push(replacementRecord);
  for (const spec of afterReplacement) {
    records.push(record(spec, records.at(-1).envelope.recordId));
  }
  return { ...current, records };
}

function assertGapResult(current, expected) {
  for (const records of [current.records, [...current.records].reverse()]) {
    const paused = resolve(records, current.replacement.coordinationProjection);
    assert.deepEqual(adopt(paused, records, current.records.at(-1).envelope.recordId), expected);
  }
}

function dispositionBoundaryHistory({
  authorBranches,
  authorScope = { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
  historical,
  targetBranch = branch,
}) {
  const originalScope =
    authorScope.scopeRootIssue === issue
      ? { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] }
      : {
          scopeRootIssue: parentIssue,
          includedIssues: [issue, siblingIssue],
          excludedIssues: [],
        };
  const originalBranches = [
    ...new Set(
      [targetBranch, siblingBranch, ...authorBranches].map((candidate) =>
        candidate.startsWith('refs/heads/') ? candidate.slice('refs/heads/'.length) : candidate
      )
    ),
  ];
  const originalGrant = grant({ scope: originalScope, branches: originalBranches });
  const root = record({
    recordId: id(101),
    recordType: 'coordinator-grant',
    payload: originalGrant,
    actor: coordinator.actor,
    epoch: 1,
    grantId: id(8000),
  });
  const active = resolve([root], {
    schema: 'aitm.coordination-projection/v1',
    grantId: originalGrant.grantId,
    epoch: 1,
    adoptionState: 'adopted',
  });
  assert.equal(active.status, 'active');
  const assignment = record(
    assignmentSpec(id(110), { branch: targetBranch }),
    root.envelope.recordId
  );
  const submission = record(
    submissionSpec({
      recordId: id(120),
      assignmentRecordId: assignment.envelope.recordId,
      payload: { branch: targetBranch },
    }),
    assignment.envelope.recordId
  );
  const authorGrant = grant({
    grantId: id(9002),
    epoch: 2,
    grantCoordinator: replacementCoordinator,
    issuer: coordinator,
    scope: authorScope,
    branches: authorBranches,
  });
  const firstReplacement = replaceCoordinator({
    authority: active,
    expectedGrantId: originalGrant.grantId,
    expectedEpoch: 1,
    replacementGrant: authorGrant,
  });
  const revocation = record(
    {
      recordId: id(140),
      recordType: 'coordinator-revocation',
      payload: firstReplacement.revocation,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    submission.envelope.recordId
  );
  const authorGrantRecord = record(
    {
      recordId: id(141),
      recordType: 'coordinator-grant',
      payload: authorGrant,
      actor: coordinator.actor,
      epoch: 1,
      grantId: id(8000),
    },
    revocation.envelope.recordId
  );
  const disposition = record(
    {
      ...dispositionSpec({
        recordId: id(150),
        assignmentRecordId: assignment.envelope.recordId,
        submissionRecordId: submission.envelope.recordId,
      }),
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: authorGrant.grantId,
    },
    authorGrantRecord.envelope.recordId
  );
  if (!historical) {
    const preDispositionRecords = [root, assignment, submission, revocation, authorGrantRecord];
    const records = [root, assignment, submission, revocation, authorGrantRecord, disposition];
    return {
      assignment,
      disposition,
      expectedHeadRecordId: disposition.envelope.recordId,
      projection: firstReplacement.coordinationProjection,
      preDispositionRecords,
      records,
      submission,
    };
  }
  const authorAuthority = resolve(
    [root, assignment, submission, revocation, authorGrantRecord, disposition],
    { ...firstReplacement.coordinationProjection, adoptionState: 'adopted' }
  );
  assert.equal(authorAuthority.status, 'active');
  const currentGrant = grant({
    grantId: id(9003),
    epoch: 3,
    grantCoordinator: { ...replacementCoordinator, session: 'boundary-epoch-3' },
    issuer: replacementCoordinator,
    scope: authorScope,
    branches: authorBranches,
  });
  const secondReplacement = replaceCoordinator({
    authority: authorAuthority,
    expectedGrantId: authorGrant.grantId,
    expectedEpoch: 2,
    replacementGrant: currentGrant,
  });
  const secondRevocation = record(
    {
      recordId: id(160),
      recordType: 'coordinator-revocation',
      payload: secondReplacement.revocation,
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(8000),
    },
    disposition.envelope.recordId
  );
  const currentGrantRecord = record(
    {
      recordId: id(161),
      recordType: 'coordinator-grant',
      payload: currentGrant,
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(8000),
    },
    secondRevocation.envelope.recordId
  );
  const records = [
    root,
    assignment,
    submission,
    revocation,
    authorGrantRecord,
    disposition,
    secondRevocation,
    currentGrantRecord,
  ];
  return {
    assignment,
    disposition,
    expectedHeadRecordId: currentGrantRecord.envelope.recordId,
    projection: secondReplacement.coordinationProjection,
    records,
    submission,
  };
}

const dispositionBranchCases = [
  { name: 'exact branch', authorBranches: [branch], ready: true },
  { name: 'normalized refs/heads branch', authorBranches: [`refs/heads/${branch}`], ready: true },
  { name: 'sibling branch', authorBranches: [siblingBranch], ready: false },
  { name: 'branch prefix escape', authorBranches: [`${branch}/escape`], ready: false },
];

for (const historical of [false, true]) {
  for (const branchCase of dispositionBranchCases) {
    if (historical && branchCase.ready) continue;
    test(`${historical ? 'historical' : 'replacement'} disposition requires ${branchCase.name}`, () => {
      const current = dispositionBoundaryHistory({
        authorBranches: branchCase.authorBranches,
        historical,
      });
      for (const records of [current.records, [...current.records].reverse()]) {
        const paused = resolve(records, current.projection);
        const adopted = adopt(paused, records, current.expectedHeadRecordId);
        if (!historical) {
          const candidateAuthority = resolve(current.preDispositionRecords, current.projection);
          const direct = () =>
            acceptSubmission({
              authority: candidateAuthority,
              assignment: current.assignment,
              submission: current.submission,
            });
          if (branchCase.ready) assert.equal(direct().payload.decision, 'accepted');
          else assert.throws(direct, /work-assignment:authority/);
        }
        if (branchCase.ready) {
          assert.equal(adopted.status, 'ready-to-adopt', JSON.stringify(adopted));
          assert.deepEqual(adopted.acceptedSubmissionRecordIds, [
            current.submission.envelope.recordId,
          ]);
        } else {
          assert.equal(adopted.status, 'blocked');
        }
      }
    });
  }
}

test('a predecessor historical disposition on its exact branch remains terminal', () => {
  const current = gapHistory({
    beforeRevocation: [assignmentSpec(), submissionSpec(), dispositionSpec({ replacement: false })],
  });
  assertGapResult(current, {
    status: 'ready-to-adopt',
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: id(9002),
      epoch: 2,
      adoptionState: 'adopted',
    },
    acceptedSubmissionRecordIds: [],
    rejectedSubmissionRecordIds: [],
  });
});

for (const issueCase of [
  {
    name: 'narrowed sibling issue scope',
    scope: { scopeRootIssue: siblingIssue, includedIssues: [], excludedIssues: [] },
  },
  {
    name: 'explicitly excluded target issue',
    scope: {
      scopeRootIssue: parentIssue,
      includedIssues: [issue, siblingIssue],
      excludedIssues: [issue],
    },
  },
]) {
  test(`${issueCase.name} is blocked before disposition replay`, () => {
    const current = dispositionBoundaryHistory({
      authorBranches: [branch],
      authorScope: issueCase.scope,
      historical: false,
    });
    for (const records of [current.records, [...current.records].reverse()]) {
      const paused = resolve(records, current.projection);
      assert.deepEqual(adopt(paused, records, current.expectedHeadRecordId), {
        status: 'blocked',
        diagnostic: { reason: 'authority' },
      });
    }
  });
}

test('a lifecycle capsule appended after the paused head blocks adoption before publication', () => {
  const current = zeroOutstandingHistory();
  const lifecycle = record(
    {
      recordId: id(42),
      recordType: 'lifecycle-transition',
      payload: { kind: 'lifecycle-transition', result: 'must not extend adoption authority' },
      actor: replacementCoordinator.actor,
      epoch: 2,
      grantId: id(9002),
    },
    current.replacementRecord.envelope.recordId
  );
  const records = [...current.records, lifecycle];
  for (const inputRecords of [records, [...records].reverse()]) {
    assert.equal(
      resolve(inputRecords, {
        ...current.replacement.coordinationProjection,
        adoptionState: 'adopted',
      }).status,
      'active'
    );
    const paused = resolve(inputRecords, current.replacement.coordinationProjection);
    assert.deepEqual(adopt(paused, inputRecords, lifecycle.envelope.recordId), {
      status: 'blocked',
      diagnostic: { reason: 'authority' },
    });
  }
});

test('a pre-boundary orphan submission is ignored by replay and adoption', () => {
  const current = zeroOutstandingHistory({ preBoundaryOrphanSubmission: true });
  const records = current.records;
  for (const inputRecords of [records, [...records].reverse()]) {
    assert.equal(
      resolve(inputRecords, {
        ...current.replacement.coordinationProjection,
        adoptionState: 'adopted',
      }).status,
      'active'
    );
    const paused = resolve(inputRecords, current.replacement.coordinationProjection);
    assert.deepEqual(adopt(paused, inputRecords, current.replacementRecord.envelope.recordId), {
      status: 'ready-to-adopt',
      coordinationProjection: {
        ...current.replacement.coordinationProjection,
        adoptionState: 'adopted',
      },
      acceptedSubmissionRecordIds: [],
      rejectedSubmissionRecordIds: [],
    });
  }
});

test('post-boundary orphan submissions and dispositions block adoption before publication', () => {
  for (const kind of ['submission', 'disposition']) {
    const current = zeroOutstandingHistory();
    const extension =
      kind === 'submission'
        ? record(orphanSubmissionSpec(), current.replacementRecord.envelope.recordId)
        : record(
            {
              recordId: id(42),
              recordType: 'record-disposition',
              payload: {
                schema: 'aitm.record-disposition/v1',
                decision: 'rejected',
                issue,
                assignmentRecordId: id(70),
                assignmentCommentNodeId: 'IC_unknown_assignment',
                submissionRecordId: id(71),
                submissionCommentNodeId: 'IC_unknown_submission',
                grantId: id(9002),
                epoch: 2,
                decidedBy: replacementCoordinator,
                reason: 'unknown post-boundary target',
              },
              actor: replacementCoordinator.actor,
              epoch: 2,
              grantId: id(9002),
            },
            current.replacementRecord.envelope.recordId
          );
    const records = [...current.records, extension];
    for (const inputRecords of [records, [...records].reverse()]) {
      assert.equal(
        resolve(inputRecords, {
          ...current.replacement.coordinationProjection,
          adoptionState: 'adopted',
        }).status,
        'active',
        kind
      );
      const paused = resolve(inputRecords, current.replacement.coordinationProjection);
      assert.equal(
        adopt(paused, inputRecords, extension.envelope.recordId).status,
        'blocked',
        kind
      );
    }
  }
});

test('the revocation gap rejects malformed and well-formed assignments', () => {
  const malformed = assignmentSpec(id(11));
  delete malformed.payload.grantId;
  for (const spec of [assignmentSpec(), malformed]) {
    assertGapResult(gapHistory({ gap: [spec] }), {
      status: 'blocked',
      diagnostic: { reason: 'authority' },
    });
  }
});

test('the revocation gap admits only a valid eligible worker submission', () => {
  const current = gapHistory({
    beforeRevocation: [assignmentSpec()],
    gap: [submissionSpec()],
    afterReplacement: [dispositionSpec()],
  });
  assertGapResult(current, {
    status: 'ready-to-adopt',
    coordinationProjection: {
      ...current.replacement.coordinationProjection,
      adoptionState: 'adopted',
    },
    acceptedSubmissionRecordIds: [id(20)],
    rejectedSubmissionRecordIds: [],
  });
});

test('malformed, stale, and orphan submissions in the revocation gap block adoption', () => {
  const malformed = submissionSpec();
  delete malformed.payload.assignmentRecordId;
  const cases = [
    malformed,
    submissionSpec({ grantId: id(8999) }),
    submissionSpec({ assignmentRecordId: id(70) }),
  ];
  for (const spec of cases) {
    assertGapResult(gapHistory({ beforeRevocation: [assignmentSpec()], gap: [spec] }), {
      status: 'blocked',
      diagnostic: { reason: 'authority' },
    });
  }
});

test('dispositions and unrelated capsules are forbidden in the revocation gap', () => {
  const unrelated = {
    recordId: id(50),
    recordType: 'lifecycle-transition',
    payload: { kind: 'lifecycle-transition', result: 'gap record' },
    actor: coordinator.actor,
    epoch: 1,
    grantId: id(9001),
  };
  for (const spec of [dispositionSpec({ replacement: false }), unrelated]) {
    assertGapResult(gapHistory({ gap: [spec] }), {
      status: 'blocked',
      diagnostic: { reason: 'authority' },
    });
  }
});

test('effective same-type supersession repairs a malformed gap submission', () => {
  const malformed = submissionSpec();
  delete malformed.payload.assignmentRecordId;
  const current = gapHistory({
    beforeRevocation: [assignmentSpec()],
    gap: [
      malformed,
      submissionSpec({
        recordId: id(21),
        supersedes: id(20),
      }),
    ],
    afterReplacement: [dispositionSpec({ submissionRecordId: id(21) })],
  });
  assertGapResult(current, {
    status: 'ready-to-adopt',
    coordinationProjection: {
      ...current.replacement.coordinationProjection,
      adoptionState: 'adopted',
    },
    acceptedSubmissionRecordIds: [id(21)],
    rejectedSubmissionRecordIds: [],
  });
});

test('an effective submission referencing a structurally known stale assignment blocks adoption', () => {
  const current = gapHistory({
    beforeRevocation: [assignmentSpec(), submissionSpec(), assignmentSpec(id(11), {}, id(10))],
  });
  assertGapResult(current, {
    status: 'blocked',
    diagnostic: { reason: 'authority' },
  });
});

test('same-type submission repair can follow the effective superseding assignment', () => {
  const current = gapHistory({
    beforeRevocation: [
      assignmentSpec(),
      submissionSpec(),
      assignmentSpec(id(11), {}, id(10)),
      submissionSpec({ recordId: id(21), assignmentRecordId: id(11), supersedes: id(20) }),
    ],
    afterReplacement: [dispositionSpec({ assignmentRecordId: id(11), submissionRecordId: id(21) })],
  });
  assertGapResult(current, {
    status: 'ready-to-adopt',
    coordinationProjection: {
      ...current.replacement.coordinationProjection,
      adoptionState: 'adopted',
    },
    acceptedSubmissionRecordIds: [id(21)],
    rejectedSubmissionRecordIds: [],
  });
});

for (const crossTargetSupersession of [false, true]) {
  test(`a disposition for a superseding submission must ${
    crossTargetSupersession ? 'not supersede' : 'be independent of'
  } the prior target disposition`, () => {
    const current = gapHistory({
      beforeRevocation: [
        assignmentSpec(),
        submissionSpec(),
        dispositionSpec({ replacement: false }),
        submissionSpec({ recordId: id(21), supersedes: id(20) }),
        dispositionSpec({
          recordId: id(31),
          submissionRecordId: id(21),
          replacement: false,
          supersedes: crossTargetSupersession ? id(30) : null,
        }),
      ],
    });
    const expected = crossTargetSupersession
      ? { status: 'blocked', diagnostic: { reason: 'authority' } }
      : {
          status: 'ready-to-adopt',
          coordinationProjection: {
            ...current.replacement.coordinationProjection,
            adoptionState: 'adopted',
          },
          acceptedSubmissionRecordIds: [],
          rejectedSubmissionRecordIds: [],
        };
    assertGapResult(current, expected);
  });
}
