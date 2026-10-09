import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, lstatSync } from 'node:fs';
import path from 'node:path';

import { findMainWorktreePath } from '../fleet-registry.mjs';
import { tmpAitmDir } from '../paths.mjs';
import { withRuntimeWriteSync, runtimeWriterRootsForPath } from './runtime-writer.mjs';
import { RuntimeRootError } from './runtime-storage.mjs';

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
  const stampRoot = path.join(tmpAitmDir(mainWorktreePath), 'locks');
  const stampPath = path.join(
    stampRoot,
    hookStampKey({ sid, hookEventName, promptId, eventTimestamp })
  );
  return withRuntimeWriteSync(stampPath, () => {
    mkdirSync(stampRoot, { recursive: true });
    runtimeWriterRootsForPath(stampPath);
    try {
      closeFile(openFile(stampPath, 'wx'));
      return { claimed: true, stampPath };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      runtimeWriterRootsForPath(stampPath);
      const observed = lstatSync(stampPath);
      if (!observed.isFile() || observed.size !== 0)
        throw new RuntimeRootError('RUNTIME_STATE_CORRUPT', 'Hook idempotency stamp must be a regular empty record');
      return { claimed: false, stampPath };
    }
  });
}
