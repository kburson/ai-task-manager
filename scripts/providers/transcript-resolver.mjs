// Transcript-path resolver (#477) — turns a session id into the absolute path
// of the provider's native transcript JSONL.
//
// Dispatch is on the adapter's declarative `transcriptLayout` descriptor, NOT
// on provider name. The recording path (`word-counter.jsonlPath` →
// `runtime.flushActiveToGH`) therefore stays provider-agnostic: it asks the
// active adapter for a path and never branches on `if (codex)` / `if (claude)`.
//
// Layouts:
//   'flat'          — <homedir>/<transcriptLocator>/<projectKey>/<sid>.jsonl
//                     (Claude). Computed deterministically; the file need not
//                     exist yet (a fresh session's transcript appears later).
//   'date-bucketed' — <homedir>/<transcriptLocator>/YYYY/MM/DD/<prefix>-<sid>.jsonl
//                     (Codex). The sid is the trailing UUID of the rollout
//                     filename, so we search the date-bucket tree for the first
//                     file whose basename ends with `-<sid>.jsonl`. Returns null
//                     when no such file exists on disk (caller degrades to a
//                     sid-only session-ref record — never a placeholder path).

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Walk the bounded date-bucket tree (root → YYYY → MM → DD → files) for the
// first file whose basename ends with `-<sid>.jsonl`. Returns the absolute path
// or null. Missing/unreadable directories are skipped rather than thrown.
function findBySidSuffix(root, sid) {
  const suffix = `-${sid}.jsonl`;
  let dirs = [root];
  // root + YYYY + MM + DD = depth 4; one extra level of slack for safety.
  for (let depth = 0; depth < 5 && dirs.length; depth++) {
    const next = [];
    for (const dir of dirs) {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith(suffix)) return full;
        if (entry.isDirectory()) next.push(full);
      }
    }
    dirs = next;
  }
  return null;
}

// Resolve the absolute transcript path for `sid` under `adapter`. Returns an
// absolute path string, or null when the adapter declares no layout/locator or
// (for date-bucketed providers) no matching file exists.
//
// opts:
//   adapter     — a ProviderAdapter (must carry transcriptLocator + transcriptLayout)
//   sid         — session id string
//   homedir     — absolute homedir path
//   projectKey  — flattened project key (used by the 'flat' layout only)
export function resolveTranscriptPath({ adapter, sid, homedir, projectKey, cwd, env = {} } = {}) {
  if (!adapter || !sid || !homedir) return null;
  const { transcriptLocator, transcriptLayout } = adapter;
  if (!transcriptLocator || !transcriptLayout) return null;
  const root = path.join(homedir, transcriptLocator);
  switch (transcriptLayout) {
    case 'flat': {
      const dir = projectKey ? path.join(root, projectKey) : root;
      return path.join(dir, `${sid}.jsonl`);
    }
    case 'date-bucketed':
      return findBySidSuffix(root, sid);
    case 'cwd-session-dir': {
      if (!cwd) return null;
      const providerHome =
        adapter.transcriptHomeEnv && env[adapter.transcriptHomeEnv]
          ? env[adapter.transcriptHomeEnv]
          : adapter.transcriptHomeDefault
            ? path.join(homedir, adapter.transcriptHomeDefault)
            : homedir;
      const providerRoot = path.join(providerHome, transcriptLocator);
      const file = path.join(
        providerRoot,
        encodeURIComponent(cwd),
        sid,
        'chat_history.jsonl'
      );
      return existsSync(file) ? file : null;
    }
    default:
      return null;
  }
}
