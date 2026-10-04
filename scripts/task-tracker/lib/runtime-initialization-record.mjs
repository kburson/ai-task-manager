import {
  emptyRuntimeKeys,
  emptyRuntimeDigest,
  validEmptyOperationId,
  validEmptyDigest,
  validEmptyRuntimeOwner,
} from './runtime-empty-record.mjs';
// @story #1857
import { createHash } from 'node:crypto';
export const runtimeInitializationId = (root) => createHash('sha256').update(root).digest('hex');
export const runtimeInitializationDigest = (value) =>
  'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const INITIAL_RUNTIME_RECORDS = Object.freeze({
  'state/task-tracker-state.json': '{}\n',
  'state/task-tracker-queue.json': '[]\n',
});
export function validRuntimeInitializationPlan(plan) {
  if (plan?.schema === 'aitm.runtime-initialization-plan/v2') return validLinkedEmptyPlan(plan);
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return false;
  const { digest, ...value } = plan;
  return (
    plan.schema === 'aitm.runtime-initialization-plan/v1' &&
    ['projectRoot', 'mainRoot', 'gitDir', 'commonDir', 'mainTransactionId'].every(
      (key) => typeof plan[key] === 'string' && plan[key]
    ) &&
    plan.projectRoot !== plan.mainRoot &&
    plan.id === runtimeInitializationId(plan.projectRoot) &&
    /^sha256:[a-f0-9]{64}$/.test(plan.mainPlanDigest) &&
    plan.sourcePolicy === 'empty-local-no-volatile-inherit' &&
    JSON.stringify(plan.records) === JSON.stringify(INITIAL_RUNTIME_RECORDS) &&
    digest === runtimeInitializationDigest(value)
  );
}
export function validRuntimeInitializationJournal(journal) {
  if (journal?.schema === 'aitm.runtime-initialization/v2') return validLinkedEmptyJournal(journal);
  return Boolean(
    journal &&
    journal.schema === 'aitm.runtime-initialization/v1' &&
    ['prepared', 'complete'].includes(journal.status) &&
    validRuntimeInitializationPlan(journal.plan) &&
    journal.owner &&
    ['provider', 'sid', 'processToken'].every(
      (key) => typeof journal.owner[key] === 'string' && journal.owner[key]
    ) &&
    Number.isSafeInteger(journal.owner.pid) &&
    journal.owner.pid > 0
  );
}

function validLinkedEmptyPlan(plan) {
  if (
    !emptyRuntimeKeys(plan, [
      'schema',
      'id',
      'operationId',
      'projectRoot',
      'mainRoot',
      'gitDir',
      'commonDir',
      'activation',
      'sourcePolicy',
      'records',
      'digest',
    ])
  )
    return false;
  const { digest, ...payload } = plan;
  return (
    ['projectRoot', 'mainRoot', 'gitDir', 'commonDir'].every(
      (key) => typeof plan[key] === 'string' && plan[key].startsWith('/')
    ) &&
    plan.projectRoot !== plan.mainRoot &&
    plan.id === runtimeInitializationId(plan.projectRoot) &&
    validEmptyOperationId(plan.operationId) &&
    emptyRuntimeKeys(plan.activation, ['kind', 'id', 'digest']) &&
    plan.activation.kind === 'empty-initialization' &&
    validEmptyOperationId(plan.activation.id) &&
    validEmptyDigest(plan.activation.digest) &&
    plan.sourcePolicy === 'empty-local-no-volatile-inherit' &&
    emptyRuntimeDigest(plan.records) === emptyRuntimeDigest(INITIAL_RUNTIME_RECORDS) &&
    digest === runtimeInitializationDigest(payload)
  );
}
function validLinkedEmptyJournal(journal) {
  return (
    (emptyRuntimeKeys(journal, ['schema', 'status', 'plan', 'owner', 'ownerHistory']) ||
      emptyRuntimeKeys(journal, [
        'schema',
        'status',
        'plan',
        'owner',
        'ownerHistory',
        'recoveryReceipt',
      ])) &&
    ['prepared', 'complete'].includes(journal.status) &&
    validLinkedEmptyPlan(journal.plan) &&
    validEmptyRuntimeOwner(journal.owner) &&
    Array.isArray(journal.ownerHistory) &&
    journal.ownerHistory.length > 0 &&
    journal.ownerHistory.every(validEmptyRuntimeOwner) &&
    emptyRuntimeDigest(journal.ownerHistory.at(-1)) === emptyRuntimeDigest(journal.owner) &&
    (journal.recoveryReceipt === undefined || typeof journal.recoveryReceipt === 'string')
  );
}
