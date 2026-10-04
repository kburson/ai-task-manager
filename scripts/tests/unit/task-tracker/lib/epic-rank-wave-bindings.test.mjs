// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyRankWaveBindings,
  validateRankWaveRefresh,
} from '../../../../task-tracker/lib/epic-rank-wave-bindings.mjs';
const parent = {
  issue: 107,
  worktree: '/clone/parent',
  branch: 'parent',
  commonDir: '/clone/.git',
  provider: 'codex',
  sessionId: 'parent-native',
  generation: 'parent-generation',
};
function binding(issue) {
  return {
    ...parent,
    issue,
    worktree: `/clone/${issue}`,
    branch: `child-${issue}`,
    sessionId: `native-${issue}`,
    generation: `generation-${issue}`,
  };
}
function fixture() {
  const bindings = [binding(140), binding(144)];
  const children = [
    { number: 140, boardState: 'develop' },
    { number: 144, boardState: 'ready-for-plan' },
  ];
  const observations = new Map(
    bindings.map((b) => [
      b.issue,
      {
        physical: { worktree: b.worktree, branch: b.branch, commonDir: b.commonDir },
        occupancy: {
          issue: b.issue,
          sid: b.sessionId,
          provider: b.provider,
          worktreePath: b.worktree,
          bindingGenerationId: b.generation,
        },
        active: {
          issue: `#${b.issue}`,
          worktreePath: b.worktree,
          worktreeBranch: b.branch,
          bindingGenerationId: b.generation,
        },
        native: { sessionId: b.sessionId, verified: true },
      },
    ])
  );
  return { bindings, children, observations };
}
async function check(f) {
  return verifyRankWaveBindings({
    ...f,
    parent,
    target: 144,
    observe: async (b) => f.observations.get(b.issue),
  });
}

test('distinct genuine live child generations admit; shared physical roots, branches, clone or identities refuse', async () => {
  assert.equal((await check(fixture())).ok, true);
  for (const key of ['worktree', 'branch', 'sessionId']) {
    const f = fixture();
    f.bindings[1][key] = f.bindings[0][key];
    assert.equal((await check(f)).ok, false, key);
  }
  for (const physical of [
    { worktree: '/clone/140' },
    { branch: 'HEAD' },
    { commonDir: '/other/.git' },
  ]) {
    const f = fixture();
    Object.assign(f.observations.get(144).physical, physical);
    assert.equal((await check(f)).ok, false, JSON.stringify(physical));
  }
  const f = fixture();
  f.bindings[0].sessionId = parent.sessionId;
  assert.equal((await check(f)).ok, false);
});

test('stale location sid, missing native proof, occupancy and active generation mismatch refuse', async () => {
  for (const alter of [
    (o) => (o.occupancy.sid = 'stale'),
    (o) => (o.native.verified = false),
    (o) => (o.active.bindingGenerationId = 'stale'),
    (o) => (o.occupancy = null),
    (o) => (o.active = null),
  ]) {
    const f = fixture();
    alter(f.observations.get(144));
    assert.equal((await check(f)).ok, false);
  }
});

test('completed peer retains frozen lineage without requiring worker occupancy', async () => {
  const f = fixture();
  Object.assign(f.children[0], {
    boardState: 'done',
    issueState: 'closed',
    closeReason: 'completed',
    recoveryPhase: null,
  });
  f.observations.get(140).occupancy = null;
  f.observations.get(140).active = null;
  assert.equal((await check(f)).ok, true);
  f.children[0].closeReason = 'not_planned';
  assert.equal((await check(f)).ok, false);
});

test('Test/Review parent supervision requires actual child handoff with old worker discharge', async () => {
  for (const state of ['test', 'review']) {
    const f = fixture();
    f.children[0].boardState = state;
    f.observations.get(140).occupancy = null;
    f.observations.get(140).active = null;
    f.observations.get(140).handoff = {
      verified: true,
      issue: 140,
      parentSessionId: parent.sessionId,
      oldGeneration: f.bindings[0].generation,
      workerDischarged: true,
    };
    assert.equal((await check(f)).ok, true, state);
    f.observations.get(140).handoff.workerDischarged = false;
    assert.equal((await check(f)).ok, false, state);
  }
});

test('refresh permits exactly one new generation after positive old-claim discharge and no scope drift', () => {
  const before = [binding(140), binding(144)];
  const after = structuredClone(before);
  after[1].generation = 'new-generation';
  after[1].sessionId = 'new-native';
  const discharge = {
    verified: true,
    issue: 144,
    oldGeneration: 'generation-144',
    oldSessionId: 'native-144',
    overlapping: false,
  };
  assert.equal(validateRankWaveRefresh({ before, after, discharge }).ok, true);
  for (const change of [
    () => (after[0].generation = 'also-new'),
    () => (after[1].worktree = '/elsewhere'),
    () => (discharge.verified = false),
    () => (discharge.overlapping = true),
  ]) {
    const b = structuredClone(after),
      d = structuredClone(discharge);
    change();
    assert.equal(validateRankWaveRefresh({ before, after, discharge }).ok, false);
    after.splice(0, after.length, ...b);
    Object.assign(discharge, d);
  }
});

test('default observation derives handoff only from real parent replacement claim and discharged worker binding', async () => {
  const { observeRankWaveBinding } =
    await import('../../../../task-tracker/lib/epic-rank-wave-bindings.mjs');
  const worker = binding(140),
    replacement = {
      issue: 140,
      sid: parent.sessionId,
      provider: parent.provider,
      worktreePath: worker.worktree,
      bindingGenerationId: 'supervision-generation',
    };
  const active = {
    issue: '#140',
    worktreePath: worker.worktree,
    worktreeBranch: worker.branch,
    bindingGenerationId: 'supervision-generation',
  };
  const ports = {
    physical: () => ({
      worktree: worker.worktree,
      branch: worker.branch,
      commonDir: worker.commonDir,
    }),
    rows: () => ({ 140: replacement }),
    active: (sid) => (sid === parent.sessionId ? active : null),
    native: async (b) => ({ verified: true, sessionId: b.sessionId }),
  };
  const observed = await observeRankWaveBinding(worker, {
    parent,
    child: { number: 140, boardState: 'test' },
    ports,
  });
  assert.equal(observed.handoff?.verified, true);
  ports.active = () => ({ ...active, bindingGenerationId: worker.generation });
  assert.equal(
    (
      await observeRankWaveBinding(worker, {
        parent,
        child: { number: 140, boardState: 'test' },
        ports,
      })
    ).handoff,
    undefined
  );
});

test('an idle Ready-for-Planning peer retains native lineage while the target and executing peers require live claims', async () => {
  const f = fixture();
  f.children[0].boardState = 'ready-for-plan';
  f.observations.get(140).active = null;
  f.observations.get(140).occupancy = null;
  assert.equal((await check(f)).ok, true);
  for (const phase of ['plan', 'develop']) {
    f.children[0].boardState = phase;
    assert.equal((await check(f)).ok, false, phase);
  }
  f.children[0].boardState = 'ready-for-plan';
  assert.equal(
    (
      await verifyRankWaveBindings({
        ...f,
        parent,
        target: 140,
        observe: async (b) => f.observations.get(b.issue),
      })
    ).ok,
    false
  );
});

test('Claude native transcript lookup uses its dotted-worktree project directory encoding', async () => {
  const { nativeRankWaveTranscript } =
    await import('../../../../task-tracker/lib/epic-rank-wave-bindings.mjs');
  const b = { ...binding(144), provider: 'claude', worktree: '/clone/.worktrees/child-144' };
  const file = nativeRankWaveTranscript(b, { home: '/fixture-home' });
  assert.equal(file, '/fixture-home/.claude/projects/-clone--worktrees-child-144/native-144.jsonl');
});
