// @story #2088
import { PROJECT_ROOT_ALIASES } from '../../task-tracker/lib/runtime-storage.mjs';

// Synthetic repositories do not inherit the verifier's project-root authority.
export function fixtureEnvironment() {
  const environment = { ...process.env };
  for (const key of PROJECT_ROOT_ALIASES) delete environment[key];
  return environment;
}
