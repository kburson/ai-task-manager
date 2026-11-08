// @story #2142 — real publication ownership; only external observations are controlled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  unchangedWriterFixture,
  writerCfg as cfg,
  writerDefs,
} from './decomposition-review-writers.fixtures.mjs';
import { estimationObservation } from '../../../fixtures/estimation-publication.mjs';
import { publishFieldEstimateRevision } from '../../../../task-tracker/lib/decomposition-field-writer.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { tetherIssueToProject } from '../../../../gh/lib/project-tether.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { runRefine, parseArgs } from '../../../../task-tracker/verbs/refine.mjs';

function recoveryFixture(writerId = 'refine') {
  const f = unchangedWriterFixture();
  f.body += '\n<!-- aitm-issue-kind kind="epic" -->\n';
  const content =
    '## Implementation Tasks\n### Task 1: Preserve delivery\nRun: `node verify.mjs`\n';
  let children = [],
    interrupt = true,
    writes = 0;
  const deps = {
    ...f.deps,
    decomposition: {
      ...f.decomposition,
      readProject: async () =>
        estimationObservation({
          projectId: cfg.projectId,
          projectItemId: 'ITEM_1987',
          ...f.board,
          children,
        }),
      readSelectedPlan: async () =>
        estimationObservation({
          path: 'docs/recovery-plan.md',
          commit: 'a'.repeat(40),
          section: null,
          digest: createHash('sha256').update(content).digest('hex'),
          availability: 'available',
          content,
          references: null,
        }),
    },
    afterPublicationEffects: async () => {
      if (interrupt) {
        interrupt = false;
        throw new Error('transport interrupted after field effects');
      }
    },
  };
  const run = (supersedePending = false, extra = {}, requestedWriter = writerId) =>
    publishFieldEstimateRevision({
      cfg,
      issueNumber: 1987,
      writerId: requestedWriter,
      key: {
        estimate: 12,
        reason: 'Bounded recovery',
        ...(supersedePending ? { supersedePending: true } : {}),
      },
      estimate: 12,
      size: 'M',
      supersedePending,
      deps: { ...deps, ...extra },
      writeField: async ({ field, value }) => {
        writes++;
        f.board[field] = value;
      },
    });
  return {
    f,
    run,
    deps,
    get writes() {
      return writes;
    },
    addChild() {
      children = [
        {
          number: 205,
          title: 'Discovered recovery',
          body: '',
          rank: null,
          blockedBy: [],
          state: 'backlog',
        },
      ];
    },
  };
}

test('CLI explicitly recognizes pending Refine recovery and rejects duplicate flags', () => {
  const argv = [
    '2142',
    '--size',
    'S',
    '--estimate',
    '4',
    '--priority',
    'p1',
    '--reason',
    'Recover predecessor',
  ];
  assert.equal(parseArgs([...argv, '--supersede-pending']).supersedePending, true);
  assert.equal(parseArgs(argv).supersedePending, undefined);
  assert.throws(
    () => parseArgs([...argv, '--supersede-pending', '--supersede-pending']),
    /duplicate/
  );
});

test('changed epic children require explicit recovery and retain the predecessor effects', async () => {
  const h = recoveryFixture();
  const first = await h.run();
  assert.equal(first.status, 'partial', first.reason);
  const predecessor = readDecompositionRecords(h.f.body).publication;
  assert.equal(predecessor.status, 'pending');
  assert.ok(predecessor.effects.every((e) => e.status === 'confirmed'));
  h.addChild();
  const ordinary = await h.run();
  assert.equal(ordinary.status, 'partial');
  assert.match(ordinary.reason, /semantic-drift|final-authority-drift/);
  const recovered = await h.run(true);
  assert.equal(recovered.status, 'recorded', recovered.reason);
  const current = readDecompositionRecords(h.f.body).publication;
  assert.notEqual(current.operationId, predecessor.operationId);
  assert.equal(current.status, 'complete');
  assert.equal(current.supersedes.operationId, predecessor.operationId);
  assert.deepEqual(current.supersedes.effects, predecessor.effects);
  const writes = h.writes;
  await h.run(true);
  assert.equal(h.writes, writes, 'an identical completed recovery must not repeat field effects');
});

test('incomplete authority refuses recovery before field writes', async () => {
  const h = recoveryFixture();
  await h.run();
  h.addChild();
  const writes = h.writes;
  await assert.rejects(
    h.run(true, {
      decomposition: {
        ...h.deps.decomposition,
        readProject: async () => ({ status: 'unavailable', value: null }),
      },
    }),
    /unavailable/
  );
  assert.equal(h.writes, writes);
});

test('Refine recovery cannot supersede another registered writer', async () => {
  const h = recoveryFixture('inflate-estimate');
  await h.run();
  h.addChild();
  // A foreign writer cannot opt itself into the new Refine-only recovery path.
  const refused = await h.run(true, {}, 'refine');
  assert.notEqual(refused.status, 'recorded');
  assert.match(refused.reason, /pending|publication/);
  assert.equal(readDecompositionRecords(h.f.body).publication.writerId, 'inflate-estimate');
});

test('an interrupted explicit recovery resumes its own operation without repeating field effects', async () => {
  const h = recoveryFixture();
  await h.run();
  h.addChild();
  let interrupted = false;
  const extra = {
    afterPublicationEffects: async () => {
      if (!interrupted) {
        interrupted = true;
        throw new Error('recovery transport interrupted');
      }
    },
  };
  const first = await h.run(true, extra);
  assert.equal(first.status, 'partial');
  const pending = readDecompositionRecords(h.f.body).publication;
  const writes = h.writes;
  const retried = await h.run(true, extra);
  assert.equal(retried.status, 'recorded', retried.reason);
  assert.equal(readDecompositionRecords(h.f.body).publication.operationId, pending.operationId);
  assert.equal(h.writes, writes);
});

test('real Refine forwards explicit recovery, stamps a current snapshot and advances one edge', async () => {
  const h = recoveryFixture();
  await h.run();
  h.addChild();
  const predecessor = readDecompositionRecords(h.f.body).publication;
  let promotions = 0;
  const result = await runRefine({
    cfg,
    args: {
      issueNumber: 1987,
      size: 'M',
      estimate: 12,
      priority: 'p1',
      rank: 1,
      reason: 'Recover current child graph',
      supersedePending: true,
    },
    deps: {
      ...h.deps,
      assertBound: (issue) => assert.equal(issue, 1987),
      fetchBody: async () => h.f.body,
      fetchLabels: async () => ['bug'],
      loadProjectFieldDefs: () => writerDefs,
      tetherIssueToProject: (args) =>
        tetherIssueToProject({ ...args, runGql: h.f.runGql, sleep: async () => {}, deps: h.deps }),
      mutateBody: (options) => mutateIssueBody({ ...options, deps: h.deps.decomposition }),
      verbPromote: async () => {
        promotions++;
      },
    },
  });
  assert.equal(result.status, 'refined', result.reason);
  assert.equal(promotions, 1);
  assert.match(h.f.body, /aitm-refine-complete/);
  assert.match(h.f.body, /aitm-refinement-snapshot/);
  const publication = readDecompositionRecords(h.f.body).publication;
  assert.equal(publication.status, 'complete');
  assert.equal(publication.supersedes.operationId, predecessor.operationId);
});
