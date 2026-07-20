// @story #914 (epic #912)
// Gated delivery into a NON-TRUNK parent branch: verify the merge-back was
// performed and the child branch eliminated BEFORE the done transition.
//
// #905's `merge-back.mjs` PERFORMS delivery (rebase child onto epic → run gates →
// `git merge --ff-only` → delete child branch/worktree). This module is its
// honest mirror on the done side: it never merges anything — it VERIFIES, at the
// moment "done" is about to be recorded, that the merge-back already happened and
// left no orphaned child branch. Keeping perform and verify in separate hands is
// what stops the recorded "done" fact from drifting away from the real git
// topology (the #521 failure mode — a tick that lies about what actually landed).
//
// Ordering invariant enforced: pass all gates → merge into parent → done. Done
// cannot be recorded before the merge is verified. `deliveryOrderingSatisfied`
// is the pure predicate the caller composes; `verifyMergeBackForDone` is the
// topology check that supplies its `mergeVerified` input.
//
// Scope boundary: TRUNK delivery is out of scope here — that path is PR-gated and
// owned by #908. A child whose parent branch is trunk (or a standalone story)
// short-circuits to an inert pass, so trunk-only repos and root stories are never
// touched by this gate.
//
// Reconciliation: composes with #913's `lineageDoneGate` (which asserts the
// `[#N]` commit is reachable on the parent branch) and the #877 review→done
// all-children-done gate — this module adds the branch-elimination fact those two
// do not check. Pure core (graph + git predicates injected via `deps`); the
// git-backed defaults are used only when a caller omits them.

import { execFileSync } from 'node:child_process';

import { resolveEpicLineage } from './resolve-epic-lineage.mjs';
import { composeBranchName } from './branch-name.mjs';

// Default git-backed `branchExists(branch) → boolean`. A local ref check; never
// throws (a missing ref is the answer, not an error).
export function defaultBranchExists(branch) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

// Default git-backed `isAncestor(ancestor, descendant) → boolean` via
// `git merge-base --is-ancestor` (exit 0 = ancestor).
export function defaultIsAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

// The pure ordering predicate. "done" is permissible only when every gate has
// passed AND the merge-back into the parent is verified present. Encodes
// `pass all gates → merge into parent → done`; a false on either input forbids
// the transition. Exported so the done-path caller composes the invariant
// without re-deriving it.
export function deliveryOrderingSatisfied({ gatesPassed, mergeVerified } = {}) {
  return Boolean(gatesPassed) && Boolean(mergeVerified);
}

// Verify that a child destined for a non-trunk parent was merged back and had
// its branch eliminated before the done transition.
//
//   verifyMergeBackForDone({ issueNumber, deps }) →
//     { ok: true, skipped?, childBranch?, parentBranch?, merged? }
//   | { ok: false, blocker, childBranch, parentBranch, merged? }
//
// deps: { graph, trunk?, branchExists?, isAncestor?, commitReachable? }
//   graph(issue) → { parent, children }        (required — via resolveEpicLineage)
//   commitReachable(issue, branch) → boolean    (optional; when present, the
//     branch-eliminated path additionally asserts the `[#N]` deliverable actually
//     landed on the parent — a child branch deleted WITHOUT merging back is caught)
export function verifyMergeBackForDone({ issueNumber, deps = {} } = {}) {
  if (issueNumber == null) throw new Error('verifyMergeBackForDone: issueNumber is required');
  const trunk = deps.trunk || 'trunk';
  const branchExists = deps.branchExists || defaultBranchExists;
  const isAncestor = deps.isAncestor || defaultIsAncestor;
  const commitReachable = deps.commitReachable;

  const lineage = resolveEpicLineage(issueNumber, { deps });

  // Only a child delivers into a parent branch. An epic integrates its own
  // children (handled by #883/#877); a standalone story delivers to trunk.
  if (lineage.role !== 'child') {
    return { ok: true, skipped: `role-${lineage.role}-not-a-child-delivery` };
  }

  const parentBranch = lineage.parentBranch || lineage.epicBranch;
  if (!parentBranch || parentBranch === trunk) {
    // Trunk delivery is PR-gated and owned by #908 — inert here.
    return { ok: true, skipped: 'trunk-parent-delivery-out-of-scope', parentBranch: trunk };
  }

  const childBranch = lineage.branch || composeBranchName({ role: 'child', issue: issueNumber });

  // A. The child branch must be eliminated once the item is done. A surviving
  //    branch is a refusal regardless — but the message sharpens when it also
  //    carries commits the parent never received (merge-back never happened).
  if (branchExists(childBranch)) {
    const merged = isAncestor(childBranch, parentBranch);
    return {
      ok: false,
      blocker: merged
        ? `gated-delivery-child-branch-not-eliminated: ${childBranch} is merged into ${parentBranch} but still exists — delete the child branch on done`
        : `gated-delivery-merge-back-not-performed: ${childBranch} has commits not on ${parentBranch} — rebase + ff-merge into the parent before done`,
      childBranch,
      parentBranch,
      merged,
    };
  }

  // B. The branch is gone (eliminated). If the caller supplied a reachability
  //    probe, confirm the deliverable actually landed on the parent — a branch
  //    deleted WITHOUT a merge-back would otherwise pass silently.
  if (typeof commitReachable === 'function' && !commitReachable(issueNumber, parentBranch)) {
    return {
      ok: false,
      blocker: `gated-delivery-merge-back-missing: no [#${issueNumber}] commit reachable on ${parentBranch} — the child branch was eliminated without merging back`,
      childBranch,
      parentBranch,
      merged: false,
    };
  }

  return { ok: true, childBranch, parentBranch, merged: true };
}
