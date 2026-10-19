// @story #2037
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { evaluateSessionReadiness } from '../../../../task-tracker/lib/action-decision/session.mjs';
import { inspectBoundDecomposition } from '../../../../task-tracker/lib/action-decision/decomposition.mjs';
import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { observeRankWaveAdmission } from '../../../../task-tracker/lib/epic-rank-wave-admission.mjs';
import { planRefineWipGate } from '../../../../task-tracker/lib/epic-children-gate.mjs';
import { fixture, subject, freshUnitDir } from './decomposition-authority-fixtures.mjs';

function readiness(readIssueBody, actionId = 'bind') {
  return evaluateSessionReadiness({
    actionId,
    issue: 1987,
    stateBefore: { active: null, paused: false },
    config: { repo: 'o/r', preferences: { gateAssigneeMatch: false } },
    projectDir: '/controlled',
    invokingDir: '/controlled',
    deps: {
      readIssueBody,
      fetchAssignmentSnapshot: async () => ({ state: 'develop', assignees: [] }),
      readWorktreeIdentity: () => ({ worktreePath: '/controlled' }),
      resolveProjectDir: () => '/controlled',
      readOccupancy: () => ({}),
      findMainWorktreePath: () => '/controlled',
      currentSessionId: () => 'controlled',
      loadMigrationJournal: () => null,
      decomposition: {
        subject,
        runtime: {
          collect: async () => {
            throw new Error('Excluded read port');
          },
        },
      },
    },
  });
}

for (const action of ['bind', 'resume']) {
  test(`${action} reads one coherent body per invocation and refreshes on the next invocation`, async () => {
    let body = fixture().body;
    let reads = 0;
    const read = async () => {
      reads++;
      return body;
    };
    const first = await readiness(read, action);
    assert.equal(first.status, 'ready');
    assert.equal(reads, 1);
    const firstBody = first.observations.find((o) => o.resource === 'issue-body').value.body;
    body = body.replace('Collect current authority.', 'Observe newly changed authority.');
    const second = await readiness(read, action);
    assert.equal(second.status, 'ready');
    assert.equal(reads, 2);
    assert.notEqual(firstBody, body);
    assert.equal(second.observations.find((o) => o.resource === 'issue-body').value.body, body);
  });
}

test('a failed preliminary body read remains unavailable without a hidden same-attempt retry', async () => {
  let reads = 0;
  const result = await readiness(async () => {
    if (++reads === 1) throw new Error('Transport unavailable');
    return fixture().body;
  });
  assert.equal(result.status, 'indeterminate');
  assert.equal(reads, 1);
  assert.ok(result.blockers.some((b) => b.args.source === 'issue-body'));
});

test('malformed body authority stays indeterminate', async () => {
  const result = await readiness(async () => 'Stub only');
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.blockers.some((b) => b.args.source === 'issue-body'));
});

for (const mode of ['confirmed', 'unconfirmed', 'failed']) {
  test(`${mode} refresh retains its authority boundary without redundant confirmed collection`, async () => {
    const f = fixture();
    const dir = freshUnitDir('read-dedup-');
    const runtime = createDecompositionRuntime({
      cfg: { repo: 'o/r', projectId: 'PVT_a' },
      projectDir: dir,
      deps: f.deps,
    });
    if (mode === 'unconfirmed')
      f.deps.readBackIssue = async () => {
        throw new Error('Readback failed');
      };
    let collects = 0;
    try {
      const result = await inspectBoundDecomposition(
        {
          decomposition: {
            subject,
            runtime: {
              refresh:
                mode === 'failed'
                  ? async () => {
                      throw new Error('Refresh failed');
                    }
                  : (...args) => runtime.refresh(...args),
              collect: (...args) => {
                collects++;
                return runtime.collect(...args);
              },
            },
          },
        },
        subject.issue
      );
      assert.equal(result.status, 'bound');
      assert.equal(collects, mode === 'confirmed' ? 0 : 1);
      assert.equal(
        result.decomposition.capabilities.includes('scoped-implementation'),
        mode === 'confirmed'
      );
      assert.equal(Object.hasOwn(result.decomposition, 'status'), false);
      if (mode === 'confirmed') {
        assert.equal(result.decomposition.projection.status, 'current');
        assert.ok(
          f.writes.length > 0,
          'the real refresh must still write and confirm its projection'
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('a malformed confirmed refresh cannot grant scoped implementation', async () => {
  const result = await inspectBoundDecomposition(
    {
      decomposition: { subject, runtime: { refresh: async () => ({ status: 'confirmed' }) } },
    },
    subject.issue
  );
  assert.equal(result.decomposition.assessment.status, 'indeterminate');
  assert.equal(result.decomposition.capabilities.includes('scoped-implementation'), false);
});

function child(number = 140, boardState = 'ready-for-plan') {
  return {
    number,
    rank: 2,
    state: boardState,
    boardState,
    issueState: 'open',
    hasCurrentRefinement: true,
    blockedBy: [],
    dependencyStates: new Map(),
    dependencyReadiness: 'ready',
  };
}

test('rank discovery and real legacy inspection share one initial snapshot per invocation', async () => {
  let reads = 0;
  const runtime = {
    readSnapshot: async () => {
      reads++;
      return { body: '', children: [child()] };
    },
    listRecords: async () => [],
  };
  const run = () =>
    observeRankWaveAdmission({
      cfg: { repo: 'o/r' },
      parentEpicNumber: 107,
      issueNumber: 140,
      projectDir: '/controlled',
      deps: { rankWaveRuntime: runtime },
    });
  assert.equal((await run()).legacy, true);
  assert.equal(reads, 1);
  assert.equal((await run()).legacy, true);
  assert.equal(reads, 2);
});

for (const secondOptions of [undefined, { includeBindings: false }]) {
  test(`snapshot handoff is consumed once and preserves subsequent ${JSON.stringify(secondOptions)} reads`, async () => {
    let reads = 0;
    const runtime = {
      readSnapshot: async () => ({ body: '', children: [{ ...child(), version: ++reads }] }),
    };
    const result = await observeRankWaveAdmission({
      cfg: { repo: 'o/r' },
      parentEpicNumber: 107,
      issueNumber: 140,
      projectDir: '/controlled',
      deps: {
        rankWaveRuntime: runtime,
        inspectRankWavePublication: async ({ runtime: view, epic, rank }) => {
          const initial = await view.readSnapshot(epic, rank, { includeBindings: false });
          assert.equal(initial.children[0].version, 1);
          const fresh = await view.readSnapshot(epic, rank, secondOptions);
          return { status: 'legacy', snapshot: fresh };
        },
      },
    });
    assert.equal(reads, 2);
    assert.equal(result.children[0].version, 2);
  });
}

test('legacy WIP reuses observed children and sees new sibling occupancy on a new invocation', async () => {
  let reads = 0;
  let children = [child()];
  const fetchChildren = async () => {
    reads++;
    return children;
  };
  const runtime = {
    readSnapshot: async () => ({ body: '', children: await fetchChildren() }),
    listRecords: async () => [],
  };
  const run = () =>
    planRefineWipGate({
      cfg: { repo: 'o/r' },
      issueNumber: 140,
      toState: 'plan',
      projectDir: '/controlled',
      deps: {
        fetchParentIssue: async () => 107,
        rankWaveRuntime: runtime,
        fetchSiblings: fetchChildren,
        observeDependencyReadiness: async () => {
          throw new Error('Complete evidence must be reused');
        },
      },
    });
  assert.equal((await run()).ok, true);
  assert.equal(reads, 1);
  children = [child(), child(144, 'develop')];
  const next = await run();
  assert.equal(next.ok, true);
  assert.equal(next.warnings[0].code, 'epic-wip-capacity-exceeded');
  assert.equal(next.warnings[0].args.activeIssues, '#144');
  assert.equal(reads, 2);
});

test('legacy reuse still enriches missing dependency evidence and preserves the active-sibling warning', async () => {
  let dependencyReads = 0;
  const children = [
    { ...child(), blockedBy: null, dependencyReadiness: 'unknown' },
    child(144, 'develop'),
  ];
  const result = await planRefineWipGate({
    cfg: { repo: 'o/r' },
    issueNumber: 140,
    toState: 'plan',
    projectDir: '/controlled',
    deps: {
      fetchParentIssue: async () => 107,
      rankWaveRuntime: {
        readSnapshot: async () => ({ body: '', children }),
        listRecords: async () => [],
      },
      fetchSiblings: async () => children,
      observeDependencyReadiness: async () => {
        dependencyReads++;
        return { blockedBy: null, states: new Map(), status: 'unknown' };
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings[0].code, 'epic-wip-capacity-exceeded');
  assert.equal(dependencyReads, 1);
});
