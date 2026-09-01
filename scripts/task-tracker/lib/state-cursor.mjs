// @story #1117 #1457

import { computeTransitionPlan } from './move-state/transition-plan.mjs';
import { BoundaryLockAcquireError } from './repository-adapter.mjs';

export { BoundaryLockAcquireError } from './repository-adapter.mjs';

const TRIGGERS = new Set(['actions-only', 'advance-forward', 'advance-reverse', 'bypass']);
const BOUNDARY_REFUSALS = new Set([
  'drift',
  'gate-refused',
  'move-refused',
  'boundary-lock-refused',
]);

function currentStateValue(snapshot) {
  return snapshot?.currentState?.value ?? snapshot?.currentState ?? null;
}

function allowedTargets(machine, state, trigger) {
  if (trigger === 'advance-forward') {
    const target = machine.next(state);
    return target == null ? [] : [target];
  }
  if (trigger === 'advance-reverse') return [...machine.backwardTargets(state)];
  return [];
}

function invalidBoundaryResult(boundary) {
  return Object.freeze({
    kind: 'invalid-boundary-result',
    phase: 'internal',
    exit: 1,
    reason: 'unknown legacy boundary result',
    receivedKind: boundary?.kind ?? null,
  });
}

function dormant(state, result) {
  return Object.freeze({ kind: 'dormant', state, result });
}

function skippedActionIds(stateDefinition, bypass) {
  if (!bypass) return [];
  return stateDefinition.residentActions.map(({ id }) => id);
}

export function buildReviewCursorRequest({ currentState, issue, cwd } = {}) {
  const base = { issue, cwd };
  if (currentState === 'test') {
    return Object.freeze({
      ...base,
      trigger: 'advance-forward',
      requestedTarget: 'review',
      flags: Object.freeze({ verb: 'review' }),
    });
  }
  if (currentState === 'review') {
    return Object.freeze({ ...base, trigger: 'actions-only' });
  }
  throw new TypeError(`review cursor: expected test or review, received ${String(currentState)}`);
}

export function executeReviewCursor({ cursor, currentState, issue, cwd } = {}) {
  if (!cursor || typeof cursor.execute !== 'function') {
    throw new TypeError('executeReviewCursor: cursor is required');
  }
  return cursor.execute(buildReviewCursorRequest({ currentState, issue, cwd }));
}

export function classifyReviewCursorResult(result) {
  if (result?.kind === 'resident-complete' || result?.kind === 'noop') {
    return Object.freeze({ status: 'complete' });
  }
  if (result?.kind === 'resident-result') {
    return result.result?.status === 'complete'
      ? Object.freeze({ status: 'complete' })
      : Object.freeze({ status: 'action-failed', result: result.result });
  }
  if (result?.kind === 'dormant') {
    return Object.freeze({ status: 'action-failed', result: result.result });
  }
  return Object.freeze({ status: 'cursor-refused', result });
}

export function normalizeMovementIntent({ trigger, requestedTarget, flags = {} } = {}) {
  if (!TRIGGERS.has(trigger) || trigger === 'actions-only') {
    throw new TypeError(`normalizeMovementIntent: unsupported movement trigger ${String(trigger)}`);
  }
  if (typeof requestedTarget !== 'string' || requestedTarget.trim().length === 0) {
    throw new TypeError('normalizeMovementIntent: exactly one target is required');
  }
  const copiedFlags = Object.freeze({ ...flags });
  return Object.freeze({
    trigger,
    target: requestedTarget.trim().toLowerCase(),
    flags: copiedFlags,
    verb:
      typeof copiedFlags.verb === 'string' && copiedFlags.verb.trim()
        ? copiedFlags.verb.trim()
        : trigger,
  });
}

export function buildMoveContext({
  snapshot,
  fromState,
  movementIntent,
  damageCarry = null,
  skippedResidentActions = [],
} = {}) {
  return Object.freeze({
    snapshot,
    fromState,
    targetState: movementIntent?.target ?? null,
    trigger: movementIntent?.trigger ?? null,
    flags: movementIntent?.flags ?? Object.freeze({}),
    movementIntent,
    damageCarry,
    skippedResidentActions: Object.freeze([...skippedResidentActions]),
  });
}

export function createStateCursor({ machine, repository, actions } = {}) {
  if (!machine || typeof machine.get !== 'function') {
    throw new TypeError('createStateCursor: machine is required');
  }
  if (!repository || typeof repository.hydrateTask !== 'function') {
    throw new TypeError('createStateCursor: repository is required');
  }
  if (!actions || typeof actions.resume !== 'function') {
    throw new TypeError('createStateCursor: resident-action runner is required');
  }

  return Object.freeze({
    async execute({ issue, cwd, trigger, requestedTarget, flags = {} } = {}) {
      if (!TRIGGERS.has(trigger)) {
        throw new TypeError(`state cursor: unsupported trigger ${String(trigger)}`);
      }

      let snapshot = await repository.hydrateTask({ issue, cwd });
      const currentId = currentStateValue(snapshot);
      const current = machine.get(currentId);
      const movementIntent =
        trigger === 'actions-only'
          ? null
          : normalizeMovementIntent({ trigger, requestedTarget, flags });
      const plan = movementIntent
        ? computeTransitionPlan({
            fromState: current.id,
            toState: movementIntent.target,
            flags: movementIntent.flags,
          })
        : null;

      if (plan?.matrix.applies && !plan.matrix.ok) {
        return Object.freeze({
          kind: 'matrix-refused',
          reason: plan.matrix.reason,
          allowedTargets: Object.freeze(allowedTargets(machine, current.id, trigger)),
        });
      }

      if (trigger === 'actions-only' || (trigger === 'advance-forward' && !plan.bypass)) {
        const actionResult = await actions.resume(current.residentActions, snapshot, {
          trigger,
          writeAuthorized: true,
        });
        if (actionResult?.status !== 'complete') return dormant(current.id, actionResult);
        if (trigger === 'actions-only') {
          return Object.freeze({ kind: 'resident-complete', state: current.id });
        }
      }

      if (plan?.noop) return Object.freeze({ kind: 'noop', state: current.id });

      let boundary;
      try {
        const hasFinalBoundary =
          typeof repository.supportsFinalBoundary === 'function'
            ? repository.supportsFinalBoundary()
            : typeof repository.withBoundaryLock === 'function' &&
              typeof repository.runPreMutationGate === 'function' &&
              typeof repository.requestTransition === 'function';
        if (hasFinalBoundary) {
          boundary = await repository.withBoundaryLock(
            { issue, verb: movementIntent.verb, projDir: cwd },
            async () => {
              snapshot = await repository.hydrateTask({ issue, cwd });
              const boundaryState = currentStateValue(snapshot);
              if (boundaryState !== current.id) {
                return Object.freeze({
                  kind: 'drift',
                  expectedState: current.id,
                  actualState: boundaryState,
                });
              }

              const gateContext = buildMoveContext({
                snapshot,
                fromState: current.id,
                movementIntent,
                damageCarry: null,
                skippedResidentActions: skippedActionIds(current, plan.bypass),
              });
              const gateResult = await repository.runPreMutationGate({
                moveContext: gateContext,
                snapshot,
                plan,
                boundarySnapshot: snapshot,
              });
              if (gateResult?.exit !== null && gateResult?.exit !== undefined) {
                return Object.freeze({ kind: 'gate-refused', phase: 'guard', ...gateResult });
              }

              const damageCarry =
                snapshot.actionLedger?.status === 'damaged' &&
                (trigger === 'advance-reverse' || plan.bypass)
                  ? await repository.recordLedgerDamageCarry({ snapshot, movementIntent })
                  : null;
              const moveContext = damageCarry
                ? Object.freeze({ ...gateContext, damageCarry })
                : gateContext;
              const move = await repository.requestTransition({
                moveContext,
                plan,
                gateResult,
              });
              if (move?.exit !== null && move?.exit !== undefined) {
                return Object.freeze({ ...move, kind: 'move-refused' });
              }
              return Object.freeze({ kind: 'moved', move });
            }
          );
        } else if (typeof repository.requestLegacyBoundary === 'function') {
          snapshot = await repository.hydrateTask({ issue, cwd });
          const boundaryState = currentStateValue(snapshot);
          if (boundaryState !== current.id) {
            return Object.freeze({
              kind: 'drift',
              expectedState: current.id,
              actualState: boundaryState,
            });
          }
          const skippedResidentActions = skippedActionIds(current, plan.bypass);
          const moveContext = buildMoveContext({
            snapshot,
            fromState: current.id,
            movementIntent,
            damageCarry: null,
            skippedResidentActions,
          });
          boundary = await repository.requestLegacyBoundary({
            issue,
            cwd,
            fromState: current.id,
            target: movementIntent.target,
            trigger,
            flags: movementIntent.flags,
            movementIntent,
            plan,
            snapshot,
            moveContext,
            skippedResidentActions,
          });
        } else {
          return invalidBoundaryResult({ kind: 'missing-boundary-capability' });
        }
      } catch (error) {
        if (error instanceof BoundaryLockAcquireError) {
          return Object.freeze({
            kind: 'boundary-lock-refused',
            phase: 'lock',
            exit: 7,
            holder: error.holder ?? null,
            retry: error.retry ?? null,
          });
        }
        throw error;
      }

      if (BOUNDARY_REFUSALS.has(boundary?.kind)) return Object.freeze({ ...boundary });
      if (boundary?.kind !== 'moved') return invalidBoundaryResult(boundary);

      await repository.checkpoint?.('after-confirmed-move', {
        issue,
        fromState: current.id,
        targetState: movementIntent.target,
      });
      await repository.checkpoint?.('before-target-hydration', {
        issue,
        targetState: movementIntent.target,
      });
      snapshot = await repository.hydrateTask({ issue, cwd });
      const targetState = currentStateValue(snapshot);
      if (targetState !== movementIntent.target) {
        return Object.freeze({
          kind: 'drift',
          expectedState: movementIntent.target,
          actualState: targetState,
        });
      }
      await repository.checkpoint?.('before-first-target-action', {
        issue,
        targetState,
      });
      const result = await actions.resume(machine.get(targetState).residentActions, snapshot, {
        trigger: 'resident-entry',
        writeAuthorized: true,
      });
      return Object.freeze({ kind: 'resident-result', state: targetState, result });
    },
  });
}
