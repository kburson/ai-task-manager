#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked only by the Claude Code hook runner, never by a human or
// the AI. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
//
// #327 — PreToolUse source-edit gate for Edit / Write / NotebookEdit.
//
// Reads the bound issue from `.ai-task-manager/task-tracker-state.json`,
// fetches (or cache-reads) the issue's board state + deep-dive markers,
// and either ALLOWS the edit or emits a `{decision:"block", reason}` JSON
// payload on stdout so Claude Code refuses the tool call.
//
// Allowlist (always permitted regardless of state):
//   - `.tmp/**`
//   - `.ai-task-manager/scratch/**`
//
// When chore-mode is active, every path is allowed (full bypass).
//
// Cache: the `(state, hasPostedMarker, hasCompleteMarker, fetchedAt)`
// tuple is persisted under `activeIssueCache` in `.ai-task-manager/task-tracker.json`
// with a 30s TTL. Cache miss / stale → cold path runs `gh issue view` once;
// warm path is a single JSON read.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { isChoreModeActive } from './lib/chore-mode.mjs';

const pexec = promisify(execFile);

export const CACHE_TTL_MS = 30_000;

export const ALLOWLIST_PREFIXES = ['.tmp/', '.ai-task-manager/scratch/'];

// States that LACK source-edit permission (below `develop`).
const PRE_DEVELOP_STATES = new Set(['backlog', 'on-deck', 'refine', 'plan', 'unknown']);

const DEEP_DIVE_POSTED_MARKER = 'aitm-deep-dive-posted';
const DEEP_DIVE_COMPLETE_MARKER = 'aitm-deep-dive-complete';

const GATED_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

// Normalises a `file_path` from the tool payload into a project-relative
// path. Absolute paths are made relative to `projectDir` when possible;
// paths outside the project are returned as-is so the allowlist rejects
// them by default.
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

// Pure decision helper. Given the gate inputs, returns either
// `{decision:'allow'}` or `{decision:'block', reason, code}`.
export function decideSourceEdit({
  toolName,
  filePath,
  projectDir,
  boundIssue,
  choreModeActive,
  issueState,
  hasPostedMarker,
  hasCompleteMarker,
}) {
  if (!GATED_TOOLS.has(toolName)) {
    return { decision: 'allow', reason: 'tool-not-gated' };
  }

  const relPath = normalizePath(filePath, projectDir);

  // Chore-mode bypass: any path allowed.
  if (choreModeActive) {
    return { decision: 'allow', reason: 'chore-mode-bypass' };
  }

  // Allowlist: scratch areas always editable.
  if (isAllowlistedPath(relPath)) {
    return { decision: 'allow', reason: 'allowlisted-path' };
  }

  // No bound issue → refuse — we have no signal to evaluate. (Edge case:
  // the agent must `/task` bind an issue or enter chore-mode.)
  if (!boundIssue) {
    return {
      decision: 'block',
      code: 'source-edit-no-bound-issue',
      reason:
        `[task-tracker] Source-edit refused: no bound issue.\n` +
        `  Path: ${relPath || filePath}\n` +
        `  Tool: ${toolName}\n` +
        `  Escape hatches:\n` +
        `    /task #N                 — bind to an issue first\n` +
        `    chore-mode on "<reason>" — enter freeform mode (commits must be \`chore: \`)`,
    };
  }

  const state = (issueState || 'unknown').toLowerCase();

  if (PRE_DEVELOP_STATES.has(state)) {
    return {
      decision: 'block',
      code: 'source-edit-state-gate',
      reason:
        `[task-tracker] Source-edit refused: ${boundIssue} is in '${state}' (need 'develop' + deep-dive markers).\n` +
        `  Path: ${relPath || filePath}\n` +
        `  Tool: ${toolName}\n` +
        `  Escape hatches:\n` +
        `    /task promote               — advance state legitimately\n` +
        `    chore-mode on "<reason>"    — bypass gate; commits must be \`chore: \``,
    };
  }

  // State is develop or later. Require both deep-dive markers.
  if (!hasPostedMarker || !hasCompleteMarker) {
    const missing = [
      !hasPostedMarker ? DEEP_DIVE_POSTED_MARKER : null,
      !hasCompleteMarker ? DEEP_DIVE_COMPLETE_MARKER : null,
    ]
      .filter(Boolean)
      .join(' + ');
    return {
      decision: 'block',
      code: 'source-edit-marker-gate',
      reason:
        `[task-tracker] Source-edit refused: ${boundIssue} is in '${state}' but deep-dive marker(s) missing.\n` +
        `  Missing: ${missing}\n` +
        `  Path: ${relPath || filePath}\n` +
        `  Tool: ${toolName}\n` +
        `  Escape hatches:\n` +
        `    /task plan → /task promote   — stamps both markers on Plan→Develop\n` +
        `    chore-mode on "<reason>"     — bypass gate; commits must be \`chore: \``,
    };
  }

  return { decision: 'allow', reason: 'state-and-markers-ok' };
}

// ── State + cache helpers ──────────────────────────────────────────────────

export function loadBoundIssue(projectDir) {
  const statePath = path.join(projectDir, '.ai-task-manager', 'task-tracker-state.json');
  if (!existsSync(statePath)) return null;
  try {
    const s = JSON.parse(readFileSync(statePath, 'utf8'));
    const active = s.active;
    if (!active || active === 'discover' || active === 'plan') return null;
    const m = String(active).match(/^#?(\d+)$/);
    return m ? `#${m[1]}` : null;
  } catch {
    return null;
  }
}

function configPath(projectDir) {
  return path.join(projectDir, '.ai-task-manager', 'task-tracker.json');
}

export function readCache(projectDir, boundIssue) {
  const p = configPath(projectDir);
  if (!existsSync(p)) return null;
  try {
    const cfg = JSON.parse(readFileSync(p, 'utf8'));
    const c = cfg.activeIssueCache;
    if (!c || c.issue !== boundIssue) return null;
    if (typeof c.fetchedAt !== 'number') return null;
    if (Date.now() - c.fetchedAt > CACHE_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}

export function writeCache(projectDir, entry) {
  const p = configPath(projectDir);
  if (!existsSync(p)) return;
  try {
    const cfg = JSON.parse(readFileSync(p, 'utf8'));
    cfg.activeIssueCache = { ...entry, fetchedAt: Date.now() };
    writeFileSync(p, JSON.stringify(cfg, null, 2));
  } catch {
    /* tolerate */
  }
}

// Maps a kanbanOption* GUID back to its lowercase verb-state name.
function mapKanbanToState(cfg, optionId) {
  if (!cfg || !optionId) return 'unknown';
  const reverse = {
    [cfg.kanbanOptionBacklog]: 'backlog',
    [cfg.kanbanOptionRefine]: 'refine',
    [cfg.kanbanOptionPlan]: 'plan',
    [cfg.kanbanOptionDevelop]: 'develop',
    [cfg.kanbanOptionTest]: 'test',
    [cfg.kanbanOptionReview]: 'review',
    [cfg.kanbanOptionDone]: 'done',
  };
  return reverse[optionId] || 'unknown';
}

// Cold path: fetch state + markers via `gh`. Returns `{ state, hasPostedMarker, hasCompleteMarker }`.
export async function fetchIssueSignals(boundIssue, projectDir, deps = {}) {
  const ghImpl = deps.gh || (async (args) => (await pexec('gh', args, { timeout: 5000 })).stdout);
  const cfg = JSON.parse(readFileSync(configPath(projectDir), 'utf8'));
  const issueNum = boundIssue.replace(/^#/, '');
  const out = await ghImpl([
    'issue',
    'view',
    issueNum,
    '-R',
    cfg.repo,
    '--json',
    'body,projectItems',
  ]);
  const parsed = JSON.parse(out);
  const body = parsed.body || '';
  const items = parsed.projectItems || [];
  let state = 'unknown';
  for (const item of items) {
    const status =
      item.status?.optionId || item.fieldValueByName?.optionId || item['Status']?.optionId || null;
    const mapped = mapKanbanToState(cfg, status);
    if (mapped !== 'unknown') {
      state = mapped;
      break;
    }
    // Some gh shapes expose the option name directly:
    const name = (item.status?.name || item['Status']?.name || '').toLowerCase();
    if (name) {
      state = name;
      break;
    }
  }
  const hasPostedMarker = body.includes(`<!-- ${DEEP_DIVE_POSTED_MARKER}:`);
  const hasCompleteMarker = body.includes(`<!-- ${DEEP_DIVE_COMPLETE_MARKER}:`);
  return { state, hasPostedMarker, hasCompleteMarker };
}

// Resolves (state, markers) using the cache when warm; falls back to gh.
export async function resolveIssueSignals(boundIssue, projectDir, deps = {}) {
  const cached = readCache(projectDir, boundIssue);
  if (cached) {
    return {
      state: cached.state,
      hasPostedMarker: !!cached.hasPostedMarker,
      hasCompleteMarker: !!cached.hasCompleteMarker,
      source: 'cache',
    };
  }
  const fresh = await fetchIssueSignals(boundIssue, projectDir, deps);
  writeCache(projectDir, { issue: boundIssue, ...fresh });
  return { ...fresh, source: 'fetch' };
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

export async function runHook(payload, deps = {}) {
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

  const choreModeActive = (deps.isChoreModeActive || isChoreModeActive)(projectDir);
  const boundIssue = (deps.loadBoundIssue || loadBoundIssue)(projectDir);

  let signals = { state: 'unknown', hasPostedMarker: false, hasCompleteMarker: false };
  if (!choreModeActive && boundIssue) {
    try {
      signals = await (deps.resolveIssueSignals || resolveIssueSignals)(
        boundIssue,
        projectDir,
        deps
      );
    } catch {
      // Fetch failures fall through to the pure decide() which will refuse
      // pre-develop states by default.
    }
  }

  return decideSourceEdit({
    toolName,
    filePath,
    projectDir,
    boundIssue,
    choreModeActive,
    issueState: signals.state,
    hasPostedMarker: signals.hasPostedMarker,
    hasCompleteMarker: signals.hasCompleteMarker,
  });
}

async function main() {
  const raw = readStdin();
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  let result;
  try {
    result = await runHook(payload);
  } catch (err) {
    process.stderr.write(`[source-edit-gate] ${err.message}\n`);
    process.exit(0);
  }
  if (result.decision === 'block') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }));
  }
  process.exit(0);
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('source-edit-gate.mjs');
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[source-edit-gate] ${err.message}\n`);
    process.exit(0);
  });
}
