// @story #1117 #1456

import { fingerprint, canonicalJson } from './resident-action-ledger-codec.mjs';
import { createActionCapabilityContext } from './repository-adapter.mjs';

export const VERIFY_STATUSES = Object.freeze(['complete', 'incomplete']);
export const ACTION_OUTCOMES = Object.freeze(['complete', 'waiting', 'paused', 'failed']);

const VERIFY_STATUS_SET = new Set(VERIFY_STATUSES);
const ACTION_OUTCOME_SET = new Set(ACTION_OUTCOMES);
const OPEN_PHASES = new Set(['intent', 'waiting']);
const ISO_DEADLINE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function valueOf(record) {
  return record && typeof record === 'object' && 'value' in record ? record.value : record;
}

function currentEvent(snapshot) {
  if (snapshot?.actionLedger?.status !== 'clean') return null;
  return snapshot.actionLedger.events?.[0] ?? null;
}

function hasCorrelation(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
  );
}

function validDeadline(value) {
  return (
    typeof value === 'string' && ISO_DEADLINE_RE.test(value) && Number.isFinite(Date.parse(value))
  );
}

function isLockContention(error) {
  return (
    ['EAGAIN', 'EBUSY'].includes(error?.code) ||
    /(?:lock|contention).*(?:busy|held|timeout|contend)|(?:busy|held).*(?:lock|contention)/i.test(
      error?.message || ''
    )
  );
}

function invocationFrom(snapshot, actionId) {
  return { ...(snapshot?.invocation || {}), actionId };
}

function eventIdentity(snapshot, action) {
  return {
    issue: valueOf(snapshot?.issue) ?? snapshot?.invocation?.issue,
    state: valueOf(snapshot?.currentState),
    stateVisitId: snapshot?.stateVisitId,
    actionId: action.id,
    definition:
      action.definition ?? fingerprint({ id: action.id, serialization: action.serialization }),
  };
}

function evidenceFingerprint(verification) {
  return verification?.evidence === undefined ? undefined : fingerprint(verification.evidence);
}

function sameCorrelation(left, right) {
  if (!hasCorrelation(left) || !hasCorrelation(right)) return false;
  return canonicalJson(left) === canonicalJson(right);
}

function publicWaiting(event, expired = false) {
  return {
    status: 'waiting',
    deadline: event.deadline,
    correlation: event.correlation,
    ...(expired ? { expired: true } : {}),
  };
}

async function hydrate(repository, snapshot, actionId) {
  return repository.hydrateTask(invocationFrom(snapshot, actionId));
}

export function createResidentActionRunner({ repository, actionContext = {} } = {}) {
  if (!repository) throw new TypeError('createResidentActionRunner: repository is required');
  const context = createActionCapabilityContext({ repository, actionContext });

  async function append(snapshot, action, phase, input = {}) {
    await repository.checkpoint?.(`before-${phase}`, { actionId: action.id, phase });
    const result = await repository.appendActionEvent({
      ...eventIdentity(snapshot, action),
      phase,
      correlation: input.correlation,
      verifyStatus: input.verifyStatus,
      deadline: input.deadline,
      attribution: input.attribution,
      evidenceFingerprint: input.evidenceFingerprint,
      ts: new Date(repository.now()).toISOString(),
    });
    await repository.checkpoint?.(`after-${phase}`, { actionId: action.id, phase, result });
    return result;
  }

  async function verify(action, snapshot) {
    const result = await action.verify(context, snapshot);
    if (!result || !VERIFY_STATUS_SET.has(result.status)) {
      return { status: 'paused', reason: 'unverifiable-action' };
    }
    return result;
  }

  async function resumeOne(action, originalSnapshot, { trigger, writeAuthorized }) {
    let snapshot = await hydrate(repository, originalSnapshot, action.id);
    if (snapshot?.actionLedger?.status !== 'clean') {
      return { status: 'paused', reason: 'action-ledger-unavailable' };
    }

    let verification = await verify(action, snapshot);
    if (verification.status === 'paused') return verification;
    let event = currentEvent(snapshot);

    if (verification.status === 'complete') {
      if (event && OPEN_PHASES.has(event.phase) && writeAuthorized) {
        await append(snapshot, action, 'resolved', {
          correlation: event.correlation,
          verifyStatus: 'complete',
          attribution: sameCorrelation(event.correlation, verification.evidence?.correlation)
            ? 'correlated'
            : 'observed',
          evidenceFingerprint: evidenceFingerprint(verification),
        });
      }
      return { status: 'complete' };
    }

    if (event?.phase === 'waiting') {
      if (!hasCorrelation(event.correlation) || !validDeadline(event.deadline)) {
        return { status: 'paused', reason: 'malformed-waiting-event' };
      }
      const expired = repository.now() >= Date.parse(event.deadline);
      if (!expired) return publicWaiting(event);
      if (!writeAuthorized) return publicWaiting(event, true);
      await append(snapshot, action, 'failed', {
        correlation: event.correlation,
        verifyStatus: 'incomplete',
      });
      return { status: 'failed', reason: 'waiting-deadline-expired' };
    }
    if (event?.phase === 'intent' && !hasCorrelation(event.correlation)) {
      return { status: 'paused', reason: 'malformed-intent-event' };
    }

    if (!writeAuthorized) return { status: 'paused', reason: 'write-authorization-required' };

    let proposed;
    try {
      proposed =
        event?.phase === 'intent' && hasCorrelation(event.correlation)
          ? event.correlation
          : await repository.resolveCorrelation({ action, snapshot, trigger });
    } catch (error) {
      if (isLockContention(error)) return { status: 'paused', reason: 'action-lock-contention' };
      throw error;
    }
    if (!hasCorrelation(proposed)) {
      return { status: 'paused', reason: 'correlation-unavailable' };
    }

    const execute = async (winningCorrelation = proposed) => {
      if (!hasCorrelation(winningCorrelation)) {
        return { status: 'paused', reason: 'correlation-unavailable' };
      }
      await append(snapshot, action, 'intent', {
        correlation: winningCorrelation,
        verifyStatus: 'incomplete',
      });

      const beforeEffect = await hydrate(repository, snapshot, action.id);
      if (beforeEffect.stateVisitId !== snapshot.stateVisitId) {
        return { status: 'paused', reason: 'stale-state-visit' };
      }

      await repository.checkpoint?.('before-provider-submission', {
        actionId: action.id,
        correlation: winningCorrelation,
      });
      const outcome = await action.run(context, beforeEffect, {
        trigger,
        correlation: winningCorrelation,
      });
      await repository.checkpoint?.('after-provider-submission', {
        actionId: action.id,
        correlation: winningCorrelation,
        outcome,
      });
      if (!outcome || !ACTION_OUTCOME_SET.has(outcome.status)) {
        return { status: 'paused', reason: 'invalid-action-outcome' };
      }

      snapshot = await hydrate(repository, beforeEffect, action.id);
      verification = await verify(action, snapshot);
      if (verification.status === 'paused') return verification;
      if (verification.status === 'complete') {
        await append(snapshot, action, 'resolved', {
          correlation: winningCorrelation,
          verifyStatus: 'complete',
          attribution: sameCorrelation(
            winningCorrelation,
            verification.evidence?.correlation ?? outcome.correlation
          )
            ? 'correlated'
            : 'observed',
          evidenceFingerprint: evidenceFingerprint(verification),
        });
        return { status: 'complete' };
      }

      if (outcome.status === 'waiting') {
        const correlation = outcome.correlation ?? winningCorrelation;
        if (!hasCorrelation(correlation) || !validDeadline(outcome.deadline)) {
          return { status: 'paused', reason: 'invalid-waiting-outcome' };
        }
        await append(snapshot, action, 'waiting', {
          correlation,
          deadline: outcome.deadline,
          verifyStatus: 'incomplete',
        });
        const waitingSnapshot = await hydrate(repository, snapshot, action.id);
        const waitingEvent = currentEvent(waitingSnapshot);
        if (
          waitingEvent?.phase !== 'waiting' ||
          !sameCorrelation(waitingEvent.correlation, correlation) ||
          waitingEvent.deadline !== outcome.deadline ||
          !validDeadline(waitingEvent.deadline)
        ) {
          return { status: 'paused', reason: 'waiting-event-unverified' };
        }
        return publicWaiting(waitingEvent);
      }
      if (outcome.status === 'failed') {
        await append(snapshot, action, 'failed', {
          correlation: winningCorrelation,
          verifyStatus: 'incomplete',
        });
        return { status: 'failed', ...(outcome.reason ? { reason: outcome.reason } : {}) };
      }
      if (outcome.status === 'paused') {
        return { status: 'paused', ...(outcome.reason ? { reason: outcome.reason } : {}) };
      }
      return { status: 'paused', reason: 'verification-incomplete' };
    };

    try {
      if (action.serialization === 'issue-lock') {
        return await repository.withIssueLock(
          { issue: valueOf(snapshot.issue), class: 'resident-action', actionId: action.id },
          () => execute(proposed)
        );
      }
      return await repository.withCorrelationIntent(
        {
          issue: valueOf(snapshot.issue),
          stateVisitId: snapshot.stateVisitId,
          actionId: action.id,
          correlation: proposed,
        },
        execute
      );
    } catch (error) {
      if (isLockContention(error)) return { status: 'paused', reason: 'action-lock-contention' };
      throw error;
    }
  }

  return Object.freeze({
    async resume(actions, snapshot, options = {}) {
      for (const action of Array.isArray(actions) ? actions : []) {
        const result = await resumeOne(action, snapshot, options);
        if (result.status !== 'complete') return result;
      }
      return { status: 'complete' };
    },
  });
}
