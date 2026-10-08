// @story #1855
import test from 'node:test';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runHook } from '../../../../../task-tracker/source-edit-gate.mjs';
import { memoryRuntime, authorityResult } from '../../../../fixtures/criteria-revision-runtime.mjs';
import { registerRevisionDomain } from '../../../../../task-tracker/lib/criteria-revision/domain.mjs';
import {
  refreshAdmission,
  publishAdmission,
} from '../../../../../task-tracker/lib/criteria-revision/admission.mjs';
import { withRevisionInterlock } from '../../../../../task-tracker/lib/criteria-revision/interlock.mjs';

test('source hook rereads shared admission on every invocation despite unchanged cached Develop signals', async () => {
  const { createSandbox } = await import('../../../../helpers/evidence-v2/sandbox.mjs');
  const { setActiveTask } = await import('../../../../../task-tracker/session-state.mjs');
  const { currentSessionId } = await import('../../../../../task-tracker/word-counter.mjs');
  const fs = await import('node:fs');
  const s = createSandbox(),
    root = s.context.sourceRoot,
    sid = currentSessionId();
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'file.mjs'), 'old');
    fs.writeFileSync(path.join(root, 'docs', 'notes.md'), 'old');
    const { context, ports } = memoryRuntime();
    ports.worktree = root;
    context.executor = { ...context.executor, worktree: root, branch: 'trunk', sessionId: sid };
    setActiveTask(
      sid,
      {
        issue: '#1852',
        entryStartTs: new Date().toISOString(),
        worktreePath: root,
        worktreeBranch: 'trunk',
        kanbanState: 'develop',
      },
      root
    );
    const domain = registerRevisionDomain(
      {
        repository: context.repository,
        commonDir: '/git/common',
        host: 'host-one',
        quiescenceConfirmed: true,
      },
      ports
    );
    const deps = {
      resolveInvocationDirectory: () => root,
      projectDir: root,
      cfg: { repo: context.repository },
      revisionPorts: ports,
      loadBoundIssue: () => '#1852',
      readExactSessionBinding: () => null,
      isChoreModeActive: () => false,
      resolveIssueSignals: async () => ({
        state: 'develop',
        hasPostedMarker: true,
        hasCompleteMarker: true,
        assignees: ['operator'],
        currentUser: 'operator',
      }),
    };
    const payload = {
      session_id: sid,
      tool_name: 'Edit',
      cwd: root,
      tool_input: { file_path: path.join(root, 'src', 'file.mjs') },
    };
    const absent = await runHook(payload, deps);
    assert.equal(absent.decision, 'block');
    assert.equal(
      absent.code,
      'revision-authority-unavailable',
      'missing source associations cannot establish editor authority'
    );
    const { validateGovernedLinkedPlan } =
      await import('../../../../../task-tracker/lib/governed-plan-policy.mjs');
    const { hashRevisionValue } =
      await import('../../../../../task-tracker/lib/criteria-revision/schema.mjs');
    const collected = authorityResult(context, domain);
    collected.observation.protectedSourceBindings.push({
      identity: 'linked-plan',
      hash: hashRevisionValue(
        validateGovernedLinkedPlan({ body: collected.observation.body.bytes, projectDir: root })
      ),
    });
    await refreshAdmission({ context, observe: async () => collected }, ports);
    assert.equal((await runHook(payload, deps)).decision, 'allow');
    await withRevisionInterlock(
      context,
      (capability) =>
        publishAdmission({ capability, observation: { issue: 1852 }, state: 'deny' }, ports),
      ports
    );
    const revoked = await runHook(payload, deps);
    assert.equal(revoked.decision, 'block');
    assert.equal(revoked.code, 'revision-approval-stale');
    const mixed = await runHook(
      {
        ...payload,
        tool_name: 'apply_patch',
        tool_input: `*** Begin Patch\n*** Update File: ${root}/docs/notes.md\n@@\n-old\n+new\n*** Update File: ${root}/src/file.mjs\n@@\n-old\n+new\n*** End Patch`,
      },
      deps
    );
    assert.equal(mixed.decision, 'block');
    assert.equal(mixed.code, 'revision-approval-stale');
  } finally {
    s.dispose();
  }
});
