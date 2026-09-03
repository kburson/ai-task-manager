// @story #1499
import { frozen, hash, fail } from './value.mjs';
import { planCloseEffects } from './close-machine.mjs';

export async function executeCloseEffect({ plan, ports } = {}) {
  if (!['effect-required', 'checkpoint-required'].includes(plan?.status)) fail('close-runner:plan');
  const effect = plan.nextEffect;
  if (plan.status === 'effect-required') {
    await ports.checkpoint?.('before-effect', { effect, operationKey: plan.operationKey });
    await ports.applyEffect({ effect, operationKey: plan.operationKey, expected: plan.expected });
    await ports.checkpoint?.('after-effect-before-response', {
      effect,
      operationKey: plan.operationKey,
    });
  }
  const observation = await ports.readEffect({ effect, operationKey: plan.operationKey });
  if (observation?.status !== 'confirmed' || observation.operationKey !== plan.operationKey)
    return frozen({ status: 'unknown', effect, operationKey: plan.operationKey, observation });
  await ports.checkpoint?.('after-response-before-checkpoint', {
    effect,
    operationKey: plan.operationKey,
  });
  const payload = {
    step: effect,
    operationKey: plan.operationKey,
    outcome: 'confirmed',
    readBack: { status: 'confirmed', digest: hash(observation) },
  };
  await ports.appendCheckpoint({ effect, operationKey: plan.operationKey, observation, payload });
  return frozen({ status: 'recorded', effect, operationKey: plan.operationKey, payload });
}

export async function resumeClose({ context, ports, maxIterations = 32 } = {}) {
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const cycle = await ports.project(context);
    const live = await ports.observe({ context, cycle });
    const authority = await ports.authority({ context, cycle, live });
    const plan = planCloseEffects({ cycle, live, authority });
    if (plan.status === 'refused' || plan.status === 'closed-cleanup-pending') {
      return frozen({
        status: plan.status,
        cycleId: cycle.cycleId,
        transactionId: cycle.close.started?.payload.closeTransactionId ?? null,
        cleanup: plan.expected?.cleanup ?? null,
        reason: plan.reason,
      });
    }
    if (plan.status === 'complete') {
      return frozen({
        status: 'complete',
        cycleId: cycle.cycleId,
        transactionId: cycle.close.started.payload.closeTransactionId,
        cleanup: 'released',
      });
    }
    if (plan.status === 'completion-required') {
      await ports.appendCompletion({ context, cycle });
      continue;
    }
    if (plan.status === 'start-required') {
      await ports.appendStart({ context, cycle, live, authority });
      continue;
    }
    const result = await executeCloseEffect({ plan, ports });
    if (result.status === 'unknown') return result;
  }
  fail('close-runner:iteration-limit');
}
