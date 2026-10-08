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
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
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

test('genuine native linked-plan approval remains bound after its own sanctioned approval body projection', async () => {
  const f = await setup();
  try {
    const result = await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context });
    assert.ok(
      result,
      'actual native approval has current linked-source authority after its body write'
    );
    assert.equal(
      (await observeRevision({ context: f.context, deps: f.backend })).status,
      'applied'
    );
  } finally {
    f.s.dispose();
  }
});

test('actual governed linked-plan reference correction uses native old/new file observations before source effects', async () => {
  const f = await setup();
  try {
    const { backend, context, s } = f;
    const original = backend.createdEvents;
    const operationFile = path.join(s.context.sourceRoot, 'linked-operation.json');
    fs.writeFileSync(
      operationFile,
      JSON.stringify({
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expectedVersion: backend.observation.body.version,
        expected: '- **Source-plan**: docs/plan-a.md',
        replacement: '- **Source-plan**: docs/plan-b.md',
      })
    );
    let pushes = 0;
    const result = await runIssueBodyVerb(
      {
        cfg: { repo: context.repository },
        projectDir: s.context.sourceRoot,
        statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
        rest: [String(context.issue), '--operation-file', operationFile],
      },
      {
        revisionBackend: backend,
        writeDeps: {
          fetchBody: async () => backend.observation.body.bytes,
          pushBody: async (_repo, _issue, body) => {
            pushes++;
            const next = backend.observation;
            next.body = { bytes: body, version: parseBodyVersion(body) };
            const governed = validateGovernedLinkedPlan({ body, projectDir: s.context.sourceRoot });
            const resolved = resolveStoryIntentSource({
              body,
              projectDir: s.context.sourceRoot,
              governedPlan: governed,
            });
            assert.ok(governed.ok && resolved.ok);
            const bindings = planSourceBindings(resolved, governed);
            next.protectedSourceBindings = [
              ...next.protectedSourceBindings.filter(
                (b) => !bindings.some((x) => x.identity === b.identity)
              ),
              ...bindings,
            ];
            backend.replaceAuthority(next);
            backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
          },
        },
      }
    );
    assert.equal(result.status, 'ok');
    assert.equal(pushes, 1);
    const current = await observeRevision({ context, deps: backend });
    assert.equal(current.status, 'applied');
    assert.equal(current.nativeHistoryApproved, false);
    assert.deepEqual(backend.createdEvents, original);
    assert.equal(await readCurrentMemoryPlanApproval({ backend, context }), null);
    const journal = backend.snapshot.nativeSourceRecords[0];
    assert.equal(journal.sourceReads.before.path, 'docs/plan-a.md');
    assert.equal(journal.sourceReads.after.path, 'docs/plan-b.md');
    assert.deepEqual(
      journal.contract.definitions.map((d) => d.identity),
      journal.currentContract.definitions.map((d) => d.identity)
    );
    assert.equal(journal.contract.revisionId, journal.currentContract.revisionId);
    assert.notEqual(
      journal.contract.semanticContractDigest,
      journal.currentContract.semanticContractDigest
    );
    fs.unlinkSync(path.join(s.context.sourceRoot, 'docs', 'plan-a.md'));
    const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    assert.equal(await readCurrentMemoryPlanApproval({ backend: restored, context }), null);
    const approved = await runPlanApprove({
      issueNumber: context.issue,
      cfg: { repo: context.repository },
      projectDir: s.context.sourceRoot,
      deps: { revisionBackend: restored, env: { TT_FULL_AUTO: '1' } },
    });
    assert.equal(approved.status, 'approved');
    const restarted = createRevisionMemory(JSON.parse(JSON.stringify(restored.snapshot)));
    assert.ok(await readCurrentMemoryPlanApproval({ backend: restarted, context }));
    assert.deepEqual(
      restarted.snapshot.nativeSourceRecords[0],
      journal,
      'original source record remains byte-exact'
    );
    assert.deepEqual(restarted.createdEvents, original);
  } finally {
    f.s.dispose();
  }
});

for (const drift of ['file', 'selector']) {
  test(`current linked-plan ${drift} drift invalidates actual native approval`, async () => {
    const f = await setup({ tasks: drift === 'selector' });
    try {
      assert.ok(await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }));
      if (drift === 'file')
        fs.writeFileSync(
          path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md'),
          plan.replace(
            'consumers receive complete releases',
            'operators avoid incomplete release artifacts'
          )
        );
      else {
        const next = f.backend.observation;
        const beforePolicy = validateGovernedLinkedPlan({
          body: next.body.bytes,
          projectDir: f.s.context.sourceRoot,
        });
        const beforeSource = resolveStoryIntentSource({
          body: next.body.bytes,
          projectDir: f.s.context.sourceRoot,
          governedPlan: beforePolicy,
        });
        next.body.bytes = next.body.bytes.replace(
          '- **Source-plan**: docs/plan-a.md',
          '- **Source-plan**: docs/plan-a.md\n- **Source-plan-section**: ### Task 1: Publish'
        );
        const afterPolicy = validateGovernedLinkedPlan({
          body: next.body.bytes,
          projectDir: f.s.context.sourceRoot,
        });
        const afterSource = resolveStoryIntentSource({
          body: next.body.bytes,
          projectDir: f.s.context.sourceRoot,
          governedPlan: afterPolicy,
        });
        assert.ok(afterSource.ok);
        assert.equal(afterSource.source, 'linked-plan-task');
        assert.notDeepEqual(
          planSourceBindings(beforeSource, beforePolicy),
          planSourceBindings(afterSource, afterPolicy),
          'equal prose in a different native selected source remains a different binding'
        );
        f.backend.replaceAuthority(next);
      }
      assert.equal(
        await readCurrentMemoryPlanApproval({ backend: f.backend, context: f.context }),
        null
      );
      assert.notEqual(
        (await observeRevision({ context: f.context, deps: f.backend })).status,
        'applied'
      );
    } finally {
      f.s.dispose();
    }
  });
}

test('linked semantic binding cannot be minted from copied policy or caller-selected source location', async () => {
  const f = await setup();
  try {
    const body = f.backend.observation.body.bytes;
    const policy = validateGovernedLinkedPlan({ body, projectDir: f.s.context.sourceRoot });
    const actual = resolveStoryIntentSource({
      body,
      projectDir: f.s.context.sourceRoot,
      governedPlan: policy,
    });
    assert.throws(() => planSourceBindings(actual, structuredClone(policy)), /native-read/);
    assert.throws(
      () => planSourceBindings({ ...actual, location: { ...actual.location, line: 99 } }, policy),
      /native-resolution/
    );
  } finally {
    f.s.dispose();
  }
});
