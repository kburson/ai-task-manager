// @story #1878 #2100
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import {
  createCloseReadOnlyPorts,
  evaluateCloseReadiness,
} from '../../../../task-tracker/lib/action-decision/close.mjs';
import { fixture, ISSUE, NOW } from '../../../helpers/close-v5-fixture.mjs';
for (const advanced of [false, true]) {
  test(`production read-only v5 proof is ready on ${advanced ? 'disjoint advanced' : 'exact'} base and leaves Git and worktree bytes unchanged`, async () => {
    const f = fixture({ advanced });
    try {
      const before = f.snapshot();
      const result = await f.ports.runReadOnlyGuards('review', 'done', f.context, f.authority);
      assert.equal(result.status, 'ready', JSON.stringify(result));
      assert.deepEqual(f.snapshot(), before);
      assert.ok(f.commands.some(([, args]) => args[0] === 'ls-tree'));
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
}
test('production v5 proof refuses changed content and overlapping base changes', async () => {
  for (const options of [{ changed: true }, { advanced: true, overlap: true }]) {
    const f = fixture(options);
    try {
      const before = f.snapshot();
      await assert.rejects(
        f.ports.runReadOnlyGuards('review', 'done', f.context, f.authority),
        /merge-method-evidence/
      );
      assert.deepEqual(f.snapshot(), before);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  }
});
test('production v5 proof refuses unavailable accepted objects and conflicting receipt bytes', async () => {
  for (const missing of [true, false]) {
    const f = fixture();
    try {
      if (missing)
        f.context.delivery.gateInput.pullRequest.sourceCommitEvidence[0].parents = ['f'.repeat(40)];
      else
        ((f.context.delivery.gateInput.records.matchingReceipt.record = structuredClone(
          f.context.delivery.gateInput.records.matchingReceipt.record
        )),
          (f.context.delivery.gateInput.records.matchingReceipt.record.observedIntegration.commitMessage =
            'changed evidence'));
      const before = f.snapshot();
      await assert.rejects(f.ports.runReadOnlyGuards('review', 'done', f.context, f.authority));
      assert.deepEqual(f.snapshot(), before);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  }
});

// #2099: attribution must come from the actual reader, never a true stub.
test('shared canonical v5 delivery authorizes real Close attribution and executed guards', async () => {
  const f = fixture({ shared: true });
  try {
    const before = f.snapshot();
    const attributed = await f.ports.hasAttributingCommit(
      ISSUE,
      { cwd: f.dir, refs: [f.merged] },
      f.context.delivery
    );
    assert.equal(attributed, true);
    f.context.attribution.status = attributed ? 'attributed' : 'not-attributed';
    const result = await f.ports.runReadOnlyGuards('review', 'done', f.context, f.authority);
    assert.equal(
      result.status,
      'ready',
      JSON.stringify({
        status: result.status,
        blockers: result.blockers,
        observations: result.observations?.filter((x) => x.status !== 'observed'),
      })
    );
    assert.deepEqual(f.snapshot(), before);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('shared Close attribution refuses missing or unequal v5 proof and foreign authority', async () => {
  for (const mutation of ['proof', 'issue', 'source', 'target', 'claim', 'prose', 'unequal']) {
    const f = fixture({ shared: true, changed: mutation === 'unequal' });
    try {
      const input = f.context.delivery.gateInput;
      const receipt = structuredClone(input.records.matchingReceipt.record);
      input.records.matchingReceipt.record = receipt;
      input.records.receipts[0].record = receipt;
      if (mutation === 'proof') delete receipt.observedIntegration.contentProof;
      if (mutation === 'issue') input.issueNumber = 999;
      if (mutation === 'source') input.acceptedSha = 'f'.repeat(40);
      if (mutation === 'target') input.lineage.deliveryTarget = 'foreign';
      if (mutation === 'claim')
        receipt.observedIntegration.commitMessage += '\nAttribution: [#1878]';
      if (mutation === 'prose') receipt.observedIntegration.commitMessage = 'mentions [#1878]';
      const before = f.snapshot();
      await assert.rejects(
        f.ports.hasAttributingCommit(ISSUE, { cwd: f.dir, refs: [f.merged] }, f.context.delivery),
        undefined,
        mutation
      );
      assert.deepEqual(f.snapshot(), before);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  }
});

test('production Close collector and legacy guard share verified secondary attribution', async () => {
  const f = fixture({ shared: true });
  try {
    const body =
      f.context.body +
      '\n<!-- aitm-last-known-state state="review" ts="2026-10-04T18:00:00.000Z" -->';
    f.context.delivery.gateInput.body = body;
    const before = f.snapshot();
    const result = await evaluateCloseReadiness({
      issue: ISSUE,
      cfg: f.cfg,
      projectDir: f.dir,
      now: () => NOW,
      deps: {
        readIssue: async () => ({ number: ISSUE, body, state: 'OPEN', updatedAt: NOW }),
        readHead: async () => f.context.headSha,
        readWorktree: async () => ({ headSha: f.context.headSha, matches: true, dirtyPaths: [] }),
        readDelivery: async () => f.context.delivery,
        readChildren: async () => ({ complete: true, children: [] }),
        fetchBoard: async () => ({ state: 'review' }),
        workflowPolicyRuntime: { listRecords: async () => [] },
        run: async (command, args) => {
          if (command === 'git') {
            if (args[0] === 'ls-remote') return { stdout: f.merged + '\trefs/heads/trunk\n' };
            return { stdout: execFileSync(command, args, { cwd: f.dir, encoding: 'utf8' }) };
          }
          if (command === 'gh' && args[0] === 'api') return { stdout: '[[]]' };
          if (command === 'gh' && args[0] === 'issue')
            return {
              stdout: JSON.stringify({
                blockedBy: { nodes: [], totalCount: 0 },
                blocking: { nodes: [], totalCount: 0 },
              }),
            };
          throw new Error('unexpected transport ' + command + ' ' + args.join(' '));
        },
      },
    });
    assert.equal(
      result.status,
      'ready',
      JSON.stringify({
        status: result.status,
        blockers: result.blockers,
        observations: result.observations?.filter((x) => x.status !== 'observed'),
      })
    );
    assert.deepEqual(f.snapshot(), before);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('coherent v5 records cannot authorize prose, duplicate claims or a foreign owner', async () => {
  for (const claim of ['prose', 'duplicate', 'foreign-owner']) {
    const f = fixture({ shared: true, claim });
    try {
      const before = f.snapshot();
      await assert.rejects(
        f.ports.hasAttributingCommit(ISSUE, { cwd: f.dir, refs: [f.merged] }, f.context.delivery),
        /shared-attribution-claim/
      );
      assert.deepEqual(f.snapshot(), before);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  }
});

test('executed lineage gate consumes the verified shared-attribution adapter', async () => {
  const f = fixture({ shared: true });
  try {
    const { lineageDoneGate } =
      await import('../../../../task-tracker/lib/close-gates-lineage.mjs');
    const options = {
      cfg: f.cfg,
      issueNumber: ISSUE,
      projectDir: f.dir,
      body: f.context.body,
      includeEvidence: true,
      acceptedSha: f.context.headSha,
      deps: {
        resolveTrunkRef: async () => f.merged,
        graph: () => ({ parent: null, children: [] }),
        branchExists: () => false,
        listComments: async () => [
          { body: `### 🔗 Commits\n<!-- aitm-commits shas="${f.context.headSha}" -->` },
        ],
      },
    };
    assert.equal((await lineageDoneGate(options)).ok, false);
    const { createVerifiedCloseAttribution } =
      await import('../../../../task-tracker/lib/action-decision/close.mjs');
    const before = f.snapshot();
    const adapter = createVerifiedCloseAttribution({
      issue: ISSUE,
      cfg: f.cfg,
      projectDir: f.dir,
      gateInput: f.context.delivery.gateInput,
      run: async (command, args) => ({
        stdout:
          args[0] === 'ls-remote'
            ? f.merged + '\trefs/heads/trunk\n'
            : execFileSync(command, args, { cwd: f.dir, encoding: 'utf8' }),
      }),
    });
    const result = await lineageDoneGate({
      ...options,
      deps: { ...options.deps, attributingCommits: adapter },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    await assert.rejects(adapter(ISSUE, { cwd: f.dir, refs: [f.context.headSha] }), /target-drift/);
    assert.deepEqual(f.snapshot(), before);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

// @story #2100 — native assembly discovers immutable comments, not outer attribution.
test('inner Done dependency assembly discovers comment-only shared v5 delivery', async () => {
  const f = fixture({ shared: true });
  try {
    const { buildCloseGatesDeps } =
      await import('../../../../task-tracker/lib/move-state/guard-execution.mjs');
    const { lineageDoneGate } =
      await import('../../../../task-tracker/lib/close-gates-lineage.mjs');
    const { renderDeliveryIntentComment, renderDeliveryReceiptComment } =
      await import('../../../../task-tracker/lib/delivery-records.mjs');
    const g = f.context.delivery.gateInput;
    const comments = [
      { id: 1, body: renderDeliveryIntentComment(g.records.liveIntent.record), created_at: NOW },
      {
        id: 2,
        body: renderDeliveryReceiptComment(g.records.matchingReceipt.record),
        created_at: NOW,
      },
      {
        id: 3,
        body: `### 🔗 Commits\n<!-- aitm-commits shas="${g.acceptedSha}" -->`,
        created_at: NOW,
      },
    ];
    execFileSync('git', ['update-ref', 'refs/remotes/origin/trunk', f.merged], { cwd: f.dir });
    const run = async (command, args) => {
      if (command === 'git')
        return {
          stdout:
            args[0] === 'ls-remote'
              ? `${f.merged}\trefs/heads/trunk\n`
              : execFileSync(command, args, { cwd: f.dir, encoding: 'utf8' }),
        };
      if (args[0] === 'api' && args.includes('graphql'))
        return {
          stdout: JSON.stringify({
            data: { repository: { issue: { number: ISSUE, body: g.body, parent: null } } },
          }),
        };
      if (args.some((x) => x.includes('sub_issues'))) return { stdout: '[[]]' };
      if (args.some((x) => x.includes('comments'))) return { stdout: JSON.stringify([comments]) };
      if (args[0] === 'pr' && args[1] === 'list')
        return { stdout: JSON.stringify([{ ...g.pullRequest, mergeCommit: { oid: f.merged } }]) };
      throw new Error('unexpected transport ' + JSON.stringify([command, args]));
    };
    const deps = await buildCloseGatesDeps({
      stateArg: 'done',
      pexec: run,
      projectDir: f.dir,
      issueNumber: ISSUE,
      cfg: f.cfg,
      body: g.body,
      fetchPullRequestEvidence: async () => g.pullRequest,
    });
    const result = await lineageDoneGate({
      cfg: f.cfg,
      issueNumber: ISSUE,
      projectDir: f.dir,
      body: g.body,
      acceptedSha: g.acceptedSha,
      includeEvidence: true,
      deps: {
        ...deps.closeGates,
        graph: () => ({ parent: null, children: [] }),
        branchExists: () => false,
        listComments: async () => comments,
      },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});
