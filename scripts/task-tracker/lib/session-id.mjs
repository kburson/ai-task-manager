// #273 — single source of truth for session-id resolution.
//
// Background: prior to consolidation, `state.mjs::currentSid()` and
// `word-counter.mjs::currentSessionId()` resolved sids by DIFFERENT rules:
//
//   - state.mjs preferred env vars, fell back to the literal `'default-session'`.
//   - word-counter.mjs preferred env vars (registry-driven), fell back to the
//     mtime-sorted .jsonl basename in the transcript dir, returning null when
//     no transcripts exist.
//
// Result: a bind path that landed at `default-session/active-task.json` was
// invisible to the activity-guard hook (which read via the mtime path) and to
// the move-state kanban-refresh (likewise). The session sat permanently wedged
// because writer and reader disagreed on which file represented "this session."
//
// This module is the lone owner of the resolution rule. Both callers delegate
// here. The fallback chain is:
//
//   1. Orchestrator env var (AI_TASK_MANAGER_SESSION_ID)
//   2. Provider-registered env keys (active provider first)
//   3. mtime-sorted .jsonl basename in transcript dir (caller-supplied)
//   4. Literal `'default-session'`
//
// The fallback is always a non-empty string so downstream callers never need
// to guard on `null`. Tests pin each branch in `tests/session-id-resolution.test.mjs`.

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { detectProvider, getProvider, listProviders } from '../../providers/index.mjs';

export const ORCHESTRATOR_ENV_KEY = 'AI_TASK_MANAGER_SESSION_ID';
export const FALLBACK_SESSION_ID = 'default-session';

// Returns the ordered list of env keys consulted for sid resolution, given
// the current provider registry. Exposed so tests can pin precedence without
// invoking the full resolver.
export function sessionIdEnvKeys(env = process.env) {
  const active = detectProvider({ env }).name;
  const ordered = [active, ...listProviders().filter((n) => n !== active)];
  return [ORCHESTRATOR_ENV_KEY, ...ordered.flatMap((name) => getProvider(name).sessionIdEnvKeys)];
}

// Resolves the current session id. Caller supplies `transcriptDir` (a function
// returning the dir to scan for the mtime fallback) so this module stays free
// of word-counter's path helpers. Returns a non-empty string.
//
// opts:
//   env             — environment-variable bag (defaults to process.env)
//   transcriptDir   — () => string; the dir to scan for *.jsonl files. Optional.
//   fallback        — string used when env+mtime yield nothing.
//                     Defaults to FALLBACK_SESSION_ID.
export function resolveSessionId(opts = {}) {
  const env = opts.env || process.env;
  const fallback = opts.fallback || FALLBACK_SESSION_ID;
  for (const key of sessionIdEnvKeys(env)) {
    const v = env[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  if (typeof opts.transcriptDir === 'function') {
    try {
      const dir = opts.transcriptDir();
      if (dir) {
        const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
        if (files.length) {
          const top = files
            .map((f) => ({ f, mtime: statSync(path.join(dir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime)[0];
          if (top && top.f) return top.f.replace('.jsonl', '');
        }
      }
    } catch {
      /* fall through to fallback */
    }
  }
  return fallback;
}
