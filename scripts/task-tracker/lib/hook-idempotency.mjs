import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';

import { findMainWorktreePath } from '../fleet-registry.mjs';

export function hookStampKey({ sid, hookEventName, promptId, eventTimestamp }) {
  const identity = JSON.stringify([
    String(sid ?? ''),
    String(hookEventName ?? ''),
    String(promptId || 'session'),
    String(eventTimestamp ?? ''),
  ]);
  const digest = createHash('sha256').update(identity).digest('hex');
  return `hook-event-${digest}.stamp`;
}

export function claimHookStamp({
  projectDir,
  sid,
  hookEventName,
  promptId,
  eventTimestamp,
  openFile = openSync,
  closeFile = closeSync,
  findMain = findMainWorktreePath,
}) {
  const mainWorktreePath = findMain(projectDir);
  const stampRoot = path.join(mainWorktreePath, '.tmp', 'aitm', 'locks');
  mkdirSync(stampRoot, { recursive: true });
  const stampPath = path.join(
    stampRoot,
    hookStampKey({ sid, hookEventName, promptId, eventTimestamp })
  );
  try {
    closeFile(openFile(stampPath, 'wx'));
    return { claimed: true, stampPath };
  } catch (error) {
    if (error?.code === 'EEXIST') return { claimed: false, stampPath };
    throw error;
  }
}
