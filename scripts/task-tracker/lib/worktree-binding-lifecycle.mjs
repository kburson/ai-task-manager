// @story #1297 #2057
// Synchronous, machine-local lifecycle authority for worktree bindings. The
// Bash hook cannot query GitHub on every command, so successful close paths
// publish a main-anchored terminal timestamp before sweeping matching session
// records from every discoverable linked worktree.

import { assertStoryBindingSettled } from './story-cache/writer-handoff-bindings.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRuntimeRootOverride } from './runtime-storage.mjs';

import { deregisterTask, fleetRegistryPath, readFleet, withLock } from '../fleet-registry.mjs';
import { closedBindingsPath, occupancyPath } from '../paths.mjs';
import { compareAndClearActiveTask, getActiveTask } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { readOccupancy, releaseOccupancyAtOrBefore } from './occupancy.mjs';
import { releaseBindingOccupancy } from './occupancy-lifecycle.mjs';
import { GIT_TIMEOUT_MS } from './process-timeouts.mjs';

export const CLOSED_BINDINGS_SCHEMA = 1;
const GENERATION = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

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
  for (const [sessionId, entries] of Object.entries(value.sessions)) {
    if (!sessionId || !object(entries)) throw new Error('closed-bindings:invalid-session');
    for (const [issue, entry] of Object.entries(entries)) {
      if (
        normalizeBindingIssue(issue) !== issue ||
        !object(entry) ||
        (Object.hasOwn(entry, 'bindingGenerationId') && !GENERATION.test(entry.bindingGenerationId))
      ) {
        throw new Error('closed-bindings:invalid-entry');
      }
      try {
        timestamp(entry.closedAt, 'entry-closed-at');
      } catch {
        throw new Error('closed-bindings:invalid-entry');
      }
    }
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

export function markClosedBinding(
  { mainWorktreePath, sessionId, issue, closedAt, bindingGenerationId },
  deps = {}
) {
  const issueRef = normalizeBindingIssue(issue);
  if (!issueRef) throw new Error('closed-bindings:issue');
  if (!sessionId) throw new Error('closed-bindings:session');
  const closeMs = timestamp(closedAt, 'closed-at');
  if (bindingGenerationId !== undefined && !GENERATION.test(bindingGenerationId))
    throw new Error('closed-bindings:invalid-generation');
  const ledgerPath = (deps.closedBindingsPath || closedBindingsPath)(mainWorktreePath);
  const lock = deps.withLock || withLock;
  let result;
  lock(ledgerPath, () => {
    const ledger = (deps.readLedger || readClosedBindingLedger)(mainWorktreePath, deps);
    const prior = ledger.sessions?.[sessionId]?.[issueRef];
    const current = prior?.closedAt;
    const currentMs = current ? timestamp(current, 'existing-closed-at') : 0;
    if (
      currentMs === closeMs &&
      prior?.bindingGenerationId &&
      bindingGenerationId &&
      prior.bindingGenerationId !== bindingGenerationId
    )
      throw new Error('closed-bindings:conflicting-generation');
    const terminal =
      currentMs >= closeMs && prior
        ? prior
        : { closedAt, ...(bindingGenerationId ? { bindingGenerationId } : {}) };

    result = {
      ...ledger,
      sessions: {
        ...ledger.sessions,
        [sessionId]: {
          ...(ledger.sessions[sessionId] || {}),
          [issueRef]: terminal,
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
  const terminal = ledger?.sessions?.[sessionId]?.[issueRef];
  if (!terminal?.closedAt) return false;
  const closedMs = timestamp(terminal.closedAt, 'ledger-closed-at');
  // Earlier residue stays retired. A generation disambiguates equal instants;
  // it never revives an independently closed or strictly older record.
  return (
    closedMs > boundMs ||
    (closedMs === boundMs &&
      (!terminal.bindingGenerationId ||
        record.bindingGenerationId === terminal.bindingGenerationId))
  );
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

export function resolveBindingAuthorityMain(projectDir, deps = {}) {
  let linked;
  try {
    linked = (deps.listGitWorktrees || listGitWorktrees)(projectDir);
  } catch (error) {
    throw new Error(`closed-bindings:main-worktree-unavailable: ${error?.message || error}`);
  }
  const main = linked?.[0];
  if (!main) throw new Error('closed-bindings:main-worktree-unavailable');
  return path.resolve(main);
}

export function collectBindingCandidateWorktrees({ projectDir, deps = {} } = {}) {
  const resolveMain = deps.resolveMain || deps.findMain || resolveBindingAuthorityMain;
  const mainWorktreePath = resolveMain(projectDir, deps);
  const candidates = new Set([path.resolve(projectDir), path.resolve(mainWorktreePath)]);
  const env = deps.env || process.env;
  const override = resolveRuntimeRootOverride({
    cwd: projectDir,
    env,
    foreignWorktreeAdmission: deps.foreignWorktreeAdmission,
    adapters: deps.runtimeRootAdapters,
  });
  if (override) candidates.add(override.projectRoot);
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
  const resolveMain = deps.resolveMain || deps.findMain || resolveBindingAuthorityMain;
  const mainWorktreePath = resolveMain(projectDir, deps);
  const collected = deps.collectCandidates
    ? { mainWorktreePath, candidates: deps.collectCandidates({ projectDir, deps }) }
    : collectBindingCandidateWorktrees({ projectDir, deps });
  const candidates = Array.isArray(collected.candidates)
    ? collected.candidates
    : [...collected.candidates];
  const readActive = deps.getActiveTask || getActiveTask;
  for (const candidate of new Set([projectDir, ...candidates]))
    if (
      candidate === projectDir ||
      normalizeBindingIssue(readActive(sessionId, candidate)?.issue) === issueRef
    )
      assertStoryBindingSettled({ projectRoot: candidate, issue: issueRef, sessionId });
  const occupancyFile = (deps.occupancyPath || occupancyPath)(mainWorktreePath);
  // Capture before publishing/sweeping. A subsequent same-SID rebind cannot
  // replace the identity this terminal attempt is authorized to release.
  const expectedClaim =
    (deps.readOccupancy || readOccupancy)(occupancyFile)[String(Number(issueRef.slice(1)))] ?? null;
  const bindingGenerationId = expectedClaim?.bindingGenerationId;
  const mark = deps.markClosedBinding || markClosedBinding;
  const ledger = mark(
    {
      mainWorktreePath,
      sessionId,
      issue: issueRef,
      closedAt,
      ...(bindingGenerationId ? { bindingGenerationId } : {}),
    },
    deps
  );

  const compareAndClear = deps.compareAndClearActiveTask || compareAndClearActiveTask;
  const released = [];
  for (const candidate of candidates) {
    const result = compareAndClear(sessionId, candidate, (record) => {
      if (normalizeBindingIssue(record?.issue) !== issueRef) return false;
      return isBindingRecordClosed({ record, sessionId, ledger });
    });
    if (result?.status === 'cleared') released.push(candidate);
  }
  return {
    issue: issueRef,
    closedAt,
    mainWorktreePath,
    released,
    occupancyAuthority: {
      occupancyFile,
      sid: sessionId,
      closedAt,
      expectedClaim,
      ...(bindingGenerationId ? { bindingGenerationId } : {}),
    },
  };
}

export function releaseTerminalIssueBinding({ projectDir, issue, deps = {} } = {}) {
  const bindings = (deps.releaseIssueBindings || releaseIssueBindings)({ projectDir, issue });
  try {
    (deps.deregisterTask || deregisterTask)(projectDir, issue);
  } catch {
    // Fleet registration is advisory. Terminal ledger and occupancy authority
    // determine whether guarded work may continue.
  }
  const occupancy = (deps.releaseBindingOccupancy || releaseBindingOccupancy)(
    { projectDir, issue },
    {
      releaseOccupancy: (input) => {
        if (!bindings.occupancyAuthority)
          throw new Error('closed-bindings:release-claim-authority-missing');
        return (deps.releaseOccupancyAtOrBefore || releaseOccupancyAtOrBefore)({
          ...input,
          ...bindings.occupancyAuthority,
        });
      },
    }
  );
  const readback = (deps.inspectTerminalIssueBindingRelease || inspectTerminalIssueBindingRelease)({
    projectDir,
    issue,
    deps,
  });
  if (!object(readback) || typeof readback.then === 'function' || readback.status !== 'released')
    throw new Error(
      'closed-bindings:release-readback-' +
        (readback?.status === 'released' ? 'invalid' : readback?.status || 'invalid')
    );
  return { bindings, occupancy };
}

// A terminal close can crash after publishing the main-anchored closed-binding
// ledger entry but before checkpointing its delivered-close transaction. A
// retry must recognize that durable effect instead of replaying cleanup. The
// ledger entry proves a release occurred; scanning every known candidate also
// ensures a later same-session rebind is not mistaken for the old release.
export function inspectTerminalIssueBindingRelease({ projectDir, issue, deps = {} } = {}) {
  const issueRef = normalizeBindingIssue(issue);
  const sessionId = deps.sessionId ?? currentSessionId();
  if (!issueRef || !sessionId) throw new Error('closed-bindings:inspection-input');
  const resolveMain = deps.resolveMain || deps.findMain || resolveBindingAuthorityMain;
  const mainWorktreePath = resolveMain(projectDir, deps);
  const ledger = (deps.readLedger || readClosedBindingLedger)(mainWorktreePath, deps);
  const terminal = ledger.sessions?.[sessionId]?.[issueRef];
  const closedAt = terminal?.closedAt;
  if (!closedAt) return { status: 'pending', closedAt: null };
  const closedMs = timestamp(closedAt, 'ledger-closed-at');
  const occupancyFile = (deps.occupancyPath || occupancyPath)(mainWorktreePath);
  const occupancy = (deps.readOccupancy || readOccupancy)(occupancyFile);
  const occupancyRow = occupancy[String(Number(issueRef.slice(1)))] ?? null;
  if (
    occupancyRow &&
    (occupancyRow.sid !== sessionId ||
      (terminal.bindingGenerationId &&
        timestamp(occupancyRow.boundAt, 'occupancy-bound-at') === closedMs &&
        occupancyRow.bindingGenerationId !== terminal.bindingGenerationId) ||
      timestamp(occupancyRow.boundAt, 'occupancy-bound-at') > closedMs)
  ) {
    return { status: 'conflict', closedAt };
  }
  const collected = deps.collectCandidates
    ? { mainWorktreePath, candidates: deps.collectCandidates({ projectDir, deps }) }
    : collectBindingCandidateWorktrees({ projectDir, deps });
  const candidates = Array.isArray(collected.candidates)
    ? collected.candidates
    : [...collected.candidates];
  const readActive = deps.getActiveTask || getActiveTask;
  let staleBinding = false;
  for (const candidate of candidates) {
    const record = readActive(sessionId, candidate);
    if (normalizeBindingIssue(record?.issue) !== issueRef) continue;
    if (!isBindingRecordClosed({ record, sessionId, ledger })) {
      return { status: 'conflict', closedAt };
    }
    staleBinding = true;
  }
  return {
    status: occupancyRow || staleBinding ? 'incomplete' : 'released',
    closedAt,
  };
}

export function resumeTerminalIssueBindingRelease({ projectDir, issue, deps = {} } = {}) {
  const issueRef = normalizeBindingIssue(issue);
  const sessionId = deps.sessionId ?? currentSessionId();
  if (!issueRef || !sessionId) throw new Error('closed-bindings:resume-input');
  const resolveMain = deps.resolveMain || deps.findMain || resolveBindingAuthorityMain;
  const mainWorktreePath = resolveMain(projectDir, deps);
  const ledger = (deps.readLedger || readClosedBindingLedger)(mainWorktreePath, deps);
  if (!ledger.sessions?.[sessionId]?.[issueRef]?.closedAt) {
    throw new Error('closed-bindings:resume-authority-missing');
  }
  const collected = deps.collectCandidates
    ? { mainWorktreePath, candidates: deps.collectCandidates({ projectDir, deps }) }
    : collectBindingCandidateWorktrees({ projectDir, deps });
  const candidates = Array.isArray(collected.candidates)
    ? collected.candidates
    : [...collected.candidates];
  const compareAndClear = deps.compareAndClearActiveTask || compareAndClearActiveTask;
  for (const candidate of candidates) {
    const result = compareAndClear(sessionId, candidate, (record) => {
      if (normalizeBindingIssue(record?.issue) !== issueRef) return false;
      return isBindingRecordClosed({ record, sessionId, ledger });
    });
    if (
      result?.status === 'superseded' &&
      normalizeBindingIssue(result.record?.issue) === issueRef
    ) {
      throw new Error('closed-bindings:resume-conflict');
    }
  }
  try {
    (deps.deregisterTask || deregisterTask)(projectDir, issueRef);
  } catch {
    // Fleet registration remains advisory during recovery.
  }
  const occupancy = (deps.releaseOccupancyAtOrBefore || releaseOccupancyAtOrBefore)({
    projectDir,
    issue: issueRef,
    sid: sessionId,
    closedAt: ledger.sessions[sessionId][issueRef].closedAt,
    ...(ledger.sessions[sessionId][issueRef].bindingGenerationId
      ? { bindingGenerationId: ledger.sessions[sessionId][issueRef].bindingGenerationId }
      : {}),
  });
  return { status: 'released', occupancy };
}
