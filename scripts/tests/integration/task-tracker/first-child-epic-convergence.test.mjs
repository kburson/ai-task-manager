// @story #2161 — native Git/session frame, actual public/canonical paths, provider I/O isolated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT_ALIASES } from '../../../task-tracker/lib/runtime-storage.mjs';
import { sessionIdEnvKeys } from '../../../task-tracker/lib/session-id.mjs';
import { setActiveTask, getActiveTask } from '../../../task-tracker/session-state.mjs';
import { stampBodyVersion, parseBodyVersion } from '../../../task-tracker/lib/body-version.mjs';
import {
  firstChildFixture,
  installFirstChildCli,
} from '../../fixtures/first-child-epic-provider.mjs';
import { EPIC_PREFIX } from '../../../gh/lib/kind-prefix.mjs';
import { collectHookDecompositionSnapshot } from '../../../task-tracker/lib/decomposition-hook-authority.mjs';

test('public CLI kind uses inherited fixture actor and retains its existing child', (t) => {
  const f = firstChildFixture(t),
    cli = installFirstChildCli(f),
    state = cli.read();
  state.issues[43] = state.childTemplate;
  state.issues[42].childNumbers = [43];
  cli.write(state);
  const result = cli.run(['kind', '42', 'epic']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const actual = cli.read();
  assert.deepEqual(actual.issues[42].childNumbers, [43]);
  assert.match(actual.issues[42].body, /aitm-issue-kind kind="epic"/);
  assert.equal(actual.issues[42].title, EPIC_PREFIX + 'Parent task');
});

test('public Start switches from another issue into restricted recovery before exact kind', (t) => {
  const f = firstChildFixture(t),
    cli = installFirstChildCli(f),
    state = cli.read();
  state.issues[43] = state.childTemplate;
  state.issues[42].childNumbers = [43];
  const other = structuredClone(state.issues[42]);
  other.id = 'OTHER';
  other.number = 99;
  other.childNumbers = [];
  other.url = 'https://example.invalid/o/r/issues/99';
  other.projectItems.nodes[0].id = 'OTHER_ITEM';
  other.projectItems.nodes[0].content = {
    id: 'OTHER',
    number: 99,
    title: other.title,
    url: other.url,
    __typename: 'Issue',
    repository: { nameWithOwner: 'o/r' },
  };
  state.issues[99] = other;
  cli.write(state);
  const sid = f.inheritedEnv.CODEX_THREAD_ID ?? f.inheritedEnv.CODEX_SESSION_ID;
  if (!sid) {
    t.skip('production-entry actor qualification requires an inherited native provider identity');
    return;
  }
  const nativeEnv = {
    AI_TASK_MANAGER_SESSION_ID: '',
    AI_TASK_MANAGER_APP_NAME: 'codex',
    ...Object.fromEntries(PROJECT_ROOT_ALIASES.map((key) => [key, ''])),
  };
  const initial = cli.run(['start', '99', '--role', 'agent'], nativeEnv);
  assert.equal(initial.status, 0, initial.stdout + initial.stderr);
  const started = cli.run(['start', '42', '--role', 'agent'], nativeEnv);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  const bound = getActiveTask(sid, f.root);
  assert.equal(bound.issue, '#42');
  assert.equal(bound.worktreePath, f.root);
  assert.equal(bound.worktreeBranch, 'codex/fixture');
  assert.ok(bound.bindingGenerationId);
  assert.ok(Number.isFinite(Date.parse(bound.entryStartTs)));
  assert.ok(!bound.closedAt && !bound.pausedAtTs);
  const resumeDecision = cli.run(['explain', '42', '--action', 'resume', '--json'], nativeEnv);
  assert.equal(resumeDecision.status, 0, resumeDecision.stdout + resumeDecision.stderr);
  const explanation = JSON.parse(resumeDecision.stdout);
  assert.equal(explanation.result.status, 'ready');
  assert.ok(
    explanation.result.warnings.some((warning) => warning.code === 'decomposition-bind-restricted'),
    resumeDecision.stdout
  );
  const implementDecision = cli.run(['explain', '42', '--action', 'promote', '--json'], nativeEnv);
  assert.notEqual(JSON.parse(implementDecision.stdout).result.status, 'ready');
  const recovered = cli.run(['kind', '42', 'epic'], nativeEnv);
  assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  const afterKind = getActiveTask(sid, f.root);
  assert.equal(afterKind.issue, bound.issue);
  assert.equal(afterKind.worktreePath, bound.worktreePath);
  assert.equal(afterKind.worktreeBranch, bound.worktreeBranch);
  assert.equal(afterKind.bindingGenerationId, bound.bindingGenerationId);
  assert.equal(afterKind.entryStartTs, bound.entryStartTs);
  assert.ok(!afterKind.closedAt && !afterKind.pausedAtTs);
  assert.deepEqual(cli.read().issues[42].childNumbers, [43]);
});

function splitFixture(t) {
  const f = firstChildFixture(t),
    cli = installFirstChildCli(f),
    state = cli.read();
  const plan =
    '# Fixture plan\n\n### Task 1: Preserve first-child history — 2h\n\n#### Story Intent\n\n- **Beneficiary:** task operator\n- **Capability:** preserve the first-child relationship\n- **Need:** interrupted conversion can lose progress\n- **Value or failure prevented:** duplicate children are avoided\n\n#### Implementation\n\nKeep the existing child identity.\n\n**Verification Commands:**\n\n```sh\nnode verify.mjs\n```\n';
  mkdirSync(path.join(f.root, 'docs'));
  writeFileSync(path.join(f.root, 'docs/plan.md'), plan);
  f.git('add', 'docs/plan.md');
  f.git('commit', '-qm', 'Fixture decomposition plan');
  state.issues[42].body = state.issues[42].body
    .replace(
      '## AITM Progress Markers',
      '## Plan Metadata\n- **Implementation-plan**: docs/plan.md\n- **Governing-spec**: docs/plan.md\n\n## AITM Progress Markers'
    )
    .replace('"estimate":4', '"estimate":25');
  cli.write(state);
  return { f, cli };
}

test('public split-plan drives real creator and tether subprocesses under the same fixture actor', (t) => {
  const { cli } = splitFixture(t);
  const result = cli.run(['split-plan', '42', '--confirm', '--json']);
  assert.equal(
    result.status,
    0,
    (JSON.parse(result.stdout).failed?.stderr ?? result.stdout) + result.stderr
  );
  const actual = cli.read();
  assert.deepEqual(Object.keys(actual.issues).sort(), ['42', '43']);
  assert.deepEqual(actual.issues[42].childNumbers, [43]);
  assert.match(actual.issues[42].body, /aitm-issue-kind kind="epic"/);
  assert.equal(actual.effects.filter((effect) => effect === 'create:43').length, 1);
});

for (const variant of ['foreign', 'stripped-default'])
  test('public creator refuses ' + variant + ' parent authority before any GitHub effect', (t) => {
    const { f, cli } = splitFixture(t);
    const prepared = cli.run(['split-plan', '42', '--dry-run', '--json']);
    assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
    const args = JSON.parse(prepared.stdout).proposals[0].creatorArgs;
    let overrides = {};
    if (variant === 'foreign') f.rebind({ issue: '99' });
    else {
      setActiveTask('default-session', f.binding, f.root);
      overrides = Object.fromEntries(sessionIdEnvKeys(cli.env).map((key) => [key, '']));
    }
    const refused = cli.run(args, overrides);
    assert.notEqual(refused.status, 0, refused.stdout + refused.stderr);
    assert.match(refused.stderr, /binding|provider-session-required/);
    assert.deepEqual(cli.read().effects, []);
    assert.deepEqual(Object.keys(cli.read().issues), ['42']);
  });

test('authority drift after legitimate create retains the created ID and stops before tether effects', (t) => {
  const { cli } = splitFixture(t),
    state = cli.read();
  state.driftAfterCreate = true;
  cli.write(state);
  const result = cli.run(['split-plan', '42', '--confirm', '--json']);
  assert.equal(result.status, 6, result.stdout + result.stderr);
  const outcome = JSON.parse(result.stdout),
    actual = cli.read();
  assert.equal(outcome.status, 'partial-success');
  assert.equal(outcome.createdChildren[0].issueNumber, 43);
  assert.deepEqual(actual.effects, ['create:43']);
  assert.deepEqual(actual.issues[42].childNumbers, []);
  assert.ok(actual.issues[43]);
});

for (const point of ['child-body-read', 'project-link', 'field-write'])
  test('tether rechecks parent authority after admission at ' + point, (t) => {
    const { cli } = splitFixture(t),
      state = cli.read();
    state.tetherDriftPoint = point;
    cli.write(state);
    const result = cli.run(['split-plan', '42', '--confirm', '--json']);
    assert.equal(result.status, 6, result.stdout + result.stderr);
    const outcome = JSON.parse(result.stdout),
      actual = cli.read();
    assert.equal(outcome.createdChildren[0].issueNumber, 43);
    assert.ok(Number.isInteger(actual.effectsAtDrift));
    assert.equal(actual.effects.length, actual.effectsAtDrift, JSON.stringify(actual.effects));
    assert.deepEqual(actual.issues[42].childNumbers, []);
  });

for (const stage of ['backlog', 'refine', 'plan', 'develop', 'test', 'review'])
  test(
    'public kind converts an existing unsized child parent at ' +
      stage +
      ' without a plan or stage pass',
    async (t) => {
      const f = firstChildFixture(t, stage);
      await assert.rejects(
        collectHookDecompositionSnapshot({
          issue: 42,
          cfg: f.cfg,
          projectDir: f.root,
          deps: f.deps,
        }),
        /non-epic child presence/
      );
      await f.kind();
      assert.match(f.node.body, /aitm-issue-kind kind="epic"/);
      assert.equal(f.node.title, EPIC_PREFIX + 'Parent task');
      assert.deepEqual(f.node.labels, ['bug', 'epic']);
      assert.deepEqual(
        f.node.subIssues.nodes.map((child) => child.number),
        [43]
      );
      assert.match(f.node.body, new RegExp('aitm-last-known-state state="' + stage + '"'));
      assert.doesNotMatch(
        f.node.body,
        /aitm-plan-approved|aitm-entered-|aitm-verification-receipt/
      );
      const count = f.writes.length;
      await f.kind();
      assert.equal(f.writes.length, count);
    }
  );

test('automatic post-link entry completes the same real canonical conversion', async (t) => {
  const f = firstChildFixture(t, 'backlog');
  await f.automatic();
  assert.equal(f.node.title, EPIC_PREFIX + 'Parent task');
  assert.deepEqual(
    f.node.subIssues.nodes.map((child) => child.number),
    [43]
  );
});

for (const drift of ['title', 'label', 'child', 'child-field', 'owner', 'generation', 'head'])
  test(
    'post-body ' + drift + ' drift refuses further effects and preserves the actual child',
    async (t) => {
      const f = firstChildFixture(t);
      f.afterEffect = (kind) => {
        if (kind !== 'body') return;
        if (drift === 'title') f.node.title = 'Concurrent title';
        if (drift === 'label') f.node.labels.push('concurrent');
        if (drift === 'child') f.child.id = 'CHANGED';
        if (drift === 'child-field') f.child.labels.nodes.push({ id: 'L', name: 'concurrent' });
        if (drift === 'owner') f.node.assignees.nodes = [{ login: 'other' }];
        if (drift === 'generation') f.rebind({ bindingGenerationId: 'changed' });
        if (drift === 'head') {
          f.git('commit', '--allow-empty', '-qm', 'Fixture concurrent source');
        }
      };
      await assert.rejects(f.kind());
      assert.deepEqual(f.writes, ['body']);
      assert.equal(f.node.subIssues.nodes[0].number, 43);
      if (drift === 'title') assert.equal(f.node.title, 'Concurrent title');
      if (drift === 'label') assert.ok(f.node.labels.includes('concurrent'));
    }
  );

for (const effect of ['body', 'visible'])
  test(
    'lost acknowledgement after ' +
      effect +
      ' retains partial state and retries without another child',
    async (t) => {
      const f = firstChildFixture(t);
      f.afterEffect = (kind) => {
        if (kind === effect) throw new Error('lost acknowledgement');
      };
      await assert.rejects(f.kind(), /lost acknowledgement/);
      f.afterEffect = null;
      await f.kind();
      assert.equal(f.node.title, EPIC_PREFIX + 'Parent task');
      assert.deepEqual(
        f.node.subIssues.nodes.map((child) => child.number),
        [43]
      );
      assert.equal(f.writes.filter((write) => write === 'body').length, 1);
    }
  );

test('wrong final visible readback refuses complete success', async (t) => {
  const f = firstChildFixture(t);
  f.afterEffect = (kind) => {
    if (kind === 'visible') f.node.labels = ['bug'];
  };
  await assert.rejects(f.kind(), /visible-drift|readback/);
  assert.deepEqual(
    f.node.subIssues.nodes.map((child) => child.number),
    [43]
  );
});

test('label order alone does not invalidate the fixed visible frame', async (t) => {
  const f = firstChildFixture(t);
  f.node.labels.push('feature');
  f.afterEffect = (kind) => {
    if (kind === 'body') f.node.labels.reverse();
  };
  await f.kind();
  assert.deepEqual([...f.node.labels].sort(), ['bug', 'epic', 'feature']);
});

for (const phase of ['pre-visible', 'final-success'])
  for (const change of ['title', 'label', 'body-version'])
    test(
      change +
        ' drift during ' +
        phase +
        ' source collection refuses before success or later effects',
      async (t) => {
        const f = firstChildFixture(t);
        const graphql = f.deps.graphql;
        let injected = false;
        f.deps.graphql = async (input) => {
          const visible = f.writes.includes('visible');
          if (
            !injected &&
            f.writes.includes('body') &&
            visible === (phase === 'final-success') &&
            input.query.includes('viewer') &&
            input.query.includes('comments(')
          ) {
            injected = true;
            if (change === 'title') f.node.title = 'Concurrent title';
            if (change === 'label') f.node.labels.push('concurrent');
            if (change === 'body-version')
              f.node.body = stampBodyVersion(f.node.body, parseBodyVersion(f.node.body) + 1);
          }
          return graphql(input);
        };
        await assert.rejects(f.kind(), /epic-convergence:/);
        assert.ok(injected);
        assert.deepEqual(f.writes, phase === 'pre-visible' ? ['body'] : ['body', 'visible']);
        if (change === 'title') assert.equal(f.node.title, 'Concurrent title');
        if (change === 'label') assert.ok(f.node.labels.includes('concurrent'));
      }
    );
