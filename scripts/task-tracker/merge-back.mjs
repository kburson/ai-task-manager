#!/usr/bin/env node
import { enforceDirectGuidance } from './lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'merge-back');
// #905 — merge a child branch back into its epic (design: "Merge-back protocol").
//
//   node scripts/task-tracker/merge-back.mjs <child#> <worktree-path> [--preserve-worktree]
//
// The protocol keeps the epic a clean fast-forward integration branch:
//   1. Opportunistic epic sync — if the epic's parent (grandparent of the child;
//      trunk for a root epic) has advanced, rebase the epic onto it first. If the
//      epic already contains that tip, this is a no-op.
//   2. Rebase the child only if it does not already contain the epic head.
//      Otherwise preserve its reviewed commit and merge ancestry. Conflicts refuse.
//   3. Run the child's tests in its worktree. A failure refuses the merge.
//   4. `git merge --ff-only` the verified child commit into the epic.
//   5. On success, clean up unless --preserve-worktree retains completion context.
//
// Because every child contains the current epic before it lands, the epic stays
// a clean fast-forward target while already-reviewed child history is retained. Core is injectable
// (git + graph + test-runner); the CLI wires the real ones.

import { resolve as resolvePath } from 'node:path';

import { buildGraphNodeAuthority, fetchParentIssueBody } from './lib/graph-node-authority.mjs';
import { resolveEpicLineage } from './lib/resolve-epic-lineage.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { createMergeBackTestRunner } from './lib/merge-back-verification.mjs';
import { runMergeBackCli } from './lib/merge-back-cli.mjs';
export { createMergeBackTestRunner };

// Is `ancestorRef` an ancestor of `descendantRef`? merge-base --is-ancestor
// signals via exit code; deps.git throws on non-zero.
function isAncestor(git, ancestorRef, descendantRef) {
  try {
    git(['merge-base', '--is-ancestor', ancestorRef, descendantRef]);
    return true;
  } catch {
    return false;
  }
}

function hasConfiguredUpstream(git, branch) {
  const upstream = git(['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`]);
  return Boolean(String(upstream || '').trim());
}

export function mergeBack({ child, path, preserveWorktree = false, deps } = {}) {
  if (typeof preserveWorktree !== 'boolean') {
    throw new TypeError('merge-back: preserveWorktree must be boolean');
  }
  if (child == null) throw new Error('merge-back: child issue is required');
  if (!deps || typeof deps.git !== 'function') {
    throw new Error('merge-back: deps.git(args) is required');
  }
  if (typeof deps.runTests !== 'function') {
    throw new Error('merge-back: deps.runTests() runner is required');
  }
  const git = deps.git;
  // The child branch is checked out in its own worktree, so its rebase must run
  // from inside that worktree — git refuses to check out a branch that is active
  // in another worktree from the main tree. `deps.worktreeGit` is git bound to
  // the child's worktree path; it falls back to `deps.git` for unit tests that
  // inject a single cwd-agnostic fake.
  const wtGit = deps.worktreeGit || deps.git;

  const childLineage = resolveEpicLineage(child, { deps });
  const trunk = deps.trunk || 'trunk';
  const epicBranch =
    childLineage.role === 'child'
      ? childLineage.epicBranch
      : childLineage.role === 'epic' && childLineage.parentBranch !== trunk
        ? childLineage.parentBranch
        : null;
  if (!epicBranch) {
    throw new Error(
      `merge-back: #${child} is not a child or nested epic of an epic (resolved role=${childLineage.role})`
    );
  }
  const childBranch = childLineage.branch;

  // #1601 — a durable child worktree record is branch authority, not a hint.
  // Validate the operator-supplied path and its checked-out branch before any
  // mutating Git command. Legacy issues without a record retain the canonical
  // branch synthesized by resolveEpicLineage.
  if (
    childLineage.worktreePath &&
    (!path || resolvePath(path) !== resolvePath(childLineage.worktreePath))
  ) {
    throw new Error(
      `merge-back: supplied worktree path ${JSON.stringify(path || '')} does not match recorded child worktree path ${JSON.stringify(childLineage.worktreePath)}`
    );
  }
  if (path && typeof deps.currentWorktreeBranch === 'function') {
    const currentBranch = deps.currentWorktreeBranch();
    if (currentBranch !== childBranch) {
      throw new Error(
        `merge-back: checked-out branch ${JSON.stringify(currentBranch)} does not match recorded child branch ${JSON.stringify(childBranch)}`
      );
    }
  }

  // Resolve the epic's own parent (the child's grandparent) to know what the epic
  // should sync onto: trunk for a root epic, the outer epic for a nested one.
  // #1485 — the epic's identity comes from the GRAPH edge, never from parsing
  // `epicBranch`: an authoritative branch is an opaque ref (`cloud-test-automation`)
  // that the managed `feature/<role>/<N>` grammar cannot parse.
  const epicIssue = childLineage.parentIssue;
  if (!Number.isInteger(epicIssue) || epicIssue <= 0) {
    throw new Error(`merge-back: #${child} has no valid parent epic issue`);
  }
  const grandparent = resolveEpicLineage(epicIssue, { deps }).parentBranch;

  deps.assertIntegrationCheckout?.();

  // 1. Opportunistic epic sync (skip when already current).
  if (grandparent && !isAncestor(git, grandparent, epicBranch)) {
    git(['rebase', grandparent, epicBranch]);
  }

  // 2. Synchronize only when the child does not already contain the epic head.
  // Preserve reviewed merge topology when no rebase is needed; conflict → refuse.
  if (!isAncestor(wtGit, epicBranch, childBranch)) {
    try {
      wtGit(['rebase', epicBranch, childBranch]);
    } catch (err) {
      throw new Error(
        `merge-back: rebase conflict rebasing ${childBranch} onto ${epicBranch}: ${err.message}`
      );
    }
  }

  // Pin the synchronized commit so branch movement cannot integrate unverified code.
  const verifiedHead = deps.currentWorktreeHead?.();

  // 3. Run the child's tests. Failure → refuse (no merge, no cleanup).
  if (deps.runTests({ path, branch: childBranch }) !== true) {
    throw new Error(`merge-back: child ${childBranch} tests failed; refusing to merge`);
  }

  if (verifiedHead && deps.currentWorktreeHead() !== verifiedHead) {
    throw new Error('merge-back: verified HEAD changed; refusing parent integration');
  }
  deps.assertIntegrationCheckout?.();

  // 4. Fast-forward-only merge into the epic at the exact verified commit.
  git(['checkout', epicBranch]);
  git(['merge', '--ff-only', verifiedHead || childBranch]);

  // 5. Cleanup on success.
  if (!preserveWorktree) {
    if (path) git(['worktree', 'remove', path]);
    if (hasConfiguredUpstream(git, childBranch)) {
      git(['branch', '--unset-upstream', childBranch]);
    }
    git(['branch', '-d', childBranch]);
  }

  return { merged: true, epic: epicBranch, child: childBranch };
}

// ---- #1485: graph-node mapping and prefetch boundaries -----------------------

// Pure mapping boundary: turn one issue's raw graph evidence (numeric parent,
// child list, the issue's own body, and the PARENT issue's body) into the
// synchronous node shape `resolveEpicLineage` consumes.
//
// Contract notes:
//   - The issue's own valid marker yields `authoritativeBranch` and
//     `authoritativeWorktree`; a parse failure yields `authorityError`.
//   - The parent's valid marker independently yields
//     `parentAuthoritativeBranch`; a parse failure yields
//     `parentAuthorityError`. A body with no marker yields no corresponding
//     authority fields, preserving canonical branch fallback downstream.
//     This mapper never invents a branch name.
//   - A non-null parent with no supplied body is a caller error, not a missing
//     marker — it throws rather than silently degrading to canonical fallback.
export function buildMergeBackGraphNode({
  parent = null,
  children = [],
  ownBody,
  parentBody,
} = {}) {
  try {
    return buildGraphNodeAuthority({ parent, children, ownBody, parentBody });
  } catch (error) {
    throw new Error(error.message.replace(/^graph-node-authority:/, 'merge-back:'));
  }
}

// Prefetch the two nodes the synchronous merge protocol reads — the child and
// its immediate epic — into a map keyed by issue number, then hand back a sync
// lookup. A lookup outside that set fails closed rather than returning the
// child node (the #1485 defect) or fabricating an empty one.
export async function loadMergeBackGraph({ child, cfg, deps = {} } = {}) {
  const loadNode = deps.loadNode || ((issue) => realGraphNode(issue, cfg, deps));
  const childNode = await loadNode(Number(child));
  if (!childNode) throw new Error(`merge-back: graph node #${child} unavailable`);
  const nodes = new Map([[Number(child), childNode]]);
  if (childNode.parent != null) {
    const epicIssue = Number(childNode.parent);
    const epicNode = await loadNode(epicIssue);
    if (!epicNode) throw new Error(`merge-back: graph node #${epicIssue} unavailable`);
    nodes.set(epicIssue, epicNode);
  }
  return (issue) => {
    const key = Number(issue);
    if (!nodes.has(key)) throw new Error(`merge-back: graph node #${issue} was not prefetched`);
    return nodes.get(key);
  };
}

// ---- CLI wiring (real git + real gh graph + real test runner) -----------------

export async function realGraphNode(issue, cfg, deps = {}) {
  const fetchParent =
    deps.fetchParentIssue || (await import('./lib/fetch-parent-issue.mjs')).fetchParentIssue;
  const fetchChildren =
    deps.fetchEpicChildren || (await import('./lib/epic-children-gate.mjs')).fetchEpicChildren;
  const fetchBody =
    deps.fetchIssueBody ||
    ((targetIssue, targetCfg) =>
      fetchParentIssueBody({ parentIssue: targetIssue, cfg: targetCfg, deps }));
  const parent = await fetchParent({ issueNumber: issue, repo: cfg.repo });
  const children = await fetchChildren({ cfg, parentEpicNumber: issue });
  const ownBody = await fetchBody(issue, cfg);
  const parentBody = parent == null ? undefined : await fetchBody(parent, cfg);
  return buildMergeBackGraphNode({ parent, children, ownBody, parentBody });
}

export async function runMergeBackCommand(argv, deps = {}) {
  return runMergeBackCli(argv, {
    ...deps,
    mergeBack,
    loadGraph: deps.loadGraph || (({ child, cfg }) => loadMergeBackGraph({ child, cfg })),
  });
}

async function main(argv) {
  if (wantsHelp(argv)) {
    emitSelfDoc('merge-back');
    return;
  }
  const { epic, child } = await runMergeBackCommand(argv);
  process.stdout.write(`merged ${child} into ${epic}\n`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`merge-back: ${err.message}\n`);
    process.exit(1);
  });
}
