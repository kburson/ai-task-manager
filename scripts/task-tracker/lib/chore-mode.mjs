// #327 — chore-mode state read/write helpers.
//
// chore-mode is a tracker-wide bypass mode for source edits. It lives in the
// global `task-tracker-state.json` (not per-session) because the PreToolUse
// source-edit gate runs in any session context and must agree on whether the
// bypass is currently in force.
//
// Shape (persisted under `choreMode` key of the global state file):
//
//   {
//     active: boolean,           // bypass on?
//     since: string|null,        // ISO timestamp when `on` flipped to true
//     previousIssue: string|null,// e.g. "#327" — the task that was bound
//     reason: string|null        // free-form reason supplied by `on [reason]`
//   }
//
// Tolerates missing or partial records: `readChoreMode` returns a defaulted
// object so the gate's decision tree never crashes on a fresh tracker state.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { statePath as resolveStatePath } from '../paths.mjs';

export const EMPTY_CHORE_MODE = Object.freeze({
  active: false,
  since: null,
  previousIssue: null,
  reason: null,
});

function defaultStatePath(projectDir) {
  // #573: the global state file moved under `.tmp/aitm/state/` — resolve it.
  return resolveStatePath(projectDir);
}

// Read the chore-mode record from the global state file at the given project
// dir. Returns a defaulted object when the file is missing, malformed, or
// lacks a `choreMode` key.
export function readChoreMode(projectDir) {
  const p = defaultStatePath(projectDir);
  if (!existsSync(p)) return { ...EMPTY_CHORE_MODE };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { ...EMPTY_CHORE_MODE };
  }
  const cm = parsed && typeof parsed === 'object' ? parsed.choreMode : null;
  if (!cm || typeof cm !== 'object') return { ...EMPTY_CHORE_MODE };
  return {
    active: cm.active === true,
    since: typeof cm.since === 'string' ? cm.since : null,
    previousIssue: typeof cm.previousIssue === 'string' ? cm.previousIssue : null,
    reason: typeof cm.reason === 'string' ? cm.reason : null,
  };
}

// Persist the chore-mode record back to the global state file. Merges into
// any existing JSON so the rest of the global state (`active`, `lastActive`,
// timing fields) is preserved. Creates the file with just `choreMode` if it
// did not exist.
export function writeChoreMode(projectDir, record) {
  const p = defaultStatePath(projectDir);
  mkdirSync(path.dirname(p), { recursive: true });
  let existing = {};
  if (existsSync(p)) {
    try {
      existing = JSON.parse(readFileSync(p, 'utf8'));
      if (!existing || typeof existing !== 'object') existing = {};
    } catch {
      existing = {};
    }
  }
  const choreMode = {
    active: record.active === true,
    since: record.since ?? null,
    previousIssue: record.previousIssue ?? null,
    reason: record.reason ?? null,
  };
  const next = { ...existing, choreMode };
  writeFileSync(p, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return choreMode;
}

// Convenience: is chore-mode currently active? Cheap synchronous check for
// hot paths like the PreToolUse gate.
export function isChoreModeActive(projectDir) {
  return readChoreMode(projectDir).active === true;
}
