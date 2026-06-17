import {
  findMainWorktreePath,
  fleetRegistryPath,
  readFleet,
  pruneFleet,
  effectiveKind,
} from '../fleet-registry.mjs';
import { loadState } from '../state.mjs';

export function verbFleet(ctx) {
  // #441 — dispatch on the sub-command in ctx.rest[0]. No sub-command (or an
  // unrecognized one) falls through to the read-only lister, preserving the
  // historical `/task fleet` behavior.
  const sub = (ctx.rest?.[0] || '').toLowerCase();
  if (sub === 'prune') return fleetPrune(ctx);
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
