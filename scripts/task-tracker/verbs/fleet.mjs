import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  findMainWorktreePath,
  fleetRegistryPath,
  readFleet,
  pruneFleet,
  effectiveKind,
} from '../fleet-registry.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { releaseTerminalIssueBinding } from '../lib/worktree-binding-lifecycle.mjs';
import { loadState } from '../state.mjs';

const pexec = promisify(execFile);

async function defaultReadIssueState({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'state', '--jq', '.state'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '')
    .trim()
    .toUpperCase();
}

export async function releaseClosedFleetBinding(ctx, deps = {}) {
  const issueArg = ctx.rest?.[1];
  const match = String(issueArg || '').match(/^#?(\d+)$/);
  if (!match || ctx.rest.length !== 2) {
    throw new Error('fleet release-closed-binding requires exactly one #N issue');
  }
  if (!ctx.cfg?.repo) throw new Error('fleet release-closed-binding requires cfg.repo');
  const issueNumber = Number(match[1]);
  const issue = `#${issueNumber}`;
  const state = await (deps.readIssueState || defaultReadIssueState)({
    issueNumber,
    repo: ctx.cfg.repo,
  });
  if (state !== 'CLOSED') {
    throw new Error(`fleet release-closed-binding refused: ${issue} is not CLOSED`);
  }
  const result = (deps.releaseTerminalIssueBinding || releaseTerminalIssueBinding)({
    projectDir: ctx.projectDir,
    issue,
    deps,
  });
  return { issue, released: result.bindings.released };
}

export function verbFleet(ctx) {
  // #441 — dispatch on the sub-command in ctx.rest[0]. No sub-command (or an
  // unrecognized one) falls through to the read-only lister, preserving the
  // historical `/task fleet` behavior.
  const sub = (ctx.rest?.[0] || '').toLowerCase();
  if (sub === 'prune') return fleetPrune(ctx);
  if (sub === 'release-closed-binding') {
    return releaseClosedFleetBinding(ctx).then((result) => {
      console.log(
        `Fleet binding recovery: released ${result.released.length} record(s) for ${result.issue}.`
      );
      return result;
    });
  }
  return fleetList(ctx);
}

function fleetList(ctx) {
  const { projectDir } = ctx;
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  const fleet = readFleet(rPath);
  const entries = Object.entries(fleet);
  if (entries.length === 0) {
    console.log('No fleet tasks registered.');
    return;
  }
  const now = Date.now();
  console.log(`Fleet: ${entries.length} task${entries.length === 1 ? '' : 's'}`);
  for (const [ref, info] of entries) {
    const ageMin = Math.round((now - new Date(info.startedAt).getTime()) / 60000);
    const age = ageMin >= 60 ? `${Math.floor(ageMin / 60)}h ${ageMin % 60}m` : `${ageMin}m`;
    const kind = effectiveKind(info, mainPath);
    console.log(
      `  ${ref.padEnd(6)} ${kind.padEnd(8)} ${info.status.padEnd(8)} ${(info.branch || '?').padEnd(28)} started ${age} ago`
    );
  }
}

// #441 — `/task fleet prune [--dry-run]`. Evicts stale entries (gone worktrees,
// aged-out active binds, and leaked main binds that are not the live issue)
// using the same isStaleEntry predicate as guard-time auto-reap, so operator
// and automatic behavior never diverge. --dry-run lists without writing.
function fleetPrune(ctx) {
  const { projectDir, statePath, rest } = ctx;
  const dryRun = rest.includes('--dry-run');
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);

  let activeRef;
  try {
    const s = loadState(statePath);
    if (s.active && s.active !== 'discover') activeRef = s.active;
  } catch {
    /* no live state → no active main bind is protected */
  }

  const { kept, evicted } = pruneFleet(
    rPath,
    { nowMs: Date.now(), activeRef, mainWorktreePath: mainPath },
    { dryRun }
  );

  const label = dryRun ? 'Would evict' : 'Evicted';
  if (evicted.length === 0) {
    console.log(`Fleet prune: nothing stale (${Object.keys(kept).length} kept).`);
    return;
  }
  console.log(`Fleet prune${dryRun ? ' (dry-run)' : ''}: ${label} ${evicted.length}:`);
  for (const ref of evicted) console.log(`  - ${ref}`);
  console.log(`Kept ${Object.keys(kept).length}.`);
}
