// Resolve lifecycle state only from the configured GitHub Project item.
// Callers must fail closed when the configured membership or Status is absent;
// another project's first item is never an acceptable fallback.

import { normalizeStateId, stateIds } from './lifecycle-policy/index.mjs';

export function resolveConfiguredProjectState(nodes, projectId) {
  if (!projectId) throw new Error('configured project id is required');
  if (!Array.isArray(nodes)) throw new Error('configured project items payload is invalid');
  const item = nodes.find((entry) => entry?.project?.id === projectId);
  if (!item) throw new Error(`configured project item ${projectId} is missing`);
  const state = normalizeStateId(item?.fieldValueByName?.name);
  if (!stateIds().includes(state)) {
    throw new Error(`configured project item ${projectId} has no recognized AITM state`);
  }
  return state;
}
