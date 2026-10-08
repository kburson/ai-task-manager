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
//   - `.tmp/**` runtime and generated output
//   - `.scratch/**` disposable operator and workflow scratch
//   - `.scratch/**` disposable scratch
//
// Chore-mode bypasses ordinary source policy after target containment and
// installed-guard checks.
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
import {
  evaluateLocalRevisionActivity,
  quarantineLocalSourceEdit,
  withNativeLinkedSourceCorrection,
} from './lib/criteria-revision/policy.mjs';
import { getActiveTask } from './session-state.mjs';
import {
  assertRevisionMemory,
  withMemoryInterlock,
  assertMemoryCapability,
} from './lib/criteria-revision/store.mjs';
import { observeRevision } from './lib/criteria-revision/engine.mjs';
import { deriveLinkedPlanEdit } from './lib/criteria-revision/source-correction.mjs';
import { hashBytes } from './lib/criteria-revision/schema.mjs';
import {
  validateGovernedLinkedPlan,
  isGovernedPlanObservation,
} from './lib/governed-plan-policy.mjs';
import { readDeepDiveSignals } from './lib/deep-dive.mjs';
import { SCRATCH_REL_PREFIX, statePath as resolveStatePath } from './paths.mjs';
import {
  classifyEdit,
  isAllowed,
  loadPolicy,
  DEFAULT_POLICY,
  DRAFTING_STATES,
} from './activity-policy.mjs';
import { loadConfig } from './config.mjs';
import { normalizeStateId } from './lib/lifecycle-policy/index.mjs';
import { ownershipDecision } from './lib/ownership-policy.mjs';
import { fetchAssignmentSnapshot } from './lib/assignment-snapshot.mjs';
import { extractApplyPatchTargets, extractApplyPatchText } from './lib/apply-patch-targets.mjs';
import {
  resolveInvocationDirectory,
  resolveMutationTarget,
  readExactSessionBinding,
  bindingMatches,
} from './lib/mutation-context.mjs';
import { readWorktreeIdentity } from './lib/worktree-binding-guard.mjs';
import { artifactPathPolicy } from './lib/artifact-write-policy.mjs';
import { isInstalledGuardPath } from './lib/installed-guard-path.mjs';
import {
  createGithubWorkflowBoundaryRuntime,
  loadWorkflowBoundary,
} from './lib/workflow-policy/enforcement.mjs';

const pexec = promisify(execFile);

export const CACHE_TTL_MS = 30_000;

const nativeLinkedOperations = new WeakMap();
export function readNativeLinkedSourceOperation(token) {
  const held = nativeLinkedOperations.get(token);
  if (!held?.live) throw new Error('criteria-revision:native-linked-source-token');
  assertMemoryCapability(held.backend, held.capability, held.context);
  return held;
}
async function nativeLinkedHook(payload, deps, projectDir, targets) {
  const backend = deps.revisionBackend;
  assertRevisionMemory(backend);
  if (deps.revisionPorts) throw new Error('criteria-revision:source-foreign-ports');
  const context = {
    repository: deps.cfg?.repo ?? backend.observation.repository,
    issue: backend.observation.issue,
    executor: backend.observation.executor,
  };
  return withMemoryInterlock(backend, context, async (capability) => {
    const before = backend.observation;
    const binding = readExactSessionBinding(projectDir, { sessionId: payload.session_id });
    const actual = readWorktreeIdentity({ projectDir });
    const timed = getActiveTask(payload.session_id, projectDir);
    if (
      !bindingMatches(actual, binding, context.issue) ||
      !timed?.entryStartTs ||
      timed.pausedAtTs ||
      context.executor.sessionId !== payload.session_id ||
      context.executor.worktree !== actual.worktreePath ||
      context.executor.branch !== actual.worktreeBranch
    )
      throw new Error('criteria-revision:source-native-session');
    const policy = validateGovernedLinkedPlan({ body: before.body.bytes, projectDir });
    if (!policy.ok || !isGovernedPlanObservation(policy, { body: before.body.bytes, projectDir }))
      throw new Error('criteria-revision:source-native-read');
    if (!policy.observation) return null;
    const physical = resolveMutationTarget(
      policy.observation.path,
      projectDir,
      projectDir
    ).physical;
    if (!targets.some((target) => target.physical === physical)) return null;
    if (targets.length !== 1 || !['Edit', 'Write'].includes(payload.tool_name))
      throw new Error('criteria-revision:source-native-targets');
    const raw = payload.tool_input,
      tool = payload.tool_name;
    const actualTarget = resolveMutationTarget(
      raw.file_path,
      resolveInvocationDirectory(payload),
      projectDir
    );
    if (actualTarget.physical !== physical || targets[0].physical !== actualTarget.physical)
      throw new Error('criteria-revision:source-native-target');
    const allowed =
      tool === 'Edit'
        ? ['file_path', 'old_string', 'new_string', 'replace_all']
        : ['file_path', 'content'];
    if (Object.keys(raw).some((key) => !allowed.includes(key)) || !Object.hasOwn(raw, 'file_path'))
      throw new Error('criteria-revision:source-native-input');
    const input =
      tool === 'Edit'
        ? {
            old_string: raw.old_string,
            new_string: raw.new_string,
            replace_all: raw.replace_all ?? false,
          }
        : { content: raw.content };
    const state = await observeRevision({ context, deps: backend });
    const prior = state.nativeSourceJournal ?? backend.snapshot.nativeSourceRecords?.at(-1);
    const retained =
      prior?.operation.schema === 'aitm.native-linked-plan-edit/v1' &&
      prior.operation.path === policy.observation.path &&
      JSON.stringify(prior.operation.input) === JSON.stringify(input) &&
      prior.operation.tool === tool
        ? prior.sourceRead
        : null;
    const observed = policy.observation;
    const sourceRead = retained ?? {
      schema: 'aitm.native-plan-source-read/v1',
      bodyHash: hashBytes(before.body.bytes),
      projectDir: observed.projectDir,
      key: observed.key,
      path: observed.path,
      text: observed.text,
      contentSha256: observed.contentSha256,
    };
    const { operation } = deriveLinkedPlanEdit({
      tool,
      path: observed.path,
      input,
      beforeText: sourceRead.text,
    });
    const token = Object.freeze({});
    const held = {
      live: true,
      backend,
      capability,
      context,
      operation,
      sourceRead,
      session: {
        sessionId: payload.session_id,
        projectDir: actual.worktreePath,
        branch: actual.worktreeBranch,
        entryStartTs: timed.entryStartTs,
      },
    };
    nativeLinkedOperations.set(token, held);
    try {
      return await withNativeLinkedSourceCorrection({
        token,
        backend,
        capability,
        writeDeps: deps.writeDeps,
      });
    } finally {
      held.live = false;
    }
  });
}

export const ALLOWLIST_PREFIXES = ['.tmp/', SCRATCH_REL_PREFIX];

// States that LACK source-edit permission (below `develop`).
const PRE_DEVELOP_STATES = new Set(['backlog', 'refine', 'ready-for-plan', 'plan', 'unknown']);

// States AT or PAST `develop` where the state machine has already closed the
// coding window (#805). WRITE_CODE edits here are refused fail-closed; edits
// whose activity class the STATE_MATRIX still permits (e.g. WRITE_DOCS in
// `review`) pass through. `develop` itself is NOT here — it keeps the
// deep-dive-marker gate below.
const POST_DEVELOP_STATES = new Set(['test', 'review', 'done']);

const DEEP_DIVE_POSTED_MARKER = 'aitm-deep-dive-posted';
const DEEP_DIVE_COMPLETE_MARKER = 'aitm-deep-dive-complete';

export const GATED_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'apply_patch']);

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
  assignees,
  currentUser,
  workflowPolicy,
  policy = DEFAULT_POLICY,
  planBindingValid = false,
  validatedTarget = null,
}) {
  if (!GATED_TOOLS.has(toolName)) {
    return { decision: 'allow', reason: 'tool-not-gated' };
  }

  const relPath = validatedTarget?.relative ?? normalizePath(filePath, projectDir);
  if (
    isInstalledGuardPath(filePath) ||
    isInstalledGuardPath(relPath) ||
    (validatedTarget &&
      (isInstalledGuardPath(validatedTarget.lexical) ||
        isInstalledGuardPath(validatedTarget.physical)))
  ) {
    return {
      decision: 'block',
      code: 'source-edit-installed-guard',
      reason: `[task-tracker] Refusing installed guard target: ${filePath}`,
    };
  }

  const artifact = artifactPathPolicy(relPath);
  if (artifact === 'block')
    return {
      decision: 'block',
      code: 'source-edit-docs-script',
      reason: 'Script formats are not permitted under docs/; use .scratch/ or .tmp/.',
    };
  if (artifact === 'allow')
    return {
      decision: 'allow',
      reason: isAllowlistedPath(relPath) ? 'allowlisted-path' : 'artifact-path',
    };

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

  const state = normalizeStateId(issueState) || 'unknown';

  if (['develop', 'test', 'review'].includes(state)) {
    const ownership = ownershipDecision({ state, assignees, currentUser });
    if (!ownership.ok) {
      let recovery;
      if (ownership.kind === 'foreign-owner') {
        const owner = ownership.owners[0] || 'the current owner';
        const issueNumber = String(boundIssue).replace(/^#/, '');
        recovery =
          `  @${owner} must run \`npx aitm transfer ${issueNumber} --to @${ownership.currentUser || 'me'}\` from their workstation,\n` +
          `  or a human must reconcile the single owner in the GitHub UI before this workspace retries.`;
      } else if (ownership.kind === 'multiple-owners') {
        recovery = `  Reconcile the assignees in the GitHub UI to exactly one owner, then continue from that owner's workstation.`;
      } else if (ownership.kind === 'human-coordination-required') {
        recovery =
          `  Assign the story to @${ownership.currentUser || 'the local workspace owner'}, or transfer it to another owner and continue from that owner's workstation.\n` +
          `  Full-Auto does not reclaim an in-flight story.`;
      } else {
        recovery = `  Ownership is unverifiable. Restore GitHub connectivity and retry; do not edit source until exact singleton ownership is confirmed.`;
      }
      return {
        decision: 'block',
        code: 'source-edit-ownership-gate',
        reason:
          `[task-tracker] Source-edit refused: ${boundIssue} does not have the exact singleton owner for this workspace.\n` +
          `  Ownership: ${ownership.kind}\n` +
          `  Expected: @${ownership.currentUser || '(unverifiable)'}\n` +
          `  Observed: ${ownership.owners.length ? ownership.owners.map((owner) => `@${owner}`).join(', ') : 'unassigned'}\n` +
          recovery,
      };
    }
  }

  if (
    DRAFTING_STATES.includes(state) &&
    planBindingValid &&
    /^(?:docs|\.claude\/plans)\/(?:[^/]+\/)*[^/]+\.md$/.test(relPath) &&
    Array.isArray(assignees) &&
    assignees.length === 1 &&
    assignees[0] === currentUser
  ) {
    return { decision: 'allow', reason: 'plan-document-allowed' };
  }

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
          `    demote → fix → iteration → commit → finalization → re-Test\n` +
          `    /task demote                 — return the issue to 'develop'\n` +
          `    <make the edit + fix>        — now permitted in 'develop'\n` +
          `    node scripts/task-tracker/verify-develop.mjs --mode iteration\n` +
          `    <commit the clean fix>        — finalization binds evidence to the new SHA\n` +
          `    node scripts/task-tracker/verify-develop.mjs --mode final --issue <N>\n` +
          `    /task test <N>                — produce one new Test pass before Review\n` +
          `  Escape hatch:\n` +
          `    chore-mode on "<reason>"     — bypass gate; commits must be \`chore: \``,
      };
    }
    return { decision: 'allow', reason: 'post-develop-allowed-class' };
  }

  // State is develop. Require both deep-dive markers.
  if (!hasPostedMarker || !hasCompleteMarker) {
    if (workflowPolicy?.isWaived?.('planning.deep-dive')) {
      return { decision: 'allow', reason: 'state-and-deep-dive-waiver' };
    }
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
    return {
      ...c,
      state: normalizeStateId(c.state) || 'unknown',
    };
  } catch {
    return null;
  }
}

export function writeCache(projectDir, entry) {
  const p = cacheFilePath(projectDir);
  try {
    mkdirSync(path.dirname(p), { recursive: true });
    const canonicalEntry = {
      ...entry,
      ...(entry?.state ? { state: normalizeStateId(entry.state) } : {}),
      fetchedAt: Date.now(),
    };
    writeFileSync(p, JSON.stringify(canonicalEntry, null, 2));
  } catch {
    /* tolerate */
  }
}

// Cold path: fetch state, markers, and exclusive ownership via `gh`.
export async function fetchIssueSignals(boundIssue, projectDir, deps = {}) {
  const ghImpl = deps.gh || (async (args) => (await pexec('gh', args, { timeout: 5000 })).stdout);
  const cfg = loadConfig({
    projectPath: configPath(projectDir),
    userPath: path.join(projectDir, '.ai-task-manager', '.cache', 'no-user-config.json'),
  });
  const issueNum = boundIssue.replace(/^#/, '');
  const out = await ghImpl(['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body']);
  const parsed = JSON.parse(out);
  const snapshot = await (deps.fetchSnapshot || fetchAssignmentSnapshot)({
    issueNumber: issueNum,
    cfg,
  });
  const currentUser = String(await ghImpl(['api', 'user', '--jq', '.login'])).trim();
  const body = parsed.body || '';
  // #658 — derive marker presence from the canonical reader rather than a
  // hand-rolled substring check. The old `body.includes('<!-- aitm-deep-dive-posted:')`
  // form only matched the legacy colon grammar and silently missed the
  // key=value property grammar (`<!-- aitm-deep-dive-posted ts="..." -->`)
  // that `ensureDeepDive` has written since #375 — so a legitimately-deep-dived
  // issue in `develop` had every source edit refused. `readDeepDiveSignals`
  // is the same reader the Plan→Develop promote gate uses, so the gate and
  // this reader can no longer drift apart.
  const { hasPosted, hasComplete } = readDeepDiveSignals(body);
  return {
    state: snapshot.state,
    hasPostedMarker: hasPosted,
    hasCompleteMarker: hasComplete,
    assignees: snapshot.assignees,
    currentUser,
  };
}

// Resolves (state, markers) using the cache when warm; falls back to gh.
export async function resolveIssueSignals(boundIssue, projectDir, deps = {}) {
  const cached = readCache(projectDir, boundIssue);
  if (cached) {
    // #1212 — metadata may tolerate the short cache, ownership may not. A
    // transfer/unassign can happen in another process or through the GitHub UI,
    // so there is no reliable cross-process invalidation signal. Refresh the
    // exact configured-project Status + assignees snapshot on every gated edit
    // while retaining the body/deep-dive metadata cache.
    const cfg =
      deps.cfg ||
      loadConfig({
        projectPath: configPath(projectDir),
        userPath: path.join(projectDir, '.ai-task-manager', '.cache', 'no-user-config.json'),
      });
    const snapshot = await (deps.fetchSnapshot || fetchAssignmentSnapshot)({
      issueNumber: boundIssue.replace(/^#/, ''),
      cfg,
    });
    const currentUser = String(
      await (deps.gh || (async (args) => (await pexec('gh', args, { timeout: 5000 })).stdout))([
        'api',
        'user',
        '--jq',
        '.login',
      ])
    ).trim();
    const fresh = {
      state: snapshot.state,
      hasPostedMarker: !!cached.hasPostedMarker,
      hasCompleteMarker: !!cached.hasCompleteMarker,
      assignees: snapshot.assignees,
      currentUser,
      source: 'cache+ownership-fetch',
    };
    writeCache(projectDir, { issue: boundIssue, ...fresh });
    return fresh;
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

export async function runHook(payload, deps = {}) {
  if (
    payload &&
    Object.hasOwn(payload, 'session_id') &&
    (typeof payload.session_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(payload.session_id))
  )
    return {
      decision: 'block',
      code: 'source-edit-session',
      reason: '[task-tracker] invalid native hook session identity.',
    };
  const toolName = payload?.tool_name;
  if (!GATED_TOOLS.has(toolName)) return { decision: 'allow', reason: 'tool-not-gated' };

  let invocationDir;
  let projectDir;
  try {
    invocationDir = (deps.resolveInvocationDirectory || resolveInvocationDirectory)(payload);
    projectDir =
      'projectDir' in deps
        ? deps.projectDir
        : readWorktreeIdentity({ projectDir: invocationDir }).worktreePath;
  } catch (error) {
    return {
      decision: 'block',
      code: 'source-edit-context',
      reason: `[task-tracker] Source-edit context unavailable: ${error.message}`,
    };
  }
  if (!projectDir) return { decision: 'allow', reason: 'no-project-dir' };

  let targets = [];
  if (toolName === 'apply_patch') {
    try {
      targets = (deps.extractApplyPatchTargets || extractApplyPatchTargets)(
        extractApplyPatchText(payload?.tool_input)
      );
    } catch (error) {
      return {
        decision: 'block',
        code: error.code || 'mutation-parse-error',
        reason: `[task-tracker] mutation target parsing failed: ${error.message}`,
      };
    }
  } else {
    const filePath =
      payload?.tool_input?.file_path ||
      payload?.tool_input?.notebook_path ||
      payload?.tool_input?.path ||
      '';
    if (filePath) targets = [filePath];
  }

  const validatedTargets = [];
  for (const filePath of targets) {
    try {
      if (existsSync(projectDir))
        validatedTargets.push(
          (deps.resolveMutationTarget || resolveMutationTarget)(filePath, invocationDir, projectDir)
        );
      else validatedTargets.push(null);
    } catch (error) {
      return {
        decision: 'block',
        code: 'source-edit-target',
        reason: `[task-tracker] Source-edit target refused: ${error.message}`,
      };
    }
  }
  if (deps.revisionBackend && targets.length) {
    try {
      const native = await nativeLinkedHook(payload, deps, projectDir, validatedTargets);
      if (native) return native;
    } catch (error) {
      return {
        decision: 'block',
        code: 'revision-authority-unavailable',
        reason: `[task-tracker] ${error.message}`,
      };
    }
  }
  if (targets.length) {
    try {
      const cfg = deps.cfg || loadConfig({ projectPath: configPath(projectDir) });
      const revision = await quarantineLocalSourceEdit(
        {
          repository: cfg.repo,
          targets: targets.map((target, index) => validatedTargets[index]?.lexical ?? target),
          projectDir,
          sessionId: payload?.session_id,
        },
        deps.revisionPorts
      );
      if (revision.status !== 'ready')
        return {
          decision: 'block',
          code: revision.code,
          reason: `[task-tracker] ${revision.code}: linked source mutation requires trusted native authority.`,
        };
    } catch {
      return {
        decision: 'block',
        code: 'revision-authority-unavailable',
        reason:
          '[task-tracker] revision-authority-unavailable: source mutation context unavailable.',
      };
    }
  }
  // Resolve artifact-only mutations before consulting session or remote authority.
  const artifactDecisions = targets.map((filePath, index) =>
    decideSourceEdit({
      toolName: toolName === 'apply_patch' ? 'Edit' : toolName,
      filePath,
      projectDir,
      validatedTarget: validatedTargets[index],
    })
  );
  const forbiddenArtifact = artifactDecisions.find(
    (result) => result.code === 'source-edit-docs-script'
  );
  if (forbiddenArtifact) return forbiddenArtifact;
  if (artifactDecisions.length && artifactDecisions.every((result) => result.decision === 'allow'))
    return artifactDecisions[0];

  const choreModeActive = (deps.isChoreModeActive || isChoreModeActive)(projectDir);
  const exactBinding = (deps.readExactSessionBinding || readExactSessionBinding)(projectDir, {
    sessionId: payload?.session_id,
  });
  const boundIssue = deps.loadBoundIssue
    ? deps.loadBoundIssue(projectDir)
    : exactBinding
      ? `#${exactBinding.issueNumber}`
      : payload?.session_id !== undefined
        ? null
        : loadBoundIssue(projectDir);

  const localPolicy = (deps.loadPolicy || loadPolicy)(projectDir);
  if (
    targets.some(
      (filePath) => classifyEdit(normalizePath(filePath, projectDir), localPolicy) === 'WRITE_CODE'
    )
  ) {
    const cfg = deps.cfg || loadConfig({ projectPath: configPath(projectDir) });
    const revision = evaluateLocalRevisionActivity(
      { repository: cfg.repo, issue: Number(String(boundIssue || '').replace(/^#/, '')) },
      { ...deps.revisionPorts, worktree: projectDir }
    );
    if (revision.status !== 'ready')
      return {
        decision: 'block',
        code: revision.code,
        reason: `[task-tracker] ${revision.code}: current revision activity admission is unavailable.`,
      };
  }

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

  const policy = (deps.loadPolicy || loadPolicy)(projectDir);
  let workflowPolicy = null;
  if (
    !choreModeActive &&
    boundIssue &&
    normalizeStateId(signals.state) === 'develop' &&
    (!signals.hasPostedMarker || !signals.hasCompleteMarker)
  ) {
    const cfg =
      deps.cfg ||
      loadConfig({
        projectPath: configPath(projectDir),
        userPath: path.join(projectDir, '.ai-task-manager', '.cache', 'no-user-config.json'),
      });
    const issue = Number(boundIssue.replace(/^#/, ''));
    try {
      const ghImpl =
        deps.gh || (async (args) => (await pexec('gh', args, { timeout: 5000 })).stdout);
      const bodyJson = await ghImpl([
        'issue',
        'view',
        String(issue),
        '-R',
        cfg.repo,
        '--json',
        'body',
      ]);
      const body = JSON.parse(bodyJson).body || '';
      const loadBoundary = deps.loadWorkflowBoundary || loadWorkflowBoundary;
      workflowPolicy = await loadBoundary({
        repository: cfg.repo,
        issue,
        body,
        requirementIds: ['planning.deep-dive'],
        activity: 'source-edit',
        state: 'develop',
        now: new Date().toISOString(),
        runtime:
          deps.workflowPolicyRuntime ||
          createGithubWorkflowBoundaryRuntime({ repository: cfg.repo }),
      });
    } catch {
      workflowPolicy = null;
    }
  }
  let allowedResult = { decision: 'allow', reason: 'all-mutation-targets-allowed' };
  const observed = existsSync(projectDir) ? readWorktreeIdentity({ projectDir }) : null;
  const planBindingValid = bindingMatches(
    observed,
    exactBinding,
    Number(String(boundIssue || '').replace(/^#/, ''))
  );
  for (const [index, filePath] of (targets.length ? targets : ['']).entries()) {
    const result = decideSourceEdit({
      toolName: toolName === 'apply_patch' ? 'Edit' : toolName,
      filePath,
      projectDir,
      boundIssue,
      choreModeActive,
      issueState: signals.state,
      hasPostedMarker: signals.hasPostedMarker,
      hasCompleteMarker: signals.hasCompleteMarker,
      assignees: signals.assignees,
      currentUser: signals.currentUser,
      workflowPolicy,
      policy,
      planBindingValid,
      validatedTarget: validatedTargets[index],
    });
    if (result.decision === 'block') return result;
    allowedResult = result;
  }
  return allowedResult;
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
