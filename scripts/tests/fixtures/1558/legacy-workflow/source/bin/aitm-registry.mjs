// #413 — Single-source command registry for the `aitm` orchestrator.
//
// `aitm` is a thin front-router. This module is its routing table. It has two
// halves:
//
//   1. VERBS — the /task state-machine verbs exposed by the canonical command
//      catalog. `aitm <verb>` delegates to task-tracker.mjs.
//   2. SCRIPTS — the curated set of operator-facing standalone support scripts
//      (from scripts/lib/self-doc.mjs). `aitm <name>` spawns the script.
//
// Anything not in either half is intentionally NOT reachable through `aitm`.
// The INTERNAL map below documents the deliberate exclusions and why, so the
// omissions are auditable rather than accidental.
//
// Intended caller: bin/aitm.mjs (the dispatcher) and the dispatcher's tests.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELF_DOC } from '../scripts/lib/self-doc.mjs';
import {
  agentCommandCatalog,
  taskVerbNames,
} from '../scripts/task-tracker/lib/command-surface/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const TASK_TRACKER_PATH = path.join(REPO_ROOT, 'scripts/task-tracker/task-tracker.mjs');
// Repo-root-relative form of the verb hub — the resolution target for a direct
// `node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs`
// invocation, which `aitm-path-guard` steers to `npx aitm <verb>`.
export const TASK_TRACKER_REL = 'scripts/task-tracker/task-tracker.mjs';

// Verbs that exist as `case` labels but are NOT user commands: `move` is a
// guard stub that errors with a "did you mean promote/demote" hint, and
// `help`/`?` are handled by the dispatcher itself.
const NON_COMMAND_CASES = new Set(['move', 'help', '?']);

// Cross-check helper (retained from #413): recover the verb set by scanning
// task-tracker.mjs's dispatch switch for `case` labels. This is NO LONGER the
// registry's source of truth — the manifest is. It survives only as the
// reference the parity test diffs the manifest against, so a `case` added to
// the verb hub without a matching manifest entry (or vice-versa) fails CI.
export function parseVerbs(source = readFileSync(TASK_TRACKER_PATH, 'utf8')) {
  const verbs = new Set();
  const re = /case\s+'([a-z][a-z0-9-]*)'\s*:/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    const verb = m[1];
    if (!NON_COMMAND_CASES.has(verb)) verbs.add(verb);
  }
  return verbs;
}

// The verb set — now declared by the command manifest (canonical names plus
// aliases), not regex-scraped. Help output (groupedListing) and dispatch
// routing (kind → bin/aitm.mjs) both read this, so they share one source.
export const VERBS = taskVerbNames();

// Operator-facing scripts explicitly safe to route through `aitm`. Direct-only
// maintenance/package lifecycle help records remain in SELF_DOC/catalog but do
// not broaden the orchestrator's mutation authority.
export const SCRIPTS = Object.freeze(
  Object.fromEntries(Object.entries(SELF_DOC).filter(([, doc]) => doc.routable !== false))
);

// Deliberate exclusions — documented so the omission is auditable, not an
// oversight. Each entry states WHY the name is not reachable through `aitm`.
export const INTERNAL = {
  'move-state': {
    reason:
      'Single audited Status mutator. The board Status field must only change via the ' +
      'state machine, so callers go through `aitm promote` / `aitm demote` / `aitm reconcile`, ' +
      'never a raw move. Exposing it would let a caller bypass the transition gates.',
  },
  'hook-handler': { reason: 'Plumbing: invoked only by Claude Code hooks, never directly.' },
  'bash-guard': { reason: 'Plumbing: PreToolUse Bash hook; invoked by the hook runner only.' },
  'activity-guard': {
    reason: 'Plumbing: Kanban-state tool gating; invoked by the hook runner only.',
  },
  'agent-guard': { reason: 'Plumbing: sub-agent spawn gate; invoked by the hook runner only.' },
  'issue-field-db': { reason: 'Plumbing: library for the embedded field DB; imported, not run.' },
  'commit-trail-handler': {
    reason: 'Plumbing: PostToolUse commit hook; invoked by the hook runner only.',
  },
  'source-edit-gate': {
    reason: 'Plumbing: edit gate consulted by hooks; imported/invoked internally.',
  },
  'epic-base-edit-guard': {
    reason:
      'Plumbing: PreToolUse Edit/Write epic-base gate (#905); invoked by the hook ' +
      'runner only. Fails closed on a managed child branch whose base is not its epic head.',
  },
};

// kind('promote') -> 'verb'; kind('set-priority') -> 'script'; else null.
export function kind(name) {
  if (VERBS.has(name)) return 'verb';
  if (Object.prototype.hasOwnProperty.call(SCRIPTS, name)) return 'script';
  return null;
}

// Reverse index: repo-root-relative script path → exposed command name.
const SCRIPT_PATH_TO_NAME = new Map(Object.entries(SCRIPTS).map(([name, doc]) => [doc.path, name]));

// #487 — resolve a repo-root-relative `scripts/...` path (as extracted from a
// direct `node node_modules/ai-task-manager/<path>` invocation) to its `aitm`
// command. Returns `{ target: 'verb-hub' }` for the task-tracker verb hub (the
// concrete verb is the caller's first arg), `{ target: 'script', name }` for an
// exposed standalone script, or `null` when the path maps to no registered
// command (internal-only — deliberately not steered).
export function resolveAitmPath(scriptRelPath) {
  const rel = String(scriptRelPath || '').replace(/^\.\//, '');
  if (!rel) return null;
  if (rel === TASK_TRACKER_REL) return { target: 'verb-hub' };
  const name = SCRIPT_PATH_TO_NAME.get(rel);
  if (name) return { target: 'script', name };
  return null;
}

// Build the grouped listing data for `aitm` / `aitm help`. Names only — never
// filepaths. Verbs collapse under a single "Workflow verbs" group.
export function groupedListing() {
  const groups = {};
  for (const record of agentCommandCatalog().filter((entry) => entry.routing === 'standalone')) {
    (groups[record.group] ||= []).push({
      name: record.name,
      synopsis: record.purpose,
    });
  }
  for (const g of Object.values(groups)) g.sort((a, b) => a.name.localeCompare(b.name));
  return {
    verbs: [...VERBS].sort(),
    scriptGroups: groups,
  };
}
