// #871 — the base-aware post-close cleanup CONTRACT.
//
// This module is the specification half of the epic development pattern's
// cleanup step: it decides, purely, WHAT a cleanup run would do. The git side
// effects (`git worktree remove`, `git branch -d`, `git rebase`) belong to the
// follow-up implementation issue; nothing here touches the repository.
//
// The defect this contract exists to prevent: a cleanup routine that hardcodes
// `origin/trunk` as both the prune predicate and the rebase target. Mid-epic,
// a child's `[#N]` commit is reachable on `feature/epic/<N>` but NOT yet on
// trunk — so a trunk-bound predicate reaps nothing, and a trunk-bound rebase
// target drags surviving siblings off the epic head and back to trunk, which is
// exactly the wrong-base failure `cut-child-worktree` and the epic-base
// edit-guard exist to prevent.
//
// Both decisions are therefore evaluated against ONE `--base <ref>`:
//
//   - prune predicate : is the child's `[#N]` commit reachable from `--base`?
//   - rebase target   : survivors rebase onto `--base`.
//
// Two sanctioned invocations follow from that:
//
//   - mid-epic      : `--base feature/epic/<N>` reaps children already merged
//                     back into the epic while the epic is still in flight.
//   - epic-complete : `--base origin/trunk` (the default) reaps the epic branch
//                     and any straggler once the epic PR has merged.
//
// Reachability is message-based, consistent with AITM's attribution contract
// (`docs/guides/workflow.md` → Commit Attribution): a child is merged when its
// `[#N]` token appears in a commit message reachable from the base, never by
// SHA identity — so the predicate survives the rebase, squash, and amend that
// the integration path performs.

// The desync-proof default: a remote-tracking ref is never checked out, so
// reading it can never strand a worktree's index. Same rationale as
// `lib/trunk-ref.mjs`.
export const DEFAULT_CLEANUP_BASE = 'origin/trunk';

// Resolve the ref both cleanup decisions are evaluated against.
// An explicit `--base` always wins; otherwise the epic-completion default.
export function resolveCleanupBase({ base } = {}) {
  const explicit = typeof base === 'string' ? base.trim() : '';
  return explicit || DEFAULT_CLEANUP_BASE;
}

function normalizeIssueNumber(value) {
  const match = String(value ?? '').match(/^#?(\d+)$/);
  return match ? Number(match[1]) : null;
}

// Plan a cleanup run without performing it.
//
//   base       — the `--base <ref>` value; defaults to `origin/trunk`.
//   children   — [{ issue, branch, worktree }] candidate child records.
//   isReachable({ issue, base }) → boolean — injected reachability probe. The
//                real implementation greps `[#N]` across commit messages
//                reachable from `base`; tests inject a stub.
//
// Returns { base, prune: [...], rebase: [{ ...child, onto: base }] }. Every
// child lands in exactly one bucket, and every rebase target is `base` — never
// `origin/trunk` unless `base` resolved to it.
export function planBaseAwareCleanup({ base, children = [], isReachable } = {}) {
  if (typeof isReachable !== 'function') {
    throw new Error('planBaseAwareCleanup: isReachable({ issue, base }) is required');
  }
  const resolvedBase = resolveCleanupBase({ base });
  const prune = [];
  const rebase = [];

  for (const child of children) {
    const issue = normalizeIssueNumber(child?.issue);
    if (issue === null) {
      throw new Error(
        `planBaseAwareCleanup: bad child issue number ${JSON.stringify(child?.issue)}`
      );
    }
    const record = { ...child, issue };
    if (isReachable({ issue, base: resolvedBase })) {
      prune.push(record);
    } else {
      rebase.push({ ...record, onto: resolvedBase });
    }
  }

  return { base: resolvedBase, prune, rebase };
}
