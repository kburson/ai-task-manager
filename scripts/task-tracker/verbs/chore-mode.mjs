// #327 — `/task chore-mode` verb. Three sub-commands:
//
//   chore-mode on  [reason]   — detach + flush + set choreMode.active = true
//   chore-mode off [--resume] — clear choreMode.active; optionally rebind prior
//   chore-mode status         — print on/off + since + previousIssue + reason
//
// `on` refuses when any worktree-scoped sub-agent is recorded as live in the
// fleet registry. This avoids chore-mode interacting with a live parallel
// fan-out (#327 non-goal: chore-mode is single-thread main-loop only).
//
// While active, chore-mode bypasses the source-edit gate (every Edit/Write
// allowed) and commit-trail-handler refuses any subject that does not start
// with `chore: `. See lib/chore-mode.mjs for the state primitive.

import { loadState, saveState } from '../state.mjs';
import { readChoreMode, writeChoreMode, appendChoreModeAudit } from '../lib/chore-mode.mjs';
import {
  readFleet,
  fleetRegistryPath,
  findMainWorktreePath,
  effectiveKind,
} from '../fleet-registry.mjs';

// Returns the list of fleet entries that look like a live worktree-scoped
// agent. Used by the `on` refusal gate. An entry is considered live if its
// `status === 'active'` AND its effective kind is `worktree` (a real
// worktree-scoped spawn, not a main-thread bind).
//
// #441 — a main-thread `/task #N` bind stores `worktreePath = projectDir`
// (= the main worktree), which is byte-identical to a real agent's path. The
// old "non-empty worktreePath" test therefore false-blocked chore-mode on
// every main bind (the #405@trunk class). We now key on the stored `kind`,
// falling back to path-inference against `mainWorktreePath` for legacy entries
// that predate the tag. When `mainWorktreePath` is omitted, only the stored
// kind is honored (still strictly better than the old behavior).
export function liveWorktreeAgents(fleet, mainWorktreePath) {
  const out = [];
  if (!fleet || typeof fleet !== 'object') return out;
  for (const [ref, entry] of Object.entries(fleet)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.status !== 'active') continue;
    if (!entry.worktreePath || typeof entry.worktreePath !== 'string') continue;
    if (effectiveKind(entry, mainWorktreePath) !== 'worktree') continue;
    out.push({ ref, ...entry });
  }
  return out;
}

// Pure helper: build the structured refusal payload for the `on` gate.
// Exported so tests can pin the shape without spawning the verb.
export function buildLiveFleetRefusal(agents) {
  const lines = agents.map((a) => `  - ${a.ref} @ ${a.branch || '?'} (${a.worktreePath})`);
  return {
    code: 'chore-mode-live-fleet',
    message:
      'chore-mode on refused: live worktree-scoped agent(s) detected.\n' +
      'chore-mode is single-thread main-loop only — incompatible with parallel fan-out.\n' +
      'Live agents:\n' +
      lines.join('\n') +
      '\nResolve: wait for each agent to finish (or stop them) before entering chore-mode.',
  };
}

// Pure helper: format the status output for `chore-mode status`.
export function formatStatus(cm) {
  const flag = cm.active ? 'on' : 'off';
  const since = cm.since || '(never)';
  const prev = cm.previousIssue || 'none';
  const reason = cm.reason || '(none)';
  return [
    `chore-mode: ${flag}`,
    `since: ${since}`,
    `previousIssue: ${prev}`,
    `reason: ${reason}`,
  ].join('\n');
}

// Sub-command dispatchers. Each takes `ctx` (the verb context) plus an
// optional `deps` bag for test injection. The CLI surface (`verbChoreMode`)
// reads the sub-command from `ctx.rest[0]` and dispatches.

export async function choreModeOn(ctx, deps = {}) {
  const { statePath, projectDir, rest } = ctx;
  const readFleetImpl = deps.readFleet || readFleet;
  const findMainImpl = deps.findMainWorktreePath || findMainWorktreePath;
  const readCM = deps.readChoreMode || readChoreMode;
  const writeCM = deps.writeChoreMode || writeChoreMode;
  const appendAudit = deps.appendChoreModeAudit || appendChoreModeAudit;
  const nowIso = deps.nowIso || (() => new Date().toISOString());
  const flushActiveToGH = deps.flushActiveToGH || ctx.flushActiveToGH;
  const out = deps.out || process.stdout;
  const err = deps.err || process.stderr;

  const currentCM = readCM(projectDir);
  if (currentCM.active) {
    out.write(
      `chore-mode is already on (since ${currentCM.since}; previousIssue ${currentCM.previousIssue || 'none'}).\n`
    );
    return 0;
  }

  // Refuse if a live worktree-scoped agent is recorded in the fleet registry.
  let fleet = {};
  let mainPath;
  try {
    mainPath = findMainImpl(projectDir);
    fleet = readFleetImpl(fleetRegistryPath(mainPath));
  } catch {
    // Missing/unreadable registry is treated as "no live agents" — chore-mode
    // is a developer-only flow and a missing fleet file means no fan-out is
    // even possible.
  }
  const live = liveWorktreeAgents(fleet, mainPath);
  if (live.length > 0) {
    const refusal = buildLiveFleetRefusal(live);
    err.write(`[task-tracker] ${refusal.code}: ${refusal.message}\n`);
    return 2;
  }

  // Slice rest=['on', ...reason] → reason string.
  const reasonArgs = rest.slice(1).filter((a) => a !== '--resume');
  const reason = reasonArgs.join(' ').trim() || null;

  // Flush + detach the active task so its timing-log row captures pre-chore work.
  const s = loadState(statePath);
  let previousIssue = null;
  if (s.active && s.active !== 'discover') {
    previousIssue = s.active;
    if (typeof flushActiveToGH === 'function' && s.entryStartTs) {
      try {
        await flushActiveToGH(s, 'chore-mode-enter', reason || 'entered chore-mode');
      } catch {
        /* tolerate flush failure — chore-mode itself must not block */
      }
    }
    saveState(
      {
        ...s,
        active: null,
        entryStartTs: null,
        wordsAtEntryStart: 0,
        lastActive: previousIssue,
      },
      statePath
    );
  }

  const since = nowIso();
  writeCM(projectDir, {
    active: true,
    since,
    previousIssue,
    reason,
  });

  // #659 AC3 — record a durable audit marker for this activation. The live
  // `choreMode` record is wiped on `off`, so the append-only log is the
  // attributable trail of who bypassed the source-edit gate and why.
  appendAudit(projectDir, { reason, ts: since, previousIssue });

  out.write(
    `chore-mode: on${previousIssue ? ` (detached ${previousIssue})` : ''}${reason ? ` — ${reason}` : ''}\n`
  );
  return 0;
}

export async function choreModeOff(ctx, deps = {}) {
  const { rest, projectDir } = ctx;
  const readCM = deps.readChoreMode || readChoreMode;
  const writeCM = deps.writeChoreMode || writeChoreMode;
  const out = deps.out || process.stdout;
  const verbStart = deps.verbStart;
  const resume = rest.includes('--resume');

  const currentCM = readCM(projectDir);
  if (!currentCM.active) {
    out.write('chore-mode is already off.\n');
    return 0;
  }

  const prev = currentCM.previousIssue;

  // Clear the active flag first — if --resume rebinds and that path throws,
  // we still want the gate to release.
  writeCM(projectDir, {
    active: false,
    since: null,
    previousIssue: prev, // keep one cycle for debugging
    reason: null,
  });

  if (resume && prev) {
    if (typeof verbStart === 'function') {
      // verbStart reads lastActive — set it via state so the existing resume
      // path rebinds the previous issue. lastActive was already pushed by the
      // saveState in `on`, so this is just a defensive write.
      const { loadState: ls, saveState: ss } = await import('../state.mjs');
      const s = ls(ctx.statePath);
      if (!s.lastActive) {
        ss({ ...s, lastActive: prev }, ctx.statePath);
      }
      await verbStart(ctx, 'chore-mode exit');
      out.write(`chore-mode: off (resumed ${prev}).\n`);
      return 0;
    }
    out.write(`chore-mode: off (would resume ${prev}; verbStart not wired).\n`);
    return 0;
  }

  out.write('chore-mode: off (tracker idle).\n');
  return 0;
}

export function choreModeStatus(ctx, deps = {}) {
  const { projectDir } = ctx;
  const readCM = deps.readChoreMode || readChoreMode;
  const out = deps.out || process.stdout;
  const cm = readCM(projectDir);
  out.write(formatStatus(cm) + '\n');
  return 0;
}

// CLI entry-point — dispatches on `ctx.rest[0]`.
export async function verbChoreMode(ctx) {
  const sub = (ctx.rest[0] || '').toLowerCase();
  if (sub === 'on') {
    const code = await choreModeOn(ctx);
    if (code !== 0) process.exit(code);
    return;
  }
  if (sub === 'off') {
    // Lazy-import verbStart so we only pay the cost when actually resuming.
    const { verbStart } = await import('./start.mjs');
    const code = await choreModeOff(ctx, { verbStart });
    if (code !== 0) process.exit(code);
    return;
  }
  if (sub === 'status' || sub === '') {
    choreModeStatus(ctx);
    return;
  }
  process.stderr.write(`unknown chore-mode sub-command: ${sub}\n`);
  process.stderr.write('Usage: /task chore-mode (on [reason] | off [--resume] | status)\n');
  process.exit(2);
}
