// #413 — Single-source command registry for the `aitm` orchestrator.
//
// `aitm` is a thin front-router. This module is its routing table. It has two
// halves:
//
//   1. VERBS — the /task state-machine verbs, parsed at runtime from
//      task-tracker.mjs's own dispatch `switch` so the registry can never drift
//      from the verb hub. `aitm <verb>` delegates to task-tracker.mjs.
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const TASK_TRACKER_PATH = path.join(REPO_ROOT, 'scripts/task-tracker/task-tracker.mjs');

// Verbs that exist as `case` labels but are NOT user commands: `move` is a
// guard stub that errors with a "did you mean promote/demote" hint, and
// `help`/`?` are handled by the dispatcher itself.
const NON_COMMAND_CASES = new Set(['move', 'help', '?']);

// Parse the verb set from task-tracker.mjs's dispatch switch. Single source of
// truth — adding a `case 'foo':` to the verb hub auto-exposes `aitm foo`.
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

export const VERBS = parseVerbs();

// Operator-facing scripts, keyed by command name → { group, path, ...doc }.
export const SCRIPTS = SELF_DOC;

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
  'state-machine': { reason: 'Plumbing: library defining legal transitions; imported, not run.' },
  'issue-field-db': { reason: 'Plumbing: library for the embedded field DB; imported, not run.' },
  'commit-trail-handler': {
    reason: 'Plumbing: PostToolUse commit hook; invoked by the hook runner only.',
  },
  'source-edit-gate': {
    reason: 'Plumbing: edit gate consulted by hooks; imported/invoked internally.',
  },
};

// kind('promote') -> 'verb'; kind('set-priority') -> 'script'; else null.
export function kind(name) {
  if (VERBS.has(name)) return 'verb';
  if (Object.prototype.hasOwnProperty.call(SCRIPTS, name)) return 'script';
  return null;
}

// Build the grouped listing data for `aitm` / `aitm help`. Names only — never
// filepaths. Verbs collapse under a single "Workflow verbs" group.
export function groupedListing() {
  const groups = {};
  for (const [name, doc] of Object.entries(SCRIPTS)) {
    (groups[doc.group] ||= []).push({ name, synopsis: doc.synopsis });
  }
  for (const g of Object.values(groups)) g.sort((a, b) => a.name.localeCompare(b.name));
  return {
    verbs: [...VERBS].sort(),
    scriptGroups: groups,
  };
}
