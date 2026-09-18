// @story #1117 #1458 #1629

import {
  agentReviewIncompleteReason,
  clearReviewFailed,
  runAgentReviewGate,
  stampAgentReviewPassed,
  stampReviewFailed,
} from '../agent-review/review-gate.mjs';
import { parseProofMarker } from '../proof-marker.mjs';
import { parseEntryMarkers } from '../stage-entry-markers.mjs';
import { terminalReviewHandoffOutcome } from '../terminal-review-handoff.mjs';
import {
  createGithubWorkflowBoundaryRuntime,
  loadWorkflowBoundary,
} from '../workflow-policy/enforcement.mjs';

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

const SEMANTIC_REVIEW_REQUIREMENT = 'review.semantic-resident';

function currentEvent(snapshot) {
  if (snapshot?.actionLedger?.status !== 'clean') return null;
  return snapshot.actionLedger.events?.[0] ?? null;
}

async function loadSemanticReviewPolicy(context, snapshot) {
  const capabilities = context?.review;
  if (!capabilities?.repo) return null;
  const issueNumber = Number(valueOf(snapshot?.issue) ?? snapshot?.invocation?.issue);
  const body = String(valueOf(snapshot?.body) || '');
  const loadBoundary = capabilities.loadWorkflowBoundary || loadWorkflowBoundary;
  return loadBoundary({
    repository: capabilities.repo,
    issue: issueNumber,
    body,
    requirementIds: [SEMANTIC_REVIEW_REQUIREMENT],
    activity: 'semantic-review:resident',
    state: 'review',
    now: isoNow(context),
    runtime:
      capabilities.workflowPolicyRuntime ||
      createGithubWorkflowBoundaryRuntime({ repository: capabilities.repo }),
  });
}

function waivedEvidence(policy, snapshot) {
  return {
    authority: policy.decision(SEMANTIC_REVIEW_REQUIREMENT)?.authority,
    acceptedSha: valueOf(snapshot?.headSha),
    requirementId: SEMANTIC_REVIEW_REQUIREMENT,
  };
}

async function hasCurrentTerminalWaiver(context, snapshot, evidence) {
  const capabilities = context?.review;
  if (snapshot?.reviewCommentsStatus === 'error') return 'error';
  if (
    !Array.isArray(snapshot?.reviewComments) &&
    typeof capabilities?.readComments !== 'function'
  ) {
    return 'error';
  }
  let comments;
  try {
    comments = Array.isArray(snapshot?.reviewComments)
      ? snapshot.reviewComments
      : typeof capabilities?.readComments === 'function'
        ? await capabilities.readComments({
            issueNumber: Number(valueOf(snapshot?.issue) ?? snapshot?.invocation?.issue),
            snapshot,
          })
        : [];
  } catch {
    return 'error';
  }
  const timingComments = Array.isArray(comments)
    ? comments.filter(({ body }) => String(valueOf(body) || '').includes('⏱ Timing Log'))
    : [];
  if (timingComments.length !== 1) return 'stale';
  const terminal = terminalReviewHandoffOutcome(valueOf(timingComments[0].body));
  return terminal?.outcome === 'waived' &&
    terminal.evidence?.requirementId === evidence.requirementId &&
    terminal.evidence?.acceptedSha === evidence.acceptedSha &&
    terminal.evidence?.authority?.recordId === evidence.authority?.recordId &&
    terminal.evidence?.authority?.revision === evidence.authority?.revision
    ? 'current'
    : 'stale';
}

export const reviewAgentValidationAction = Object.freeze({
  id: 'review-agent-validation',
  serialization: 'issue-lock',

  async verify(context, snapshot) {
    const body = String(valueOf(snapshot?.body) || '');
    const reason = agentReviewIncompleteReason(body);
    if (reason) {
      if (currentEvent(snapshot)?.phase === 'waived') {
        const policy = await loadSemanticReviewPolicy(context, snapshot);
        if (policy?.isWaived(SEMANTIC_REVIEW_REQUIREMENT)) {
          // A durable waived ledger event proves the action decision, but an
          // active failure carrier still needs the waived self-loop to run so
          // onWaived can retire that obsolete blocker.
          if (reason === 'review-failed') return { status: 'incomplete', reason };
          const evidence = waivedEvidence(policy, snapshot);
          const terminalStatus = await hasCurrentTerminalWaiver(context, snapshot, evidence);
          if (terminalStatus === 'error') {
            return { status: 'paused', reason: 'review-comments-unavailable' };
          }
          if (terminalStatus !== 'current') {
            return { status: 'incomplete', reason: 'stale-waiver-evidence' };
          }
          return { status: 'waived', evidence };
        }
      }
      return { status: 'incomplete', reason };
    }

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
    if (!capabilities) {
      return { status: 'paused', reason: 'review-capabilities-unavailable' };
    }

    const policy = await loadSemanticReviewPolicy(context, snapshot);
    if (policy?.isWaived(SEMANTIC_REVIEW_REQUIREMENT)) {
      const evidence = waivedEvidence(policy, snapshot);
      if (typeof capabilities.onWaived === 'function') {
        await capabilities.onWaived({
          issueNumber: Number(valueOf(snapshot?.issue) ?? snapshot?.invocation?.issue),
          snapshot,
          ts: isoNow(context),
          correlation,
          evidence,
        });
      }
      return { status: 'waived', evidence };
    }
    if (typeof capabilities.onFailure !== 'function') {
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
    const gateInput = {
      body,
      issueNumber,
      repo: capabilities.repo,
      comments,
      changedPaths,
    };
    let gate = await gateFn(gateInput);
    const planningSectionFailure = (gate.failures || []).some(
      (failure) =>
        String(failure).startsWith('body-sections:') &&
        /section '(?:Plan Metadata|Deep Dive)' is missing/.test(String(failure))
    );
    if (!gate.pass && planningSectionFailure) {
      const loadBoundary = capabilities.loadWorkflowBoundary || loadWorkflowBoundary;
      const workflowPolicy = await loadBoundary({
        repository: capabilities.repo,
        issue: issueNumber,
        body,
        requirementIds: ['planning.metadata', 'planning.deep-dive'],
        activity: 'semantic-review:resident',
        state: 'review',
        now: isoNow(context),
        runtime:
          capabilities.workflowPolicyRuntime ||
          createGithubWorkflowBoundaryRuntime({ repository: capabilities.repo }),
      });
      gate = await gateFn({ ...gateInput, workflowPolicy });
    }
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
