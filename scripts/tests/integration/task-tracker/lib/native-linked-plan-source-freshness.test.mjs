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
import { planSourceBindings } from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';
import { validateGovernedLinkedPlan } from '../../../../task-tracker/lib/governed-plan-policy.mjs';
import { resolveStoryIntentSource } from '../../../../task-tracker/lib/story-intent-source.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import { runHook as runSourceEditHook } from '../../../../task-tracker/source-edit-gate.mjs';
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

test('native linked correction refuses real file drift during awaited predecessor replay', async (t) => {
  const { syncBuiltinESMExports } = await import('node:module');
  const f = await linkedExecutionFixture();
  const file = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
  const originalRead = fs.readFileSync;
  let changed = false,
    scheduled = false,
    directRead = false;
  try {
    t.mock.method(fs, 'readFileSync', function (...args) {
      const bytes = originalRead.apply(this, args);
      const frames = new Error().stack.split('\n');
      const directCurrentRead = frames.some(
        (line, index) =>
          line.includes('at validateGovernedLinkedPlan') &&
          frames[index + 1]?.includes('at withNativeLinkedSourceCorrection')
      );
      if (args[0] === file && directCurrentRead) directRead = true;
      const finalReplayRead =
        directRead && frames.some((line) => line.includes('at replayNativeEpoch'));
      if (!scheduled && args[0] === file && finalReplayRead) {
        scheduled = true;
        queueMicrotask(() => {
          fs.writeFileSync(
            file,
            plan.replace('registry checks can fail', 'unsealed concurrent source change')
          );
          changed = true;
        });
      }
      return bytes;
    });
    syncBuiltinESMExports();
    const events = f.backend.createdEvents;
    const result = await f.invoke();
    assert.equal(directRead, true, 'actual adapter captured its pre-replay source');
    assert.equal(
      scheduled,
      true,
      'race occurs after the replay actual source read and before its awaited return'
    );
    assert.equal(changed, true);
    assert.equal(result.decision, 'block', JSON.stringify(result));
    assert.equal(
      f.backend.snapshot.nativeSourceRecords?.length ?? 0,
      0,
      'no journal may seal stale file authority'
    );
    assert.equal(f.pushes(), 0);
    assert.deepEqual(f.backend.createdEvents, events);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    f.s.dispose();
  }
});

test('awaited native history rereads current linked source after its final epoch yield', async (t) => {
  const { syncBuiltinESMExports } = await import('node:module');
  const { reconstructNativeHistory } =
    await import('../../../../task-tracker/lib/criteria-revision/source-correction.mjs');
  const { readMemoryNativeHistory } =
    await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
  const f = await setup(),
    file = path.join(f.s.context.sourceRoot, 'docs', 'plan-a.md');
  const originalRead = fs.readFileSync;
  let changed = false;
  try {
    const state = await observeRevision({ context: f.context, deps: f.backend });
    const input = {
      history: readMemoryNativeHistory(f.backend),
      chain: state.chain,
      backend: f.backend,
      observation: f.backend.observation,
    };
    assert.equal((await reconstructNativeHistory(input)).status, 'complete');
    let scheduled = false;
    t.mock.method(fs, 'readFileSync', function (...args) {
      const bytes = originalRead.apply(this, args);
      if (!scheduled && args[0] === file && new Error().stack.includes('at replayNativeEpoch')) {
        scheduled = true;
        queueMicrotask(() => {
          fs.writeFileSync(
            file,
            plan.replace(
              'registry checks can fail',
              'changed after native replay source observation'
            )
          );
          changed = true;
        });
      }
      return bytes;
    });
    syncBuiltinESMExports();
    await assert.rejects(reconstructNativeHistory(input), /native-history-current-source/);
    assert.equal(changed, true);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    f.s.dispose();
  }
});
