// @story #1855
// cspell:words unadmitted
import { runPlanApprove } from '../../../../task-tracker/verbs/plan-approve.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { approvedFixture, fixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import path from 'node:path';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';
import * as fs from 'node:fs';
import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { readCurrentMemoryPlanApproval } from '../../../../task-tracker/lib/criteria-revision/plan-approval.mjs';

test('actual governed Scope correction preserves criterion identities and original transaction while making normal Plan approval stale', async () => {
  const s = createSandbox();
  try {
    const sid = currentSessionId();
    const { backend, context } = await approvedFixture({
      worktree: s.context.sourceRoot,
      branch: 'trunk',
      sessionId: sid,
    });
    setActiveTask(
      sid,
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
    const immutableEvents = backend.createdEvents;
    const operationFile = path.join(s.context.sourceRoot, 'scope-operation.json');
    fs.writeFileSync(
      operationFile,
      JSON.stringify({
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expectedVersion: backend.observation.body.version,
        expected: 'Synthetic scope',
        replacement: 'Corrected scope',
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
          revisionBackend: backend,
          fetchBody: async () => backend.observation.body.bytes,
          pushBody: async (_repo, _issue, body) => {
            pushes++;
            const next = backend.observation;
            next.body = { bytes: body, version: parseBodyVersion(body) };
            const scope = body.split('## Scope\n')[1].split('\n## ')[0].trim();
            next.protectedSourceBindings = next.protectedSourceBindings.map((binding) =>
              binding.identity === 'scope' ? { ...binding, hash: hashBytes(scope) } : binding
            );
            backend.replaceAuthority(next);
            backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
          },
        },
      }
    );
    assert.equal(pushes, 1);
    assert.ok(result.body.includes('Corrected scope'));
    const current = await observeRevision({ context, deps: backend });
    assert.equal(current.status, 'applied');
    assert.deepEqual(backend.createdEvents, immutableEvents);
    assert.deepEqual(
      current.effectiveProposal,
      original.effectiveProposal,
      'original transaction stays immutable'
    );
    assert.equal(await readCurrentMemoryPlanApproval({ backend, context }), null);
    await assert.rejects(
      withRevisionConsumer({ ...context, backend, activity: 'body-write' }, () => {}),
      (error) => error.code === 'revision-approval-stale'
    );
    assert.deepEqual(
      current.currentContract.definitions.map((d) => d.identity),
      original.effectiveProposal.after.definitions.map((d) => d.identity)
    );
    assert.notEqual(
      current.currentContract.semanticContractDigest,
      original.effectiveProposal.after.semanticContractDigest
    );
    assert.ok(
      current.currentContract.definitions.every((d) => !d.checked && !d.proof),
      'source dependency change retires individual and aggregate claims'
    );
    assert.equal(current.currentContract.revisionId, original.effectiveProposal.after.revisionId);
    const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
    const restarted = await observeRevision({ context, deps: restored });
    assert.equal(restarted.status, 'applied');
    assert.deepEqual(restarted.currentContract, current.currentContract);
    assert.equal(await readCurrentMemoryPlanApproval({ backend: restored, context }), null);
    const approved = await runPlanApprove({
      issueNumber: context.issue,
      cfg: { repo: context.repository },
      projectDir: s.context.sourceRoot,
      deps: { revisionBackend: restored, env: { TT_FULL_AUTO: '1' } },
    });
    assert.equal(approved.status, 'approved', JSON.stringify(approved));
    const approval = await readCurrentMemoryPlanApproval({ backend: restored, context });
    assert.equal(
      approval.payload.semanticContractDigest,
      current.currentContract.semanticContractDigest
    );
    assert.deepEqual(
      restored.snapshot.nativeOrder.map((ref) => ref.kind),
      ['plan', 'source', 'plan']
    );
    const again = createRevisionMemory(JSON.parse(JSON.stringify(restored.snapshot)));
    assert.equal((await observeRevision({ context, deps: again })).status, 'applied');
    assert.deepEqual(again.createdEvents, immutableEvents);
    let admitted = 0;
    await withRevisionConsumer({ ...context, backend: again, activity: 'body-write' }, () => {
      admitted++;
    });
    assert.equal(
      admitted,
      1,
      'fresh normal source-bound Plan approval restores ordinary admission after restart'
    );
  } finally {
    s.dispose();
  }
});
import { postNewAutomatedTestsComment } from '../../../../task-tracker/lib/new-automated-tests-comment.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'current']) {
  test(`actual new-tests comment ${state} gates all public reader and effect callbacks`, async () => {
    const { backend, context } =
      state === 'current' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed')
      backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    const calls = [];
    const deps = {
      revisionBackend: backend,
      listComments: async () => {
        calls.push('comments');
        return [
          {
            id: 'IC_trail',
            body: '### 🔗 Commits\n<!-- aitm-commits shas="' + 'a'.repeat(40) + '" -->',
          },
        ];
      },
      attributingCommits: async () => {
        calls.push('attribution');
        return [];
      },
      showShaTestDiff: async () => {
        calls.push('diff');
        return "+++ b/scripts/example.test.mjs\n+test('rejects changed source before publication', () => {});\n";
      },
      createComment: async ({ body }) => {
        calls.push('create');
        assert.match(body, /rejects changed source before publication/);
      },
    };
    let error, result;
    try {
      result = await postNewAutomatedTestsComment({
        cfg: { repo: context.repository },
        issueNumber: context.issue,
        cwd: context.executor.worktree,
        deps,
      });
    } catch (caught) {
      error = caught;
    }
    if (['baseline', 'current'].includes(state)) {
      assert.equal(error, undefined);
      assert.equal(result.status, 'posted');
      assert.deepEqual(calls, ['comments', 'attribution', 'diff', 'create']);
    } else {
      assert.deepEqual(
        calls,
        [],
        'no supplied reader or writer may precede complete revision admission'
      );
      assert.equal(
        error?.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    }
  });
}
import { ensureRecordComment } from '../../../../task-tracker/lib/reviewed-scope/comments.mjs';
import {
  makeRecord,
  requestDigest,
  lineageDigest,
  encodeRecord,
} from '../../../../task-tracker/lib/reviewed-scope/model.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed', 'baseline', 'current']) {
  test(`actual reviewed-scope comment ${state} gates supplied readers and publication`, async () => {
    const { backend, context } =
      state === 'current' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed')
      backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    const manifest = {
      schema: 'aitm.reviewed-scope-evidence/v1',
      repository: context.repository,
      issue: context.issue,
      worktree: context.executor.worktree,
      branch: context.executor.branch,
      head: 'a'.repeat(40),
      label: 'Inspect output',
      provenance: { kind: 'operator-inspection' },
      rationale: 'Inspected sandbox output.',
      artifacts: [{ path: 'evidence.txt', sha256: 'b'.repeat(64) }],
    };
    const targetDigest = 'c'.repeat(64);
    const record = makeRecord({
      manifest,
      targetDigest,
      requestDigest: requestDigest({ manifest, targetDigest }),
      lineage: lineageDigest({
        repository: context.repository,
        issue: context.issue,
        targetDigest,
      }),
      predecessor: null,
      actor: { id: '42', login: 'fixture' },
      recordedAt: '2026-10-01T00:00:00.000Z',
    });
    const encoded = encodeRecord(record),
      calls = [];
    let stored, result, error;
    const deps = {
      revisionBackend: backend,
      listComments: async () => {
        calls.push('list');
        return [];
      },
      createComment: async ({ repository, issue, body }) => {
        calls.push('create');
        assert.equal(repository, context.repository);
        assert.equal(issue, context.issue);
        assert.equal(body, encoded.commentBody);
        stored = {
          id: '99',
          body,
          issue_url: `https://api.github.com/repos/${repository}/issues/${issue}`,
          user: { id: '42' },
        };
        return stored;
      },
      readComment: async () => {
        calls.push('readback');
        return stored;
      },
    };
    try {
      result = await ensureRecordComment({
        repository: context.repository,
        issue: context.issue,
        projectDir: context.executor.worktree,
        record,
        expectedPredecessor: null,
        deps,
      });
    } catch (caught) {
      error = caught;
    }
    if (['baseline', 'current'].includes(state)) {
      assert.equal(error, undefined);
      assert.equal(result.reused, false);
      assert.deepEqual(calls, ['list', 'create', 'readback']);
      assert.equal(stored.body, encoded.commentBody);
    } else {
      assert.deepEqual(calls, []);
      assert.equal(
        error?.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    }
  });
}
import { recordReviewedScope } from '../../../../task-tracker/lib/reviewed-scope/record.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`actual reviewed-scope coordinator ${state} refuses before supplied authority or filesystem reads`, async () => {
    const { backend, context } = await fixture(state);
    if (state === 'malformed')
      backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    const calls = [];
    let error;
    try {
      await recordReviewedScope({
        ctx: {
          cfg: { repo: context.repository },
          issueNumber: context.issue,
          projectDir: context.executor.worktree,
          deps: {
            revisionBackend: backend,
            reviewedScope: {
              readRecordingAuthority: async () => {
                calls.push('authority');
                throw new Error('unadmitted');
              },
              readBoundManifest: async () => {
                calls.push('manifest');
                throw new Error('unadmitted');
              },
            },
          },
        },
        label: 'Inspect output',
        manifestPath: 'evidence.json',
      });
    } catch (caught) {
      error = caught;
    }
    assert.deepEqual(calls, []);
    assert.equal(
      error?.code,
      state === 'pending'
        ? 'revision-pending'
        : state === 'stale'
          ? 'revision-approval-stale'
          : 'revision-authority-unavailable'
    );
  });
}

test('reviewed-scope default publication preserves typed memory quarantine before any OS transport', async () => {
  const s = createSandbox(),
    previousPath = process.env.PATH;
  try {
    const { backend, context } = await approvedFixture({ worktree: s.context.sourceRoot });
    const manifest = {
      schema: 'aitm.reviewed-scope-evidence/v1',
      repository: context.repository,
      issue: context.issue,
      worktree: context.executor.worktree,
      branch: context.executor.branch,
      head: 'a'.repeat(40),
      label: 'Inspect output',
      provenance: { kind: 'operator-inspection' },
      rationale: 'Inspected sandbox output.',
      artifacts: [{ path: 'evidence.txt', sha256: 'b'.repeat(64) }],
    };
    const targetDigest = 'c'.repeat(64);
    const record = makeRecord({
      manifest,
      targetDigest,
      requestDigest: requestDigest({ manifest, targetDigest }),
      lineage: lineageDigest({
        repository: context.repository,
        issue: context.issue,
        targetDigest,
      }),
      predecessor: null,
      actor: { id: '42', login: 'fixture' },
      recordedAt: '2026-10-01T00:00:00.000Z',
    });
    const bin = path.join(s.context.root, 'transport-bin'),
      marker = path.join(s.context.root, 'transport-effect');
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, 'gh'),
      '#!' +
        process.execPath +
        '\n' +
        'require("node:fs").writeFileSync(' +
        JSON.stringify(marker) +
        ',"unexpected transport"); process.exit(97);\n'
    );
    fs.chmodSync(path.join(bin, 'gh'), 0o755);
    process.env.PATH = bin + path.delimiter + previousPath;
    let error;
    try {
      await ensureRecordComment({
        repository: context.repository,
        issue: context.issue,
        projectDir: context.executor.worktree,
        record,
        expectedPredecessor: null,
        deps: { revisionBackend: backend, listComments: async () => [] },
      });
    } catch (caught) {
      error = caught;
    }
    assert.equal(fs.existsSync(marker), false);
    assert.equal(error?.code, 'revision-authority-unavailable');
    assert.equal(error?.blocker?.guardId, 'revision-mutation');
  } finally {
    process.env.PATH = previousPath;
    s.dispose();
  }
});
