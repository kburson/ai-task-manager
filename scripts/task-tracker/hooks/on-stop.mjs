#!/usr/bin/env node
// Claude Code `Stop` hook.
//
// EPIC #207 / #213 — Seq 2. RETIRED by EPIC #823 (timing model v2) C1.
//
// History: this hook used to write a `pending-pause.json` marker on every
// turn-end so the next `UserPromptSubmit` could compute an inter-turn gap and
// post an `idle` row to the bound issue's `⏱ Timing Log`. Timing model v2
// (Option A) declares that an ordinary turn-end is NOT a pause — idle exists
// only inside an explicit `/task pause` (or `switch-out`) → `/task resume`
// bracket. So the auto-writer is removed: the Stop hook no longer stages a
// pause and manufactures no idle time.
//
// The module is kept (rather than deleted) because `pendingPausePath` and
// `buildPayload` are imported by the marker-cleanup path (orphan-finalize.mjs)
// and by tests. The CLI entry is now an inert exit-0 so an existing
// `Stop` hook registration keeps working without emitting anything.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getProjectDir, sessionDir } from '../paths.mjs';

function readHookStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export function pendingPausePath(sid, projDir = getProjectDir()) {
  return path.join(sessionDir(sid, projDir), 'pending-pause.json');
}

export function buildPayload(active, sid, nowIso = new Date().toISOString()) {
  return {
    stoppedAt: nowIso,
    issue: active?.issue ?? null,
    sessionId: sid,
  };
}

// v2 no-op. Retained for caller/registration compatibility — writes nothing,
// stages no pause. An ordinary turn-end is not a pause.
export function recordPendingPause() {
  return { status: 'retired' };
}

// CLI entry — invoked by Claude Code via the `Stop` hook. Drains stdin (so the
// hook contract is honored) and always exits 0. Emits nothing.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/on-stop.mjs') ||
  process.argv[1]?.endsWith('\\on-stop.mjs');
if (invokedDirectly) {
  try {
    readHookStdin();
  } catch {
    /* swallow */
  }
  process.exit(0);
}
