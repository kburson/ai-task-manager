// Bounded stale-body recovery for the two arcs traversed by the first
// `/task refine` run (#1017).
//
// This helper runs before the move saga mutates board/body/timing state. It
// retains the historical contiguity-only path for compatibility callers. The
// shared evaluator caller supplies rerunGuards to replace the entire result
// when the body changes, so no other body-dependent predicate stays stale.

import { contiguityEntryGuard } from '../contiguity-entry-guard.mjs';
import { indeterminateRefreshResult } from '../action-decision/evaluate.mjs';

const PRE_REFINE_ARCS = new Set(['backlog→refine']);

function isPreRefineArc(fromState, toState) {
  return PRE_REFINE_ARCS.has(`${fromState}→${toState}`);
}

export async function refreshPreRefineContiguity({
  fromState,
  toState,
  issueNumber,
  guardResult,
  fetchFreshBody,
  rerunGuards,
  guard = contiguityEntryGuard,
} = {}) {
  const refusals = Array.isArray(guardResult?.refusals) ? guardResult.refusals : [];
  const hasContiguityRefusal = refusals.some((refusal) => refusal?.id === 'contiguity-entry');
  if (
    !isPreRefineArc(fromState, toState) ||
    !hasContiguityRefusal ||
    typeof fetchFreshBody !== 'function'
  ) {
    return { guardResult, refreshed: false, attempts: 0 };
  }

  let freshBody;
  try {
    freshBody = await fetchFreshBody();
    if (typeof freshBody !== 'string') {
      throw new TypeError('fresh issue body was not a string');
    }
  } catch (error) {
    return {
      guardResult:
        typeof rerunGuards === 'function'
          ? indeterminateRefreshResult({ guardResult, refusals, issueNumber })
          : guardResult,
      refreshed: false,
      attempts: 1,
      refreshError: error instanceof Error ? error.message : String(error),
    };
  }

  if (typeof rerunGuards === 'function') {
    try {
      const complete = await rerunGuards(freshBody);
      if (!complete?.guardResult || !Array.isArray(complete.guardResult.refusals)) {
        throw new TypeError('fresh full guard result is invalid');
      }
      return { ...complete, refreshed: true, attempts: 1 };
    } catch (error) {
      return {
        guardResult: indeterminateRefreshResult({ guardResult, refusals, issueNumber }),
        refreshed: false,
        attempts: 1,
        refreshError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  let refreshedVerdict;
  try {
    refreshedVerdict = await guard.run({
      fromState,
      toState,
      issueNumber,
      body: freshBody,
    });
  } catch (error) {
    return {
      guardResult,
      refreshed: false,
      attempts: 1,
      refreshError: error instanceof Error ? error.message : String(error),
    };
  }

  if (!refreshedVerdict?.ok) {
    return { guardResult, refreshed: false, attempts: 1 };
  }

  const remainingRefusals = refusals.filter((refusal) => refusal?.id !== 'contiguity-entry');
  return {
    guardResult: {
      ...guardResult,
      ok: remainingRefusals.length === 0,
      refusals: remainingRefusals,
    },
    refreshed: true,
    attempts: 1,
  };
}
