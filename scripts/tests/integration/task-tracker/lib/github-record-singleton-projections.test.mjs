// @story #1085
// cspell:ignore KZGMP GXCAFN

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildInitialComment } from '../../../../task-tracker/gh-timing-comment.internals.mjs';
import {
  buildCoordinationProjection,
  buildEvidenceProjection,
  convergeSingletonProjections,
  renderSingletonProjectionRecord,
  renderTimingSingletonMarkdown,
} from '../../../../task-tracker/lib/github-records/singleton-projections.mjs';
import { parseAitmRecord } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { fleetObservation } from '../../../../task-tracker/fleet-registry.mjs';
import { buildStructuredTimingProjection } from '../../../../task-tracker/timing-rollup.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1085;
const actor = 'codex/story-1085';
const grantId = '01KZGMP81Y9GXCAFN533X9QKR7';
const createdAt = '2026-08-08T12:00:00.000Z';

function coordination(assignments) {
  return buildCoordinationProjection({
    revision: 3,
    grant: { grantId, epoch: 4, actor, scopeRootIssue: 1067 },
    assignments,
    chainHeads: {
      evidence: '01KZGMP81Y9GXCAFN533X9QKS2',
      coordination: '01KZGMP81Y9GXCAFN533X9QKS1',
    },
  });
}

function evidence(records) {
  return buildEvidenceProjection({ revision: 5, contractEpoch: 2, acceptedRecords: records });
}

test('coordination and evidence projections are deterministic over accepted record order', () => {
  const assignments = [
    {
      recordId: '01KZGMP81Y9GXCAFN533X9QKT1',
      issue: 1085,
      branch: 'feature/child/1085',
      state: 'active',
    },
    {
      recordId: '01KZGMP81Y9GXCAFN533X9QKT2',
      issue: 1086,
      branch: 'feature/child/1086',
      state: 'submitted',
    },
  ];
  const records = [
    {
      recordId: '01KZGMP81Y9GXCAFN533X9QKV1',
      recordType: 'verification-evidence',
      createdAt,
      logicalId: 'vc:1',
    },
    {
      recordId: '01KZGMP81Y9GXCAFN533X9QKV2',
      recordType: 'review-result',
      createdAt: '2026-08-08T12:01:00.000Z',
      logicalId: 'review:agent',
    },
  ];

  assert.deepEqual(coordination(assignments), coordination([...assignments].reverse()));
  assert.deepEqual(evidence(records), evidence([...records].reverse()));
  assert.equal(coordination(assignments).schema, 'aitm.coordination-singleton/v1');
});

test('timing projection preserves the existing timing table and emits normalized totals', () => {
  const timingBody = `${buildInitialComment()}\n| 2026-08-08 07:00:00 -05:00 | develop:started |  |  |  | 0 | began | <!-- row-sec: a=0 i=0 -->\n| 2026-08-08 07:01:00 -05:00 | develop:completed | 1m 00s |  | 5 | 5 | built | <!-- row-sec: a=60 i=0 -->\n`;
  const projection = buildStructuredTimingProjection({
    timingBody,
    issueBody: '',
    thresholdMin: 5,
  });
  const markdown = renderTimingSingletonMarkdown({ timingBody, timingProjection: projection });

  assert.equal(projection.schema, 'aitm.timing-projection/v1');
  assert.equal(projection.totals.totalActiveSec, 60);
  assert.equal(projection.totals.lastWordMarker, 5);
  assert.ok(markdown.startsWith(timingBody));
  assert.match(markdown, /Normalized timing projection/);
  assert.match(markdown, /Total active.*1m 00s/);
});

test('projection convergence is ordered, read-back validated, idempotent, and never writes the issue body', async () => {
  const current = new Map([
    ['IC_coordination', 'old coordination'],
    ['IC_evidence', 'old evidence'],
    ['IC_timing', 'old timing'],
  ]);
  const writes = [];
  const bodyWrites = [];
  const desired = [
    { kind: 'timing', commentNodeId: 'IC_timing', body: 'new timing' },
    { kind: 'coordination', commentNodeId: 'IC_coordination', body: 'new coordination' },
    { kind: 'evidence-projection', commentNodeId: 'IC_evidence', body: 'new evidence' },
  ];
  const deps = {
    async readProjection({ commentNodeId }) {
      return { commentNodeId, body: current.get(commentNodeId) };
    },
    async updateProjection({ commentNodeId, expectedBody, body }) {
      assert.equal(current.get(commentNodeId), expectedBody);
      writes.push(commentNodeId);
      current.set(commentNodeId, body);
    },
    async writeIssueBody(input) {
      bodyWrites.push(input);
    },
  };

  const first = await convergeSingletonProjections({ desired, deps });
  const replay = await convergeSingletonProjections({ desired, deps });

  assert.deepEqual(writes, ['IC_coordination', 'IC_evidence', 'IC_timing']);
  assert.deepEqual(first.updatedKinds, ['coordination', 'evidence-projection', 'timing']);
  assert.deepEqual(replay.unchangedKinds, ['coordination', 'evidence-projection', 'timing']);
  assert.deepEqual(bodyWrites, []);
});

test('interruption leaves a stale projection that replay repairs without duplicate writes', async () => {
  const current = new Map([
    ['IC_coordination', 'old coordination'],
    ['IC_evidence', 'old evidence'],
  ]);
  const writes = [];
  const desired = [
    { kind: 'coordination', commentNodeId: 'IC_coordination', body: 'new coordination' },
    { kind: 'evidence-projection', commentNodeId: 'IC_evidence', body: 'new evidence' },
  ];
  const deps = {
    async readProjection({ commentNodeId }) {
      return { commentNodeId, body: current.get(commentNodeId) };
    },
    async updateProjection({ commentNodeId, expectedBody, body }) {
      assert.equal(current.get(commentNodeId), expectedBody);
      writes.push(commentNodeId);
      current.set(commentNodeId, body);
    },
  };

  await assert.rejects(
    convergeSingletonProjections({
      desired,
      deps,
      crashAt({ phase, kind }) {
        if (phase === 'after-update' && kind === 'coordination') throw new Error('crash');
      },
    }),
    /crash/
  );
  const repaired = await convergeSingletonProjections({ desired, deps });

  assert.deepEqual(writes, ['IC_coordination', 'IC_evidence']);
  assert.deepEqual(repaired.unchangedKinds, ['coordination']);
  assert.deepEqual(repaired.updatedKinds, ['evidence-projection']);
});

test('local fleet and cache observations cannot alter projection authority', () => {
  const authoritativeAssignments = [
    {
      recordId: '01KZGMP81Y9GXCAFN533X9QKT1',
      issue: 1085,
      branch: 'feature/child/1085',
      state: 'active',
    },
  ];
  const before = coordination(authoritativeAssignments);
  const observed = fleetObservation({
    '#9999': {
      worktreePath: '/tmp/untrusted',
      branch: 'feature/untrusted',
      kind: 'worktree',
      startedAt: createdAt,
      status: 'active',
    },
  });
  const afterFleetAndCacheDeletion = coordination(authoritativeAssignments);

  assert.equal(observed.authoritative, false);
  assert.deepEqual(before, afterFleetAndCacheDeletion);

  const body = renderSingletonProjectionRecord({
    repository,
    issue,
    kind: 'coordination',
    projection: before,
    actor,
    grantId,
    epoch: 4,
    recordId: '01KZGMP81Y9GXCAFN533X9QKW1',
    createdAt,
  });
  const parsed = parseAitmRecord({
    commentNodeId: 'IC_coordination',
    body,
    expectedRepository: repository,
    expectedIssue: issue,
  });
  assert.deepEqual(parsed.envelope.payload, before);
  assert.doesNotMatch(body, /untrusted/);
});
