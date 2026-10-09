// INTERNAL — library module for the state-movement boundary (#559).
//
// Cache/unpark concern extracted from `scripts/gh/move-state.mjs`. These are
// the derived-state + downstream-release side-effects that fire after a
// committed board move:
//   • `STATES[to].onEnter` action dispatch (#292),
//   • the per-session `kanbanState` read-cache refresh (#218),
//   • auto-unpark of dependents blocked by a now-done issue (#249),
//   • the tracker-state local cache sync (single-state-mutator invariant),
//   • the Start/End event-field sync (update-event-fields.mjs),
//   • end-of-task local tracking on the move to done.
//
// Every function is best-effort: a failure surfaces on stderr and never rolls
// back the committed board move. The host calls them interleaved with the
// audit-timing emissions in the SAME order as the pre-#559 inline block, so
// observable side-effect ordering is byte-identical.
//
// Runtime values, `cfg`, and the I/O primitives arrive via the shared `ctx`;
// stateless helpers + node builtins are imported directly here.

import {
  assertRevisionStageHostEffect,
  isMemoryStageEffectScope,
} from '../criteria-revision/transport-quarantine.mjs';
import { loadState, saveState } from '../../state.mjs';
import { getProjectDir, statePath as resolveStatePath } from '../../paths.mjs';
import { GH_API_TIMEOUT_MS, LOCAL_FAST_TIMEOUT_MS } from '../process-timeouts.mjs';
import { STAGES } from '../stage-entry-markers.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  beginNativeStageTailDispatch,
  assertNativeStageTailDispatchModule,
} from './move-state-core.mjs';

// Testable seam (#629): the helpers below resolve their gh-backed / session
// collaborator modules through `ctx.deps`. Production assembles `ctx` without a
// `deps` key (see move-state.mjs), so every call falls through to the real
// dynamic import — byte-identical to the prior inline `await import(...)`.
// Unit tests pass `ctx.deps` to inject fakes and avoid spawning `gh` or
// touching real session state. Mirrors the #627/#628 injection seam.
async function importOr(dep, spec) {
  return dep || (await import(spec));
}

// #292 — fire each `STATES[to].onEnter` action after a successful Status
// write + marker stamp. Actions are short, idempotent setup hooks (see
// `states/index.mjs` Action contract). Empty today; populated by future
// migration sub-issues. Failures degrade to stderr — the transition stands.
const originalNativeDispatchReturns = new WeakMap();
export function assertOriginalNativeTailDispatchReturn(input, ctx, result) {
  const original = originalNativeDispatchReturns.get(input);
  if (!original || original.ctx !== ctx || !original.returned || result !== undefined)
    throw new TypeError('native-tail-dispatch:original-return');
  originalNativeDispatchReturns.delete(input);
}
export async function dispatchOnEnterActions(ctx, nativeInput) {
  const nativeMemory = isMemoryStageEffectScope();
  if (nativeMemory) {
    beginNativeStageTailDispatch(nativeInput, ctx);
    originalNativeDispatchReturns.set(nativeInput, { ctx, returned: false });
  } else assertRevisionStageHostEffect();
  const { issueArg, stateArg, resolvedFromState, cfg, SKIP_NETWORK } = ctx;
  if (SKIP_NETWORK) return;
  const deps = nativeMemory ? {} : ctx.deps || {};
  try {
    const stateModule = await importOr(deps.states, '../../states/index.mjs');
    if (nativeMemory) assertNativeStageTailDispatchModule(nativeInput, ctx, stateModule);
    const { STATES: STATE_OBJS } = stateModule;
    const target = STATE_OBJS[stateArg];
    if (target) {
      for (const action of target.onEnter) {
        try {
          await action.run({
            issueNumber: Number(issueArg),
            repo: cfg.repo,
            fromState: resolvedFromState,
            toState: stateArg,
            cfg,
          });
        } catch (err) {
          process.stderr.write(
            `[move-state] #${issueArg}: onEnter action "${action.id}" failed: ${err.message}\n`
          );
        }
      }
    }
    if (nativeMemory) originalNativeDispatchReturns.get(nativeInput).returned = true;
  } catch (err) {
    if (nativeMemory) {
      originalNativeDispatchReturns.delete(nativeInput);
      throw err;
    }
    process.stderr.write(`[move-state] #${issueArg}: onEnter dispatch failed: ${err.message}\n`);
  }
}

// #218 follow-up — refresh the per-session `kanbanState` derived cache that
// the activity-guard hook reads synchronously. The body marker remains the
// source of truth; this only updates the read-cache for the current
// session's bound issue so the hook isn't deadlocked between two stale
// sources. Best-effort: failures must never block the board move.
function* kanbanRefreshProgram(ctx) {
  const { issueArg, stateArg } = ctx;
  if (!STAGES.includes(stateArg)) return;
  const deps = ctx.deps || {};
  try {
    yield { kind: 'modules', deps };
    const sid = yield { kind: 'sid' };
    if (sid) {
      const active = yield { kind: 'active', sid, projectDir: yield { kind: 'root' } };
      if (active && active.issue === `#${issueArg}`) {
        yield { kind: 'set', sid, stateArg, projectDir: yield { kind: 'root' } };
      }
    }
  } catch (err) {
    yield {
      kind: 'stderr',
      bytes: `[move-state] #${issueArg}: kanbanState cache refresh failed: ${err.message}\n`,
    };
  }
}

export async function refreshKanbanStateCache(ctx) {
  assertRevisionStageHostEffect();
  const program = kanbanRefreshProgram(ctx);
  let setSessionKanbanState, getActiveTask, currentSessionId;
  let next = program.next();
  while (!next.done) {
    const operation = next.value;
    let value;
    try {
      switch (operation.kind) {
        case 'modules':
          [{ setSessionKanbanState, getActiveTask }, { currentSessionId }] = await Promise.all([
            importOr(operation.deps.sessionState, '../../session-state.mjs'),
            importOr(operation.deps.wordCounter, '../../word-counter.mjs'),
          ]);
          break;
        case 'sid':
          value = currentSessionId();
          break;
        case 'root':
          value = getProjectDir();
          break;
        case 'active':
          value = getActiveTask(operation.sid, operation.projectDir);
          break;
        case 'set':
          value = setSessionKanbanState(operation.sid, operation.stateArg, operation.projectDir);
          break;
        case 'stderr':
          value = process.stderr.write(operation.bytes);
          break;
        default:
          throw new TypeError('kanban-refresh-operation');
      }
    } catch (error) {
      next = program.throw(error);
      continue;
    }
    next = program.next(value);
  }
}

// #249/#1557 — Reconcile dependent Dispositions after a move lands at `done`.
// sibling whose `aitm-blocked-by` marker references this issue: strip the ref
// (and, on a full clear, drop the BLOCKED label) via child (b)'s marker API.
// Best-effort — failures are surfaced, never block the committed board move.
export async function unparkDoneDependents(ctx) {
  assertRevisionStageHostEffect();
  const { issueArg, stateArg, cfg, SKIP_NETWORK } = ctx;
  if (!(stateArg === 'done' && !SKIP_NETWORK && process.env.AITM_CASCADE !== '1')) return;
  const deps = ctx.deps || {};
  try {
    const { unparkDependents } = await importOr(deps.unparkMod, '../unpark-dependents.mjs');
    const results = await unparkDependents({ doneIssueNumber: Number(issueArg), cfg });
    const reconciled = results.filter((result) => result.reconciled);
    const errored = results.filter((result) => result.error);
    if (reconciled.length) {
      const summary = reconciled
        .map((result) => `#${result.issue}(${result.reconciled})`)
        .join(', ');
      process.stderr.write(`[unpark] #${issueArg}: reconciled ${summary}\n`);
    }
    for (const r of errored) {
      process.stderr.write(
        `[unpark] #${issueArg}: partial reconciliation for ${r.issue ?? '?'}: ${r.error}\n`
      );
    }
  } catch (err) {
    // surface, do not block — board move is committed
    process.stderr.write(`[unpark] #${issueArg}: enforcement failed: ${err.message}\n`);
  }
}

// Persist new kanban state to tracker-state. move-state.mjs is the single
// state-mutator, so every successful transition must sync the local cache —
// regardless of whether the caller bound via `/task #N` first. Orchestrator
// flows and sub-agent fan-outs run with `s.active === null`; gating on
// active here left the cache permanently stale and the next verb's preflight
// flagged it as a human-move (#210).
function* trackerSyncProgram(ctx) {
  const { stateArg } = ctx;
  try {
    const projectDir = yield { kind: 'root' };
    const sp = yield { kind: 'path', projectDir };
    const s = yield { kind: 'load', file: sp };
    s.state = stateArg;
    yield { kind: 'save', state: s, file: sp };
  } catch {
    /* best-effort */
  }
}

export function syncTrackerState(ctx) {
  assertRevisionStageHostEffect();
  const program = trackerSyncProgram(ctx);
  let next = program.next();
  while (!next.done) {
    const operation = next.value;
    let value;
    try {
      switch (operation.kind) {
        case 'root':
          value = getProjectDir();
          break;
        case 'path':
          value = resolveStatePath(operation.projectDir);
          break;
        case 'load':
          value = loadState(operation.file);
          break;
        case 'save':
          value = saveState(operation.state, operation.file);
          break;
        default:
          throw new TypeError('tracker-sync-operation');
      }
    } catch (error) {
      next = program.throw(error);
      continue;
    }
    next = program.next(value);
  }
}

// Update event fields (awaited — failure is a visible warning, not a silent drop)
export async function syncEventFields(ctx) {
  assertRevisionStageHostEffect();
  const { issueArg, stateArg, itemId, SKIP_NETWORK, pexec, __dir } = ctx;
  if (SKIP_NETWORK) return;
  const repoRoot = getProjectDir();
  const eventScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/gh/update-event-fields.mjs'),
    path.resolve(__dir, 'update-event-fields.mjs'),
  ];
  const eventScript = eventScriptCandidates.find((s) => existsSync(s));
  if (eventScript) {
    const args = [eventScript, issueArg, stateArg];
    if (itemId) args.push('--item-id', itemId);
    try {
      await pexec(process.execPath, args, { timeout: GH_API_TIMEOUT_MS * 2 });
    } catch (e) {
      const msg = e.stderr?.trim() || e.message?.split('\n')[0] || 'unknown error';
      process.stderr.write(
        `warning: Start Time field sync failed: ${msg}\n` +
          `  To repair: node scripts/gh/update-event-fields.mjs ${issueArg} ${stateArg} --item-id ${itemId}\n`
      );
    }
  }
}

// End task tracking when moving to done (unless during cascade close)
export function endTaskTracking(ctx) {
  assertRevisionStageHostEffect();
  const { stateArg, SKIP_NETWORK, pexec, __dir } = ctx;
  if (!(stateArg === 'done' && process.env.AITM_CASCADE !== '1' && !SKIP_NETWORK)) return;
  const repoRoot = getProjectDir();
  const ttScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs'),
    path.resolve(__dir, '../task-tracker/task-tracker.mjs'),
  ];
  const ttScript = ttScriptCandidates.find((s) => existsSync(s));
  // Fire-and-forget local task-tracker end. Local-fast budget; ignore failures.
  if (ttScript)
    pexec(process.execPath, [ttScript, 'end'], { timeout: LOCAL_FAST_TIMEOUT_MS }).catch(() => {});
}

// @story #1855
// DATA replay of the original private local-tail programs. Resource provenance,
// native operation custody, locks and effects are checked by the actual driver;
// this function can never supply any of those capabilities.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { deriveRecordedActiveTaskRead, deriveRecordedSessionKanban } from '../../session-state.mjs';
import { deriveRecordedState, deriveRecordedStateSaveProgram } from '../../state.mjs';
import { validateWordCursor } from '../../word-counter.mjs';
export function deriveRecordedNativeLocalTail(input) {
  const invalid = () => {
    throw new TypeError('native-local-tail-data');
  };
  try {
    const source = JSON.parse(canonicalRecordJson(input));
    const keys = (value, expected) => {
      if (
        !value ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).sort().join(',') !== expected.slice().sort().join(',')
      )
        invalid();
    };
    keys(source, ['kind', 'issue', 'projectDir', 'statePath', 'identity', 'boundAt', 'local']);
    keys(source.identity, ['provider', 'sid']);
    keys(source.local, [
      'activeTask',
      'actorTiming',
      'actorFlush',
      'wordCursor',
      'trackerState',
      'queue',
    ]);
    if (
      !['refreshKanbanStateCache', 'syncTrackerState'].includes(source.kind) ||
      typeof source.issue !== 'string' ||
      !Number.isSafeInteger(Number(source.issue)) ||
      Number(source.issue) < 1 ||
      String(Number(source.issue)) !== source.issue ||
      typeof source.projectDir !== 'string' ||
      !path.isAbsolute(source.projectDir) ||
      path.normalize(source.projectDir) !== source.projectDir ||
      source.projectDir.includes('\0') ||
      typeof source.statePath !== 'string' ||
      !path.isAbsolute(source.statePath) ||
      typeof source.identity.sid !== 'string' ||
      !source.identity.sid
    )
      invalid();
    for (const resource of Object.values(source.local))
      if (resource !== null) {
        keys(resource, ['bytes']);
        if (typeof resource.bytes !== 'string') invalid();
      }
    const local = structuredClone(source.local),
      operations = [];
    let stateSave = null;
    const ctx = { issueArg: source.issue, stateArg: 'test' };
    const program =
      source.kind === 'refreshKanbanStateCache'
        ? kanbanRefreshProgram(ctx)
        : trackerSyncProgram(ctx);
    let next = program.next();
    while (!next.done) {
      const operation = next.value;
      operations.push(structuredClone(operation));
      let value;
      switch (operation.kind) {
        case 'modules':
          break;
        case 'sid':
          value = source.identity.sid;
          break;
        case 'root':
          value = source.projectDir;
          break;
        case 'path':
          value = source.statePath;
          break;
        case 'active':
          value = deriveRecordedActiveTaskRead({ bytes: local.activeTask?.bytes ?? null });
          break;
        case 'set': {
          const derived = deriveRecordedSessionKanban({
            existingBytes: local.activeTask?.bytes ?? null,
            state: operation.stateArg,
          });
          local.activeTask = derived.bytes === null ? null : { bytes: derived.bytes };
          value = derived.payload;
          break;
        }
        case 'load': {
          const marker =
            local.actorTiming !== null || local.wordCursor === null
              ? { words: 0, wordsFull: 0 }
              : validateWordCursor(JSON.parse(local.wordCursor.bytes), source.identity);
          value = deriveRecordedState({
            sharedBytes: local.trackerState?.bytes ?? null,
            identity: source.identity,
            actorBytes: local.actorTiming?.bytes ?? null,
            activeBytes: local.activeTask?.bytes ?? null,
            cursor:
              local.actorTiming === null
                ? { words: marker.words, wordsFull: marker.wordsFull }
                : null,
          });
          break;
        }
        case 'save':
          stateSave = deriveRecordedStateSaveProgram({
            identity: source.identity,
            stateBytes: JSON.stringify(operation.state),
            statePath: operation.file,
            actorBytes: local.actorTiming?.bytes ?? null,
            activeBytes: local.activeTask?.bytes ?? null,
            sharedBytes: local.trackerState?.bytes ?? null,
            boundAt: source.boundAt,
          });
          Object.assign(local, structuredClone(stateSave.resources));
          break;
        default:
          invalid();
      }
      next = program.next(value);
    }
    if (source.kind === 'refreshKanbanStateCache' && source.boundAt !== null) invalid();
    const result = JSON.parse(canonicalRecordJson({ operations, stateSave, local }));
    const freeze = (value) => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    };
    return freeze(result);
  } catch {
    invalid();
  }
}
