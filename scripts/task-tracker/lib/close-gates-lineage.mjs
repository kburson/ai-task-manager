// Lineage-aware "done" gate — Axis 1 of the two-axis delivery model (#913, epic #912).
//
// The flat `commitsOnTrunkGate` (close-gates.mjs) asks "is the deliverable on
// trunk?". That is the WRONG question for an epic-branch repo: a child of an
// in-flight epic is *done* (Axis 1, delivered-to-parent) the moment its `[#N]`
// commit is reachable on its immediate parent branch — long before the epic
// squash-merges to trunk (Axis 2, delivered-to-customer, derived on demand and
// never a close gate).
//
// This gate replaces the flat trunk reachability check with a lineage-scoped
// one:
//
//   * leaf story / child  — its `[#N]` commit must be reachable on
//                           `resolveEpicLineage().parentBranch`, walking up to
//                           the nearest surviving ancestor branch (through
//                           trunk) when the immediate parent branch is already
//                           gone (rebased away / deleted after merge-back).
//   * epic                — asserts its DERIVED child-trail (#883) on the
//                           epic's own branch while it survives, then on the
//                           nearest surviving ancestor after merge-back removes
//                           it. Reconciles with the #877 review→done
//                           all-children-done gate, which owns the orthogonal
//                           "are the children in state Done?" invariant.
//
// Trunk-only (no-epic) repositories see NO regression: `resolveEpicLineage`
// returns `parentBranch === trunk` for a standalone story, so the leaf check
// degenerates to exactly the old trunk reachability check.
//
// Every unit is pure modulo injected I/O (`deps.graph`, `deps.branchExists`,
// `deps.attributingCommits`, `deps.listComments`, `deps.epicTrailLog`), so the
// tests run without git or gh.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

import { resolveEpicLineage } from './resolve-epic-lineage.mjs';
import { parseBranchName } from './branch-name.mjs';
import { findCommitTrailComment, parseCommitShas } from './code-complete-gate.mjs';
import { attributingCommits as defaultAttributingCommits } from './commit-attribution.mjs';
import { resolveCurrentIssueWorktreeBranch } from './issue-worktree-location.mjs';
import {
  epicTrailLogArgs,
  parseEpicTrailLog,
  groupCommitsByChild,
  partitionChildrenByDeliveryRequirement,
  UnreachableChildrenError,
} from './epic-derived-commit-trail.mjs';

const pexec = promisify(execFile);

const DEFAULT_TRUNK = 'trunk';
const TRUNK_FALLBACKS = ['trunk', 'main', 'master'];

// Trunk-branch name resolution, mirroring close-gates.mjs `defaultResolveTrunkRef`
// (cfg.trunkRef → first existing local branch among trunk/main/master). The
// resolved name is the terminal of every lineage walk-up: for a trunk-only
// repo it IS the done-target branch, so honoring `cfg.trunkRef` here is what
// keeps a `main`-based repo passing.
async function defaultResolveTrunkRef({ cfg, projectDir }) {
  if (cfg && typeof cfg.trunkRef === 'string' && cfg.trunkRef.trim()) return cfg.trunkRef.trim();
  for (const ref of TRUNK_FALLBACKS) {
    try {
      await pexec('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`], {
        cwd: projectDir,
        timeout: 10000,
      });
      return ref;
    } catch {
      /* try next */
    }
  }
  return null;
}

function toIssueNumber(issueOrBranch) {
  if (typeof issueOrBranch === 'number' && Number.isInteger(issueOrBranch) && issueOrBranch > 0) {
    return issueOrBranch;
  }
  const parsed = parseBranchName(String(issueOrBranch));
  if (parsed) return parsed.issue;
  const n = Number(String(issueOrBranch).replace(/^#/, ''));
  if (Number.isInteger(n) && n > 0) return n;
  throw new Error(
    `close-gates-lineage: cannot resolve an issue from ${JSON.stringify(issueOrBranch)}`
  );
}

// Pure walk-up. Returns the branch on which this issue's deliverable must be
// reachable to satisfy Axis-1 "done": the immediate parent branch, walking up
// to the nearest surviving ancestor branch, terminating at trunk (which is the
// always-present terminal target).
//
//   deps.graph(issue) → { parent, children }   (required)
//   deps.branchExists(branch) → boolean        (default: everything exists)
//   deps.trunk                                 (default 'trunk')
export function resolveDoneTargetBranch({ issueNumber, deps = {} } = {}) {
  const graph = deps.graph;
  if (typeof graph !== 'function') {
    throw new Error('resolveDoneTargetBranch: deps.graph(issue) is required');
  }
  const trunk = deps.trunk || DEFAULT_TRUNK;
  const branchExists = typeof deps.branchExists === 'function' ? deps.branchExists : () => true;

  let currentIssue = toIssueNumber(issueNumber);
  const seen = new Set();
  // Walk up the lineage until a surviving parent branch is found or trunk is hit.
  // The `seen` set guards against a malformed (cyclic) sub-issue graph.
  for (;;) {
    if (seen.has(currentIssue)) return trunk;
    seen.add(currentIssue);

    const { parentBranch } = resolveEpicLineage(currentIssue, { deps: { graph, trunk } });
    if (parentBranch === trunk) return trunk; // terminal
    if (branchExists(parentBranch)) return parentBranch; // nearest surviving ancestor

    // Immediate parent branch is gone — climb to the parent epic and try its parent.
    const parsed = parseBranchName(parentBranch);
    if (!parsed || !parsed.issue) return trunk; // unparseable → conservative trunk fallback
    currentIssue = parsed.issue;
  }
}

async function defaultListComments({ cfg, issueNumber }) {
  const { stdout } = await pexec(
    'gh',
    [
      'issue',
      'view',
      String(issueNumber),
      '-R',
      cfg.repo,
      '--json',
      'comments',
      '--jq',
      '.comments',
    ],
    { timeout: 15000 }
  );
  return JSON.parse(stdout || '[]');
}

// Synchronous branch-existence probe mirroring close-gates.mjs:225
// (`git rev-parse --verify --quiet refs/heads/<b>`). Returns a closure so it can
// be swapped for a pure fake in tests.
function defaultBranchExists(projectDir) {
  return (branch) => {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
        cwd: projectDir,
        timeout: 10000,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return true;
    } catch {
      return false;
    }
  };
}

async function defaultEpicTrailLog({ epicHead, projectDir }) {
  const { stdout } = await pexec('git', epicTrailLogArgs(epicHead), {
    cwd: projectDir,
    timeout: 20000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

// The lineage-aware done gate. Same trail skip-semantics as `commitsOnTrunkGate`:
// no commit-trail comment → skip (nothing was ever committed); empty trail → skip.
// Only when the trail claims ≥1 commit is the Axis-1 reachability asserted.
export async function lineageDoneGate({ cfg, issueNumber, projectDir, deps = {} } = {}) {
  if (!cfg) throw new Error('lineageDoneGate: cfg is required');
  if (!issueNumber) throw new Error('lineageDoneGate: issueNumber is required');

  const listComments = deps.listComments || defaultListComments;
  const attributing = deps.attributingCommits || defaultAttributingCommits;
  const resolveTrunkRef = deps.resolveTrunkRef || defaultResolveTrunkRef;

  // Trail presence/empty skip (identical semantics to the trunk gate it replaces).
  let shas = [];
  try {
    const comments = await listComments({ cfg, issueNumber });
    const trail = findCommitTrailComment(comments);
    if (!trail) return { ok: true, skipped: 'no-commits-marker' };
    shas = parseCommitShas(trail.body);
  } catch (err) {
    return { ok: false, blocker: `close-lineage-comments-fetch-failed: ${err.message}` };
  }
  if (shas.length === 0) return { ok: true, skipped: 'empty-commits-marker' };

  // The trunk name is the walk-up terminal; explicit `deps.trunk` wins for tests.
  const trunk = deps.trunk || (await resolveTrunkRef({ cfg, projectDir })) || DEFAULT_TRUNK;

  // Resolve role from the sub-issue graph. A fail-safe wrapper degrades a graph
  // lookup error (e.g. `gh` unavailable) to "standalone story", so a repo with
  // no epic structure falls back to exactly the flat trunk check — never a crash.
  const rawGraph = deps.graph || defaultGraphFactory({ cfg, projectDir });
  const graph = (issue) => {
    try {
      return rawGraph(issue) || { parent: null, children: [] };
    } catch {
      return { parent: null, children: [] };
    }
  };
  const branchExists =
    typeof deps.branchExists === 'function' ? deps.branchExists : defaultBranchExists(projectDir);

  let lineage;
  try {
    lineage = resolveEpicLineage(issueNumber, { deps: { graph, trunk } });
  } catch (err) {
    return { ok: false, blocker: `close-lineage-resolve-failed: ${err.message}` };
  }

  const id = String(issueNumber).replace(/^#/, '');

  if (lineage.role === 'epic') {
    let epicHead = lineage.branch;
    if (!branchExists(epicHead)) {
      try {
        epicHead = resolveDoneTargetBranch({
          issueNumber,
          deps: { graph, branchExists, trunk },
        });
      } catch (err) {
        return { ok: false, blocker: `close-lineage-target-unresolved: ${err.message}` };
      }
    }
    return epicDerivedTrailGate({
      epicNumber: Number(id),
      epicHead,
      projectDir,
      graph,
      epicTrailLog: deps.epicTrailLog,
    });
  }

  // Leaf story / child — reachable on the (walked-up) parent branch.
  let doneBranch;
  try {
    doneBranch = resolveDoneTargetBranch({ issueNumber, deps: { graph, branchExists, trunk } });
  } catch (err) {
    return { ok: false, blocker: `close-lineage-target-unresolved: ${err.message}` };
  }

  let commits;
  try {
    commits = await attributing(issueNumber, { cwd: projectDir, refs: [doneBranch] });
  } catch (err) {
    return {
      ok: false,
      blocker: `close-lineage-attribution-failed: message-attribution against ${doneBranch} failed: ${err.message}`,
      doneBranch,
    };
  }
  if (Array.isArray(commits) && commits.length > 0) return { ok: true, doneBranch };

  return {
    ok: false,
    blocker: `close-not-on-parent-branch: no commit referencing [#${id}] reachable on ${doneBranch} — merge into ${doneBranch}`,
    doneBranch,
  };
}

// Epic done check — the derived child-trail (#883) must be reachable on the
// selected delivery target. Delegates the reachability arithmetic to
// `groupCommitsByChild`; refuses naming every child with no reachable commit.
async function epicDerivedTrailGate({ epicNumber, epicHead, projectDir, graph, epicTrailLog }) {
  const trailLog = epicTrailLog || ((args) => defaultEpicTrailLog(args));

  const { children = [] } = graph(epicNumber) || {};
  const childList = children.map((c) => (typeof c === 'object' ? c : { number: Number(c) }));
  if (childList.length === 0) {
    // A leaf mislabeled as epic (no children) has no derived trail to assert.
    return { ok: true, epicHead, skipped: 'no-children' };
  }

  let stdout;
  try {
    stdout = await trailLog({ epicHead, projectDir });
  } catch (err) {
    return { ok: false, blocker: `close-epic-trail-log-failed: ${err.message}`, epicHead };
  }
  const commits = parseEpicTrailLog(stdout);
  const { deliveryRequired } = partitionChildrenByDeliveryRequirement(childList);
  const groups = groupCommitsByChild({ children: deliveryRequired, commits });
  const unreachable = groups.filter((g) => g.commits.length === 0);
  if (unreachable.length === 0) return { ok: true, epicHead };

  const err = new UnreachableChildrenError(epicNumber, unreachable);
  return {
    ok: false,
    blocker: `close-epic-child-trail-incomplete: ${err.message}`,
    epicHead,
    unreachable: unreachable.map((g) => g.number),
  };
}

// Default gh-backed sub-issue graph builder (Pattern A — prefetch a single
// node, reused from merge-back.mjs/cut-child-worktree.mjs). Returns a SYNC
// `graph(issue)` closure so `resolveEpicLineage` (sync) can consume it. Because
// the gate only reaches this after the trail-skip guard, no gh call is made for
// the common no-commits close path.
export function closeGraphNodeFromQuery(data) {
  const node = data?.data?.repository?.issue ?? {};
  const parent = node.parent?.number ?? null;
  let parentAuthoritativeBranch;
  let parentAuthorityError;
  if (parent != null) {
    try {
      parentAuthoritativeBranch =
        resolveCurrentIssueWorktreeBranch(node.parent?.body || '') || undefined;
    } catch (error) {
      parentAuthorityError = error.message;
    }
  }
  return {
    parent,
    children: (node.subIssues?.nodes ?? []).map((child) => ({
      number: Number(child.number),
      title: child.title || '',
      closeReason: child.stateReason || null,
    })),
    ...(parentAuthoritativeBranch ? { parentAuthoritativeBranch } : {}),
    ...(parentAuthorityError ? { parentAuthorityError } : {}),
  };
}

function defaultGraphFactory({ cfg, projectDir }) {
  return (issue) => {
    const out = execFileSync(
      'gh',
      [
        'api',
        'graphql',
        '-f',
        `query=query { repository(owner: "${cfg.repo.split('/')[0]}", name: "${cfg.repo.split('/')[1]}") { issue(number: ${issue}) { parent { number body } subIssues(first: 100) { nodes { number title stateReason } } } } }`,
      ],
      { cwd: projectDir, encoding: 'utf8', timeout: 8000 }
    );
    return closeGraphNodeFromQuery(JSON.parse(out));
  };
}
