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
