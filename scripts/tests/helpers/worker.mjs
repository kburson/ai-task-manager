#!/usr/bin/env node
// Worker process used by the two-session integration tests. Acquires the
// per-issue timing lock in a fresh process, then writes a `start`/`end`
// stamp to a shared NDJSON log so the parent can assert overlap/serial
// behavior. No network I/O.

import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { withLock } from '../../task-tracker/locks.mjs';

const [projDir, issue, sessionLabel, logPath, holdMsRaw] = process.argv.slice(2);
const holdMs = Number(holdMsRaw) || 50;

function safe(n) {
  return String(n).replace(/[^A-Za-z0-9_-]/g, '_');
}
const lockPath = path.join(projDir, '.ai-task-manager', 'locks', `timing-${safe(issue)}.lock`);

function log(event) {
  appendFileSync(
    logPath,
    JSON.stringify({ session: sessionLabel, issue, event, t: Date.now() }) + '\n'
  );
}

try {
  await withLock(
    lockPath,
    async () => {
      log('start');
      await new Promise((r) => setTimeout(r, holdMs));
      log('end');
    },
    { timeoutMs: 10_000 }
  );
  process.exit(0);
} catch (err) {
  log('error:' + (err && err.message));
  process.exit(1);
}
