// @story #1873
import { TEST_NO_RETRY_ENV } from './gh/lib/with-retry.mjs';
import { PROJECT_ROOT_ALIASES } from './task-tracker/lib/runtime-storage.mjs';

export function buildTestChildEnv(parent) {
  const env = { ...parent, [TEST_NO_RETRY_ENV]: '1' };
  // Each test fixture chooses its own runtime root under the production guards.
  for (const alias of PROJECT_ROOT_ALIASES) delete env[alias];
  return env;
}
