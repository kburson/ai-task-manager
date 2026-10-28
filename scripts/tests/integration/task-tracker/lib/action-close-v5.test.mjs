// @story #1878
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  createCloseReadOnlyPorts,
  evaluateCloseReadiness,
} from '../../../../task-tracker/lib/action-decision/close.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { buildDeliveryCommitText } from '../../../../task-tracker/lib/delivery-attribution.mjs';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';

const ISSUE = 1878;
const NOW = '2026-10-04T18:00:00.000Z';
function fixture({
  advanced = false,
  overlap = false,
  changed = false,
  shared = false,
  claim = null,
} = {}) {
  const dir = mkdtempProjectIsolated('close-v5-');
  const git = (args, input) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', input }).trim();
  writeFileSync(path.join(dir, '.gitignore'), '.ai-task-manager/\n.tmp/\n');
  git(['config', 'user.name', 'Fixture']);
  git(['config', 'user.email', 'fixture@example.com']);
  writeFileSync(path.join(dir, 'file with space.txt'), 'base\n');
  git(['add', '.']);
  git(['commit', '-qm', 'base']);
  const base = git(['rev-parse', 'HEAD']);
  git(['checkout', '-qb', 'feature/1878']);
  writeFileSync(path.join(dir, 'file with space.txt'), 'accepted\n');
  git(['add', '.']);
  const sourceMessage = shared ? '[#1877] [#1878] accepted source' : '[#1878] accepted source';
  git(['commit', '-qm', sourceMessage]);
  const head = git(['rev-parse', 'HEAD']);
  const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
  git(['checkout', '-q', 'trunk']);
  if (advanced) {
    writeFileSync(path.join(dir, overlap ? 'file with space.txt' : 'other.txt'), 'trunk advance\n');
    git(['add', '.']);
    git(['commit', '-qm', 'trunk advance']);
  }
  const integrationBase = git(['rev-parse', 'HEAD']);
  git(['checkout', head, '--', 'file with space.txt']);
  if (changed) writeFileSync(path.join(dir, 'file with space.txt'), 'contradictory\n');
  git(['add', '.']);
  const tree = git(['write-tree']);
  const canonical = buildDeliveryCommitText({
    issueNumber: shared ? 1877 : ISSUE,
    prNumber: 99,
    expectedHeadSha: head,
    commitSubjects: [sourceMessage],
  });
  const text = { ...canonical };
  if (claim === 'prose') text.commitMessage = 'Mention [#1878] without a canonical claim';
  if (claim === 'duplicate') text.commitMessage += '\nAttribution: [#1877] [#1878]';
  if (claim === 'foreign-owner') text.commitTitle = '[#999] Governed PR delivery';
  const merged = git(
    ['commit-tree', tree, '-p', integrationBase],
    text.commitTitle + '\n\n' + text.commitMessage + '\n'
  );
  git(['checkout', '-qf', 'feature/1878']);
  const intent = buildDeliveryIntent({
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: ISSUE,
    repository: 'example/project',
    prNumber: 99,
    baseRef: 'trunk',
    headRef: 'feature/1878',
    expectedHeadSha: head,
    mergeMethod: 'squash',
    attributionTokens: text.attributionTokens,
    commitTitle: text.commitTitle,
    commitMessage: text.commitMessage,
    provider: shared ? 'external' : 'codex',
    sessionId: 'fixture-v5',
    clientCreatedAt: NOW,
  });
  const evidence = [{ oid: head, parents: [base], tree: sourceTree, message: sourceMessage }];
  const receipt = buildDeliveryReceipt({
    intentId: intent.intentId,
    issueNumber: ISSUE,
    prNumber: 99,
    expectedHeadSha: head,
    mergeCommitSha: merged,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: intent.provider,
    sessionId: intent.sessionId,
    verifiedAt: NOW,
    sourceDigest:
      'sha256:' + createHash('sha256').update(canonicalRecordJson(evidence)).digest('hex'),
    observedIntegration: {
      method: 'squash',
      mergeCommitSha: merged,
      parents: [integrationBase],
      tree,
      commitTitle: text.commitTitle,
      commitMessage: text.commitMessage,
      sourceMapping: [{ source: head, integrated: merged }],
      contentProof: {
        kind: 'equivalent-delta',
        sourceBase: base,
        sourceHead: head,
        integrationBase,
        integrationHead: merged,
      },
    },
  });
  const body = [
    '## User Story\nClose safely\n\n## Scope\nRead-only close\n\n## Acceptance Criteria\n- [x] Close safely',
    ...['backlog', 'refine', 'plan', 'develop', 'test', 'review'].map(
      (stage, i) => `<!-- aitm-entered-${stage}: 2026-06-07T0${i}:00:00Z -->`
    ),
    `<!-- aitm-dod-verified: ${head}:2026-06-07T07:00:00Z -->`,
    '<!-- aitm-review-approved: 2026-06-07T08:00:00Z -->',
    '- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->',
    `<!-- aitm-verification-receipt stage="test" data="${Buffer.from(JSON.stringify({ stage: 'test', commitSha: head })).toString('base64url')}" -->`,
  ].join('\n');
  const pr = {
    number: 99,
    merged: true,
    state: 'MERGED',
    headRefName: intent.headRef,
    headRefOid: head,
    baseRefName: 'trunk',
    mergeCommitSha: merged,
    mergedAt: NOW,
    mergeMethod: 'squash',
    sourceCommitsComplete: true,
    sourceCommitsHeadSha: head,
    sourceCommits: [{ oid: head, messageHeadline: evidence[0].message }],
    sourceCommitEvidence: evidence,
    headRefDeleted: false,
  };
  const gateInput = {
    issueNumber: ISSUE,
    repository: 'example/project',
    body,
    branch: intent.headRef,
    acceptedSha: head,
    observedLocalHeadSha: head,
    headRelation: 'current',
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    pullRequests: [pr],
    pullRequest: pr,
    records: {
      intents: [{ record: intent }],
      receipts: [{ record: receipt }],
      liveIntent: { record: intent, createdAt: NOW },
      matchingReceipt: { record: receipt },
    },
  };
  const cfg = {
    repo: 'example/project',
    projectId: 'P',
    trunkRef: 'origin/trunk',
    lifecycleCheckboxesRequired: false,
  };
  const commands = [];
  const ports = createCloseReadOnlyPorts({
    issue: ISSUE,
    cfg,
    projectDir: dir,
    deps: {
      run: async (command, args) => {
        commands.push([command, args]);
        assert.equal(command, 'git');
        assert.ok(['cat-file', 'show', 'merge-base', 'ls-tree', 'log'].includes(args[0]));
        return { stdout: execFileSync(command, args, { cwd: dir, encoding: 'utf8' }) };
      },
    },
  });
  const context = {
    issueNumber: ISSUE,
    repo: cfg.repo,
    cfg,
    projectDir: dir,
    body,
    headSha: head,
    fromState: 'review',
    toState: 'done',
    readOnly: true,
    children: [],
    attribution: { status: 'attributed', tip: { sha: merged } },
    delivery: {
      mode: 'ordinary',
      gateInput,
      authority: { remote: 'origin' },
      graph: [[ISSUE, { parent: null, children: [] }]],
    },
  };
  const authority = {
    comments: [],
    files: {},
    dirty: [],
    parentState: null,
    dependency: { status: 'ready', states: [] },
  };
  function snapshot() {
    const files = [];
    function walk(root) {
      for (const item of readdirSync(root, { withFileTypes: true })) {
        const file = path.join(root, item.name);
        if (item.isDirectory()) walk(file);
        else
          files.push([
            path.relative(dir, file),
            createHash('sha256').update(readFileSync(file)).digest('hex'),
          ]);
      }
    }
    walk(dir);
    return files.sort();
  }
  return { dir, ports, context, authority, commands, snapshot, merged, cfg };
}
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
