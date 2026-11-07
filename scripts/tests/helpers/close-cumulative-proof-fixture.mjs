// @story #2165 — adversarial observations use real immutable Git objects.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, chmodSync, unlinkSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fixture } from './close-v5-fixture.mjs';
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';

export function cumulativeProofFixture(kind) {
  const f = fixture({
    cumulativePrefix: true,
    changed: kind === 'contradictory final',
    baseFiles: { 'retained.txt': 'retained base\n' },
  });
  const git = (args, input) =>
    execFileSync('git', args, { cwd: f.dir, encoding: 'utf8', input, stdio: 'pipe' }).trim();
  const g = f.context.delivery.gateInput;
  const evidence = structuredClone(g.pullRequest.sourceCommitEvidence);
  const receipt = structuredClone(g.records.matchingReceipt.record);
  g.records.matchingReceipt.record = receipt;
  g.records.receipts[0].record = receipt;
  if (kind.startsWith('unrelated ')) {
    git(['checkout', '-qb', 'adversarial-base', f.integrationBase]);
    const file = path.join(f.dir, 'retained.txt');
    if (kind === 'unrelated content') writeFileSync(file, 'unrelated integration change\n');
    else if (kind === 'unrelated mode') chmodSync(file, 0o755);
    else if (kind === 'unrelated delete') unlinkSync(file);
    else if (kind === 'unrelated rename') renameSync(file, path.join(f.dir, 'renamed.txt'));
    else throw Error('unknown adversarial base case: ' + kind);
    git(['add', '-A']);
    git(['commit', '-qm', '[#1878] Independent integration change']);
    const integrationBase = git(['rev-parse', 'HEAD']);
    const tree = git(['rev-parse', f.head + '^{tree}']);
    const observed = receipt.observedIntegration;
    const merged = git(
      ['commit-tree', tree, '-p', integrationBase],
      observed.commitTitle + '\n\n' + observed.commitMessage + '\n'
    );
    git(['checkout', '-qf', 'feature/1878']);
    f.integrationBase = integrationBase;
    f.merged = merged;
    f.context.attribution.tip.sha = merged;
    g.pullRequest.mergeCommitSha = merged;
    receipt.mergeCommitSha = merged;
    observed.mergeCommitSha = merged;
    observed.parents = [integrationBase];
    observed.tree = tree;
    observed.contentProof.integrationBase = integrationBase;
    observed.contentProof.integrationHead = merged;
  } else if (kind === 'observed tree') {
    evidence[6].tree = f.prefixTree;
  } else if (kind === 'observed parent') {
    evidence.splice(6, 1);
    evidence[6].parents = [evidence[5].oid];
  } else if (kind === 'missing object') {
    evidence[6].oid = 'f'.repeat(40);
    evidence[7].parents = [evidence[6].oid];
  } else if (kind === 'missing tree object') {
    const tree = evidence[6].tree;
    unlinkSync(path.join(f.dir, '.git/objects', tree.slice(0, 2), tree.slice(2)));
  } else if (kind === 'foreign prefix') {
    const message = '[#1878] Foreign prefix object';
    const oid = git(['commit-tree', f.prefixTree, '-p', f.sourceBase], message + '\n');
    const foreign = { oid, tree: f.prefixTree, parents: [f.sourceBase], message };
    evidence.splice(0, 8, foreign);
    evidence[1].parents = [oid];
  } else if (kind === 'incomplete inventory') {
    g.pullRequest.sourceCommitsComplete = false;
  } else if (kind === 'incomplete chain') {
    evidence.splice(6, 1);
  } else if (kind === 'wrong inventory head') {
    g.pullRequest.sourceCommitsHeadSha = f.prefixHead;
  } else if (kind === 'wrong accepted head') {
    g.acceptedSha = f.prefixHead;
  } else if (!['receipt mapping', 'contradictory final'].includes(kind)) {
    throw Error('unknown cumulative proof case: ' + kind);
  }
  // These are adversarial receipt claims, not newly verified delivery records.
  // Keep their claimed inventory/mapping internally coherent so immutable
  // object checks, rather than an incidental stale digest, must refuse them.
  g.pullRequest.sourceCommitEvidence = evidence;
  g.pullRequest.sourceCommits = evidence.map((c) => ({ oid: c.oid, messageHeadline: c.message }));
  receipt.sourceDigest =
    'sha256:' + createHash('sha256').update(canonicalRecordJson(evidence)).digest('hex');
  receipt.observedIntegration.sourceMapping = evidence.map(({ oid }) => ({
    source: oid,
    integrated: f.merged,
  }));
  if (kind === 'receipt mapping')
    receipt.observedIntegration.sourceMapping[7].integrated = f.integrationBase;
  return f;
}
