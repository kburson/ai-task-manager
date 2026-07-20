// #905 — flat, role-typed branch naming for epic-aware git branching.
//
//   feature/story/<N>    root-level standalone story  (cut from trunk)
//   feature/epic/<N>     epic                         (root: from trunk; nested: from parent epic)
//   feature/child/<N>    child of an epic             (cut from its epic head)
//
// Design invariant: **lineage is never encoded in the name.** Segment 2 is a
// mutable role hint (enables `feature/epic/*` globs); segment 3 is the
// globally-unique issue number and the real key. A re-parent is a `git rebase`
// with zero rename. Pure string logic — no git, no I/O.

export const ROLES = Object.freeze(['story', 'epic', 'child']);

const ROLE_SET = new Set(ROLES);

// `feature/<role>/<digits>` — exactly three segments. The `$` after the digits
// rejects the hierarchical `feature/epic/859/child/872` form (deliberately
// unsupported) and any non-numeric tail.
const BRANCH_RE = /^feature\/(story|epic|child)\/([0-9]+)$/;

export const STORY_GLOB = 'feature/story/*';
export const EPIC_GLOB = 'feature/epic/*';
export const CHILD_GLOB = 'feature/child/*';

// Coerce an issue argument to a positive integer or throw. Accepts a number or
// a numeric string; rejects zero, negatives, non-integers, and non-numeric
// strings.
function toIssueNumber(issue) {
  if (typeof issue === 'number') {
    if (Number.isInteger(issue) && issue > 0) return issue;
  } else if (typeof issue === 'string' && /^[0-9]+$/.test(issue)) {
    const n = Number(issue);
    if (n > 0) return n;
  }
  throw new Error(`branch-name: issue must be a positive integer, got ${JSON.stringify(issue)}`);
}

// Compose `feature/<role>/<N>`. Throws on unknown role or invalid issue.
export function composeBranchName({ role, issue } = {}) {
  if (!ROLE_SET.has(role)) {
    throw new Error(
      `branch-name: unknown role ${JSON.stringify(role)} (expected ${ROLES.join('|')})`
    );
  }
  const n = toIssueNumber(issue);
  return `feature/${role}/${n}`;
}

// Parse a managed branch name into `{ role, issue }`, or `null` when the input
// is not a flat `feature/<role>/<N>` branch (trunk, hotfix, hierarchical, bad
// role, missing/garbage number, empty, non-string).
export function parseBranchName(branch) {
  if (typeof branch !== 'string') return null;
  const m = BRANCH_RE.exec(branch);
  if (!m) return null;
  return { role: m[1], issue: Number(m[2]) };
}

// True when `branch` parses and its role equals `role`.
export function isRole(branch, role) {
  const parsed = parseBranchName(branch);
  return parsed != null && parsed.role === role;
}

// Git list-glob for a role (`feature/epic/*`). Throws on unknown role.
export function branchGlob(role) {
  if (!ROLE_SET.has(role)) {
    throw new Error(
      `branch-name: unknown role ${JSON.stringify(role)} (expected ${ROLES.join('|')})`
    );
  }
  return `feature/${role}/*`;
}
