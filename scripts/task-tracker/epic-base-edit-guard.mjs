#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked only by the Claude Code hook runner. See bin/aitm-registry.mjs
// (INTERNAL map) for the rationale.
//
// #905 — PreToolUse epic-base edit-guard for Edit / Write / NotebookEdit.
//
// The fail-closed backstop for epic-aware branching. When an agent's worktree is a
// managed child branch (`feature/child/<N>`), this refuses a source edit unless the
// child is based on its epic head — catching the #859 debacle (a child cut from
// trunk instead of the epic) at the very first edit, before any work is wasted.
//
// Fail-open / fail-closed policy:
//   - Branch is NOT a managed child branch (trunk, claude/*, feature/epic/*,
//     feature/story/*, detached) → ALLOW. Solo/main/epic/story work is untouched;
//     epics are created correct-by-construction by cut-epic-branch.
//   - Managed child branch, base confirmed WRONG → BLOCK (the whole point).
//   - Managed child branch, base could NOT be resolved (gh/git error) → BLOCK.
//     A child worktree whose base cannot be confirmed is exactly the state the
//     guard exists to stop; scratch paths stay writable so notes/retries proceed.
//   - Allowlisted machine-local paths (`.tmp/**`, `.scratch/**`) → ALLOW.
//
// The decision core (`decideEpicBaseEdit`) is pure; the git+graph wiring
// (`computeEvaluation`) is injectable. Both keep the hook testable without a live
// repo or `gh`.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { SCRATCH_REL_PREFIX } from './paths.mjs';
import { currentBranch } from './fleet-registry.mjs';
import { parseBranchName } from './lib/branch-name.mjs';
import { resolveCurrentIssueWorktreeBranch } from './lib/issue-worktree-location.mjs';
import { resolveEpicLineage } from './lib/resolve-epic-lineage.mjs';
import { resolveTrunkRefSync } from './lib/trunk-ref.mjs';
import { evaluateEpicBase } from './lib/epic-base-guard.mjs';

export const GATED_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
export const ALLOWLIST_PREFIXES = ['.tmp/', SCRATCH_REL_PREFIX];

export function normalizePath(filePath, projectDir) {
  if (!filePath) return '';
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(projectDir, filePath);
  const rel = path.relative(projectDir, abs);
  if (rel.startsWith('..')) return abs;
  return rel.split(path.sep).join('/');
}

export function isAllowlistedPath(relPath) {
  if (!relPath) return false;
  return ALLOWLIST_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

// Pure decision. `evaluation` is the `{pass, reason}` from evaluateEpicBase, or
// `null` when the base could not be resolved.
export function decideEpicBaseEdit({ toolName, branch, relPath, evaluation }) {
  if (!GATED_TOOLS.has(toolName)) {
    return { decision: 'allow', reason: 'tool-not-gated' };
  }
  if (isAllowlistedPath(relPath)) {
    return { decision: 'allow', reason: 'allowlisted-path' };
  }

  const parsed = parseBranchName(branch);
  // Only child branches carry an epic base to protect. Everything else — trunk,
  // claude/*, epic and story branches, detached HEAD — fails open.
  if (!parsed || parsed.role !== 'child') {
    return { decision: 'allow', reason: 'not-a-managed-child-branch' };
  }

  if (evaluation == null) {
    return {
      decision: 'block',
      code: 'epic-base-unresolved',
      reason:
        `[task-tracker] Source-edit refused: could not confirm that ${branch} is based on its epic.\n` +
        `  Path: ${relPath}\n` +
        `  The epic base could not be resolved (gh/git unavailable). A child worktree whose\n` +
        `  base cannot be confirmed is refused fail-closed.\n` +
        `  Fixes:\n` +
        `    - re-create the worktree with: node scripts/task-tracker/cut-child-worktree.mjs <N> <path>\n` +
        `    - or retry once gh/git is reachable\n` +
        `    - runtime paths (.tmp/**) and scratch paths (.scratch/**) remain writable`,
    };
  }

  if (!evaluation.pass) {
    return {
      decision: 'block',
      code: 'epic-base-wrong',
      reason:
        `[task-tracker] Source-edit refused: ${branch} is not based on its epic head.\n` +
        `  Reason: ${evaluation.reason}\n` +
        `  Path: ${relPath}\n` +
        `  This is the #859 wrong-base failure — a child cut from the wrong point.\n` +
        `  Fix: re-create the worktree from the epic head:\n` +
        `    node scripts/task-tracker/cut-child-worktree.mjs <N> <path>`,
    };
  }

  return { decision: 'allow', reason: 'child-on-epic-line' };
}

// Is `ancestorRef` an ancestor-or-equal of `descendantRef`? merge-base
// --is-ancestor signals via exit code; the injected git throws on non-zero.
function isAncestor(git, ancestorRef, descendantRef) {
  try {
    git(['merge-base', '--is-ancestor', ancestorRef, descendantRef]);
    return true;
  } catch {
    return false;
  }
}

// Resolve the three revs for a child branch and run the invariant. Returns the
// `{pass, reason}` evaluation, or `null` if anything could not be resolved.
// deps: { graph, git }.
export function computeEvaluation(branch, deps) {
  try {
    const parsed = parseBranchName(branch);
    if (!parsed || parsed.role !== 'child') return null;
    const childNode = deps.graph(parsed.issue) || {};
    if (childNode.authorityError || childNode.parentAuthorityError) return null;
    const epicIssue = Number(childNode.parent);
    if (!Number.isInteger(epicIssue) || epicIssue <= 0) return null;
    const lineage = resolveEpicLineage(branch, { deps });
    if (lineage.role !== 'child' || !lineage.epicBranch) return null;
    const epicBranch = lineage.epicBranch;
    const epicParent = resolveEpicLineage(epicIssue, { deps }).parentBranch;

    const git = deps.git;
    const epicHead = git(['rev-parse', epicBranch]).trim();
    const epicFork = git(['merge-base', epicBranch, epicParent]).trim();
    const childBase = git(['merge-base', branch, epicBranch]).trim();
    const forkIsAncestorOfChildBase = isAncestor(git, epicFork, childBase);

    return evaluateEpicBase({ epicHead, epicFork, childBase, forkIsAncestorOfChildBase });
  } catch {
    return null;
  }
}

// ── PreToolUse entry-point ─────────────────────────────────────────────────

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function findProjectDir(startDir) {
  if (process.env.AI_TASK_MANAGER_PROJECT_DIR) return process.env.AI_TASK_MANAGER_PROJECT_DIR;
  let dir = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, '.ai-task-manager'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function realGit(projectDir) {
  return (args) => execFileSync('git', args, { cwd: projectDir, encoding: 'utf8' });
}

// Build the graph node lookup the resolver needs, via `gh`. Synchronous shape
// (the resolver is sync) — a failure throws and computeEvaluation returns null.
function realGraph(projectDir) {
  const cache = new Map();
  return (issue) => {
    if (cache.has(issue)) return cache.get(issue);
    const cfg = JSON.parse(
      readFileSync(path.join(projectDir, '.ai-task-manager', 'task-tracker.json'), 'utf8')
    );
    const out = execFileSync(
      'gh',
      [
        'api',
        'graphql',
        '-f',
        `query=query { repository(owner: "${cfg.repo.split('/')[0]}", name: "${cfg.repo.split('/')[1]}") { issue(number: ${issue}) { body parent { number body } subIssues(first: 100) { nodes { number } } } } }`,
      ],
      { cwd: projectDir, encoding: 'utf8', timeout: 5000 }
    );
    const node = JSON.parse(out)?.data?.repository?.issue ?? {};
    const result = {
      parent: node.parent?.number ?? null,
      children: (node.subIssues?.nodes ?? []).map((c) => Number(c.number)),
      authoritativeBranch: resolveCurrentIssueWorktreeBranch(node.body),
      parentAuthoritativeBranch: resolveCurrentIssueWorktreeBranch(node.parent?.body),
    };
    cache.set(issue, result);
    return result;
  };
}

export function runHook(payload, deps = {}) {
  const toolName = payload?.tool_name;
  if (!GATED_TOOLS.has(toolName)) return { decision: 'allow', reason: 'tool-not-gated' };

  const projectDir =
    'projectDir' in deps ? deps.projectDir : findProjectDir(payload?.cwd || process.cwd());
  if (!projectDir) return { decision: 'allow', reason: 'no-project-dir' };

  const filePath =
    payload?.tool_input?.file_path ||
    payload?.tool_input?.notebook_path ||
    payload?.tool_input?.path ||
    '';
  const relPath = normalizePath(filePath, projectDir);

  let branch;
  try {
    branch = (deps.currentBranch || currentBranch)(projectDir);
  } catch {
    branch = null;
  }

  // Short-circuit before any gh/git resolution for non-child branches.
  const parsed = parseBranchName(branch);
  if (!parsed || parsed.role !== 'child') {
    return decideEpicBaseEdit({ toolName, branch, relPath, evaluation: null });
  }

  const graph = deps.graph || realGraph(projectDir);
  const git = deps.git || realGit(projectDir);
  // #927 — resolve the trunk ref the root epic forks from, WITHOUT fetching: this
  // is the PreToolUse hot path, so it must not do a network round-trip. Reading
  // the existing remote-tracking ref (default origin/trunk) instead of a local
  // `trunk` keeps the fork-point resolvable even when the main worktree sits on a
  // non-trunk branch and local `trunk` is stale or absent — otherwise the epic
  // fork-point would fail to resolve and a legitimately-based child edit would be
  // wrongly BLOCKED. `deps.trunk` lets tests inject a fixed ref.
  const trunk = 'trunk' in deps ? deps.trunk : resolveTrunkRefSync({ projectDir });
  const evaluation = computeEvaluation(branch, { graph, git, trunk });

  return decideEpicBaseEdit({ toolName, branch, relPath, evaluation });
}

function main() {
  const raw = readStdin();
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  let result;
  try {
    result = runHook(payload);
  } catch (err) {
    process.stderr.write(`[epic-base-edit-guard] ${err.message}\n`);
    process.exit(0);
  }
  if (result.decision === 'block') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }));
  }
  process.exit(0);
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('epic-base-edit-guard.mjs');
if (isMain) {
  main();
}
