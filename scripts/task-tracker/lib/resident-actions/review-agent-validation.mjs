// @story #1117 #1458

import {
  agentReviewIncompleteReason,
  clearReviewFailed,
  runAgentReviewGate,
  stampAgentReviewPassed,
  stampReviewFailed,
} from '../agent-review/review-gate.mjs';
import { parseProofMarker } from '../proof-marker.mjs';
import { parseEntryMarkers } from '../stage-entry-markers.mjs';

function valueOf(record) {
  return record && typeof record === 'object' && 'value' in record ? record.value : record;
}

function reviewPassEvidence(body) {
  for (const line of String(body || '').split('\n')) {
    if (!/^- \[[ xX]\]\s+Agent Review Passed\b/.test(line)) continue;
    const proof = parseProofMarker(line);
    if (proof?.gate === 'agent-review' && proof.result === 'pass') return proof;
  }
  return null;
}

function isoNow(context) {
  const value = context?.now?.() ?? Date.now();
  return typeof value === 'string' ? new Date(value).toISOString() : new Date(value).toISOString();
}

export const reviewAgentValidationAction = Object.freeze({
  id: 'review-agent-validation',
  serialization: 'issue-lock',

  async verify(_context, snapshot) {
    const body = String(valueOf(snapshot?.body) || '');
    const reason = agentReviewIncompleteReason(body);
    if (reason) return { status: 'incomplete', reason };

    const reviewVisits = parseEntryMarkers(body).filter(({ stage }) => stage === 'review');
    const currentVisit = reviewVisits.at(-1);
    if (!currentVisit) return { status: 'incomplete', reason: 'review-entry-missing' };

    const pass = reviewPassEvidence(body);
    if (!pass?.ts || Date.parse(pass.ts) < Date.parse(currentVisit.ts)) {
      return { status: 'incomplete', reason: 'stale-evidence' };
    }
    return {
      status: 'complete',
      evidence: {
        stateVisitId: snapshot?.stateVisitId,
        reviewVisit: currentVisit.visit,
        reviewEntryTs: currentVisit.ts,
        passTs: pass.ts,
        validators: pass.validators || '',
      },
    };
  },

  async run(context, snapshot, { correlation } = {}) {
    const capabilities = context?.review;
    if (!capabilities || typeof capabilities.onFailure !== 'function') {
      return { status: 'paused', reason: 'review-capabilities-unavailable' };
    }

    const issueNumber = Number(valueOf(snapshot?.issue) ?? snapshot?.invocation?.issue);
    const body = String(valueOf(snapshot?.body) || '');
    const comments =
      typeof capabilities.readComments === 'function'
        ? await capabilities.readComments({ issueNumber, snapshot })
        : [];
    const changedPaths =
      typeof capabilities.computeChangedPaths === 'function'
        ? await capabilities.computeChangedPaths({ issueNumber, snapshot })
        : [];
    const gateFn = capabilities.runAgentReviewGate || runAgentReviewGate;
    const gate = await gateFn({
      body,
      issueNumber,
      repo: capabilities.repo,
      comments,
      changedPaths,
    });
    const base = typeof gate.normalizedBody === 'string' ? gate.normalizedBody : body;
    const ts = isoNow(context);

    if (!gate.pass) {
      const failures = Array.isArray(gate.failures) ? gate.failures : [];
      const failedBody = stampReviewFailed(base, failures, { ts });
      await capabilities.onFailure({
        issueNumber,
        snapshot,
        failures,
        failedBody,
        ts,
        correlation,
      });
      return {
        status: 'failed',
        reason: failures[0] || 'agent-review-failed',
        failures,
      };
    }

    if (typeof capabilities.onPass !== 'function') {
      return { status: 'paused', reason: 'review-capabilities-unavailable' };
    }
    const validators = Array.isArray(gate.validatorsRun) ? gate.validatorsRun : [];
    const passedBody = stampAgentReviewPassed(clearReviewFailed(base), { ts, validators });
    await capabilities.onPass({
      issueNumber,
      snapshot,
      validators,
      passedBody,
      originalBody: body,
      ts,
      correlation,
    });
    return {
      status: 'complete',
      evidence: { correlation, passTs: ts, validators },
    };
  },
});
