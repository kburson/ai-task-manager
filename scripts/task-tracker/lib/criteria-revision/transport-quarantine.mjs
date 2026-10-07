// @story #1855
// Recognized memory is fixture authority. This scope can only add denial;
// it never supplies approval, a transport, or a production capability.
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { validateBlocker } from '../action-decision/contract.mjs';

const quarantine = new AsyncLocalStorage();
const stageEffects = new AsyncLocalStorage();
export function withMemoryTransportQuarantine(fn) {
  return quarantine.run(true, fn);
}
export function assertRevisionProductionTransport(file = 'gh') {
  if (!quarantine.getStore() || !['gh', 'gh.exe'].includes(path.basename(String(file)))) return;
  throw memoryEffectRefusal();
}
function memoryEffectRefusal() {
  const code = 'revision-authority-unavailable';
  const noAutomaticRemediation = { reason: 'authority-investigation-required' };
  const error = new Error(code);
  error.name = 'RevisionMemoryTransportError';
  Object.assign(error, { code, status: 'indeterminate', noAutomaticRemediation,
    blocker: Object.freeze(validateBlocker({ guardId: 'revision-mutation', code, args: {},
      noAutomaticRemediation }, { status: 'indeterminate' })) });
  return error;
}

// Add-denial only: no flag/exit route can permit a host effect. The eventual
// native stage driver must intercept its exact owned memory leaves before these
// assertions; a recognized memory token never authorizes real host writes.
export function withMemoryStageEffectQuarantine(fn) {
  return stageEffects.run(true, fn);
}
export function assertRevisionStageHostEffect() {
  if (stageEffects.getStore()) throw memoryEffectRefusal();
}

// Read-only scope classification. True adds no permission: the fixed native
// branch must independently prove its original token/invocation or refuse.
export function isMemoryStageEffectScope() { return stageEffects.getStore() === true; }
