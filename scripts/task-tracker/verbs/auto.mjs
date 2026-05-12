// `/task auto <both|analyze|review|off|reset>` verb (#89).
//
// Mutates the session-scoped gate-override file. Pure-core + DI seam — the
// `runAuto` function takes `loadSession` / `saveSession` deps so tests can stub
// the filesystem. CLI wrapper is at the bottom.

import {
  loadSession as realLoad,
  saveSession as realSave,
  applyChoice,
  VALID_CHOICES,
} from '../lib/session-store.mjs';
import { currentSessionId } from '../word-counter.mjs';

const SUMMARIES = {
  both: 'both gates OFF (full auto)',
  analyze: 'analyze→dev OFF, review→done ON',
  review: 'analyze→dev ON, review→done OFF',
  off: 'both gates ON (safe default)',
  reset: 'session override cleared (falls back to project config)',
};

export async function runAuto({ choice, sessionId, deps = {} } = {}) {
  const valid = VALID_CHOICES();
  if (!valid.includes(choice)) {
    return {
      status: 'invalid',
      message: `unknown choice "${choice}". Use one of: ${valid.join(', ')}`,
    };
  }
  if (!sessionId) {
    return {
      status: 'no-session',
      message: 'no active session id; cannot persist auto-mode override',
    };
  }
  const loadSession = deps.loadSession || realLoad;
  const saveSession = deps.saveSession || realSave;
  const state = loadSession(sessionId);
  const next = applyChoice(state, choice);
  saveSession(next);
  return { status: 'ok', choice, summary: SUMMARIES[choice], state: next };
}

// CLI entry — invoked when imported via task-tracker.mjs dispatch.
export async function cli(args = []) {
  const choice = args[0];
  if (!choice) {
    process.stderr.write(`usage: /task auto <${VALID_CHOICES().join('|')}>\n`);
    process.exit(2);
  }
  const sessionId = currentSessionId();
  const result = await runAuto({ choice, sessionId });
  if (result.status === 'invalid') {
    process.stderr.write(`✗ ${result.message}\n`);
    process.exit(2);
  }
  if (result.status === 'no-session') {
    process.stderr.write(`✗ ${result.message}\n`);
    process.exit(3);
  }
  process.stdout.write(`✓ auto-mode: ${result.summary}\n`);
}
