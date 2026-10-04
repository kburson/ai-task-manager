// @story #65 #1857
import { writeFileSync } from 'node:fs';
import { statePath } from '../../task-tracker/paths.mjs';
import { createLegacyRootFixture } from './legacy-runtime-root-fixture.mjs';

export async function makeRepo({ state } = {}) {
  const dir = await createLegacyRootFixture('aitm-activity-guard-');
  // Deliberate legacy fallback fixture in the admitted runtime store; the
  // consumer's compatibility cases still exercise its legacy pointer/cache.
  const stateObj = { active: '#65', lastActive: '#65' };
  if (state !== undefined) stateObj.state = state;
  writeFileSync(statePath(dir), JSON.stringify(stateObj));
  return dir;
}

export async function makeRepoNoState() {
  const dir = await createLegacyRootFixture('aitm-activity-guard-');
  return dir;
}
