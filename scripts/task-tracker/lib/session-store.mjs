// Session-scoped auto-mode store (#89).
//
// Per-chat overrides for the two human gates (analysisToDevelopment,
// reviewToDone). Lives at `.tmp/aitm/gates/task-tracker.session.<session-id>.json`
// (#573 — relocated out of the tracked `.claude/` root into the gitignored
// machine-local tree).
//
// Schema:
//   {
//     sessionId: string,
//     lastPromptedParent: string|null,   // e.g. "61" or null
//     gates: {
//       analysisToDevelopment: bool|null,  // null = not overridden, defer
//       reviewToDone:          bool|null,
//     },
//     updatedAt: ISO8601 string
//   }
//
// All fs ops go through an injected `fs` (real fs by default) so tests can
// supply an in-memory stub. The store is pure aside from those fs calls.

import * as realFs from 'node:fs';
import path from 'node:path';

import { gatesDir } from '../paths.mjs';

// #682 — the default gate-store directory is resolved LAZILY via `gatesDir()`
// (paths.mjs), so `AI_TASK_MANAGER_PROJECT_DIR` isolates the session store the
// same way it isolates project config and every other #573 runtime artifact.
// It MUST stay a per-call default-parameter expression (`dir = gatesDir()`) —
// never a frozen module-level constant — so the project dir is read at call
// time. In real runs no isolation env is set → getProjectDir() falls back to
// cwd → `gatesDir()` yields `<cwd>/.tmp/aitm/gates`, byte-identical to the
// legacy cwd-relative location (no behavior change for production).
const FILE_PREFIX = 'task-tracker.session.';
const FILE_SUFFIX = '.json';

export function sessionFilePath(sessionId, dir = gatesDir()) {
  return path.join(dir, `${FILE_PREFIX}${sessionId}${FILE_SUFFIX}`);
}

function freshState(sessionId) {
  return {
    sessionId,
    lastPromptedParent: null,
    gates: { analysisToDevelopment: null, reviewToDone: null },
    updatedAt: new Date(0).toISOString(),
  };
}

export function loadSession(sessionId, { fs = realFs, dir = gatesDir() } = {}) {
  if (!sessionId) return freshState('');
  const p = sessionFilePath(sessionId, dir);
  try {
    if (!fs.existsSync(p)) return freshState(sessionId);
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      ...freshState(sessionId),
      ...parsed,
      gates: { ...freshState(sessionId).gates, ...(parsed.gates || {}) },
      sessionId,
    };
  } catch {
    return freshState(sessionId);
  }
}

export function saveSession(state, { fs = realFs, dir = gatesDir(), now = () => new Date() } = {}) {
  if (!state?.sessionId) return;
  const p = sessionFilePath(state.sessionId, dir);
  const next = { ...state, updatedAt: now().toISOString() };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

// Map a user choice to gate booleans. Used by /task auto verb.
//   both    -> both gates OFF
//   plan    -> plan→dev OFF, review→done ON
//   review  -> review→done OFF, plan→dev ON
//   off     -> both gates ON
//   reset   -> clear override (null) + clear lastPromptedParent
const CHOICE_GATES = {
  both: { analysisToDevelopment: false, reviewToDone: false },
  plan: { analysisToDevelopment: false, reviewToDone: true },
  review: { analysisToDevelopment: true, reviewToDone: false },
  off: { analysisToDevelopment: true, reviewToDone: true },
};

export function VALID_CHOICES() {
  return ['both', 'plan', 'review', 'off', 'reset'];
}

export function applyChoice(state, choice, { parent = null } = {}) {
  if (choice === 'reset') {
    return {
      ...state,
      gates: { analysisToDevelopment: null, reviewToDone: null },
      lastPromptedParent: null,
    };
  }
  const gates = CHOICE_GATES[choice];
  if (!gates) throw new Error(`invalid choice: ${choice}`);
  return {
    ...state,
    gates: { ...gates },
    lastPromptedParent: parent ?? state.lastPromptedParent,
  };
}

// Orphan GC — delete session files older than maxAgeMs. Returns count deleted.
export function sweepOrphans({ now = Date.now(), maxAgeMs, fs = realFs, dir = gatesDir() } = {}) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return 0;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let count = 0;
  for (const n of names) {
    if (!n.startsWith(FILE_PREFIX) || !n.endsWith(FILE_SUFFIX)) continue;
    const p = path.join(dir, n);
    try {
      const st = fs.statSync(p);
      if (now - st.mtimeMs > maxAgeMs) {
        fs.unlinkSync(p);
        count++;
      }
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
    }
  }
  return count;
}
