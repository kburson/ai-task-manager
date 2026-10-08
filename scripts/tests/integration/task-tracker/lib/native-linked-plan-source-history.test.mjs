// @story #1855
// cspell:words reconstructable
import { execFileSync } from 'node:child_process';
import {
  registerRevisionDomain,
  revisionRuntime,
} from '../../../../task-tracker/lib/criteria-revision/domain.mjs';
import test, { before, after } from 'node:test';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import {
  readCurrentMemoryPlanApproval,
  planSourceBindings,
} from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import { validateGovernedLinkedPlan } from '../../../../task-tracker/lib/governed-plan-policy.mjs';
import { resolveStoryIntentSource } from '../../../../task-tracker/lib/story-intent-source.mjs';
import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
import { runHook as runSourceEditHook } from '../../../../task-tracker/source-edit-gate.mjs';
import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';

// Node --test isolates each file in its own worker process. Keep every native
// default-root read in that process deterministic even when the user's host has
// unrelated enabled domains; no runtime/port root override is passed to a hook.
const originalProcessHome = process.env.HOME;

let isolatedProcessHome;

before(() => {
  isolatedProcessHome = mkdtempProjectIsolated('aitm-linked-source-host-');
  process.env.HOME = isolatedProcessHome;
  assert.equal(
    revisionRuntime().configRoot,
    path.join(isolatedProcessHome, '.ai-task-manager', 'criteria-revision-domains')
  );
});

after(() => {
  if (originalProcessHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalProcessHome;
  fs.rmSync(isolatedProcessHome, { recursive: true, force: true });
});

const plan = `## Story Intent
- **Beneficiary:** release operator
- **Capability:** stop partial publication
- **Need:** registry checks can fail
- **Value or failure prevented:** consumers receive complete releases
`;

async function setup({ tasks = false, nativeDomain = false } = {}) {
  const s = createSandbox();
  fs.mkdirSync(path.join(s.context.sourceRoot, 'docs'));
  fs.writeFileSync(
    path.join(s.context.sourceRoot, 'docs', 'plan-a.md'),
    plan +
      (tasks
        ? '\n## Tasks\n### Task 1: Publish\n' + plan.replace('## Story Intent', '#### Story Intent')
        : '')
  );
  fs.writeFileSync(
    path.join(s.context.sourceRoot, 'docs', 'plan-b.md'),
    plan.replace(
      'consumers receive complete releases',
      'operators avoid incomplete release artifacts'
    )
  );
  try {
    let ports, writerDomain;
    if (nativeDomain) {
      execFileSync(
        'git',
        ['remote', 'set-url', 'origin', 'https://github.com/example/criteria.git'],
        { cwd: s.context.sourceRoot, env: s.env }
      );
      ports = {
        configRoot: path.join(s.env.HOME, '.ai-task-manager', 'criteria-revision-domains'),
        worktree: s.context.sourceRoot,
      };
      const actual = revisionRuntime(ports).inspect(s.context.sourceRoot);
      writerDomain = { hostId: actual.hostId, commonDirectory: actual.commonDirectory };
    }
    const f = await approvedFixture({
      worktree: s.context.sourceRoot,
      branch: 'trunk',
      sessionId: currentSessionId(),
      linkedPlan: 'docs/plan-a.md',
      writerDomain,
    });
    if (ports)
      f.nativeDomain = registerRevisionDomain(
        {
          repository: f.context.repository,
          commonDir: writerDomain.commonDirectory,
          host: writerDomain.hostId,
          quiescenceConfirmed: true,
        },
        ports
      );
    setActiveTask(
      currentSessionId(),
      {
        issue: `#${f.context.issue}`,
        entryStartTs: new Date().toISOString(),
        worktreePath: s.context.sourceRoot,
        worktreeBranch: 'trunk',
        kanbanState: 'develop',
      },
      s.context.sourceRoot
    );
    return { ...f, s, ports };
  } catch (error) {
    s.dispose();
    throw error;
  }
}

async function linkedExecutionFixture(tool = 'Edit') {
  const f = await setup(),
    file = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
  const afterText = plan.replace(
    'registry checks can fail',
    'source changes require current approval'
  );
  const payload = {
    session_id: currentSessionId(),
    cwd: f.s.context.sourceRoot,
    tool_name: tool,
    tool_input:
      tool === 'Edit'
        ? {
            file_path: file,
            old_string: 'registry checks can fail',
            new_string: 'source changes require current approval',
          }
        : { file_path: file, content: afterText },
  };
  let pushes = 0,
    transportFault = null;
  f.payload = payload;
  f.writeDeps = {
    fetchBody: async () => f.backend.observation.body.bytes,
    pushBody: async (_repo, _issue, body) => {
      if (transportFault === 'before') throw new Error('uncertain linked body transport');
      pushes++;
      const next = f.backend.observation;
      next.body = { bytes: body, version: parseBodyVersion(body) };
      const governedPlan = validateGovernedLinkedPlan({ body, projectDir: f.s.context.sourceRoot });
      const resolved = resolveStoryIntentSource({
        body,
        projectDir: f.s.context.sourceRoot,
        governedPlan,
      });
      const bindings = planSourceBindings(resolved, governedPlan);
      next.protectedSourceBindings = [
        ...next.protectedSourceBindings.filter(
          (b) => !bindings.some((x) => x.identity === b.identity)
        ),
        ...bindings,
      ];
      f.backend.replaceAuthority(next);
      f.backend.replacePlanning({ ...f.backend.snapshot.planning, bodyHash: hashBytes(body) });
      if (transportFault === 'after') throw new Error('uncertain linked body transport');
    },
  };
  f.invoke = () =>
    runSourceEditHook(payload, {
      cfg: { repo: f.context.repository },
      revisionBackend: f.backend,
      writeDeps: f.writeDeps,
    });
  f.restore = (snapshot = f.backend.snapshot) => {
    f.backend = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
  };
  f.edit = () => fs.writeFileSync(file, afterText);
  f.transport = (value) => {
    transportFault = value;
  };
  f.pushes = () => pushes;
  return f;
}

test('genuine Scope then Plan history survives a later native linked-file correction without current-read branding', async () => {
  const f = await linkedExecutionFixture();
  try {
    const operationFile = path.join(f.s.context.sourceRoot, 'scope-before-linked.json');
    fs.writeFileSync(
      operationFile,
      JSON.stringify({
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expectedVersion: f.backend.observation.body.version,
        expected: 'Synthetic scope',
        replacement: 'Corrected source scope',
      })
    );
    const result = await runIssueBodyVerb(
      {
        cfg: { repo: f.context.repository },
        projectDir: f.s.context.sourceRoot,
        statePath: path.join(f.s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
        rest: [String(f.context.issue), '--operation-file', operationFile],
      },
      {
        revisionBackend: f.backend,
        writeDeps: {
          fetchBody: async () => f.backend.observation.body.bytes,
          pushBody: async (_repo, _issue, body) => {
            const next = f.backend.observation;
            next.body = { bytes: body, version: parseBodyVersion(body) };
            const scope = body.split('## Scope\n')[1].split('\n## ')[0].trim();
            next.protectedSourceBindings = next.protectedSourceBindings.map((binding) =>
              binding.identity === 'scope' ? { ...binding, hash: hashBytes(scope) } : binding
            );
            f.backend.replaceAuthority(next);
            f.backend.replacePlanning({
              ...f.backend.snapshot.planning,
              bodyHash: hashBytes(body),
            });
          },
        },
      }
    );
    assert.equal(result.status, 'ok');
    assert.equal(
      (
        await runPlanApprove({
          issueNumber: f.context.issue,
          cfg: { repo: f.context.repository },
          projectDir: f.s.context.sourceRoot,
          deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
        })
      ).status,
      'approved'
    );
    assert.equal((await f.invoke()).decision, 'allow');
    const originalSource = f.backend.snapshot.nativeSourceRecords[0];
    // Compatibility-only old-shaped fixture: preserve absent reads and update
    // its reference hash coherently; this is not authenticated historical data.
    const { canonicalRecordJson } =
      await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const oldShape = f.backend.snapshot,
      oldSource = oldShape.nativeSourceRecords[0],
      oldId = oldSource.id;
    delete oldSource.sourceReads;
    const { id: discardedId, ...oldRecord } = oldSource;
    oldSource.id = hashBytes(canonicalRecordJson(oldRecord));
    for (const ref of oldShape.nativeOrder) {
      if (ref.id === oldId) ref.id = oldSource.id;
      if (ref.predecessor === oldId) ref.predecessor = oldSource.id;
    }
    // The later linked journal embeds its original predecessor; use the actual
    // earlier Scope/Plan snapshot for this old-shape compatibility check.
    oldShape.nativeSourceRecords.pop();
    oldShape.nativeOrder.pop();
    delete oldShape.pendingSource;
    const compatible = createRevisionMemory(JSON.parse(JSON.stringify(oldShape)));
    assert.ok(await readCurrentMemoryPlanApproval({ backend: compatible, context: f.context }));
    assert.equal(Object.hasOwn(compatible.snapshot.nativeSourceRecords[0], 'sourceReads'), false);
    f.edit();
    assert.throws(
      () => createRevisionMemory(JSON.parse(JSON.stringify(oldShape))),
      /native-source-journal-coherence/
    );
    assert.doesNotThrow(
      () => f.restore(),
      'genuine old source evidence must reconstruct from retained original native reads'
    );
    assert.equal((await f.invoke()).code, 'revision-approval-stale');
    assert.deepEqual(f.backend.snapshot.nativeSourceRecords[0], originalSource);
    assert.equal(
      await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
      null
    );
  } finally {
    f.s.dispose();
  }
});

for (const delta of [
  'duplicate',
  'hidden',
  'key',
  'selector',
  'combined',
  'missing',
  'escape',
  'symlink',
]) {
  test(`native pointer adapter refuses ${delta} delta before transport or journal publication`, async () => {
    const f = await setup();
    try {
      const before = f.backend.observation,
        field = '- **Source-plan**: docs/plan-a.md';
      let replacement = '- **Source-plan**: docs/plan-b.md',
        expected = field;
      if (delta === 'duplicate') replacement += '\n- **Source-plan**: docs/plan-b.md';
      if (delta === 'hidden') replacement = '<!-- ' + replacement + ' -->';
      if (delta === 'key') replacement = '- **Implementation-plan**: docs/plan-b.md';
      if (delta === 'selector') replacement += '\n- **Source-plan-section**: ### Task 1: Publish';
      if (delta === 'combined') {
        expected = before.body.bytes;
        replacement = expected
          .replace(field, replacement)
          .replace('Synthetic scope', 'Unrelated changed scope');
      }
      if (delta === 'missing') replacement = '- **Source-plan**: docs/missing.md';
      if (delta === 'escape') replacement = '- **Source-plan**: ../outside.md';
      if (delta === 'symlink') {
        const outside = path.join(f.s.root, 'outside-plan.md');
        fs.writeFileSync(outside, plan);
        fs.symlinkSync(outside, path.join(f.s.context.sourceRoot, 'docs', 'foreign.md'));
        replacement = '- **Source-plan**: docs/foreign.md';
      }
      const operationFile = path.join(f.s.context.sourceRoot, 'refused-pointer.json');
      fs.writeFileSync(
        operationFile,
        JSON.stringify({
          schema: 'aitm.issue-body-operation/v1',
          kind: 'replace-exact',
          expectedVersion: before.body.version,
          expected,
          replacement,
        })
      );
      let effects = 0;
      await assert.rejects(
        runIssueBodyVerb(
          {
            cfg: { repo: f.context.repository },
            projectDir: f.s.context.sourceRoot,
            statePath: path.join(
              f.s.context.sourceRoot,
              '.ai-task-manager',
              'task-tracker-state.json'
            ),
            rest: [String(f.context.issue), '--operation-file', operationFile],
          },
          {
            revisionBackend: f.backend,
            writeDeps: {
              fetchBody: async () => {
                effects++;
                return before.body.bytes;
              },
              pushBody: async () => {
                effects++;
              },
            },
          }
        )
      );
      assert.equal(effects, 0);
      assert.equal(f.backend.snapshot.nativeSourceRecords?.length ?? 0, 0);
      assert.deepEqual(f.backend.observation, before);
    } finally {
      f.s.dispose();
    }
  });
}

test('actual linked UserStory history survives later file correction with independent current approval', async () => {
  const { runUserStory } = await import('../../../../task-tracker/verbs/user-story.mjs');
  const f = await linkedExecutionFixture();
  try {
    const story = {
      asA: 'release operator',
      iWant: 'stop partial publication because registry checks can fail',
      soThat: 'consumers receive complete validated releases',
    };
    const result = await runUserStory({
      target: f.context.issue,
      story,
      cfg: { repo: f.context.repository },
      projectDir: f.s.context.sourceRoot,
      deps: { revisionBackend: f.backend, writeDeps: f.writeDeps },
    });
    assert.equal(result.status, 'written');
    const original = f.backend.snapshot.nativeSourceRecords[0];
    assert.ok(original.sourceReads.before && original.sourceReads.after);
    assert.equal(
      (
        await runPlanApprove({
          issueNumber: f.context.issue,
          cfg: { repo: f.context.repository },
          projectDir: f.s.context.sourceRoot,
          deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
        })
      ).status,
      'approved'
    );
    assert.equal((await f.invoke()).decision, 'allow');
    f.edit();
    f.restore();
    assert.equal((await f.invoke()).code, 'revision-approval-stale');
    assert.equal(f.pushes(), 2);
    assert.deepEqual(f.backend.snapshot.nativeSourceRecords[0], original);
    assert.equal(
      await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
      null
    );
    assert.equal(
      (
        await runPlanApprove({
          issueNumber: f.context.issue,
          cfg: { repo: f.context.repository },
          projectDir: f.s.context.sourceRoot,
          deps: { revisionBackend: f.backend, env: { TT_FULL_AUTO: '1' } },
        })
      ).status,
      'approved'
    );
    f.restore();
    assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
  } finally {
    f.s.dispose();
  }
});
