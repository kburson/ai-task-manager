// @story #1297
// Synchronous, machine-local lifecycle authority for worktree bindings. The
// Bash hook cannot query GitHub on every command, so successful close paths
// publish a main-anchored terminal timestamp before sweeping matching session
// records from every discoverable linked worktree.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  findMainWorktreePath,
  fleetRegistryPath,
  readFleet,
  withLock,
} from '../fleet-registry.mjs';
import { closedBindingsPath } from '../paths.mjs';
import { clearActiveTask, getActiveTask, setActiveTask } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';

export const CLOSED_BINDINGS_SCHEMA = 1;

function emptyLedger() {
  return { schema: CLOSED_BINDINGS_SCHEMA, sessions: {} };
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeBindingIssue(value) {
  const match = String(value || '').match(/^#?(\d+)$/);
  return match ? `#${Number(match[1])}` : null;
}

function timestamp(value, label, { allowMissing = false } = {}) {
  if (allowMissing && !value) return 0;
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) throw new Error(`closed-bindings:${label}`);
  return parsed;
}

export function readClosedBindingLedger(mainWorktreePath, deps = {}) {
  const ledgerPath = (deps.closedBindingsPath || closedBindingsPath)(mainWorktreePath);
  const pathExists = deps.pathExists || existsSync;
  if (!pathExists(ledgerPath)) return emptyLedger();
  const readFile = deps.readFile || readFileSync;
  let value;
  try {
    value = JSON.parse(readFile(ledgerPath, 'utf8'));
  } catch (error) {
    throw new Error(`closed-bindings:invalid-json: ${error?.message || String(error)}`);
  }
  if (value?.schema !== CLOSED_BINDINGS_SCHEMA || !object(value.sessions)) {
    throw new Error('closed-bindings:invalid-schema');
  }
  return value;
}

function writeClosedBindingLedger(mainWorktreePath, ledger, deps = {}) {
  const ledgerPath = (deps.closedBindingsPath || closedBindingsPath)(mainWorktreePath);
  const makeDir = deps.mkdir || mkdirSync;
  const writeFile = deps.writeFile || writeFileSync;
  const renameFile = deps.rename || renameSync;
  makeDir(path.dirname(ledgerPath), { recursive: true });
  const temporary = `${ledgerPath}.tmp.${process.pid}.${Date.now()}`;
  writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  renameFile(temporary, ledgerPath);
}

export function markClosedBinding({ mainWorktreePath, sessionId, issue, closedAt }, deps = {}) {
  const issueRef = normalizeBindingIssue(issue);
  if (!issueRef) throw new Error('closed-bindings:issue');
  if (!sessionId) throw new Error('closed-bindings:session');
  const closeMs = timestamp(closedAt, 'closed-at');
  const ledgerPath = (deps.closedBindingsPath || closedBindingsPath)(mainWorktreePath);
  const lock = deps.withLock || withLock;
  let result;
  lock(ledgerPath, () => {
    const ledger = (deps.readLedger || readClosedBindingLedger)(mainWorktreePath, deps);
    const current = ledger.sessions?.[sessionId]?.[issueRef]?.closedAt;
    const currentMs = current ? timestamp(current, 'existing-closed-at') : 0;
    const effective = currentMs > closeMs ? current : closedAt;
    result = {
      ...ledger,
      sessions: {
        ...ledger.sessions,
        [sessionId]: {
          ...(ledger.sessions[sessionId] || {}),
          [issueRef]: { closedAt: effective },
        },
      },
    };
    (deps.writeLedger || writeClosedBindingLedger)(mainWorktreePath, result, deps);
  });
  return result;
}

export function isBindingRecordClosed({ record, sessionId, ledger }) {
  const issueRef = normalizeBindingIssue(record?.issue);
  if (!issueRef || !sessionId) return false;
  const boundMs = timestamp(record.worktreeResolvedAt || record.boundAt, 'bound-at', {
    allowMissing: true,
  });
  const intrinsic = record.closedAt;
  if (intrinsic && timestamp(intrinsic, 'record-closed-at') >= boundMs) return true;
  const shared = ledger?.sessions?.[sessionId]?.[issueRef]?.closedAt;
  return Boolean(shared && timestamp(shared, 'ledger-closed-at') >= boundMs);
}

export function parseGitWorktreePaths(output = '') {
  return String(output)
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
    .filter(Boolean);
}

function listGitWorktrees(projectDir) {
  return parseGitWorktreePaths(
    execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    })
  );
}

export function collectBindingCandidateWorktrees({ projectDir, deps = {} } = {}) {
  const findMain = deps.findMain || findMainWorktreePath;
  const mainWorktreePath = findMain(projectDir);
  const candidates = new Set([path.resolve(projectDir), path.resolve(mainWorktreePath)]);
  const env = deps.env || process.env;
  for (const variable of ['AI_TASK_MANAGER_PROJECT_DIR', 'TASK_TRACKER_PROJECT_DIR']) {
    const value = env[variable];
    if (typeof value === 'string' && value.trim()) candidates.add(path.resolve(value));
  }
  const fleet = (deps.readFleet || readFleet)(
    (deps.fleetRegistryPath || fleetRegistryPath)(mainWorktreePath)
  );
  for (const entry of Object.values(fleet || {})) {
    if (typeof entry?.worktreePath === 'string' && entry.worktreePath.trim()) {
      candidates.add(path.resolve(entry.worktreePath));
    }
  }
  let linked = [];
  try {
    linked = (deps.listGitWorktrees || listGitWorktrees)(projectDir);
  } catch {
    // Fleet/config candidates remain usable. The terminal ledger still makes a
    // missed record ineligible, so enumeration failure does not revive it.
  }
  for (const candidate of linked || []) candidates.add(path.resolve(candidate));
  return { mainWorktreePath, candidates: [...candidates] };
}

export function releaseIssueBindings({
  projectDir,
  issue,
  sessionId = currentSessionId(),
  closedAt = new Date().toISOString(),
  deps = {},
} = {}) {
  const issueRef = normalizeBindingIssue(issue);
  if (!issueRef) throw new Error('closed-bindings:issue');
  if (!sessionId) throw new Error('closed-bindings:session');
  const findMain = deps.findMain || findMainWorktreePath;
  const mainWorktreePath = findMain(projectDir);
  const collected = deps.collectCandidates
    ? { mainWorktreePath, candidates: deps.collectCandidates({ projectDir, deps }) }
    : collectBindingCandidateWorktrees({ projectDir, deps });
  const candidates = Array.isArray(collected.candidates)
    ? collected.candidates
    : [...collected.candidates];
  const mark = deps.markClosedBinding || markClosedBinding;
  mark({ mainWorktreePath, sessionId, issue: issueRef, closedAt }, deps);

  const readActive = deps.getActiveTask || getActiveTask;
  const stampActive = deps.setActiveTask || setActiveTask;
  const clearActive = deps.clearActiveTask || clearActiveTask;
  const released = [];
  for (const candidate of candidates) {
    const record = readActive(sessionId, candidate);
    if (normalizeBindingIssue(record?.issue) !== issueRef) continue;
    stampActive(sessionId, { ...record, closedAt }, candidate);
    clearActive(sessionId, candidate);
    const residual = readActive(sessionId, candidate);
    if (normalizeBindingIssue(residual?.issue) === issueRef) {
      throw new Error(`closed-bindings:release-failed:${candidate}`);
    }
    released.push(candidate);
  }
  return { issue: issueRef, closedAt, mainWorktreePath, released };
}
