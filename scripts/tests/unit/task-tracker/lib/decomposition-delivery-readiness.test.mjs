// @story #1287
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  describePreSplitReadiness,
  evaluateMaterializedWbsReadiness,
} from '../../../../task-tracker/lib/decomposition-delivery-readiness.mjs';
import { classifyDecomposition } from '../../../../task-tracker/lib/decomposition-policy.mjs';

const PLAN_PATH = 'docs/plan.md';

function planText(count = 3) {
  return Array.from(
    { length: count },
    (_, index) =>
      `### Task ${index + 1}: Part ${index + 1}\n\nRun: \`node --test part-${index + 1}.test.mjs\``
  ).join('\n\n');
}

function child(task, index, overrides = {}) {
  const number = 2001 + index;
  return {
    number,
    title: task.title,
    body: [
      '## Plan Metadata',
      `- **Source-plan**: ${PLAN_PATH}`,
      '- **Source-plan-commit**: accepted-plan',
      `- **Source-plan-section**: ${task.heading}`,
    ].join('\n'),
    rank: index + 1,
    blockedBy: index === 0 ? [] : [number - 1],
    hasCurrentRefinement: true,
    ...overrides,
  };
}

function materialized(overrides = {}) {
  const acceptedPlanText = planText();
  const tasks = classifyDecomposition({ planText: acceptedPlanText }).tasks;
  return {
    issueNumber: 1287,
    tasks,
    acceptedPlanPath: PLAN_PATH,
    acceptedPlanText,
    epicBody:
      '## Plan Metadata\n\n<!-- aitm-worktree-location worktree="/work/epic" branch="codex/1287-live" sid="s" ts="2026-08-31T00:00:00Z" -->',
    children: tasks.map(child),
    readPlanAtCommit: async () => acceptedPlanText,
    ...overrides,
  };
}

test('pre-split must-split evidence is decomposition-ready, never delivery-ready', () => {
  const classification = classifyDecomposition({ planText: planText(6) });
  const result = describePreSplitReadiness({ classification });

  assert.equal(result.status, 'decomposition-ready');
  assert.equal(result.deliveryReady, false);
  assert.deepEqual(
    result.expectedWbs.map((task) => task.heading),
    classification.tasks.map((task) => task.heading)
  );
});

test('fully reconciled materialized WBS is delivery-ready on recorded epic branch', async () => {
  const result = await evaluateMaterializedWbsReadiness(materialized());

  assert.equal(result.status, 'delivery-ready', result.blockers.join('\n'));
  assert.equal(result.deliveryReady, true);
  assert.equal(result.epicBranch, 'codex/1287-live');
  assert.equal(result.boundaries.coverage.ok, true);
  assert.equal(result.boundaries.sections.ok, true);
  assert.equal(result.boundaries.planning.ok, true);
  assert.equal(result.boundaries.branch.ok, true);
});

test('canonical epic branch remains valid when no durable override exists', async () => {
  const result = await evaluateMaterializedWbsReadiness(materialized({ epicBody: '' }));
  assert.equal(result.status, 'delivery-ready', result.blockers.join('\n'));
  assert.equal(result.epicBranch, 'feature/epic/1287');
});

test('an accepted terminal child keeps its existing successful admission behavior', async () => {
  const input = materialized();
  Object.assign(input.children[0], {
    rank: null,
    blockedBy: null,
    hasCurrentRefinement: false,
    state: 'done',
    issueState: 'closed',
    boardState: 'done',
    closeReason: 'completed',
    recoveryPhase: null,
  });

  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'delivery-ready', result.blockers.join('\n'));
});

test('bounded section contradictions refuse and name the section boundary', async () => {
  const input = materialized();
  input.children[1].body = input.children[1].body.replace('### Task 2', '### Task 99');
  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => item.startsWith('section-selection:')));
});

test('rank and dependency contradictions are accumulated fail-closed', async () => {
  const input = materialized();
  input.children[0].rank = null;
  input.children[1].blockedBy = [input.children[1].number];
  input.children[2].blockedBy = [9999];
  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => /planning-rank.*#2001/.test(item)));
  assert.ok(result.blockers.some((item) => /planning-dependency.*self/.test(item)));
  assert.ok(result.blockers.some((item) => /planning-dependency.*outside/.test(item)));
});

test('stale or unreadable child planning evidence refuses', async () => {
  const input = materialized();
  input.children[0].hasCurrentRefinement = false;
  input.children[1].childEvidenceError = 'live dependencies disagree with snapshot';
  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => /planning-evidence.*#2001/.test(item)));
  assert.ok(result.blockers.some((item) => /live dependencies disagree/.test(item)));
});

test('malformed durable branch authority refuses without canonical fallback', async () => {
  const result = await evaluateMaterializedWbsReadiness(
    materialized({
      epicBody: '<!-- aitm-worktree-location worktree="/work/epic" branch="codex/1287-live" -->',
    })
  );

  assert.equal(result.status, 'refused');
  assert.ok(
    result.blockers.some((item) => item.startsWith('branch-authority: ') && /malformed/.test(item))
  );
});

test('#1486: decomposition branch readiness delegates authority to the shared adapter', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/lib/decomposition-delivery-readiness.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /graph-node-authority\.mjs/);
  assert.doesNotMatch(source, /resolveCurrentIssueWorktree(?:Location|Branch)\s*\(/);
});

test('unreadable WBS evidence refuses and evaluator performs no mutations', async () => {
  let mutations = 0;
  const input = materialized({
    readPlanAtCommit: async () => {
      throw new Error('pinned plan missing');
    },
    mutateIssue: () => {
      mutations += 1;
    },
  });
  const result = await evaluateMaterializedWbsReadiness(input);

  assert.equal(result.status, 'refused');
  assert.ok(result.blockers.some((item) => /pinned plan is unreadable/.test(item)));
  assert.equal(mutations, 0);
});

import {
  fixture,
  subject,
  observed,
  publication,
  freshUnitDir,
} from './decomposition-authority-fixtures.mjs';
import {
  collectDecompositionAuthority,
  createDecompositionRuntime,
} from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { refreshDecompositionProjection } from '../../../../task-tracker/lib/decomposition-projection.mjs';
import { replaceDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
const cfg = { repo: 'o/r', projectId: 'PVT_a', fieldIds: { estimate: 'EST', size: 'SIZE' } };
const collect = (f) =>
  collectDecompositionAuthority({ subject, cfg, projectDir: process.cwd(), deps: f.deps });

// @story #2169
// Retained actual unmodified K-equivalent capture; do not regenerate under changed source.
import { gunzipSync } from 'node:zlib';
import { publishEstimateRevision } from '../../../../task-tracker/lib/decomposition-publication.mjs';
const retainedK = JSON.parse(
  gunzipSync(
    Buffer.from(
      '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',
      'base64'
    )
  )
);
for (const [name, baseline] of Object.entries(retainedK.cases))
  test('#2169 unchanged K ' + name + ' records stay current and retryable', async () => {
    const f = fixture();
    f.body = baseline.body;
    Object.assign(f.values, structuredClone(baseline.values));
    f.deps.readPlanAtCommit = async () => f.values.plan.content;
    const projectDir = freshUnitDir('2169-continuity-');
    const options = { subject, cfg, projectDir, deps: f.deps };
    const current = await collectDecompositionAuthority(options);
    assert.deepEqual(current.input, baseline.input);
    assert.equal(current.inputDigest, baseline.inputDigest);
    assert.equal(current.projection.status, 'current');
    assert.deepEqual(current.capabilities, baseline.capabilities);
    assert.equal(f.body, baseline.body);
    assert.equal((await refreshDecompositionProjection(options)).status, 'confirmed');
    const publicationBytes = (body) => body.match(/<!-- aitm-decomposition-publication[^\n]+/)[0];
    assert.equal(publicationBytes(f.body), publicationBytes(baseline.body));
    assert.deepEqual((await collectDecompositionAuthority(options)).input, baseline.input);
    const refreshedBody = f.body;
    const effect = {
      id: 'estimate',
      resource: 'project-estimate',
      targetIdentity: 'PVTI_a',
      value: f.values.project.estimate,
      read: async () => observed(f.values.project.estimate),
      apply: async () => {
        throw new Error('current retry cannot replay an effect');
      },
    };
    f.deps.readPublicationEffect = effect.read;
    const runtime = createDecompositionRuntime({ cfg, projectDir, deps: f.deps });
    assert.equal(
      (
        await publishEstimateRevision({
          ...baseline.publicationArgs,
          subject,
          effects: [effect],
          deps: {
            writerId: 'inflate-estimate',
            intendedInputDigest: baseline.inputDigest,
            runtime,
          },
        })
      ).status,
      'recorded'
    );
    assert.equal(f.body, refreshedBody);
  });

for (const [name, change] of [
  [
    'assessment',
    (f) => (f.body += '\n<!-- aitm-decomposition-assessment schema="1" payload="broken" -->'),
  ],
  [
    'publication',
    (f) => (f.body += '\n<!-- aitm-decomposition-publication schema="1" payload="broken" -->'),
  ],
])
  test('#2169 converted malformed ' + name + ' cannot be refreshed into authority', async () => {
    const f = convertedEpicFixture();
    change(f);
    const before = await collect(f);
    assert.equal(before.capabilities.includes('scoped-completion'), false);
    await assert.rejects(
      refreshDecompositionProjection({
        subject,
        cfg,
        projectDir: freshUnitDir('2169-malformed-'),
        deps: f.deps,
      }),
      /decomposition/
    );
    assert.equal(f.writes.length, 0);
  });
test('#2169 converted pending intent survives refresh and retains restrictions', async () => {
  const f = convertedEpicFixture();
  const before = await collect(f),
    pending = publication(before.inputDigest);
  f.body = replaceDecompositionRecords(f.body, {
    assessment: before.assessment,
    publication: pending,
  });
  const result = await refreshDecompositionProjection({
    subject,
    cfg,
    projectDir: freshUnitDir('2169-pending-'),
    deps: f.deps,
  });
  assert.equal(result.status, 'confirmed');
  const current = await collect(f);
  assert.deepEqual(current.publication, pending);
  assert.equal(current.assessment.status, 'pending');
  assert.equal(current.capabilities.includes('scoped-completion'), false);
});
test('#2169 converted refresh with failed exact readback is unconfirmed', async () => {
  const f = convertedEpicFixture();
  f.deps.readBackIssue = async () => observed({ number: 1987, body: 'wrong body' });
  const result = await refreshDecompositionProjection({
    subject,
    cfg,
    projectDir: freshUnitDir('2169-readback-'),
    deps: f.deps,
  });
  assert.equal(result.status, 'unconfirmed');
});
test('#2169 conversion fact drift during refresh cannot confirm the old input', async () => {
  const f = convertedEpicFixture(true);
  const fetchBody = f.deps.fetchBody;
  f.deps.fetchBody = async () => {
    f.values.project.children[0].rawTitle += ' ';
    return fetchBody();
  };
  await assert.rejects(
    refreshDecompositionProjection({
      subject,
      cfg,
      projectDir: freshUnitDir('2169-refresh-drift-'),
      deps: f.deps,
    }),
    /drift/
  );
  assert.equal(f.writes.length, 0);
});

function convertedEpicFixture(blocked = false) {
  const baseline = retainedK.cases['exact-title-epic'];
  const f = fixture();
  f.body = baseline.body;
  Object.assign(f.values, structuredClone(baseline.values));
  f.deps.readPlanAtCommit = async () => f.values.plan.content;
  const child = f.values.project.children[0];
  child.title = child.rawTitle = '🧑‍🧒‍🧒 [Epic] Retain WBS child';
  child.body += '\n## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->';
  child.nativeWbsIdentity = {
    repository: 'o/r',
    nodeId: 'CHILD',
    number: 2001,
    parent: { repository: 'o/r', nodeId: 'PARENT', number: 1987 },
  };
  if (blocked) child.hasCurrentRefinement = false;
  return f;
}
