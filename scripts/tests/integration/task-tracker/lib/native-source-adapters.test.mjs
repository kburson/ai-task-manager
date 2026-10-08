// @story #1855
// cspell:words untimed
import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { pexec } from '../../../../gh/lib/gh-client.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
import { readCurrentMemoryPlanApproval } from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import { validateGovernedLinkedPlan } from '../../../../task-tracker/lib/governed-plan-policy.mjs';
import { resolveStoryIntentSource } from '../../../../task-tracker/lib/story-intent-source.mjs';
import { planSourceBindings } from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { fixture, approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { runUserStory } from '../../../../task-tracker/verbs/user-story.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { before, after } from 'node:test';

const originalFixtureSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const originalFixtureApp = process.env.AI_TASK_MANAGER_APP_NAME;
before(() => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-native-source-adapters';
  process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
  assert.equal(currentSessionId(), 'fixture-native-source-adapters');
  assert.match(currentSessionId(), /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
});
after(() => {
  if (originalFixtureSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = originalFixtureSid;
  if (originalFixtureApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = originalFixtureApp;
});

const story = {
  asA: 'release operator',
  iWant: 'stop partial publication because registry checks can fail',
  soThat: 'consumers receive complete validated releases',
};
for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`public user-story ${state} authority refuses before injected mutation or advisory callbacks`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await fixture(state, { worktree: s.context.sourceRoot });
      if (state === 'malformed')
        backend.addComment({
          id: 'bad',
          body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
        });
      const effects = [];
      await assert.rejects(
        runUserStory({
          target: context.issue,
          story,
          cfg: { repo: context.repository },
          projectDir: s.context.sourceRoot,
          deps: {
            revisionBackend: backend,
            mutateIssueBody: async () => {
              effects.push('mutate');
              return { status: 'ok' };
            },
            readIssueState: async () => {
              effects.push('state');
              return 'develop';
            },
          },
        })
      );
      assert.deepEqual(effects, []);
    } finally {
      s.dispose();
    }
  });
}

test('actual governed user-story correction uses native prose/source resolvers and retires source-bound proof before new Plan approval', async () => {
  const s = createSandbox();
  try {
    let { backend, context } = await approvedFixture({
      worktree: s.context.sourceRoot,
      branch: 'trunk',
      sessionId: currentSessionId(),
    });
    setActiveTask(
      currentSessionId(),
      {
        issue: `#${context.issue}`,
        entryStartTs: new Date().toISOString(),
        worktreePath: s.context.sourceRoot,
        worktreeBranch: 'trunk',
        kanbanState: 'develop',
      },
      s.context.sourceRoot
    );
    const original = await observeRevision({ context, deps: backend });
    let pushes = 0;
    const writeDeps = {
      revisionBackend: backend,
      fetchBody: async () => backend.observation.body.bytes,
      pushBody: async (_repo, _issue, body) => {
        pushes++;
        const next = backend.observation;
        next.body = { bytes: body, version: parseBodyVersion(body) };
        const plan = validateGovernedLinkedPlan({ body, projectDir: s.context.sourceRoot });
        const resolved = resolveStoryIntentSource({
          body,
          projectDir: s.context.sourceRoot,
          governedPlan: plan,
        });
        assert.ok(plan.ok && resolved.ok);
        const bindings = planSourceBindings(resolved, plan);
        next.protectedSourceBindings = [
          ...next.protectedSourceBindings.filter(
            (b) => !bindings.some((x) => x.identity === b.identity)
          ),
          ...bindings,
        ];
        backend.replaceAuthority(next);
        backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
      },
    };
    // Preserve the original injected-wrapper RED as a negative: an arbitrary
    // public mutation callback cannot issue native source authority.
    await assert.rejects(
      runUserStory({
        target: context.issue,
        story,
        cfg: { repo: context.repository },
        projectDir: s.context.sourceRoot,
        deps: {
          revisionBackend: backend,
          mutateIssueBody: (args) => mutateIssueBody({ ...args, deps: writeDeps }),
        },
      }),
      (error) => error.code === 'criteria-revision-required'
    );
    assert.equal(pushes, 0);
    let advisoryCalls = 0;
    const result = await runUserStory({
      target: context.issue,
      story,
      cfg: { repo: context.repository },
      projectDir: s.context.sourceRoot,
      deps: {
        revisionBackend: backend,
        writeDeps,
        readIssueState: async () => {
          advisoryCalls++;
          return 'develop';
        },
      },
    });
    assert.equal(
      advisoryCalls,
      0,
      'source checks do not grant caller advisory callbacks mutation authority'
    );
    assert.equal(result.status, 'written');
    assert.equal(pushes, 1);
    const current = await observeRevision({ context, deps: backend });
    assert.equal(current.status, 'applied');
    assert.deepEqual(current.effectiveProposal, original.effectiveProposal);
    assert.deepEqual(
      current.currentContract.definitions.map((d) => d.identity),
      original.effectiveProposal.after.definitions.map((d) => d.identity)
    );
    assert.notEqual(
      current.currentContract.semanticContractDigest,
      original.effectiveProposal.after.semanticContractDigest
    );
    assert.ok(current.currentContract.definitions.every((d) => !d.checked && !d.proof));
    assert.equal(current.nativeHistoryApproved, false);
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal((await observeRevision({ context, deps: backend })).status, 'applied');
    assert.equal(await readCurrentMemoryPlanApproval({ backend, context }), null);
    const correctedStory = {
      ...story,
      soThat: 'consumers receive complete validated release artifacts',
    };
    const invoke = () =>
      runUserStory({
        target: context.issue,
        story: correctedStory,
        cfg: { repo: context.repository },
        projectDir: s.context.sourceRoot,
        deps: { revisionBackend: backend, writeDeps },
      });
    const staleCorrection = await invoke();
    assert.equal(
      staleCorrection.status,
      'written',
      'another genuine source correction remains available while approval is stale'
    );
    assert.equal(pushes, 2);
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const repeated = await invoke();
    assert.equal(repeated.status, 'no-op');
    assert.equal(repeated.target, context.issue);
    assert.equal(pushes, 2);
    const finalContract = (await observeRevision({ context, deps: backend })).currentContract;
    const approved = await runPlanApprove({
      issueNumber: context.issue,
      cfg: { repo: context.repository },
      projectDir: s.context.sourceRoot,
      deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } },
    });
    assert.equal(approved.status, 'approved');
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal(
      (await readCurrentMemoryPlanApproval({ backend, context })).payload.semanticContractDigest,
      finalContract.semanticContractDigest
    );
    assert.deepEqual(
      backend.snapshot.nativeOrder.map((ref) => ref.kind),
      ['plan', 'source', 'source', 'plan']
    );
    assert.deepEqual(
      (await observeRevision({ context, deps: backend })).effectiveProposal,
      original.effectiveProposal
    );
    const finalStory = {
      ...story,
      soThat: 'consumers receive complete validated delivery artifacts',
    };
    const retry = (value) =>
      runUserStory({
        target: context.issue,
        story: value,
        cfg: { repo: context.repository },
        projectDir: s.context.sourceRoot,
        deps: { revisionBackend: backend, writeDeps },
      });
    backend.failAfter = 'native-source-journal-readback';
    await assert.rejects(retry(finalStory), /interrupted/);
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    await assert.rejects(retry(story), (error) => error.code === 'revision-pending');
    assert.equal(pushes, 2, 'changed intent cannot consume the persisted native source prefix');
    assert.equal((await retry(finalStory)).status, 'written');
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal((await retry(finalStory)).status, 'no-op');
    assert.equal(pushes, 3);
    assert.equal(backend.snapshot.nativeSourceRecords.length, 3);
    assert.deepEqual(
      (await observeRevision({ context, deps: backend })).effectiveProposal,
      original.effectiveProposal
    );
  } finally {
    s.dispose();
  }
});

for (const fault of ['pending', 'unavailable', 'foreign', 'placeholder', 'untimed']) {
  test(`native user-story ${fault} refuses before journal publication or transport/advisory effects`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = ['pending', 'unavailable'].includes(fault)
        ? await fixture(fault, { worktree: s.context.sourceRoot })
        : await approvedFixture({
            worktree: s.context.sourceRoot,
            branch: 'trunk',
            sessionId: currentSessionId(),
          });
      setActiveTask(
        currentSessionId(),
        {
          issue: `#${context.issue}`,
          entryStartTs: fault === 'untimed' ? null : new Date().toISOString(),
          worktreePath: s.context.sourceRoot,
          worktreeBranch: fault === 'foreign' ? 'foreign' : context.executor.branch,
        },
        s.context.sourceRoot
      );
      const before = backend.effects.length;
      let effects = 0;
      await assert.rejects(
        runUserStory({
          target: context.issue,
          story:
            fault === 'placeholder'
              ? { ...story, asA: '[who wants to accomplish something]' }
              : story,
          cfg: { repo: context.repository },
          projectDir: s.context.sourceRoot,
          deps: {
            revisionBackend: backend,
            writeDeps: {
              fetchBody: async () => {
                effects++;
                return backend.observation.body.bytes;
              },
              pushBody: async () => {
                effects++;
              },
            },
            readIssueState: async () => {
              effects++;
              return 'plan';
            },
          },
        })
      );
      assert.equal(effects, 0);
      assert.ok(!backend.effects.slice(before).includes('native-source-journal-write'));
    } finally {
      s.dispose();
    }
  });
}

for (const wiring of ['default', 'native-pexec']) {
  test(`recognized-memory native source refuses ${wiring} production transport before any process effect`, async () => {
    const s = createSandbox();
    const oldPath = process.env.PATH,
      oldDouble = process.env.AITM_GH_TEST_DOUBLE_BIN;
    try {
      const { backend, context } = await approvedFixture({
        worktree: s.context.sourceRoot,
        branch: 'trunk',
        sessionId: currentSessionId(),
      });
      setActiveTask(
        currentSessionId(),
        {
          issue: `#${context.issue}`,
          entryStartTs: new Date().toISOString(),
          worktreePath: s.context.sourceRoot,
          worktreeBranch: 'trunk',
          kanbanState: 'develop',
        },
        s.context.sourceRoot
      );
      const bin = path.join(s.context.sourceRoot, 'offline-bin');
      mkdirSync(bin);
      const bodyPath = path.join(bin, 'body'),
        logPath = path.join(bin, 'effects');
      writeFileSync(bodyPath, backend.observation.body.bytes);
      // This executable is an isolated observer of the real default process
      // dispatch. It never forwards to gh or contacts a network.
      writeFileSync(
        path.join(bin, 'gh'),
        `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.argv[3] === 'view') process.stdout.write(fs.readFileSync(${JSON.stringify(bodyPath)}, 'utf8'));
else if (process.argv[3] === 'edit') { let input = ''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => fs.writeFileSync(${JSON.stringify(bodyPath)}, input)); }
else process.exitCode = 90;
`,
        { mode: 0o755 }
      );
      process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
      process.env.AITM_GH_TEST_DOUBLE_BIN = bin;
      let error;
      try {
        await runUserStory({
          target: context.issue,
          story,
          cfg: { repo: context.repository },
          projectDir: s.context.sourceRoot,
          deps: {
            revisionBackend: backend,
            ...(wiring === 'native-pexec' ? { writeDeps: { pexec } } : {}),
          },
        });
      } catch (e) {
        error = e;
      }
      const effects = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
      assert.deepEqual(
        { code: error?.code, effects },
        { code: 'revision-authority-unavailable', effects: '' }
      );
    } finally {
      process.env.PATH = oldPath;
      if (oldDouble === undefined) delete process.env.AITM_GH_TEST_DOUBLE_BIN;
      else process.env.AITM_GH_TEST_DOUBLE_BIN = oldDouble;
      s.dispose();
    }
  });
}

test('actual governed Deep-Dive Story Intent correction retires source proof and requires fresh source-bound Plan approval', async () => {
  const s = createSandbox();
  try {
    let { backend, context } = await approvedFixture({
      worktree: s.context.sourceRoot,
      branch: 'trunk',
      sessionId: currentSessionId(),
    });
    setActiveTask(
      currentSessionId(),
      {
        issue: `#${context.issue}`,
        entryStartTs: new Date().toISOString(),
        worktreePath: s.context.sourceRoot,
        worktreeBranch: 'trunk',
        kanbanState: 'develop',
      },
      s.context.sourceRoot
    );
    const original = await observeRevision({ context, deps: backend });
    const operation = {
      schema: 'aitm.issue-body-operation/v1',
      kind: 'replace-exact',
      expectedVersion: backend.observation.body.version,
      expected: '- **Value or failure prevented:** consumers receive complete releases',
      replacement: '- **Value or failure prevented:** operators avoid incomplete release artifacts',
    };
    const operationFile = path.join(s.context.sourceRoot, 'intent-operation.json');
    writeFileSync(operationFile, JSON.stringify(operation));
    let pushes = 0;
    const writeDeps = {
      fetchBody: async () => backend.observation.body.bytes,
      pushBody: async (_repo, _issue, body) => {
        pushes++;
        const next = backend.observation;
        next.body = { bytes: body, version: parseBodyVersion(body) };
        const plan = validateGovernedLinkedPlan({ body, projectDir: s.context.sourceRoot });
        const resolved = resolveStoryIntentSource({
          body,
          projectDir: s.context.sourceRoot,
          governedPlan: plan,
        });
        assert.ok(plan.ok && resolved.ok);
        const bindings = planSourceBindings(resolved, plan);
        next.protectedSourceBindings = [
          ...next.protectedSourceBindings.filter(
            (b) => !bindings.some((x) => x.identity === b.identity)
          ),
          ...bindings,
        ];
        backend.replaceAuthority(next);
        backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
      },
    };
    const invoke = () =>
      runIssueBodyVerb(
        {
          cfg: { repo: context.repository },
          projectDir: s.context.sourceRoot,
          statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
          rest: [String(context.issue), '--operation-file', operationFile],
        },
        { revisionBackend: backend, writeDeps }
      );
    backend.failAfter = 'native-source-journal-readback';
    await assert.rejects(invoke(), /interrupted/);
    assert.equal(pushes, 0);
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal(
      (await observeRevision({ context, deps: backend })).status,
      'pending-native-source'
    );
    await invoke();
    assert.equal(pushes, 1);
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal((await invoke()).status, 'no-op');
    assert.equal(pushes, 1);
    const current = await observeRevision({ context, deps: backend });
    assert.equal(current.status, 'applied');
    assert.equal(current.nativeHistoryApproved, false);
    assert.deepEqual(current.effectiveProposal, original.effectiveProposal);
    assert.deepEqual(
      current.currentContract.definitions.map((d) => d.identity),
      original.effectiveProposal.after.definitions.map((d) => d.identity)
    );
    assert.ok(current.currentContract.definitions.every((d) => !d.checked && !d.proof));
    assert.notEqual(
      current.currentContract.semanticContractDigest,
      original.effectiveProposal.after.semanticContractDigest
    );
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal((await observeRevision({ context, deps: backend })).status, 'applied');
    assert.equal(await readCurrentMemoryPlanApproval({ backend, context }), null);
    assert.equal(
      (
        await runPlanApprove({
          issueNumber: context.issue,
          cfg: { repo: context.repository },
          projectDir: s.context.sourceRoot,
          deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } },
        })
      ).status,
      'approved'
    );
    backend = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal(
      (await readCurrentMemoryPlanApproval({ backend, context })).payload.semanticContractDigest,
      current.currentContract.semanticContractDigest
    );
    assert.deepEqual(
      backend.snapshot.nativeOrder.map((ref) => ref.kind),
      ['plan', 'source', 'plan']
    );
  } finally {
    s.dispose();
  }
});

for (const fault of [
  'malformed-intent',
  'duplicate-intent',
  'ambiguous-deep-dive',
  'source-switch',
  'scope-and-intent',
  'story-and-intent',
  'control-and-intent',
]) {
  test(`native Story Intent ${fault} refuses before source journal or body transport`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await approvedFixture({
        worktree: s.context.sourceRoot,
        branch: 'trunk',
        sessionId: currentSessionId(),
      });
      setActiveTask(
        currentSessionId(),
        {
          issue: `#${context.issue}`,
          entryStartTs: new Date().toISOString(),
          worktreePath: s.context.sourceRoot,
          worktreeBranch: 'trunk',
          kanbanState: 'develop',
        },
        s.context.sourceRoot
      );
      const before = backend.observation.body.bytes;
      let changed = before.replace(
        '- **Value or failure prevented:** consumers receive complete releases',
        '- **Value or failure prevented:** operators avoid incomplete release artifacts'
      );
      if (fault === 'malformed-intent')
        changed = changed.replace('- **Need:** registry checks can fail', '');
      if (fault === 'duplicate-intent')
        changed = changed.replace('### Story Intent', '### Story Intent\n### Story Intent');
      if (fault === 'ambiguous-deep-dive') changed += '\n## Deep-Dive Analysis\n### Story Intent\n';
      if (fault === 'source-switch') {
        mkdirSync(path.join(s.context.sourceRoot, 'docs'));
        writeFileSync(
          path.join(s.context.sourceRoot, 'docs', 'plan.md'),
          '## Story Intent\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n'
        );
        changed += '\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n';
        const actual = resolveStoryIntentSource({
          body: changed,
          projectDir: s.context.sourceRoot,
        });
        assert.equal(actual.ok, true);
        assert.equal(actual.source, 'linked-plan');
      }
      if (fault === 'scope-and-intent')
        changed = changed.replace('Synthetic scope', 'Foreign scope');
      if (fault === 'story-and-intent')
        changed = changed.replace(
          'So that consumers receive complete releases',
          'So that operators avoid incomplete release artifacts'
        );
      if (fault === 'control-and-intent')
        changed += '\n<!-- aitm-reviewed ts="2026-10-06T00:00:00Z" -->\n';
      const operationFile = path.join(s.context.sourceRoot, 'invalid-intent-operation.json');
      writeFileSync(
        operationFile,
        JSON.stringify({
          schema: 'aitm.issue-body-operation/v1',
          kind: 'replace-exact',
          expectedVersion: backend.observation.body.version,
          expected: before,
          replacement: changed,
        })
      );
      const effectsBefore = backend.effects.length;
      let pushes = 0;
      await assert.rejects(
        runIssueBodyVerb(
          {
            cfg: { repo: context.repository },
            projectDir: s.context.sourceRoot,
            statePath: path.join(
              s.context.sourceRoot,
              '.ai-task-manager',
              'task-tracker-state.json'
            ),
            rest: [String(context.issue), '--operation-file', operationFile],
          },
          {
            revisionBackend: backend,
            writeDeps: {
              fetchBody: async () => backend.observation.body.bytes,
              pushBody: async () => {
                pushes++;
              },
            },
          }
        )
      );
      assert.equal(pushes, 0);
      assert.ok(!backend.effects.slice(effectsBefore).includes('native-source-journal-write'));
    } finally {
      s.dispose();
    }
  });
}
