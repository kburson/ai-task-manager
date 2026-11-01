// @story #2068
import test from 'node:test';
import { buildAuditCommentBody } from '../../../../task-tracker/lib/reevaluate-estimate.mjs';
import { historicalForecastEnvelope } from '../../../helpers/task-2065-forecast-fixture.mjs';
import { renderAitmRecord } from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { currentIssueLockOwner } from '../../../../task-tracker/issue-mutator-lock.mjs';
import assert from 'node:assert/strict';
import { rmSync, readFileSync } from 'node:fs';
import {
  fixture,
  freshUnitDir,
  observed,
  subject,
} from '../lib/decomposition-authority-fixtures.mjs';
import {
  collectDecompositionAuthority,
  collectDecompositionCommentProposals,
} from '../../../../task-tracker/lib/decomposition-authority.mjs';
import {
  parseIssueFieldDb,
  formatIssueFieldDb,
  stripIssueFieldDb,
} from '../../../../task-tracker/issue-field-db.mjs';
import {
  parseArgs,
  validateArgs,
  runInflateEstimate,
} from '../../../../task-tracker/verbs/inflate-estimate.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { readEstimateBeforeRecord } from '../../../../task-tracker/lib/estimate-writer-publication.mjs';

const originalComment =
  '<!-- aitm-refined-estimate: 1987 -->\n### Planned Estimate\n\n| Field | Before | After | Delta |\n|---|---|---|---|\n| Size | S | S | 0 |\n| Estimate (h) | 3.5 | 3.5 | 0 |\n';
const request = {
  issueNumber: subject.issue,
  size: 'M',
  estimate: '6.5',
  reason: 'Approved additional recovery',
  items: ['Recovery (~3h)'],
};
const cfg = {
  repo: subject.repository,
  projectId: subject.projectId,
  fieldIds: { size: 'SIZE', estimate: 'EST' },
};

function composed(t) {
  const f = fixture(3.5),
    projectDir = freshUnitDir('inflation-audit-');
  t.after(() => rmSync(projectDir, { recursive: true, force: true }));
  f.values.project.size = 'S';
  f.body =
    stripIssueFieldDb(f.body) + '\n' + formatIssueFieldDb({ size: 'S', estimate: 3.5 }) + '\n';
  const comment = { id: 99, node_id: 'fixture-node-99', body: originalComment };
  const writes = [];
  f.deps.readForecast = async () => {
    const board = { size: f.values.project.size, estimate: f.values.project.estimate };
    const { size, estimate } = parseIssueFieldDb(f.body).values;
    const bodyFields = { size, estimate };
    const { proposals, available } = collectDecompositionCommentProposals({
      subject,
      body: f.body,
      published: null,
      board,
      bodyFields,
      comments: [{ id: comment.node_id, body: comment.body }],
    });
    assert.equal(available, true);
    return observed({
      recordId: null,
      payloadHash: null,
      estimate: null,
      size: null,
      proposals,
      observedProjections: [board, bodyFields],
    });
  };
  const deps = {
    projectDir,
    decomposition: f.deps,
    projectItemForIssue: async () => ({ itemId: subject.projectItemId }),
    listComments: async () => [comment],
    patchComment: async ({ body }) => {
      writes.push('audit');
      comment.body = body;
    },
    getIssueBody: async () => f.body,
    mutateIssueBody: async ({ mutate }) => {
      writes.push('fields');
      f.body = await mutate(f.body);
    },
    projectValuesForIssue: async () => f.values.project,
    loadProjectFieldDefs: () => [
      { key: 'size', type: 'single_select' },
      { key: 'estimate', type: 'number' },
    ],
    fieldOptionMap: async () => ({}),
    writeProjectFieldValue: async ({ fieldId, value }) => {
      writes.push(fieldId);
      if (fieldId === 'EST') f.values.project.estimate = value.number;
      else f.values.project.size = value.singleSelectOptionName;
    },
  };
  deps.readInflationActor = async () => ({
    sid: 'fixture-native-sid',
    claimSid: 'fixture-native-sid',
    root: projectDir,
    claimRoot: projectDir,
    commonDir: projectDir + '/.git',
    boundAt: '2026-11-01T11:30:00Z',
    issue: '#1987',
    claimIssue: 1987,
    state: 'develop',
    boardState: 'develop',
    branch: 'codex/fixture',
    head: 'a'.repeat(40),
    entryStartTs: '2026-11-01T11:35:00Z',
    generation: '11111111-1111-4111-8111-111111111111',
    claimGeneration: '11111111-1111-4111-8111-111111111111',
    provider: 'codex',
    closed: false,
    login: 'fixture',
    owners: ['fixture'],
    open: true,
  });
  deps.plannedEstimate = { listComments: deps.listComments };
  return {
    f,
    comment,
    deps,
    writes,
    collect: () => collectDecompositionAuthority({ subject, cfg, projectDir, deps: f.deps }),
  };
}

test('inflating a comment with a planned estimate confirms the exact future audit and 6.5h state', async (t) => {
  const c = composed(t);
  const result = await runInflateEstimate(request, cfg, c.deps);
  assert.equal(result.status, 'recorded', result.reason);
  assert.equal(readDecompositionRecords(c.f.body).publication.status, 'complete');
  assert.deepEqual(c.writes, ['audit', 'SIZE', 'EST', 'fields']);
  assert.equal((await c.collect()).input.estimate.hours, 7);
  assert.equal(parseIssueFieldDb(c.f.body).values.estimate, 6.5);
});

const legacy = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/2068/legacy-inflate-publication.json', import.meta.url),
    'utf8'
  )
);
function fromLegacy(t) {
  const c = composed(t);
  c.f.body = legacy.body;
  Object.assign(c.comment, legacy.comment);
  Object.assign(c.f.values.project, { size: 'M', estimate: 6.5 });
  return c;
}
async function recoveryArgs(c) {
  const current = await c.collect();
  return parseArgs([
    String(subject.issue),
    '--reconcile-audit',
    current.publication.operationId,
    '--current-input',
    current.inputDigest,
  ]);
}
test('owner-linked audit recovery preserves sealed predecessor, repeats no business writes and is idempotent', async (t) => {
  const c = fromLegacy(t),
    original = await c.collect(),
    args = await recoveryArgs(c);
  validateArgs(args);
  for (let n = 0; n < 2; n++) {
    const result = await runInflateEstimate(args, cfg, c.deps);
    assert.equal(result.status, 'recorded', result.reason);
    const next = await c.collect();
    assert.equal(next.publication.status, 'complete');
    assert.equal(next.publication.supersedes.operationId, original.publication.operationId);
    assert.deepEqual(next.publication.supersedes.effects, original.publication.effects);
    assert.equal(next.publication.intendedInputDigest, original.inputDigest);
    assert.equal(next.inputDigest, original.inputDigest);
    assert.deepEqual(next.publication.proposal, original.publication.proposal);
    assert.deepEqual(c.writes, []);
    assert.equal(c.comment.body, legacy.comment.body);
    assert.match(c.f.body, /state="develop"/);
    assert.equal(
      readEstimateBeforeRecord(c.f.body).intendedInputDigest,
      original.publication.intendedInputDigest
    );
  }
});
for (const variant of ['operation', 'fingerprint', 'audit', 'scope', 'board', 'duplicate']) {
  test('audit reconciliation refuses ' + variant + ' drift before any writes', async (t) => {
    const c = fromLegacy(t),
      args = await recoveryArgs(c);
    if (variant === 'operation') args.reconcileAudit = '11111111-1111-4111-8111-111111111111';
    if (variant === 'fingerprint') args.currentInput = '0'.repeat(64);
    if (variant === 'audit') c.comment.body += 'unrelated edit';
    if (variant === 'scope')
      c.f.body = c.f.body.replace('Collect current authority.', 'Changed scope.');
    if (variant === 'board') c.f.values.project.estimate = 7;
    if (variant === 'duplicate') c.deps.listComments = async () => [c.comment, c.comment];
    if (['audit', 'scope', 'board'].includes(variant))
      args.currentInput = (await c.collect()).inputDigest;
    const before = c.f.body,
      count = c.f.writes.length;
    await assert.rejects(async () => {
      const r = await runInflateEstimate(args, cfg, c.deps);
      if (r.status === 'refused') throw new Error(r.reason);
    }, /reconciliation|drift|authority|refine-comment/);
    assert.equal(c.f.body, before);
    assert.equal(c.f.writes.length, count);
    assert.deepEqual(c.writes, []);
  });
}
test('reconciliation cannot mix an explicit fingerprint with ordinary estimate arguments', () => {
  assert.throws(
    () =>
      parseArgs([
        '1987',
        '--size',
        'M',
        '--reconcile-audit',
        '11111111-1111-4111-8111-111111111111',
        '--current-input',
        'a'.repeat(64),
      ]),
    /reconciliation/
  );
});

test('another forecast proposal arriving after lock acquisition refuses before successor intent', async (t) => {
  const c = fromLegacy(t),
    args = await recoveryArgs(c),
    read = c.f.deps.readForecast;
  let ownedReads = 0;
  c.f.deps.readForecast = async () => {
    const result = await read();
    if (currentIssueLockOwner(subject.issue) && ++ownedReads >= 2) {
      result.value.proposals.push({
        proposalId: 'comment:other:planned-estimate',
        hours: 2,
        size: 'S',
        sourceDigest: 'a'.repeat(64),
      });
      return observed(result.value);
    }
    return result;
  };
  const before = c.f.body,
    count = c.f.writes.length;
  const result = await runInflateEstimate(args, cfg, c.deps);
  assert.notEqual(result.status, 'recorded');
  assert.equal(c.f.writes.length, count, 'stale request cannot publish a successor');
  assert.equal(c.f.body, before);
  assert.deepEqual(c.writes, []);
});
test('interrupted linked intent resumes after a commit and timer restart on the same binding', async (t) => {
  const c = fromLegacy(t),
    args = await recoveryArgs(c),
    prior = readEstimateBeforeRecord(c.f.body),
    push = c.f.deps.pushBody;
  let interrupted = false;
  c.f.deps.pushBody = async (...a) => {
    await push(...a);
    if (!interrupted) {
      interrupted = true;
      throw new Error('transport interrupted after write');
    }
  };
  const first = await runInflateEstimate(args, cfg, c.deps);
  assert.notEqual(first.status, 'recorded');
  assert.equal(
    readDecompositionRecords(c.f.body).publication.supersedes.operationId,
    args.reconcileAudit
  );
  const pending = readDecompositionRecords(c.f.body).publication;
  assert.equal(pending.status, 'pending');
  const actor = await c.deps.readInflationActor();
  c.deps.readInflationActor = async () => ({
    ...actor,
    head: 'b'.repeat(40),
    entryStartTs: '2026-11-01T12:00:00Z',
  });
  const second = await runInflateEstimate(args, cfg, c.deps);
  assert.equal(second.status, 'recorded', second.reason);
  const complete = readDecompositionRecords(c.f.body).publication;
  assert.equal(complete.operationId, pending.operationId);
  assert.equal(complete.status, 'complete');
  assert.deepEqual(complete.supersedes, pending.supersedes);
  assert.deepEqual(complete.proposal, pending.proposal);
  assert.deepEqual(readEstimateBeforeRecord(c.f.body), prior);
  assert.deepEqual(c.writes, []);
});

for (const variant of ['owner', 'state', 'generation', 'issue', 'root', 'closed', 'rebound']) {
  test(
    'recovery refuses ' + variant + ' actor mismatch before successor publication',
    async (t) => {
      const c = fromLegacy(t),
        args = await recoveryArgs(c),
        valid = c.deps.readInflationActor;
      c.deps.readInflationActor = async () => {
        const actor = await valid();
        if (variant === 'owner') actor.owners = ['different-user'];
        if (variant === 'state') actor.boardState = 'plan';
        if (variant === 'generation')
          actor.claimGeneration = '22222222-2222-4222-8222-222222222222';
        if (variant === 'issue') actor.issue = '#99';
        if (variant === 'root') actor.claimRoot = '/foreign';
        if (variant === 'closed') actor.closed = true;
        if (variant === 'rebound' && currentIssueLockOwner(subject.issue)) {
          actor.generation = actor.claimGeneration = '22222222-2222-4222-8222-222222222222';
        }
        return actor;
      };
      const before = c.f.body;
      await assert.rejects(async () => {
        const r = await runInflateEstimate(args, cfg, c.deps);
        if (r.status === 'refused') throw new Error(r.reason);
      }, /actor/);
      assert.equal(c.f.body, before);
      assert.deepEqual(c.writes, []);
    }
  );
}

for (const field of ['generation', 'sid', 'login', 'boundAt', 'commonDir', 'branch'])
  test('an interrupted successor refuses a different valid ' + field, async (t) => {
    const c = fromLegacy(t),
      args = await recoveryArgs(c),
      push = c.f.deps.pushBody;
    let stopped = false;
    c.f.deps.pushBody = async (...values) => {
      await push(...values);
      if (!stopped) {
        stopped = true;
        throw new Error('transport interrupted');
      }
    };
    assert.notEqual((await runInflateEstimate(args, cfg, c.deps)).status, 'recorded');
    const initial = c.f.body,
      writes = c.f.writes.length,
      actor = await c.deps.readInflationActor();
    if (field === 'generation')
      actor.generation = actor.claimGeneration = '22222222-2222-4222-8222-222222222222';
    if (field === 'sid') actor.sid = actor.claimSid = 'replacement-session';
    if (field === 'login') {
      actor.login = 'replacement';
      actor.owners = [actor.login];
    }
    if (field === 'boundAt') actor.boundAt = '2026-11-01T11:31:00Z';
    if (field === 'commonDir') actor.commonDir += '-replacement';
    if (field === 'branch') actor.branch += '-replacement';
    c.deps.readInflationActor = async () => actor;
    await assert.rejects(runInflateEstimate(args, cfg, c.deps), /reconciliation-predecessor/);
    assert.equal(c.f.body, initial);
    assert.equal(c.f.writes.length, writes);
    assert.deepEqual(c.writes, []);
  });
test('a synthetic storage checkout cannot invoke the production native actor path', async (t) => {
  const c = fromLegacy(t),
    args = await recoveryArgs(c);
  delete c.deps.readInflationActor;
  const initial = c.f.body;
  await assert.rejects(runInflateEstimate(args, cfg, c.deps), /actor-root|actor-environment/);
  assert.equal(c.f.body, initial);
});

for (const field of ['generation', 'head', 'entryStartTs'])
  test(
    field + ' changing during fresh-body validation refuses the first successor write',
    async (t) => {
      const c = fromLegacy(t),
        args = await recoveryArgs(c),
        readActor = c.deps.readInflationActor;
      let moved = false;
      c.f.deps.mutateIssueBody = async (input) => {
        moved = true;
        return mutateIssueBody(input);
      };
      c.deps.readInflationActor = async () => {
        const actor = await readActor();
        if (moved && field === 'generation')
          actor.generation = actor.claimGeneration = '22222222-2222-4222-8222-222222222222';
        if (moved && field === 'head') actor.head = 'b'.repeat(40);
        if (moved && field === 'entryStartTs') actor.entryStartTs = '2026-11-01T12:00:00Z';
        return actor;
      };
      const initial = c.f.body,
        writes = c.f.writes.length;
      const r = await runInflateEstimate(args, cfg, c.deps);
      assert.notEqual(r.status, 'recorded');
      assert.match(r.reason, /actor-changed/);
      assert.equal(c.f.body, initial, 'the pending original remains authoritative');
      assert.equal(c.f.writes.length, writes);
      assert.deepEqual(c.writes, []);
    }
  );

for (const [baseline, higher] of [
  [3.5, false],
  [3.5, true],
  [4, true],
])
  test(
    'an inflation after a published Plan forecast confirms the final collector digest, baseline=' +
      baseline +
      ', higher proposal=' +
      higher,
    async (t) => {
      const c = composed(t);
      c.f.values.project.estimate = baseline;
      c.f.body =
        stripIssueFieldDb(c.f.body) +
        '\n' +
        formatIssueFieldDb({ size: 'S', estimate: baseline }) +
        '\n';
      const id = '01J00000000000000000000601';
      const envelope = historicalForecastEnvelope({
        recordType: 'estimation-forecast',
        repository: subject.repository,
        issue: subject.issue,
        createdAt: '2026-10-11T12:00:00.000Z',
        recordId: id,
        grantId: '01J00000000000000000000602',
        actor: 'fixture/plan',
        payload: {
          schema: 'aitm.estimation-forecast/v1',
          issue: subject.issue,
          lifecycleState: 'plan',
          refine: { size: 'S', humanHours: 3.5 },
          plan: { size: 'S', humanHours: 3.5, deltaHours: 0, rationale: 'Original approved plan.' },
          ai: {
            p50EngagedHours: 2,
            p80EngagedHours: 3,
            stages: { plan: 0.5, develop: 1, test: 0.5, review: 0 },
          },
          wbs: [
            {
              id: 'original',
              description: 'Original reviewed work',
              humanHours: 3.5,
              signals: ['test'],
            },
          ],
          comparableIssues: [],
          rubric: {
            recordId: '01J00000000000000000000600',
            version: 1,
            cohortSize: 0,
            confidence: 0.1,
          },
          testPlan: { impactedLanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 5 },
          risks: [],
          recommendation: { action: 'proceed', reason: 'Original bounded plan.' },
          supersedesForecastRecordId: null,
        },
      });
      c.f.body += '\n<!-- aitm-estimation-forecast-ready record-id="' + id + '" -->\n';
      const forecastComment = {
        id: 100,
        node_id: 'IC_forecast',
        body: renderAitmRecord({ envelope }),
      };
      const human = {
        id: 98,
        node_id: 'IC_human',
        body: buildAuditCommentBody({
          current: { size: 'S', estimate: 3.5 },
          size: 'M',
          estimate: 25,
          requiresHuman: true,
          signals: { files: 8, steps: 8, risks: 3, deps: 3 },
          score: 12,
        }),
      };
      const comments = () => [...(higher ? [human] : []), c.comment, forecastComment];
      c.deps.listComments = async () => comments();
      delete c.f.deps.readForecast;
      c.f.deps.forecast = {
        graphql: async () => ({
          data: {
            repository: {
              issue: {
                number: subject.issue,
                repository: { nameWithOwner: subject.repository },
                body: c.f.body,
                projectItems: {
                  nodes: [
                    {
                      id: subject.projectItemId,
                      project: { id: cfg.projectId },
                      fieldValues: {
                        nodes: [
                          {
                            number: c.f.values.project.estimate,
                            field: { id: cfg.fieldIds.estimate },
                          },
                          { name: c.f.values.project.size, field: { id: cfg.fieldIds.size } },
                        ],
                        pageInfo: { hasNextPage: false },
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false },
                },
                comments: {
                  nodes: comments().map((x) => ({
                    __typename: 'IssueComment',
                    id: x.node_id,
                    body: x.body,
                    createdAt: '2026-10-11T12:00:00.000Z',
                    updatedAt: '2026-10-11T12:00:00.000Z',
                    author: { login: 'fixture' },
                    issue: {
                      number: subject.issue,
                      repository: { nameWithOwner: subject.repository },
                    },
                  })),
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        }),
      };
      const before = await c.collect();
      assert.equal(before.input.availability.status, 'complete');
      assert.equal(before.sourceObservations.readForecast.value.recordId, id);
      const previous = before.sourceObservations.readForecast.value.proposals;
      assert.deepEqual(
        previous.map((p) => p.proposalId),
        [
          ...(higher ? ['comment:IC_human:human-attention'] : []),
          ...(baseline === 4 ? ['comment:fixture-node-99:planned-estimate'] : []),
        ]
      );
      const result = await runInflateEstimate(request, cfg, c.deps);
      assert.equal(result.status, 'recorded', result.reason);
      const after = await c.collect();
      assert.equal(after.publication.status, 'complete');
      assert.equal(after.publication.intendedInputDigest, after.inputDigest);
      assert.deepEqual(
        after.sourceObservations.readForecast.value.proposals,
        previous.filter((p) => p.proposalId === 'comment:IC_human:human-attention')
      );
      assert.equal(after.input.estimate.hours, higher ? 25 : 7);
      assert.equal(after.sourceObservations.readProject.value.estimate, 6.5);
      assert.equal(parseIssueFieldDb(c.f.body).values.size, 'M');
      assert.deepEqual(c.writes, ['audit', 'SIZE', 'EST', 'fields']);
    }
  );
