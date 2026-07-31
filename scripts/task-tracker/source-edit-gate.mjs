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
// tuple is persisted in a gitignored sidecar at `.ai-task-manager/.cache/active-issue.json`
// with a 30s TTL (#664 — formerly under `activeIssueCache` in the tracked
// task-tracker.json, which dirtied a git-tracked file on every edit and deadlocked
// the Test→Review clean-tree gate). Cache miss / stale → cold path runs
// `gh issue view` once; warm path is a single JSON read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { isChoreModeActive } from './lib/chore-mode.mjs';
import { readDeepDiveSignals } from './lib/deep-dive.mjs';
import { SCRATCH_REL_PREFIX, statePath as resolveStatePath } from './paths.mjs';
import { classifyEdit, isAllowed, loadPolicy, DEFAULT_POLICY } from './activity-policy.mjs';
import { createRuntimeGovernedEffectAdapter } from './lib/work-lease/governed-effect.mjs';

const pexec = promisify(execFile);

export const CACHE_TTL_MS = 30_000;

export const ALLOWLIST_PREFIXES = ['.tmp/', SCRATCH_REL_PREFIX];

// States that LACK source-edit permission (below `develop`).
const PRE_DEVELOP_STATES = new Set(['backlog', 'on-deck', 'refine', 'plan', 'unknown']);

// States AT or PAST `develop` where the state machine has already closed the
// coding window (#805). WRITE_CODE edits here are refused fail-closed; edits
// whose activity class the STATE_MATRIX still permits (e.g. WRITE_DOCS in
// `review`) pass through. `develop` itself is NOT here — it keeps the
// deep-dive-marker gate below.
const POST_DEVELOP_STATES = new Set(['test', 'review', 'done']);

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
  policy = DEFAULT_POLICY,
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

  // Post-develop lock (#805): once the state machine has moved past `develop`
  // (into `test`, `review`, or `done`), the coding window is closed. Classify
  // the edit with the shared activity matrix and refuse any class the state no
  // longer permits — this is what closes the demonstrated jailbreak of editing a
  // regression `*.test.mjs` out-of-band while an issue sits in `test`. Classes
  // the matrix still allows (e.g. WRITE_DOCS in `review`) pass through, so the
  // lock is class-aware rather than a blanket freeze. Fail-closed: `unknown`
  // already sits in PRE_DEVELOP_STATES above, so an unresolvable state refuses.
  if (POST_DEVELOP_STATES.has(state)) {
    const activityClass = classifyEdit(relPath, policy);
    if (!isAllowed(state, activityClass)) {
      return {
        decision: 'block',
        code: 'source-edit-post-develop-lock',
        reason:
          `[task-tracker] Source-edit refused: ${boundIssue} is in '${state}' — the coding window closed at 'develop'.\n` +
          `  Path: ${relPath || filePath}\n` +
          `  Tool: ${toolName} (activity class: ${activityClass})\n` +
          `  A '${state}'-state ${activityClass} edit is exactly the out-of-band patch the gate forbids.\n` +
          `  Sanctioned remediation loop:\n` +
          `    demote → fix → verify-develop → re-promote\n` +
          `    /task demote                 — return the issue to 'develop'\n` +
          `    <make the edit + fix>        — now permitted in 'develop'\n` +
          `    node scripts/task-tracker/verify-develop.mjs\n` +
          `    /task promote                — advance back through the states\n` +
          `  Escape hatch:\n` +
          `    chore-mode on "<reason>"     — bypass gate; commits must be \`chore: \``,
      };
    }
    return { decision: 'allow', reason: 'post-develop-allowed-class' };
  }

  // State is develop. Require both deep-dive markers.
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
  const statePath = resolveStatePath(projectDir); // #573: `.tmp/aitm/state/`
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

// #664 — the active-issue cache (`issue` + `fetchedAt`) is volatile, per-session
// bookkeeping. It MUST NOT live in the tracked `task-tracker.json`: writing it
// there dirties a git-tracked file as a side effect of every permitted Edit/Write,
// which later deadlocks the Test→Review clean-tree gate (the activity-guard forbids
// committing `.ai-task-manager/**` in any state). The cache instead lives in a
// gitignored sidecar so the tracked config only changes on deliberate verb actions.
export function cacheFilePath(projectDir) {
  return path.join(projectDir, '.ai-task-manager', '.cache', 'active-issue.json');
}

export function readCache(projectDir, boundIssue) {
  const p = cacheFilePath(projectDir);
  if (!existsSync(p)) return null;
  try {
    const c = JSON.parse(readFileSync(p, 'utf8'));
    if (!c || c.issue !== boundIssue) return null;
    if (typeof c.fetchedAt !== 'number') return null;
    if (Date.now() - c.fetchedAt > CACHE_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}

export function writeCache(projectDir, entry) {
  const p = cacheFilePath(projectDir);
  try {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ ...entry, fetchedAt: Date.now() }, null, 2));
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
  // #658 — derive marker presence from the canonical reader rather than a
  // hand-rolled substring check. The old `body.includes('<!-- aitm-deep-dive-posted:')`
  // form only matched the legacy colon grammar and silently missed the
  // key=value property grammar (`<!-- aitm-deep-dive-posted ts="..." -->`)
  // that `ensureDeepDive` has written since #375 — so a legitimately-deep-dived
  // issue in `develop` had every source edit refused. `readDeepDiveSignals`
  // is the same reader the Plan→Develop promote gate uses, so the gate and
  // this reader can no longer drift apart.
  const { hasPosted, hasComplete } = readDeepDiveSignals(body);
  return { state, hasPostedMarker: hasPosted, hasCompleteMarker: hasComplete };
}

// Resolves (state, markers) using the cache when warm; falls back to gh.
export async function resolveIssueSignals(boundIssue, projectDir, deps = {}, options = {}) {
  const cached = (deps.readCache || readCache)(projectDir, boundIssue);
  if (cached) {
    return {
      state: cached.state,
      hasPostedMarker: !!cached.hasPostedMarker,
      hasCompleteMarker: !!cached.hasCompleteMarker,
      source: 'cache',
    };
  }
  const fresh = await (deps.fetchIssueSignals || fetchIssueSignals)(boundIssue, projectDir, deps);
  if (options.persistCache !== false) {
    (deps.writeCache || writeCache)(projectDir, { issue: boundIssue, ...fresh });
  }
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

  // Resolve unconditional bypasses and the no-binding refusal before any
  // remote read, cache write, or work-lease authority initialization.
  const preliminary = decideSourceEdit({
    toolName,
    filePath,
    projectDir,
    boundIssue,
    choreModeActive,
    issueState: 'unknown',
    hasPostedMarker: false,
    hasCompleteMarker: false,
  });
  if (
    preliminary.reason === 'chore-mode-bypass' ||
    preliminary.reason === 'allowlisted-path' ||
    preliminary.code === 'source-edit-no-bound-issue'
  ) {
    return preliminary;
  }

  let signals = { state: 'unknown', hasPostedMarker: false, hasCompleteMarker: false };
  try {
    signals = await (deps.resolveIssueSignals || resolveIssueSignals)(
      boundIssue,
      projectDir,
      deps,
      { persistCache: false }
    );
  } catch {
    // Fetch failures fall through to the pure decide() which will refuse
    // pre-develop states by default.
  }

  let policyDecision;
  try {
    policyDecision = decideSourceEdit({
      toolName,
      filePath,
      projectDir,
      boundIssue,
      choreModeActive,
      issueState: signals.state,
      hasPostedMarker: signals.hasPostedMarker,
      hasCompleteMarker: signals.hasCompleteMarker,
      policy: (deps.loadPolicy || loadPolicy)(projectDir),
    });
  } catch (error) {
    return sourceEditFailure(error, 'source-edit-policy-failure');
  }
  if (policyDecision.decision === 'block') return policyDecision;

  try {
    const withGovernedEffect = deps.withGovernedEffect
      ? deps.withGovernedEffect
      : createRuntimeGovernedEffectAdapter({
          projectDir,
          config: deps.config || JSON.parse(readFileSync(configPath(projectDir), 'utf8')),
        });
    return await withGovernedEffect(
      {
        issueId: boundIssue.replace(/^#/, ''),
        operation: 'source-write',
        heartbeat: true,
      },
      async () => {
        // A cold fetch is intentionally not durable until the current fence is
        // verified. A loser must leave even volatile cache bytes untouched.
        if (signals.source === 'fetch') {
          (deps.writeCache || writeCache)(projectDir, {
            issue: boundIssue,
            state: signals.state,
            hasPostedMarker: signals.hasPostedMarker,
            hasCompleteMarker: signals.hasCompleteMarker,
          });
        }
        return policyDecision;
      }
    );
  } catch (error) {
    return sourceEditFailure(error, 'source-edit-authority-refused');
  }
}

function sourceEditFailure(error, code) {
  const authorityCode =
    typeof error?.code === 'string' && error.code.trim() ? error.code.trim() : 'unknown';
  const detail = error?.message ? `: ${error.message}` : '';
  return {
    decision: 'block',
    code,
    reason:
      `[task-tracker] Source-edit refused: work-lease authority ${authorityCode}${detail}\n` +
      `  No source write or source-edit cache mutation was authorized.`,
  };
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
    result = sourceEditFailure(err, 'source-edit-gate-failure');
  }
  if (result.decision === 'block') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }));
  }
  process.exit(0);
}

// Explicit installed-bootstrap seam. Dynamic import must remain side-effect
// free for unit tests; guardBootstrapCommand invokes this callable exactly once.
export const runGuardBootstrap = main;

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('source-edit-gate.mjs');
if (isMain) {
  runGuardBootstrap().catch((err) => {
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason: sourceEditFailure(err, 'source-edit-gate-failure').reason,
      })
    );
    process.exit(0);
  });
}
