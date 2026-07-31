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

import { loadState, saveState } from '../../state.mjs';
import { getProjectDir, statePath as resolveStatePath } from '../../paths.mjs';
import { LOCAL_FAST_TIMEOUT_MS } from '../process-timeouts.mjs';
import { STAGES } from '../stage-entry-markers.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isGovernedAuthorityError } from '../work-lease/governed-effect.mjs';

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
export async function dispatchOnEnterActions(ctx) {
  const { issueArg, stateArg, resolvedFromState, cfg, SKIP_NETWORK } = ctx;
  if (SKIP_NETWORK) return;
  const deps = ctx.deps || {};
  try {
    const { STATES: STATE_OBJS } = await importOr(deps.states, '../../states/index.mjs');
    const target = STATE_OBJS[stateArg];
    if (target) {
      for (const action of target.onEnter) {
        try {
          await ctx.reverifyGovernedEffect?.();
          await action.run({
            issueNumber: Number(issueArg),
            repo: cfg.repo,
            fromState: resolvedFromState,
            toState: stateArg,
            cfg,
          });
        } catch (err) {
          if (isGovernedAuthorityError(err)) throw err;
          process.stderr.write(
            `[move-state] #${issueArg}: onEnter action "${action.id}" failed: ${err.message}\n`
          );
        }
      }
    }
  } catch (err) {
    if (isGovernedAuthorityError(err)) throw err;
    process.stderr.write(`[move-state] #${issueArg}: onEnter dispatch failed: ${err.message}\n`);
  }
}

// #218 follow-up — refresh the per-session `kanbanState` derived cache that
// the activity-guard hook reads synchronously. The body marker remains the
// source of truth; this only updates the read-cache for the current
// session's bound issue so the hook isn't deadlocked between two stale
// sources. Best-effort: failures must never block the board move.
export async function refreshKanbanStateCache(ctx) {
  const { issueArg, stateArg } = ctx;
  if (!STAGES.includes(stateArg)) return;
  const deps = ctx.deps || {};
  try {
    const [{ setSessionKanbanState, getActiveTask }, { currentSessionId }] = await Promise.all([
      importOr(deps.sessionState, '../../session-state.mjs'),
      importOr(deps.wordCounter, '../../word-counter.mjs'),
    ]);
    const sid = currentSessionId();
    if (sid) {
      const active = getActiveTask(sid, getProjectDir());
      if (active && active.issue === `#${issueArg}`) {
        await ctx.reverifyGovernedEffect?.();
        setSessionKanbanState(sid, stateArg, getProjectDir());
      }
    }
  } catch (err) {
    if (isGovernedAuthorityError(err)) throw err;
    process.stderr.write(
      `[move-state] #${issueArg}: kanbanState cache refresh failed: ${err.message}\n`
    );
  }
}

// #249 — Auto-unpark dependents. When the move lands at `done`, release any
// sibling whose `aitm-blocked-by` marker references this issue: strip the ref
// (and, on a full clear, drop the BLOCKED label) via child (b)'s marker API.
// Best-effort — failures are surfaced, never block the committed board move.
export async function unparkDoneDependents(ctx) {
  const { issueArg, stateArg, cfg, SKIP_NETWORK } = ctx;
  if (!(stateArg === 'done' && !SKIP_NETWORK && process.env.AITM_CASCADE !== '1')) return;
  const deps = ctx.deps || {};
  // A parent move lease is never authority for a dependent child. Callers that
  // already carry governed authority must provide an explicit child-authority
  // adapter; otherwise this best-effort tail fails closed with zero mutation.
  if (ctx.withGovernedEffect && typeof deps.childWithGovernedEffect !== 'function') {
    process.stderr.write(
      `[unpark] #${issueArg}: skipped dependent mutation — exact child authority unavailable\n`
    );
    return;
  }
  try {
    const { unparkDependents } = await importOr(deps.unparkMod, '../unpark-dependents.mjs');
    const released = await unparkDependents({
      doneIssueNumber: Number(issueArg),
      cfg,
      ...(deps.childWithGovernedEffect
        ? { deps: { withGovernedEffect: deps.childWithGovernedEffect } }
        : {}),
    });
    const cleared = released.filter((r) => r.cleared);
    const errored = released.filter((r) => r.error);
    if (cleared.length) {
      const summary = cleared.map((r) => `#${r.issue}(${r.cleared})`).join(', ');
      process.stderr.write(`[unpark] #${issueArg}: released ${summary}\n`);
    }
    for (const r of errored) {
      process.stderr.write(`[unpark] #${issueArg}: ${r.issue ?? '?'} failed: ${r.error}\n`);
    }
  } catch (err) {
    if (isGovernedAuthorityError(err)) throw err;
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
export async function syncTrackerState(ctx) {
  const { stateArg } = ctx;
  try {
    const deps = ctx.deps || {};
    const projectDir = getProjectDir();
    const sp = resolveStatePath(projectDir);
    const s = loadState(sp);
    s.state = stateArg;
    deps.beforeTrackerSave?.();
    await ctx.reverifyGovernedEffect?.();
    const saveTrackerState = deps.saveState || saveState;
    saveTrackerState(s, sp);
  } catch (err) {
    if (isGovernedAuthorityError(err)) throw err;
    /* best-effort */
  }
}

// Update event fields (awaited — failure is a visible warning, not a silent drop)
export async function syncEventFields(ctx) {
  const { issueArg, stateArg, itemId, SKIP_NETWORK } = ctx;
  if (SKIP_NETWORK) return;
  const args = [issueArg, stateArg];
  if (itemId) args.push('--item-id', itemId);
  try {
    const updateEventFields =
      ctx.deps?.updateEventFields || (await import('../../../gh/update-event-fields.mjs')).main;
    const code = await updateEventFields(args, {
      operation: ctx.governedOperation,
      withGovernedEffect: ctx.withGovernedEffect,
    });
    if (code !== 0) throw Object.assign(new Error(`event-field update exited ${code}`), { code });
  } catch (e) {
    if (isGovernedAuthorityError(e)) throw e;
    const msg = e.stderr?.trim() || e.message?.split('\n')[0] || 'unknown error';
    process.stderr.write(
      `warning: Start Time field sync failed: ${msg}\n` +
        `  To repair: node scripts/gh/update-event-fields.mjs ${issueArg} ${stateArg} --item-id ${itemId}\n`
    );
  }
}

// End task tracking when moving to done (unless during cascade close)
export async function endTaskTracking(ctx) {
  const { stateArg, SKIP_NETWORK, pexec, __dir } = ctx;
  if (!(stateArg === 'done' && process.env.AITM_CASCADE !== '1' && !SKIP_NETWORK)) return;
  const repoRoot = getProjectDir();
  const ttScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs'),
    path.resolve(__dir, '../task-tracker/task-tracker.mjs'),
  ];
  const ttScript = ttScriptCandidates.find((s) => existsSync(s));
  // This is part of the governed tail: fence immediately before spawning and
  // await completion so the authority scope cannot unwind while the child is
  // still mutating local task state.
  if (ttScript) {
    await ctx.reverifyGovernedEffect?.();
    try {
      await pexec(process.execPath, [ttScript, 'end'], { timeout: LOCAL_FAST_TIMEOUT_MS });
    } catch (error) {
      if (isGovernedAuthorityError(error)) throw error;
      /* best-effort local cleanup */
    }
  }
}
