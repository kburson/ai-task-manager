// cspell:ignore optout
import { uncheckedPreCloseCheckboxes } from '../close-gate.mjs';
import { lifecycleSatisfaction } from './lifecycle-dod.mjs';
import { parseMarker } from './marker-grammar.mjs';
import { stripFencedCodeBlocks, upsertProgressMarker } from './markers.mjs';
import { derivePersistedReviewAuthority } from './review-authority.mjs';
import { isGovernedAuthorityError } from './work-lease/governed-effect.mjs';

const SATISFIED_LIFECYCLE_STATUSES = new Set(['ticked', 'audited', 'optout']);
const UNAUTHORIZED_CLOSE_PHASES = new Set(['intent', 'reopened', 'review', 'timing', 'complete']);
const UNAUTHORIZED_CLOSE_PROP_NAMES = new Set([
  'tx',
  'phase',
  'state-reason',
  'unticked',
  'actor',
  'ts',
]);
const UNAUTHORIZED_CLOSE_RE = /<!--\s*aitm-unauthorized-close\b[^>]*-->/i;
const PHASE_RANK = Object.freeze({
  intent: 0,
  reopened: 1,
  review: 2,
  timing: 3,
  complete: 4,
});

export function normalizeIssueCloseSnapshot({ state, stateReason } = {}) {
  const normalizedState = String(state || '')
    .trim()
    .toUpperCase();
  if (normalizedState === 'OPEN') {
    return { issueClosed: false, stateReason: null };
  }
  if (normalizedState !== 'CLOSED') {
    return { issueClosed: null, stateReason: null };
  }

  const normalizedReason = String(stateReason || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const knownReason = new Set(['completed', 'not_planned', 'duplicate']).has(normalizedReason)
    ? normalizedReason
    : null;
  return { issueClosed: true, stateReason: knownReason };
}

function checkboxLabel(line) {
  return String(line || '').replace(/^- \[ \] /, '');
}

function lifecycleKeyMissing(results, key) {
  const result = results.find((entry) => entry.key === key);
  return !result || !SATISFIED_LIFECYCLE_STATUSES.has(result.status);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateRecoveryStateReason(recovery, prefix) {
  if (recovery.phase === 'complete') {
    if (!['completed', 'unknown'].includes(recovery.stateReason)) {
      throw new Error(`${prefix}: complete recovery requires stateReason=completed or unknown`);
    }
    return;
  }
  if (recovery.stateReason !== 'completed') {
    throw new Error(`${prefix}: pending recovery requires stateReason=completed`);
  }
}

function validateUnauthorizedCloseRecovery(recovery, prefix) {
  if (!isNonEmptyString(recovery?.tx)) {
    throw new Error(`${prefix}: tx must be a non-empty string`);
  }
  if (!UNAUTHORIZED_CLOSE_PHASES.has(recovery?.phase)) {
    throw new Error(`${prefix}: phase must be one of intent, reopened, review, timing, complete`);
  }
  for (const field of ['stateReason', 'actor', 'ts']) {
    if (!isNonEmptyString(recovery?.[field])) {
      throw new Error(`${prefix}: ${field} must be a non-empty string`);
    }
  }
  validateRecoveryStateReason(recovery, prefix);
  if (
    !Array.isArray(recovery?.unticked) ||
    !recovery.unticked.every((label) => typeof label === 'string')
  ) {
    throw new Error(`${prefix}: unticked must be an array of strings`);
  }
  let serializedUnticked;
  try {
    serializedUnticked = JSON.stringify(recovery.unticked);
    const roundTrip = JSON.parse(serializedUnticked);
    if (
      !Array.isArray(roundTrip) ||
      roundTrip.length !== recovery.unticked.length ||
      !roundTrip.every((label, index) => label === recovery.unticked[index])
    ) {
      throw new Error('round-trip mismatch');
    }
  } catch {
    throw new Error(`${prefix}: unticked must round-trip through JSON`);
  }
  return serializedUnticked;
}

export function deriveClosedIssueIntegrity({ body, fullAuto = false, childBoardStates = [] } = {}) {
  const unticked = uncheckedPreCloseCheckboxes(body).map(checkboxLabel);
  const lifecycle = lifecycleSatisfaction(body);
  const reviewAuthority = derivePersistedReviewAuthority(body);

  if (lifecycleKeyMissing(lifecycle, 'agent-review-passed')) {
    unticked.push('Agent Review Passed');
  }
  if (!fullAuto && lifecycleKeyMissing(lifecycle, 'passed-final-review')) {
    unticked.push('Final Review Passed');
  }
  if (reviewAuthority.status !== 'current') {
    unticked.push('Current Review authority');
  }

  const unfinishedChildren = (childBoardStates || []).filter(
    (child) => String(child?.state || '').toLowerCase() !== 'done'
  );
  for (const child of unfinishedChildren) {
    const number = child?.number == null ? '?' : child.number;
    const state = String(child?.state || '').toLowerCase() || 'unknown';
    unticked.push(`child #${number} board=${state}`);
  }

  return {
    allTicked: unticked.length === 0,
    unticked,
    childrenDone: unfinishedChildren.length === 0,
  };
}

export function readUnauthorizedCloseRecovery(body) {
  const match = stripFencedCodeBlocks(body).match(UNAUTHORIZED_CLOSE_RE);
  if (!match) return null;
  const parsed = parseMarker(match[0]);
  if (!parsed || parsed.name !== 'unauthorized-close') return null;
  const props = parsed.props || {};
  const propNames = Object.keys(props);
  if (
    propNames.length !== UNAUTHORIZED_CLOSE_PROP_NAMES.size ||
    !propNames.every((name) => UNAUTHORIZED_CLOSE_PROP_NAMES.has(name))
  ) {
    return null;
  }
  let unticked;
  try {
    unticked = JSON.parse(props.unticked);
  } catch {
    return null;
  }
  if (
    !UNAUTHORIZED_CLOSE_PHASES.has(props.phase) ||
    !isNonEmptyString(props.tx) ||
    !isNonEmptyString(props['state-reason']) ||
    !isNonEmptyString(props.actor) ||
    !isNonEmptyString(props.ts) ||
    !Array.isArray(unticked) ||
    !unticked.every((label) => typeof label === 'string')
  ) {
    return null;
  }
  const recovery = {
    tx: props.tx || '',
    phase: props.phase,
    stateReason: props['state-reason'] || '',
    unticked,
    actor: props.actor || '',
    ts: props.ts || '',
  };
  try {
    validateRecoveryStateReason(recovery, 'readUnauthorizedCloseRecovery');
  } catch {
    return null;
  }
  return recovery;
}

export function upsertUnauthorizedCloseRecovery(body, recovery = {}) {
  const serializedUnticked = validateUnauthorizedCloseRecovery(
    recovery,
    'upsertUnauthorizedCloseRecovery'
  );
  return upsertProgressMarker(body, {
    kind: 'unauthorized-close',
    props: {
      tx: recovery.tx,
      phase: recovery.phase,
      'state-reason': recovery.stateReason,
      unticked: serializedUnticked,
      actor: recovery.actor,
      ts: recovery.ts,
    },
  });
}

// Compatibility facade for the one-shot close wiring removed by Task 5.
export function appendUnauthorizedCloseMarker(
  body,
  { tx = 'legacy', ts, stateReason, unticked = [], actor = 'unknown' } = {}
) {
  if (readUnauthorizedCloseRecovery(body)) return String(body || '');
  return upsertUnauthorizedCloseRecovery(body, {
    tx,
    phase: 'complete',
    stateReason: stateReason || 'unknown',
    unticked,
    actor: actor || 'unknown',
    ts,
  });
}

function adapterFailed(result) {
  return result === false || result?.ok === false || result?.queued === true;
}

function adapterFailureDetail(name, result) {
  return result?.stderr || result?.error || `${name} returned a failed result`;
}

function atLeast(phase, target) {
  return PHASE_RANK[phase] >= PHASE_RANK[target];
}

function recoveryCompletionMessage(steps) {
  const effects = [];
  if (steps.includes('reopenIssue')) effects.push('reopening the issue');
  if (steps.includes('moveToReview')) effects.push('restoring the board to Review');
  if (steps.includes('postTimingAudit')) effects.push('posting the timing audit');
  if (effects.length === 0) {
    return 'recovery completed without repeating live-state repair or timing effects';
  }
  if (effects.length === 1) return `recovery completed after ${effects[0]}`;
  if (effects.length === 2) return `recovery completed after ${effects.join(' and ')}`;
  return `recovery completed after ${effects.slice(0, -1).join(', ')}, and ${effects.at(-1)}`;
}

export async function runClosedIssueConvergence(input = {}, deps = {}) {
  const action = input.decision?.action;
  const steps = [];
  let recovery = input.recovery || null;
  let activeStep = null;

  if (recovery) {
    try {
      validateUnauthorizedCloseRecovery(recovery, 'runClosedIssueConvergence');
    } catch (error) {
      return {
        action,
        status: 'failed',
        steps,
        failedStep: 'validateRecovery',
        durablePhase: recovery.phase ?? null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (
    recovery &&
    !atLeast(recovery.phase, 'complete') &&
    action !== 'aberration' &&
    input.decision?.repair !== true
  ) {
    return {
      action,
      status: 'failed',
      steps,
      failedStep: 'recovery-decision-mismatch',
      durablePhase: recovery.phase,
      error: `incomplete recovery phase ${recovery.phase} requires an aberration decision`,
    };
  }

  if (action === 'dead') {
    return { action, status: 'untouched', steps };
  }

  const callAdapter = async (
    name,
    args,
    { allowFalse = false, record = true, stepName = name, validate } = {}
  ) => {
    activeStep = stepName;
    const adapter = deps[name];
    if (typeof adapter !== 'function') {
      throw new Error(`missing ${name} adapter`);
    }
    const result = await adapter(...args);
    if ((!allowFalse || result !== false) && adapterFailed(result)) {
      throw new Error(String(adapterFailureDetail(name, result)));
    }
    if (typeof validate === 'function') validate(result);
    if (record) steps.push(stepName);
    activeStep = null;
    return result;
  };

  const runStep = (name) =>
    callAdapter(name, [{ ...input, recovery }], {
      stepName: name,
    });

  const writeRecoveryPhase = async (phase, current) => {
    const proposed = { ...current, phase };
    activeStep = `writeRecoveryPhase:${phase}`;
    validateUnauthorizedCloseRecovery(proposed, 'writeRecoveryPhase');
    let persisted = null;
    await callAdapter('writeRecoveryPhase', [phase, proposed], {
      stepName: `writeRecoveryPhase:${phase}`,
      validate: (result) => {
        persisted = result?.recovery || result;
        validateUnauthorizedCloseRecovery(persisted, 'writeRecoveryPhase');
        if (persisted.phase !== phase || persisted.tx !== proposed.tx) {
          throw new Error(`writeRecoveryPhase did not confirm durable phase ${phase}`);
        }
      },
    });
    return persisted;
  };

  try {
    if (action === 'finalize' || action === 'noop') {
      if (action === 'finalize' || input.decision?.boardDrift) {
        await runStep('moveToDone');
      }
      await runStep('emitClosePair');
      await runStep('reconcileLifecycle');
      await runStep('cleanup');
      return { action, status: 'completed', steps };
    }

    if (action === 'aberration') {
      if (!recovery) {
        const tx = await callAdapter('createTransactionId', [input], {
          record: false,
          validate: (result) => {
            if (typeof result !== 'string' || result.length === 0) {
              throw new Error('createTransactionId did not return a transaction id');
            }
          },
        });
        recovery = await writeRecoveryPhase('intent', {
          tx,
          phase: 'intent',
          stateReason: input.stateReason || 'unknown',
          unticked: Array.isArray(input.unticked) ? [...input.unticked] : [],
          actor: input.actor || 'unknown',
          ts: input.ts || '',
        });
      }
      if (!atLeast(recovery.phase, 'complete')) {
        let observedIssueClosed = input.issueClosed === true;
        let observedBoardState = String(input.boardState || '').toLowerCase();
        if (observedIssueClosed) {
          await runStep('reopenIssue');
          observedIssueClosed = false;
        }
        if (!atLeast(recovery.phase, 'reopened')) {
          recovery = await writeRecoveryPhase('reopened', recovery);
        }
        if (observedBoardState !== 'review') {
          await runStep('moveToReview');
          observedBoardState = 'review';
        }
        if (!atLeast(recovery.phase, 'review')) {
          recovery = await writeRecoveryPhase('review', recovery);
        }
      }
      if (!atLeast(recovery.phase, 'timing')) {
        const timingPresent = await callAdapter('timingAuditPresent', [recovery.tx], {
          allowFalse: true,
          record: false,
          validate: (result) => {
            if (typeof result !== 'boolean') {
              throw new Error('timingAuditPresent did not return a boolean');
            }
          },
        });
        if (!timingPresent) await runStep('postTimingAudit');
        recovery = await writeRecoveryPhase('timing', recovery);
      }
      if (!atLeast(recovery.phase, 'complete')) {
        recovery = await writeRecoveryPhase('complete', recovery);
      }
      return {
        action,
        status: 'recovered',
        steps,
        durablePhase: recovery.phase,
        message: recoveryCompletionMessage(steps),
      };
    }

    return { action, status: 'not-handled', steps };
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
    return {
      action,
      status: 'failed',
      steps,
      failedStep: activeStep,
      ...(action === 'aberration' ? { durablePhase: recovery?.phase ?? null } : {}),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
