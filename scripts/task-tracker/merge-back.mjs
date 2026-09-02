#!/usr/bin/env node
// #905 — merge a child branch back into its epic (design: "Merge-back protocol").
//
//   node scripts/task-tracker/merge-back.mjs <child#> <worktree-path>
//
// The protocol keeps the epic a clean linear integration branch:
//   1. Opportunistic epic sync — if the epic's parent (grandparent of the child;
//      trunk for a root epic) has advanced, rebase the epic onto it first. If the
//      epic already contains that tip, this is a no-op.
//   2. Rebase the child onto the epic head. A conflict here refuses the merge.
//   3. Run the child's tests in its worktree. A failure refuses the merge.
//   4. `git merge --ff-only` the child into the epic — guaranteed linear.
//   5. On success, delete the child worktree and branch.
//
// Because every child rebases onto the epic before it lands, the epic stays a
// clean fast-forward target and children never cross-contaminate. Core is injectable
// (git + graph + test-runner); the CLI wires the real ones.

import { execFileSync } from 'node:child_process';

import { resolveEpicLineage } from './lib/resolve-epic-lineage.mjs';
import { resolveCurrentIssueWorktreeBranch } from './lib/issue-worktree-location.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

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

export function mergeBack({ child, path, deps } = {}) {
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

  // 1. Opportunistic epic sync (skip when already current).
  if (grandparent && !isAncestor(git, grandparent, epicBranch)) {
    git(['rebase', grandparent, epicBranch]);
  }

  // 2. Rebase the child onto the epic head, from inside the child worktree.
  // Conflict → refuse.
  try {
    wtGit(['rebase', epicBranch, childBranch]);
  } catch (err) {
    throw new Error(
      `merge-back: rebase conflict rebasing ${childBranch} onto ${epicBranch}: ${err.message}`
    );
  }

  // 3. Run the child's tests. Failure → refuse (no merge, no cleanup).
  if (!deps.runTests({ path, branch: childBranch })) {
    throw new Error(`merge-back: child ${childBranch} tests failed; refusing to merge`);
  }

  // 4. Fast-forward-only merge into the epic.
  git(['checkout', epicBranch]);
  git(['merge', '--ff-only', childBranch]);

  // 5. Cleanup on success.
  if (path) git(['worktree', 'remove', path]);
  git(['branch', '-d', childBranch]);

  return { merged: true, epic: epicBranch, child: childBranch };
}

// ---- #1485: graph-node mapping and prefetch boundaries -----------------------

// Pure mapping boundary: turn one issue's raw graph evidence (numeric parent,
// child list, and the PARENT issue's body) into the synchronous node shape
// `resolveEpicLineage` consumes.
//
// Contract notes:
//   - Emits at most one authority outcome. A valid current worktree-location
//     marker yields `parentAuthoritativeBranch`; a parse failure yields
//     `parentAuthorityError`; a parent body with no marker at all yields
//     NEITHER field, which is what preserves canonical `feature/epic/<N>`
//     fallback downstream. This mapper never invents a branch name.
//   - It populates only the PARENT's authority. The node's own
//     `authoritativeBranch` is deliberately left unset: merge-back only ever
//     asks where a child should land, never what the child's own recorded ref
//     is. A future caller needing that must add it explicitly rather than
//     assume this mapper supplied it.
//   - A non-null parent with no supplied body is a caller error, not a missing
//     marker — it throws rather than silently degrading to canonical fallback.
export function buildMergeBackGraphNode({ parent = null, children = [], parentBody } = {}) {
  const normalizedParent = parent == null ? null : Number(parent);
  if (normalizedParent != null && (!Number.isInteger(normalizedParent) || normalizedParent <= 0)) {
    throw new Error('merge-back: parent issue must be a positive integer');
  }
  const normalizedChildren = (children || []).map((child) => Number(child.number ?? child));
  if (normalizedChildren.some((child) => !Number.isInteger(child) || child <= 0)) {
    throw new Error('merge-back: child issues must be positive integers');
  }
  if (normalizedParent == null) return { parent: null, children: normalizedChildren };
  if (typeof parentBody !== 'string') {
    throw new Error(`merge-back: parent #${normalizedParent} body unavailable`);
  }
  try {
    const branch = resolveCurrentIssueWorktreeBranch(parentBody);
    return {
      parent: normalizedParent,
      children: normalizedChildren,
      ...(branch ? { parentAuthoritativeBranch: branch } : {}),
    };
  } catch (error) {
    return {
      parent: normalizedParent,
      children: normalizedChildren,
      parentAuthorityError: error.message,
    };
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

async function fetchIssueBody(issue, cfg) {
  const { gql, splitRepo } = await import('../gh/lib/github-projects.mjs');
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) { issue(number: $issue) { body } }
    }`,
    { owner, repo: repoName, issue: Number(issue) }
  );
  const body = data?.repository?.issue?.body;
  if (typeof body !== 'string') {
    throw new Error(`merge-back: parent #${issue} body unavailable`);
  }
  return body;
}

async function realGraphNode(issue, cfg, deps = {}) {
  const fetchParent =
    deps.fetchParentIssue || (await import('./lib/fetch-parent-issue.mjs')).fetchParentIssue;
  const fetchChildren =
    deps.fetchEpicChildren || (await import('./lib/epic-children-gate.mjs')).fetchEpicChildren;
  const fetchBody = deps.fetchIssueBody || fetchIssueBody;
  const parent = await fetchParent({ issueNumber: issue, repo: cfg.repo });
  const children = await fetchChildren({ cfg, parentEpicNumber: issue });
  const parentBody = parent == null ? undefined : await fetchBody(parent, cfg);
  return buildMergeBackGraphNode({ parent, children, parentBody });
}

function realGit(projectDir) {
  return (args) => execFileSync('git', args, { cwd: projectDir, encoding: 'utf8' }).trim();
}

async function main(argv) {
  if (wantsHelp(argv)) {
    emitSelfDoc('merge-back');
    return;
  }
  const child = Number(String(argv[0] || '').replace(/^#/, ''));
  const wtPath = argv[1];
  if (!Number.isInteger(child) || child <= 0) {
    process.stderr.write('usage: merge-back.mjs <child#> <worktree-path>\n');
    process.exit(2);
  }
  const { loadConfig } = await import('./config.mjs');
  const cfg = loadConfig();
  // #1485 — prefetch the child AND its immediate epic, keyed by issue number.
  // The retired constant single-node adapter returned the child's node for every
  // lookup, so the epic's own grandparent resolution silently read the child.
  // Built before any git or test-runner call, so an authority failure or a
  // missing node refuses with zero mutation.
  const graph = await loadMergeBackGraph({ child, cfg });
  const projectDir = cfg.projectDir || process.cwd();
  // #927 — the epic's grandparent, for a root epic, is trunk; the opportunistic
  // epic sync (step 1) rebases the epic onto it. Resolve+fetch the trunk ref so
  // that sync targets origin/trunk, not a stale local `trunk`.
  const { resolveTrunkRef, fetchTrunk } = await import('./lib/trunk-ref.mjs');
  await fetchTrunk({ cfg, projectDir });
  const trunk = await resolveTrunkRef({ cfg, projectDir });
  // #864 — `test:all` is retired; the suite runs only in bounded sections. Run
  // each section sequentially, each under its own 10-minute ceiling. Any section
  // failing (including a ceiling breach) fails the merge-back gate.
  const TEST_SECTIONS = ['test:unit', 'test:integration', 'test:slow'];
  const runTests = ({ path }) => {
    for (const section of TEST_SECTIONS) {
      try {
        execFileSync('npm', ['run', section], {
          cwd: path || projectDir,
          stdio: 'inherit',
        });
      } catch {
        return false;
      }
    }
    return true;
  };
  const { epic, child: childBranch } = mergeBack({
    child,
    path: wtPath,
    deps: {
      graph,
      git: realGit(projectDir),
      worktreeGit: wtPath ? realGit(wtPath) : realGit(projectDir),
      trunk,
      runTests,
    },
  });
  process.stdout.write(`merged ${childBranch} into ${epic}\n`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`merge-back: ${err.message}\n`);
    process.exit(1);
  });
}
