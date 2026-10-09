#!/usr/bin/env node
// Worker process used by the two-session integration tests. Acquires the
// per-issue timing lock in a fresh process, then writes a `start`/`end`
// stamp to a shared NDJSON log so the parent can assert overlap/serial
// behavior. No network I/O.

import { appendFileSync } from 'node:fs';
import { timingLockPath } from '../../task-tracker/paths.mjs';
import { withLock } from '../../task-tracker/locks.mjs';

const [projDir, issue, sessionLabel, logPath, holdMsRaw, barrier] = process.argv.slice(2);
const holdMs = Number(holdMsRaw) || 50;

function safe(n) {
  return String(n).replace(/[^A-Za-z0-9_-]/g, '_');
}
process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
process.env.AI_TASK_MANAGER_SESSION_ID = sessionLabel;
process.env.AI_TASK_MANAGER_PROJECT_DIR = projDir;
const lockPath = timingLockPath(safe(issue), projDir);

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
      if (barrier === 'overlap-barrier') {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('peer never entered its critical section')),
            10_000
          );
          process.once('message', (message) => {
            clearTimeout(timeout);
            if (message === 'release') resolve();
            else reject(new Error('unexpected overlap barrier message'));
          });
          process.send({ event: 'entered' });
        });
      }
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
