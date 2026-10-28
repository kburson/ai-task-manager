// @story #1878
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempProjectIsolated } from '../../task-tracker/lib/scratch-dir.mjs';
import { createCloseReadOnlyPorts } from '../../task-tracker/lib/action-decision/close.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
} from '../../task-tracker/lib/delivery-records.mjs';
import { buildDeliveryCommitText } from '../../task-tracker/lib/delivery-attribution.mjs';
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';

export const ISSUE = 1878;
export const NOW = '2026-10-04T18:00:00.000Z';
export function fixture({
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
  writeFileSync(path.join(dir, 'package.json'), '{}');
  writeFileSync(path.join(dir, 'package-lock.json'), '{}');
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
