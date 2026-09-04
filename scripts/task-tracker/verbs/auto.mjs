// `/task auto <both|plan|review|off|reset>` verb (#89).
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
  both: 'all gates OFF (Full-Auto)',
  plan: 'plan→dev OFF, PR review OFF, review→done ON',
  review: 'plan→dev ON, PR review OFF, review→done OFF',
  off: 'all gates ON (manual review)',
  reset: 'session override cleared (falls back to project config)',
  'manual-plan': 'manual plan review ON; other gates unchanged',
  'manual-code': 'manual PR code review ON; other gates unchanged',
  'manual-task': 'manual final task review ON; other gates unchanged',
  'auto-plan': 'manual plan review OFF; other gates unchanged',
  'auto-code': 'manual PR code review OFF; other gates unchanged',
  'auto-task': 'manual final task review OFF; other gates unchanged',
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
