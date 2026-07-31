// Direct-node PreToolUse guard entrypoint resolution (#792).
//
// The guards are wired in `.claude/settings.json` as bare `node <path>` hook
// commands. In an `isolation: "worktree"` worktree of this repo the gitignored
// `node_modules/` tree (and its `ai-task-manager` self-symlink) is absent, so
// `node node_modules/ai-task-manager/scripts/task-tracker/<guard>.mjs` fails to
// resolve the file *before any guard code runs*. Claude Code treats a crashed
// PreToolUse hook as non-blocking, so every guard silently fails OPEN in the
// single highest-risk context (parallel sub-agent fan-out).
//
// The failure is at node's file-resolution step — the `.mjs` never executes —
// so no in-module resolver can rescue it (sibling to #751's in-module
// fail-closed and #791's self-link provisioning). The fallback must live one
// layer up, in the shell-evaluated command string, which is the only layer that
// runs before node opens any file and can therefore pick a path that exists.
//
// Path asymmetry (the crux): a downstream install has the package at
// `node_modules/ai-task-manager/…` but no `scripts/task-tracker/`; a dogfood
// worktree may lack `node_modules/` but always has the tracked source under
// `scripts/task-tracker/`. No single static path covers both — only an inline
// existence pick does. node_modules is tried FIRST so downstream behavior is
// byte-for-byte unchanged (AC3); the repo-relative candidate only ever exists
// in this repo's own checkouts.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The direct-node PreToolUse guards that share this resolution contract.
// bash-guard/agent-guard/activity-guard are the #792-enumerated set;
// source-edit-gate carries the identical exposure and rides the same helper.
export const GUARD_NAMES = Object.freeze([
  'bash-guard',
  'agent-guard',
  'activity-guard',
  'source-edit-gate',
]);

// Ordered candidate paths (relative to the project root / cwd the hook runs in)
// for a guard's real handler. node_modules FIRST (downstream + installed
// dogfood), repo-relative SECOND (node_modules-less worktree of this repo).
export function guardEntrypointCandidates(name) {
  if (!name || typeof name !== 'string') {
    throw new TypeError('guardEntrypointCandidates: name must be a non-empty string');
  }
  return [
    `node_modules/ai-task-manager/scripts/task-tracker/${name}.mjs`,
    `scripts/task-tracker/${name}.mjs`,
  ];
}

// Resolve a guard's real handler to an absolute path via the node_modules →
// repo-relative fallback chain. Returns the first candidate whose absolute path
// (against `cwd`) exists, or `null` when neither resolves (the fail-closed
// signal). `exists` is injectable for tests.
export function resolveGuardEntrypoint(name, { cwd = process.cwd(), exists = existsSync } = {}) {
  for (const candidate of guardEntrypointCandidates(name)) {
    const abs = resolve(cwd, candidate);
    if (exists(abs)) return abs;
  }
  return null;
}

// Build the `node -e "…"` hook command string embedding the fallback pick.
// The inline program: resolves each candidate against process.cwd(), imports
// the first existing one in-process (so it inherits stdin fd 0 and propagates
// the guard's own process.exit code), invokes an explicit `runGuardBootstrap`
// export when the module supplies one, and — if NEITHER exists — writes a
// distinct stderr diagnostic and exits 2 (fail closed + loud, AC2). Legacy
// guards still execute at module top level and exit during import, so the
// optional callable does not double-run them.
export function guardBootstrapCommand(name) {
  const candidates = JSON.stringify(guardEntrypointCandidates(name));
  const program =
    `const {existsSync}=require('fs');` +
    `const {resolve}=require('path');` +
    `const {pathToFileURL}=require('url');` +
    `const c=${candidates};` +
    `const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);` +
    `if(!p){process.stderr.write('aitm ${name}: guard entrypoint unresolved ` +
    `(node_modules + repo-relative both absent) — failing closed\\n');process.exit(2);}` +
    `import(pathToFileURL(p).href).then(m=>` +
    `typeof m.runGuardBootstrap==='function'?m.runGuardBootstrap():undefined);`;
  return `node -e ${JSON.stringify(program)}`;
}

// Exact #792 command form retained only so installers can remove it during
// migration. It imported a guard but had neither safe shell serialization nor
// an explicit callable for import-side-effect-free guards.
export function legacyGuardBootstrapCommand(name) {
  const candidates = JSON.stringify(guardEntrypointCandidates(name));
  const program =
    `const {existsSync}=require('fs');` +
    `const {resolve}=require('path');` +
    `const {pathToFileURL}=require('url');` +
    `const c=${candidates};` +
    `const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);` +
    `if(!p){process.stderr.write('aitm ${name}: guard entrypoint unresolved ` +
    `(node_modules + repo-relative both absent) — failing closed\\n');process.exit(2);}` +
    `import(pathToFileURL(p).href);`;
  return `node -e "${program}"`;
}

// #869 — general candidate builder for ANY repo-relative entrypoint (not just
// the four guards). Same node_modules-first / repo-relative-second ordering.
export function entrypointCandidates(repoRelPath) {
  if (!repoRelPath || typeof repoRelPath !== 'string') {
    throw new TypeError('entrypointCandidates: repoRelPath must be a non-empty string');
  }
  return [`node_modules/ai-task-manager/${repoRelPath}`, repoRelPath];
}

// #869 — bootstrap command for the lifecycle HOOKS. Unlike the guards (which run
// at top-level module scope), hooks gate their main block on process.argv[1]
// matching their own filename and read positional args from process.argv[2+]
// (e.g. on-ask `pause`/`resume`). So before importing we rewrite process.argv to
// [argv0, resolvedPath, ...extraArgs] — this makes the module's isMain check
// pass and its argv reads resolve. Hooks are non-security: on no-resolution we
// fail OPEN (exit 0 + stderr diagnostic), never closed.
export function hookBootstrapCommand(repoRelPath, ...extraArgs) {
  const candidates = JSON.stringify(entrypointCandidates(repoRelPath));
  const argvTail = extraArgs.map((a) => JSON.stringify(String(a))).join(',');
  const label = repoRelPath.split('/').pop();
  const program =
    `const {existsSync}=require('fs');` +
    `const {resolve}=require('path');` +
    `const {pathToFileURL}=require('url');` +
    `const c=${candidates};` +
    `const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);` +
    `if(!p){process.stderr.write('aitm ${label}: hook entrypoint unresolved ` +
    `(node_modules + repo-relative both absent) — skipping\\n');process.exit(0);}` +
    `process.argv=[process.argv[0],p${argvTail ? ',' + argvTail : ''}];` +
    `import(pathToFileURL(p).href);`;
  return `node -e "${program}"`;
}
