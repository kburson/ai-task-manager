// @story #54 #1211 #1714
// Integration smoke test: a fixture epic with sub-issues across two waves runs
// through the canonical 8-state lifecycle (Backlog → Refine → Ready for
// Planning → Plan → Develop → Test → Review → Done). Wave-admission
// and cascade-grooming gates are
// driven via the pure helpers in scripts/gh/lib/wave-admission.mjs and
// scripts/task-tracker/lib/body-gates.mjs against an in-memory project state —
// no live `gh` invocations.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { admit } from '../../../../../gh/lib/wave-admission.mjs';
import {
  checkCascadeGrooming,
  checkWaveAdmission,
} from '../../../../../task-tracker/lib/body-gates.mjs';
import '../../../../../task-tracker/lib/guard-bootstrap.mjs';
import { runGuards } from '../../../../../task-tracker/lib/guard-registry.mjs';
import { stateIds } from '../../../../../task-tracker/lib/lifecycle-policy/index.mjs';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import { resolveStoryIntentSource } from '../../../../../task-tracker/lib/story-intent-source.mjs';
import { stampRefinementSnapshot } from '../../../../../task-tracker/lib/refinement-snapshot.mjs';
import { CANONICAL_USER_STORY_TEMPLATE } from '../../../../../task-tracker/lib/user-story-author.mjs';
import { runPlanApprove } from '../../../../../task-tracker/verbs/plan-approve.mjs';

const STATES = [...stateIds()];

function makeProject() {
  const issues = new Map();
  return {
    add(n, { status = 'backlog', rank = null, parent = null } = {}) {
      issues.set(n, { number: n, status, rank, parent, children: [] });
      if (parent != null) issues.get(parent).children.push(n);
    },
    move(n, target) {
      assert.ok(STATES.includes(target), `unknown target ${target}`);
      issues.get(n).status = target;
    },
    setRank(n, s) {
      issues.get(n).rank = s;
    },
    read(n) {
      return issues.get(n);
    },
    childrenOf(parent) {
      return issues.get(parent).children.map((c) => issues.get(c));
    },
    fetchSiblings({ parentEpicNumber }) {
      return issues
        .get(parentEpicNumber)
        .children.map((c) => issues.get(c))
        .map((c) => ({ number: c.number, rank: c.rank, state: c.status }));
    },
    fetchSubIssueStates({ epicNumber }) {
      return issues
        .get(epicNumber)
        .children.map((c) => issues.get(c))
        .map((c) => ({ number: c.number, state: c.status }));
    },
  };
}

async function admitFor(proj, child) {
  return admit({
    parentEpicNumber: child.parent,
    rank: child.rank,
    repo: 'x/y',
    projectId: 'p',
    fetchSiblings: proj.fetchSiblings,
  });
}

async function cascadeFor(proj, epicNumber) {
  return checkCascadeGrooming({
    isEpic: true,
    epicNumber,
    repo: 'x/y',
    projectId: 'p',
    fetchSubIssueStates: proj.fetchSubIssueStates,
  });
}

async function guardedMove(project, number, target, ctx) {
  const before = project.read(number).status;
  const result = await runGuards(before, target, {
    ...ctx,
    issueNumber: number,
    fromState: before,
    toState: target,
  });
  if (result.ok) project.move(number, target);
  else assert.equal(project.read(number).status, before);
  return result;
}

function assertStoryRefusal(result, code) {
  assert.equal(result.ok, false);
  assert.ok(
    result.refusals.some(
      (refusal) =>
        refusal.id === 'plan-exit-story-approval-binding' && refusal.reason.includes(code)
    ),
    JSON.stringify(result.refusals)
  );
}

// -----------------------------------------------------------------------
// Test 1: epic + 2 waves through full 8-state flow.
// -----------------------------------------------------------------------
async function testFullFlow() {
  const p = makeProject();
  p.add(100, { status: 'refine' });
  p.add(101, { rank: 1, parent: 100 });
  p.add(102, { rank: 1, parent: 100 });
  p.add(103, { rank: 2, parent: 100 });
  p.add(104, { rank: 2, parent: 100 });

  // Cascade-grooming refuses while sub-issues are still in Backlog.
  let refusals = await cascadeFor(p, 100);
  assert.equal(refusals.length, 4, 'all 4 sub-issues should block cascade-grooming');

  for (const n of [101, 102, 103, 104]) {
    p.move(n, 'refine');
    p.move(n, 'ready-for-plan');
  }
  refusals = await cascadeFor(p, 100);
  assert.equal(refusals.length, 0, 'cascade-grooming clears once all sub-issues are groom+');

  // Epic moves through Ready for Planning → Plan → Develop.
  p.move(100, 'ready-for-plan');
  p.move(100, 'plan');
  p.move(100, 'develop');

  // Wave-1 (Rank=1) admission: S1 and S2 are admitted.
  for (const n of [101, 102]) {
    const r = await admitFor(p, p.read(n));
    assert.equal(r.ok, true, `wave-1 sub-issue #${n} should be admitted`);
  }

  // Wave-2 (Rank=2) admission: blocked while wave-1 is in flight.
  p.move(101, 'plan');
  p.move(102, 'plan');
  for (const n of [103, 104]) {
    const r = await admitFor(p, p.read(n));
    assert.equal(r.ok, false, `wave-2 sub-issue #${n} must be blocked while wave-1 is in flight`);
    assert.ok(r.blockers.length >= 1);
  }

  // Run S1 to Done independently of S2.
  for (const target of ['develop', 'test', 'review', 'done']) p.move(101, target);
  // S2 still in flight → wave-2 still blocked.
  let r = await admitFor(p, p.read(103));
  assert.equal(r.ok, false, 'wave-2 still blocked while S2 is in flight');

  // Finish S2.
  for (const target of ['develop', 'test', 'review', 'done']) p.move(102, target);

  // Wave-2 now admits.
  for (const n of [103, 104]) {
    const r2 = await admitFor(p, p.read(n));
    assert.equal(r2.ok, true, `wave-2 sub-issue #${n} should admit once wave-1 is Done`);
  }
}

// -----------------------------------------------------------------------
// Test 2: same-wave newcomer rule.
// A discovered sub-issue inserted at Rank=1 mid-flight does NOT halt
// already-flowing wave-1 members, but DOES extend wave-2 admission.
// -----------------------------------------------------------------------
async function testSameWaveNewcomer() {
  const p = makeProject();
  p.add(200, { status: 'develop' });
  p.add(201, { rank: 1, parent: 200, status: 'develop' });
  p.add(202, { rank: 1, parent: 200, status: 'review' });
  p.add(203, { rank: 2, parent: 200, status: 'backlog' });

  // Newcomer S5 joins wave-1 mid-flight.
  p.add(205, { rank: 1, parent: 200, status: 'plan' });

  // Existing wave-1 members are NOT blocked by the newcomer (same-wave rule).
  for (const n of [201, 202]) {
    const r = await admitFor(p, p.read(n));
    assert.equal(r.ok, true, `existing wave-1 member #${n} must not be halted by newcomer`);
  }

  // Newcomer itself: admitted (its own wave is wave-1; nothing earlier).
  const newcomer = await admitFor(p, p.read(205));
  assert.equal(newcomer.ok, true, 'newcomer at lowest wave admits');

  // Wave-2 admission: must wait for newcomer too.
  // Drive S1 + S2 to Done.
  p.move(201, 'test');
  p.move(201, 'review');
  p.move(201, 'done');
  p.move(202, 'done');

  // Newcomer still in analyze → wave-2 stays blocked.
  let r = await admitFor(p, p.read(203));
  assert.equal(r.ok, false, 'wave-2 blocked while newcomer not yet Done');

  // Drive newcomer to Done; wave-2 now admits.
  for (const target of ['develop', 'test', 'review', 'done']) p.move(205, target);
  r = await admitFor(p, p.read(203));
  assert.equal(r.ok, true, 'wave-2 admits once newcomer reaches Done');
}

// -----------------------------------------------------------------------
// Test 3: solo issue with no parent — wave-admission and cascade-grooming
// gates do NOT fire.
// -----------------------------------------------------------------------
async function testSoloIssue() {
  const p = makeProject();
  p.add(300, { status: 'backlog' }); // solo, no parent

  const child = p.read(300);
  const r = await admit({
    parentEpicNumber: child.parent, // null
    rank: child.rank,
    fetchSiblings: () => {
      throw new Error('solo must not call fetchSiblings');
    },
  });
  assert.equal(r.ok, true, 'solo issue admits without invoking fetchSiblings');

  const cascade = await checkWaveAdmission({
    parentEpicNumber: null,
    rank: null,
    admit: () => {
      throw new Error('solo must not call admit');
    },
  });
  assert.deepEqual(cascade, [], 'checkWaveAdmission solo bypass returns []');

  // Drive solo through the canonical early-state chain without any gate firing.
  p.move(300, 'refine');
  p.move(300, 'ready-for-plan');
  p.move(300, 'plan');
  assert.equal(p.read(300).status, 'plan');
}

const STORY = [
  'As a release operator',
  'I want to stop partial publication because registry checks can fail',
  'So that consumers receive complete releases',
].join('\n');
const INTENT = [
  '- **Beneficiary:** release operator',
  '- **Capability:** stop partial publication',
  '- **Need:** registry checks can fail',
  '- **Value or failure prevented:** consumers receive complete releases',
].join('\n');
const TRUNK_SHA = 'a'.repeat(40);
const CFG = {
  repo: 'owner/name',
  projectId: 'PVT_TEST',
  gateAnalysisToDevelopment: true,
  fieldIds: {
    priority: 'F_priority',
    size: 'F_size',
    estimate: 'F_estimate',
    rank: 'F_rank',
    startTime: 'F_startTime',
  },
};

function makeRefineDeps(body, fields, labels) {
  return {
    loadProjectFieldDefs: () => ({
      priority: { type: 'singleSelect', id: 'F_priority' },
      size: { type: 'singleSelect', id: 'F_size' },
      estimate: { type: 'number', id: 'F_estimate' },
      rank: { type: 'number', id: 'F_rank' },
      startTime: { type: 'text', id: 'F_startTime' },
    }),
    projectValuesForIssue: async () => ({ ...fields, startTime: '2026-09-19 00:00 -0500' }),
    fetchLabels: async () => labels,
    fetchBody: async () => body,
  };
}

function earlyBody(story) {
  const fields = { priority: 'P2', size: 'M', estimate: 4, rank: 1 };
  const labels = ['backend'];
  const body = stampRefinementSnapshot(
    [
      '<!-- aitm-entered-backlog ts="2026-09-19T00:00:00Z" -->',
      '<!-- aitm-entered-refine ts="2026-09-19T00:01:00Z" -->',
      '<!-- aitm-entered-ready-for-plan ts="2026-09-19T00:02:00Z" -->',
      '<!-- aitm-refine-complete ts="2026-09-19T00:02:00Z" -->',
      '<!-- aitm-refinement-rationale: {"size":"M","estimate":"4","priority":"P2","rationale":"test"} -->',
      story,
      '## Scope\n\nWell-formed intake awaiting Plan-stage value review.',
      '## Story Origin\n\n- **kind**: code',
      '## Plan Metadata\n',
      '## Acceptance Criteria\n\n- [ ] Works <!-- aitm-non-demonstrable -->',
      '## Pickup Directive — MANDATORY, DO NOT SKIP\n\n> Follow: `.ai-task-manager/templates/pickup-directive.md`',
      `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: fields })} -->`,
    ].join('\n\n'),
    { labels }
  );
  return { body, fields, labels };
}

async function testOptionalEarlyIntakeUsesProductionGuards() {
  for (const story of [
    '',
    '## User Story\n',
    `## User Story\n\n${CANONICAL_USER_STORY_TEMPLATE}`,
  ]) {
    const project = makeProject();
    const number = 400 + story.length;
    project.add(number);
    const fixture = earlyBody(story);
    const refineDeps = makeRefineDeps(fixture.body, fixture.fields, fixture.labels);
    const ctx = {
      cfg: CFG,
      body: fixture.body,
      readDependencies: async () => ({ blockedBy: [] }),
      reconcileDisposition: async () => ({ status: 'idempotent', disposition: '' }),
      fetchBlockerState: async () => null,
      deps: {
        fetchParentIssue: async () => null,
        readParentStatus: async () => null,
        epicChildren: { fetchSiblings: async () => [] },
        refinementEstimate: refineDeps,
        refineToPlanGateDeps: refineDeps,
        refinementSnapshot: {
          fetchLabels: async () => fixture.labels,
          fetchBoardFields: async () => fixture.fields,
        },
      },
    };
    for (const target of ['refine', 'ready-for-plan', 'plan']) {
      const result = await guardedMove(project, number, target, ctx);
      assert.equal(result.ok, true, `${target}: ${JSON.stringify(result.refusals)}`);
    }
  }
}

function approvalBody({ source = 'deep-dive' } = {}) {
  const planMetadata = [
    '## Plan Metadata',
    '- **Planning-note**: lifecycle adoption fixture',
    ...(source === 'linked-plan' || source === 'linked-plan-task'
      ? ['- **Source-plan**: plan.md']
      : []),
    ...(source === 'linked-plan-task'
      ? ['- **Source-plan-section**: ### Task 1: Release safely']
      : []),
  ].join('\n');
  return [
    '## User Story',
    STORY,
    '## Scope',
    'Verify the production-composed Plan approval and exit contract.',
    '<!-- aitm-entered-backlog ts="2026-09-19T00:00:00Z" -->',
    '<!-- aitm-entered-refine ts="2026-09-19T00:01:00Z" -->',
    '<!-- aitm-entered-ready-for-plan ts="2026-09-19T00:02:00Z" -->',
    '<!-- aitm-entered-plan ts="2026-09-19T00:03:00Z" -->',
    '## Story Origin',
    '- **kind**: code',
    planMetadata,
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '> Follow: `.ai-task-manager/templates/pickup-directive.md`',
    '<!-- aitm-deep-dive-posted ts="2026-09-19T00:03:00Z" -->',
    '<!-- aitm-deep-dive-complete ts="2026-09-19T00:04:00Z" -->',
    '## Deep-Dive Analysis',
    '### Story Intent',
    INTENT,
    '### Analysis',
    ...Array.from(
      { length: 18 },
      (_, index) =>
        `Line ${index + 1}: substantive lifecycle analysis covers approval authority, repair evidence, compatibility boundaries, and verification outcomes for operators.`
    ),
    '## Verification Commands',
    '- [ ] `npm test`',
    `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: 'XS' } })} -->`,
  ].join('\n\n');
}

function planText() {
  return [
    '## Story Intent',
    INTENT,
    '## Tasks',
    '### Task 1: Release safely',
    '#### Story Intent',
    INTENT,
    '### Task 2: Audit publication',
    '#### Story Intent',
    INTENT.replaceAll('release operator', 'security auditor'),
  ].join('\n\n');
}

function approvalHarness(initialBody) {
  let body = initialBody;
  const calls = { writes: 0, comments: 0 };
  return {
    calls,
    getBody: () => body,
    deps: {
      fetchEpicChildren: async () => [],
      fetchIssueBody: async () => body,
      mutateIssueBody: async ({ mutate, validateFreshBase }) => {
        const before = body;
        const next = mutate(before);
        validateFreshBase?.(before, next);
        if (next !== before) calls.writes += 1;
        body = next;
        return { status: next === before ? 'no-op' : 'ok', attempts: 1, body };
      },
      getBoardState: async () => 'plan',
      nowIso: () => '2026-09-19T00:05:00Z',
      resolveTrunkSha: async () => TRUNK_SHA,
      listComments: async () => [],
      postComment: async () => {
        calls.comments += 1;
      },
    },
  };
}

function planExitContext({ body, projectDir, issueNumber }) {
  return {
    issueNumber,
    cfg: CFG,
    body,
    projectDir,
    readDependencies: async () => ({ blockedBy: [] }),
    reconcileDisposition: async () => ({ status: 'idempotent', disposition: '' }),
    fetchBlockerState: async () => null,
    deps: {
      resolveStoryIntent: resolveStoryIntentSource,
      resolveTrunkSha: async () => TRUNK_SHA,
      fetchParentIssue: async () => null,
      readParentStatus: async () => null,
      epicChildren: { fetchSiblings: async () => [] },
      decomposition: {
        projectDir,
        loadProjectFieldDefs: () => [],
        projectValuesForIssue: async () => ({ size: 'XS', estimate: 4 }),
      },
      ownership: {
        fetchCurrentUser: async () => 'operator',
        fetchSnapshot: async () => ({ state: 'plan', assignees: ['operator'] }),
      },
      plannedEstimate: {
        listComments: async () => [
          {
            body: [
              '### 🛠 Refine estimate',
              `<!-- aitm-refined-estimate: ${issueNumber} -->`,
              '### Planned Estimate',
              '| Field | Refine | Plan | Δ |',
              '|---|---|---|---|',
              '| Size | XS | XS | 0 |',
              '| Estimate (h) | 4 | 4 | 0 |',
            ].join('\n'),
          },
        ],
      },
    },
  };
}

async function approveAndGuard({ source, projectDir, issueNumber }) {
  const harness = approvalHarness(approvalBody({ source }));
  const approved = await runPlanApprove({ issueNumber, cfg: CFG, projectDir, deps: harness.deps });
  assert.equal(approved.status, 'approved', JSON.stringify(approved));
  const project = makeProject();
  project.add(issueNumber, { status: 'plan' });
  const result = await guardedMove(
    project,
    issueNumber,
    'develop',
    planExitContext({ body: harness.getBody(), projectDir, issueNumber })
  );
  assert.equal(result.ok, true, JSON.stringify(result.refusals));
  return { harness, result };
}

async function testApprovalCompositionAndFreshness() {
  const projectDir = mkdtempSync(
    path.join(projectScratchDir('test', process.cwd()), 'aitm-story-lifecycle-')
  );
  try {
    writeFileSync(path.join(projectDir, 'plan.md'), planText());
    for (const [index, source] of ['deep-dive', 'linked-plan', 'linked-plan-task'].entries()) {
      await approveAndGuard({ source, projectDir, issueNumber: 500 + index });
    }

    for (const invalidBody of [
      approvalBody().replace(STORY, CANONICAL_USER_STORY_TEMPLATE),
      approvalBody().replace(`### Story Intent\n\n${INTENT}\n\n`, ''),
    ]) {
      const harness = approvalHarness(invalidBody);
      const result = await runPlanApprove({
        issueNumber: 510,
        cfg: CFG,
        projectDir,
        deps: harness.deps,
      });
      assert.equal(result.status, 'story-approval-binding-invalid');
      assert.equal(harness.calls.writes, 0);
      assert.equal(harness.calls.comments, 0);
    }

    const { harness } = await approveAndGuard({
      source: 'linked-plan-task',
      projectDir,
      issueNumber: 520,
    });
    const approvedBody = harness.getBody();
    assertStoryRefusal(
      await runGuards(
        'plan',
        'develop',
        planExitContext({
          body: approvedBody.replace('As a release operator', 'As a registry operator'),
          projectDir,
          issueNumber: 520,
        })
      ),
      'story-approval-stale-story'
    );

    writeFileSync(
      path.join(projectDir, 'plan.md'),
      readFileSync(path.join(projectDir, 'plan.md'), 'utf8').replaceAll(
        'registry checks can fail',
        'registry validation can fail'
      )
    );
    assertStoryRefusal(
      await runGuards(
        'plan',
        'develop',
        planExitContext({ body: approvedBody, projectDir, issueNumber: 520 })
      ),
      'story-approval-stale-intent'
    );
    const renewed = await runPlanApprove({
      issueNumber: 520,
      cfg: CFG,
      projectDir,
      deps: harness.deps,
    });
    assert.equal(renewed.status, 'repaired-story-binding');
    const recovered = await runGuards(
      'plan',
      'develop',
      planExitContext({ body: harness.getBody(), projectDir, issueNumber: 520 })
    );
    assert.equal(recovered.ok, true, JSON.stringify(recovered.refusals));
    writeFileSync(path.join(projectDir, 'plan.md'), planText());

    const deepDiveFallback = approvedBody
      .replace('- **Source-plan**: plan.md\n', '')
      .replace('- **Source-plan-section**: ### Task 1: Release safely\n', '');
    assertStoryRefusal(
      await runGuards(
        'plan',
        'develop',
        planExitContext({ body: deepDiveFallback, projectDir, issueNumber: 520 })
      ),
      'story-approval-stale-source'
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// -----------------------------------------------------------------------
async function main() {
  await testFullFlow();
  await testSameWaveNewcomer();
  await testSoloIssue();
  await testOptionalEarlyIntakeUsesProductionGuards();
  await testApprovalCompositionAndFreshness();
  console.log('eight-state-flow integration: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
