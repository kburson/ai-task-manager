// @story #1872
// Seed actor-owned test state through the canonical writer, never the live ledger.
import path from 'node:path';
import { saveState } from '../../task-tracker/state.mjs';

export function writeFixtureTrackerState(statePath, serialized, identity = null) {
  const absolute = path.resolve(statePath);
  if (
    !absolute.includes(
      `${path.sep}.ai-task-manager${path.sep}runtime${path.sep}test-fixtures${path.sep}`
    )
  )
    throw new Error('tracker fixture must belong to an isolated runtime test root');
  const priorSid = process.env.AI_TASK_MANAGER_SESSION_ID;
  const priorApp = process.env.AI_TASK_MANAGER_APP_NAME;
  if (identity) {
    process.env.AI_TASK_MANAGER_SESSION_ID = identity.sid;
    process.env.AI_TASK_MANAGER_APP_NAME = identity.provider;
  }
  try {
    if (!identity && !String(process.env.AI_TASK_MANAGER_SESSION_ID).startsWith('fixture-'))
      throw new Error('explicit fixture actor required');
    saveState(JSON.parse(serialized), absolute);
  } finally {
    if (priorSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
    else process.env.AI_TASK_MANAGER_SESSION_ID = priorSid;
    if (priorApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
    else process.env.AI_TASK_MANAGER_APP_NAME = priorApp;
  }
}
