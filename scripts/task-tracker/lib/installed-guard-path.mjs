// #659 AC2 — installed-guard self-modification interlock predicate.
//
// The PreToolUse activity guard refuses Edit/Write/NotebookEdit whose resolved
// path lands inside an *installed* guard tree — i.e. a path with a
// `node_modules/` segment leading to the ai-task-manager `scripts/` dir (or any
// package exposing a `scripts/task-tracker/` guard tree). The guards must not
// be editable by the very Write/Edit tools they gate.
//
// CRITICAL scoping rule: match the *installed* tree only, never the bare
// substring `ai-task-manager/scripts/`. This package's own dev checkout lives
// at `.../Vibe-Coding/ai-task-manager/scripts/...` with no `node_modules/`
// ancestor, so a substring match would refuse every edit to the package's own
// source and make the package impossible to maintain. Requiring a `node_modules/`
// segment keeps the dev checkout editable while closing the consumer-project
// hole (in a consumer project there is never a legitimate reason to hand-edit
// `node_modules/ai-task-manager/scripts/`).
//
// Pure logic — the path is supplied by the caller (already normalized by the
// guard's `normalizePath`), so this is fully unit-testable without the hook's
// stdin side effects.

// A `node_modules/` segment, then either the ai-task-manager package `scripts/`
// dir, or any package exposing a `scripts/task-tracker/` guard tree (defensive
// breadth against a renamed install). The `(?:@[^/]+\/)?` allows a scoped
// package prefix. The leading `(?:^|\/)` anchors on a path-segment boundary so
// both repo-relative (`node_modules/...`) and absolute
// (`/abs/.../node_modules/...`) forms match.
const INSTALLED_GUARD_RES = [
  /(?:^|\/)node_modules\/(?:@[^/]+\/)?ai-task-manager\/scripts\//,
  /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/scripts\/task-tracker\//,
];

// True when `targetPath` resolves inside an installed guard tree. Accepts
// either a repo-relative or an absolute path; tolerates Windows separators.
export function isInstalledGuardPath(targetPath) {
  const p = String(targetPath || '').replace(/\\/g, '/');
  if (!p) return false;
  return INSTALLED_GUARD_RES.some((re) => re.test(p));
}
