// @story #1857
// Explicit test-process actor; never inherit the controller's live identity.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function initializeFixtureActor(testUrl, provider = 'claude') {
  const sid = 'fixture-' + path.basename(fileURLToPath(testUrl), '.mjs');
  process.env.AI_TASK_MANAGER_SESSION_ID = sid;
  process.env.AI_TASK_MANAGER_APP_NAME = provider;
  return { provider, sid };
}
