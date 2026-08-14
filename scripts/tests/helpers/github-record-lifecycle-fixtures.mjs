import { createHash } from 'node:crypto';

import {
  createAitmRecordEnvelope,
  parseAitmRecord,
} from '../../task-tracker/lib/github-records/record-envelope.mjs';
import {
  createDraftContract,
  sealContract,
} from '../../task-tracker/lib/github-records/delivery-contract.mjs';
import { resolveCoordinatorAuthority } from '../../task-tracker/lib/github-records/coordination-authority.mjs';

export const repository = 'kburson/ai-task-manager';
export const issue = 1079;
export const branch = 'feature/child/1079';
export const coordinator = Object.freeze({
  actor: 'codex',
  platform: 'codex',
  session: 'session-1079',
});

export function id(number) {
  return `01J0000000000000000000${String(number).padStart(4, '0')}`;
}

export const grantId = id(9000);

export function projectionBody(kind, revision) {
  return `${JSON.stringify({ kind, revision })}\n`;
}

export function projectionHash(body) {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

export function projectionIntent({ kind, number, expectedRevision = 1 } = {}) {
  const expectedBody = projectionBody(kind, expectedRevision);
  const nextBody = projectionBody(kind, expectedRevision + 1);
  return Object.freeze({
    kind,
    singletonCommentNodeId: `IC_kwDOProjection${number}`,
    expectedRevision,
    expectedBodyHash: projectionHash(expectedBody),
    nextRevision: expectedRevision + 1,
    nextBodyHash: projectionHash(nextBody),
    nextBody,
  });
}

export function transitionPayload(overrides = {}) {
  return {
    schema: 'aitm.lifecycle-transition/v1',
    operationId: 'lifecycle:1079:develop:test:1',
    issue,
    action: 'advance',
    fromState: 'develop',
    toState: 'test',
    branch,
    grantId,
    grantEpoch: 1,
    contractEpoch: 1,
    projections: [
      projectionIntent({ kind: 'evidence-projection', number: 1 }),
      projectionIntent({ kind: 'timing', number: 2 }),
    ],
    ...overrides,
  };
}

export function sealedContract(overrides = {}) {
  const draft = createDraftContract({
    recordId: id(100),
    authorityEpoch: 1,
    coordinatorGrantId: grantId,
    acceptanceCriteria: [{ logicalId: 'ac-transition', text: 'Transition is durable.' }],
    verificationCommands: [{ logicalId: 'vc-transition', command: 'npm test' }],
    definitionOfDone: [{ logicalId: 'dod-transition', text: 'Transition is verified.' }],
    lifecycleProjection: {},
    acceptedRecordIds: [],
  });
  const sealed = sealContract({
    contract: draft,
    authorityEpoch: 1,
    coordinatorGrantId: grantId,
  }).contract;
  return Object.freeze({ ...sealed, ...overrides });
}

export function activeAuthority(overrides = {}) {
  const grant = {
    schema: 'aitm.coordinator-grant/v1',
    grantId,
    scope: { scopeRootIssue: issue, includedIssues: [], excludedIssues: [] },
    coordinator,
    parentGrantId: null,
    issuer: null,
    epoch: 1,
    operations: ['advance'],
    branchBoundary: [branch],
    integrationBoundary: { sourceBranches: [], destinationBranches: [] },
    activatedAt: '2026-08-05T10:00:00.000Z',
    expiresAt: null,
    ...(overrides.grant ?? {}),
  };
  return resolveCoordinatorAuthority({
    issueHierarchy: [{ issue, parentIssue: null }],
    grants: [grant],
    revocations: [],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: grant.grantId,
      epoch: grant.epoch,
      adoptionState: 'adopted',
    },
    now: '2026-08-05T11:00:00.000Z',
  });
}

export function capsule({
  recordId,
  predecessor = null,
  payload = { kind: 'verification-evidence', result: 'green' },
  recordType = 'verification-evidence',
} = {}) {
  return Object.freeze({
    commentNodeId: `IC_kwDOCapsule${recordId.slice(-4)}`,
    envelope: createAitmRecordEnvelope({
      recordId,
      recordType,
      repository,
      issue,
      payload,
      actor: coordinator.actor,
      epoch: 1,
      grantId,
      predecessor,
      supersedes: null,
      createdAt: '2026-08-05T11:00:00.000Z',
    }),
  });
}

export function memoryLifecycleStore({ records = [], projections } = {}) {
  const intents = transitionPayload().projections;
  const initialProjections =
    projections ??
    intents.map((intent) => ({
      kind: intent.kind,
      commentNodeId: intent.singletonCommentNodeId,
      revision: intent.expectedRevision,
      bodyHash: intent.expectedBodyHash,
      body: projectionBody(intent.kind, intent.expectedRevision),
    }));
  const state = {
    records: [...records],
    projections: new Map(initialProjections.map((entry) => [entry.commentNodeId, { ...entry }])),
    events: [],
    capsuleWrites: 0,
    projectionWrites: 0,
  };
  const deps = {
    async listIssueComments() {
      state.events.push('capsule-list');
      return Object.freeze([...state.records]);
    },
    async createIssueComment({ body }) {
      state.events.push('capsule-write');
      state.capsuleWrites += 1;
      const commentNodeId = `IC_kwDOLifecycle${state.capsuleWrites}`;
      const parsed = parseAitmRecord({
        commentNodeId,
        body,
        expectedRepository: repository,
        expectedIssue: issue,
      });
      const record = Object.freeze({ ...parsed, body });
      state.records.push(record);
      return record;
    },
    async readBackComment({ commentNodeId }) {
      state.events.push('capsule-readback');
      return state.records.find((record) => record.commentNodeId === commentNodeId);
    },
    async readProjection({ commentNodeId }) {
      const current = state.projections.get(commentNodeId);
      state.events.push(`projection-read:${current?.kind ?? commentNodeId}`);
      return current === undefined ? null : structuredClone(current);
    },
    async updateProjection({ commentNodeId, expected, next }) {
      const current = state.projections.get(commentNodeId);
      state.events.push(`projection-write:${current?.kind ?? commentNodeId}`);
      if (JSON.stringify(current) !== JSON.stringify(expected))
        throw new Error('store-cas-mismatch');
      state.projectionWrites += 1;
      state.projections.set(commentNodeId, structuredClone(next));
      return structuredClone(next);
    },
  };
  return { state, deps };
}
