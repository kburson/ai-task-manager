// @story #1117 #1454

import {
  RESIDENT_ACTION_HEAD_SCHEMA,
  canonicalJson,
  encodeCanonical,
  fingerprint,
  parseBodyLedgerHead,
  parseCommentPair,
  parseEventComment,
  parseSpillHeadComment,
  renderBodyLedgerHead,
  renderEventComment,
  renderSpillHeadComment,
} from './resident-action-ledger-codec.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';

export const INLINE_HEAD_MARKER_LIMIT = 8192;
export const INLINE_BODY_LIMIT = 57344;
export const RESIDENT_ACTION_CORRECTION_SCHEMA = 'aitm.resident-action-ledger-correction/v1';
export const RESIDENT_ACTION_DAMAGE_CARRY_SCHEMA = 'aitm.resident-action-ledger-damage-carry/v1';

const BODY_HEAD_RE = /<!--\s*aitm-resident-action-ledger-head\s+[^]*?-->/i;

function fullHead(head) {
  return {
    schema: RESIDENT_ACTION_HEAD_SCHEMA,
    visit: head.visit,
    commit: head.commit ?? null,
    definition: head.definition,
    audit: head.audit ?? null,
    actions: head.actions ?? {},
  };
}

export function createGenesisHead({ visit, definition, commit = null, audit = null } = {}) {
  const head = {
    mode: 'inline',
    visit,
    commit,
    definition,
    audit,
    actions: {},
  };
  return Object.freeze({ ...head, marker: renderBodyLedgerHead(head) });
}

function replaceHead(body, marker) {
  const source = String(body || '');
  if (BODY_HEAD_RE.test(source)) return source.replace(BODY_HEAD_RE, marker);
  return `${source.replace(/\s*$/, '')}\n\n${marker}\n`;
}

function expectedMatches(expectedHead, actualHead) {
  if (expectedHead == null) return actualHead == null;
  if (!actualHead) return false;
  const expected =
    typeof expectedHead === 'string'
      ? parseBodyLedgerHead(expectedHead)
      : expectedHead.marker
        ? parseBodyLedgerHead(expectedHead.marker)
        : expectedHead;
  const clean = (value) => {
    const { marker: _marker, ...rest } = value;
    return rest;
  };
  return canonicalJson(clean(expected)) === canonicalJson(clean(actualHead));
}

function commentId(created) {
  const id = created?.id ?? created?.databaseId ?? created?.commentId;
  if (id == null) throw new Error('resident-action-spill-comment-id-missing');
  return String(id);
}

function commentBody(comment) {
  return typeof comment === 'string' ? comment : comment?.body;
}

function pairFromHead(value) {
  return value ? parseCommentPair(value) : { commentId: null, hash: null };
}

async function checkpoint(deps, point, details = {}) {
  if (typeof deps.checkpoint === 'function') await deps.checkpoint(point, details);
}

function deterministicEventId({ repository, issue, stateVisitId, actionId, attemptId, phase }) {
  return fingerprint({ repository, issue, stateVisitId, actionId, attemptId, phase });
}

async function resolveCompleteHead({ issue, bodyHead, deps }) {
  if (!bodyHead || bodyHead.mode === 'inline') return bodyHead;
  if (typeof deps.readComment !== 'function')
    throw new Error('resident-action-spill-read-required');
  const { commentId: id, hash } = parseCommentPair(bodyHead.head);
  const found = await deps.readComment(issue, id);
  const body = commentBody(found);
  if (!body || fingerprint(body) !== hash) throw new Error('resident-action-spill-damaged');
  return parseSpillHeadComment(body);
}

async function readVerifiedSpill({ issue, id, body, readComment }) {
  const found = await readComment(issue, id);
  const foundBody = typeof found === 'string' ? found : found?.body;
  if (!foundBody || fingerprint(foundBody) !== fingerprint(body)) {
    throw new Error('resident-action-spill-verification-failed');
  }
  parseSpillHeadComment(foundBody);
}

export async function advanceActionLedgerHead({
  issue,
  repo,
  expectedHead,
  nextHead,
  deps = {},
} = {}) {
  if (!issue) throw new Error('advanceActionLedgerHead: issue is required');
  if (!repo) throw new Error('advanceActionLedgerHead: repo is required');
  const createComment = deps.createComment;
  const readComment = deps.readComment;
  const complete = fullHead(nextHead);
  const inline = renderBodyLedgerHead({ mode: 'inline', ...complete });

  let mode = 'inline';
  let marker = inline;
  let spill = null;
  let commentVerifications = 0;

  const mutation = (base) => {
    const actual = parseBodyLedgerHead(base);
    const candidate = replaceHead(base, inline);
    if (
      inline.length <= INLINE_HEAD_MARKER_LIMIT &&
      candidate.length <= INLINE_BODY_LIMIT &&
      !(actual?.mode === 'spill' && actual.visit === complete.visit)
    ) {
      mode = 'inline';
      marker = inline;
    } else {
      if (!spill) throw new Error('resident-action-spill-not-prepared');
      mode = 'spill';
      marker = spill.marker;
    }
    return replaceHead(base, marker);
  };

  const initialBody = await deps.fetchBody(repo, issue);
  const initialActual = parseBodyLedgerHead(initialBody);
  if (!expectedMatches(expectedHead, initialActual)) throw new Error('stale-expected-head');
  const initialInlineBody = replaceHead(initialBody, inline);
  const mustSpill =
    inline.length > INLINE_HEAD_MARKER_LIMIT ||
    initialInlineBody.length > INLINE_BODY_LIMIT ||
    (initialActual?.mode === 'spill' && initialActual.visit === complete.visit);

  if (mustSpill) {
    if (typeof createComment !== 'function' || typeof readComment !== 'function') {
      throw new Error('resident-action-spill-capability-unavailable');
    }
    const spillBody = renderSpillHeadComment(complete);
    await checkpoint(deps, 'before-spill-write', { issue, visit: complete.visit });
    const created = await createComment(issue, spillBody);
    const id = commentId(created);
    await readVerifiedSpill({ issue, id, body: spillBody, readComment });
    await checkpoint(deps, 'after-spill-write', { issue, visit: complete.visit, commentId: id });
    commentVerifications += 1;
    spill = {
      id,
      body: spillBody,
      marker: renderBodyLedgerHead({
        mode: 'spill',
        visit: complete.visit,
        commit: complete.commit,
        audit: complete.audit,
        head: `${id}:${fingerprint(spillBody)}`,
      }),
    };
  }

  await checkpoint(deps, 'before-body-head-advance', { issue, visit: complete.visit });
  const write = await mutateIssueBody({
    issueNumber: issue,
    repo,
    mutate: mutation,
    deps,
    allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    validateFreshBase: (base) => {
      if (!expectedMatches(expectedHead, parseBodyLedgerHead(base))) {
        throw new Error('stale-expected-head');
      }
    },
  });
  await checkpoint(deps, 'after-body-head-advance', { issue, visit: complete.visit, mode });

  const verifiedHead = parseBodyLedgerHead(write.body);
  if (!verifiedHead || verifiedHead.mode !== mode) {
    throw new Error('resident-action-head-readback-failed');
  }
  if (spill) {
    await readVerifiedSpill({ issue, id: spill.id, body: spill.body, readComment });
    commentVerifications += 1;
  }
  return Object.freeze({ mode, head: verifiedHead, write, commentVerifications });
}

export function deriveActionAttempt({ actionHead, correlation, verifyStatus = 'incomplete' } = {}) {
  if (!actionHead) return Object.freeze({ attemptId: 1, correlation, phase: 'intent' });
  if (['intent', 'waiting'].includes(actionHead.phase)) {
    return Object.freeze({
      attemptId: actionHead.attemptId,
      correlation,
      phase: actionHead.phase,
    });
  }
  if (actionHead.phase === 'resolved' && verifyStatus === 'complete') {
    return Object.freeze({
      attemptId: actionHead.attemptId,
      correlation,
      phase: 'resolved',
      complete: true,
    });
  }
  return Object.freeze({ attemptId: actionHead.attemptId + 1, correlation, phase: 'intent' });
}

export async function appendActionEvent(input = {}) {
  const {
    repository,
    issue,
    state,
    stateVisitId,
    actionId,
    phase,
    correlation,
    definition,
    verifyStatus = 'incomplete',
    deps = {},
  } = input;
  if (!repository || !issue || !state || !stateVisitId || !actionId || !phase) {
    throw new Error('appendActionEvent:identity-required');
  }
  let body = await deps.fetchBody(repository, issue);
  let bodyHead = parseBodyLedgerHead(body);
  if (!bodyHead) {
    const genesis = createGenesisHead({ visit: stateVisitId, definition });
    await checkpoint(deps, 'before-genesis', { issue, stateVisitId, actionId });
    const created = await advanceActionLedgerHead({
      issue,
      repo: repository,
      expectedHead: null,
      nextHead: genesis,
      deps,
    });
    bodyHead = created.head;
    body = created.write.body;
    await checkpoint(deps, 'after-genesis', { issue, stateVisitId, actionId });
  }
  if (bodyHead.visit !== stateVisitId) throw new Error('stale-state-visit');
  const completeHead = await resolveCompleteHead({ issue, bodyHead, deps });
  const actionHead = completeHead.actions?.[actionId] ?? null;
  let previousEvent = null;
  if (actionHead) {
    const priorBody = commentBody(await deps.readComment(issue, actionHead.commentId));
    if (!priorBody || fingerprint(priorBody) !== actionHead.hash) {
      throw new Error('resident-action-current-event-damaged');
    }
    previousEvent = parseEventComment(priorBody);
    if (
      previousEvent.actionId !== actionId ||
      previousEvent.stateVisitId !== stateVisitId ||
      previousEvent.attemptId !== actionHead.attemptId ||
      previousEvent.phase !== actionHead.phase
    ) {
      throw new Error('resident-action-current-event-identity');
    }
  }
  const openAttempt = actionHead && ['intent', 'waiting'].includes(actionHead.phase);
  const effectiveCorrelation = openAttempt ? previousEvent.correlation : correlation;
  const derived = deriveActionAttempt({
    actionHead,
    correlation: effectiveCorrelation,
    verifyStatus,
  });
  if (derived.complete && phase === 'resolved') {
    return Object.freeze({ status: 'no-op', reason: 'already-resolved', head: completeHead });
  }
  const attemptId = input.attemptId ?? derived.attemptId;
  const eventId = deterministicEventId({
    repository,
    issue,
    stateVisitId,
    actionId,
    attemptId,
    phase,
  });
  const existing = await deps.findEventById?.(issue, eventId);
  if (
    existing &&
    actionHead?.commentId === commentId(existing) &&
    actionHead.hash === fingerprint(commentBody(existing)) &&
    actionHead.attemptId === attemptId &&
    actionHead.phase === phase
  ) {
    const priorEvent = parseEventComment(commentBody(existing));
    if (canonicalJson(priorEvent.correlation) !== canonicalJson(effectiveCorrelation)) {
      throw new Error('resident-action-event-conflict');
    }
    return Object.freeze({ status: 'no-op', event: priorEvent, head: completeHead });
  }
  const globalPrevious = pairFromHead(completeHead.commit);
  const actionPrevious = actionHead
    ? { commentId: String(actionHead.commentId), hash: actionHead.hash }
    : { commentId: null, hash: null };
  const event = {
    schema: 'aitm.resident-action-event/v1',
    eventId,
    previousCommentId: globalPrevious.commentId,
    previousHash: globalPrevious.hash,
    actionPreviousCommentId: actionPrevious.commentId,
    actionPreviousHash: actionPrevious.hash,
    issue,
    state,
    stateVisitId,
    actionId,
    attemptId,
    phase,
    correlation: effectiveCorrelation,
    ts: input.ts ?? new Date(deps.now?.() ?? Date.now()).toISOString(),
    ...(input.deadline ? { deadline: input.deadline } : {}),
    ...(input.attribution ? { attribution: input.attribution } : {}),
    ...(input.evidenceFingerprint ? { evidenceFingerprint: input.evidenceFingerprint } : {}),
  };
  const rendered = renderEventComment(event);
  let stored = existing;
  let status = 'no-op';
  if (stored) {
    if (commentBody(stored) !== rendered) throw new Error('resident-action-event-conflict');
  } else {
    stored = await deps.createComment(issue, rendered);
    status = 'appended';
  }
  const id = commentId(stored);
  const verified = await deps.readComment(issue, id);
  if (commentBody(verified) !== rendered)
    throw new Error('resident-action-event-verification-failed');
  parseEventComment(rendered);
  const pair = { commentId: id, hash: fingerprint(rendered) };
  if (completeHead.commit === `${pair.commentId}:${pair.hash}`) {
    return Object.freeze({ status: 'no-op', event, head: completeHead });
  }
  const nextHead = {
    ...completeHead,
    definition: definition ?? completeHead.definition,
    commit: `${pair.commentId}:${pair.hash}`,
    audit: `${pair.commentId}:${pair.hash}`,
    actions: {
      ...completeHead.actions,
      [actionId]: {
        ...pair,
        attemptId,
        phase,
      },
    },
  };
  const advanced = await advanceActionLedgerHead({
    issue,
    repo: repository,
    expectedHead: bodyHead,
    nextHead,
    deps,
  });
  return Object.freeze({ status, event, head: advanced.head, advanced });
}

export async function recoverOrphanedEvent({
  expectedEventId,
  listCommentsPage,
  parseCandidate = (comment) => {
    try {
      return parseEventComment(commentBody(comment));
    } catch {
      return null;
    }
  },
  onCandidate,
  matchesCandidate = () => true,
} = {}) {
  const matches = [];
  let cursor = null;
  try {
    do {
      const page = await listCommentsPage({ cursor });
      for (const comment of page.comments ?? []) {
        const candidate = parseCandidate(comment);
        if (candidate?.eventId === expectedEventId && matchesCandidate(candidate, comment)) {
          matches.push({ candidate, comment });
        }
      }
      cursor = page.nextCursor ?? null;
    } while (cursor);
  } catch {
    return Object.freeze({ status: 'paused', reason: 'ledger-orphan-scan-interrupted' });
  }
  if (matches.length === 0) {
    return Object.freeze({ status: 'damaged', reason: 'ledger-orphan-missing' });
  }
  if (matches.length !== 1) {
    return Object.freeze({ status: 'damaged', reason: 'ledger-orphan-ambiguous' });
  }
  if (onCandidate) await onCandidate(matches[0]);
  return Object.freeze({ status: 'recovered', ...matches[0] });
}

export async function auditActionLedger({ listCommentsPage, inspectComment, onPage } = {}) {
  const records = [];
  let cursor = null;
  do {
    const page = await listCommentsPage({ cursor });
    onPage?.(page);
    for (const comment of page.comments ?? []) {
      records.push(inspectComment ? inspectComment(comment) : comment);
    }
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return Object.freeze({ status: 'complete', records: Object.freeze(records) });
}

function renderProtectedRecord(marker, record) {
  return (
    'AITM resident-action recovery evidence. Do not edit or delete this comment.\n' +
    `<!-- ${marker} data="${encodeCanonical(record)}" -->`
  );
}

export async function reconcileActionLedger({
  issue,
  head,
  affectedActionIds = [],
  evidence = {},
  approvedBy,
  reason,
  deps = {},
} = {}) {
  if (!approvedBy || !reason) throw new Error('human-approval-required');
  const operation = async () => {
    const correction = Object.freeze({
      schema: RESIDENT_ACTION_CORRECTION_SCHEMA,
      issue: issue ?? null,
      approvedBy,
      reason,
      priorHead: head,
      evidence,
      ts: new Date(deps.now?.() ?? Date.now()).toISOString(),
    });
    const body = renderProtectedRecord('aitm-resident-action-ledger-correction', correction);
    const created = await deps.createComment(issue, body);
    const id = commentId(created);
    const verified = await deps.readComment(issue, id);
    if (commentBody(verified) !== body) throw new Error('ledger-correction-verification-failed');
    const correctionPair = `${id}:${fingerprint(body)}`;
    const actions = { ...(head.actions ?? {}) };
    for (const actionId of affectedActionIds) {
      if (actions[actionId]) actions[actionId] = { ...actions[actionId], proof: 'unproven' };
    }
    const nextHead = { ...head, commit: correctionPair, audit: correctionPair, actions };
    if (deps.advanceHead) await deps.advanceHead({ expectedHead: head, nextHead, correction });
    return Object.freeze({ status: 'reconciled', correction, head: nextHead, commentId: id });
  };
  return deps.withIssueLock
    ? deps.withIssueLock({ issue, purpose: 'action-ledger-reconcile' }, operation)
    : operation();
}

export async function recordLedgerDamageCarry({ issue, snapshot, movementIntent, deps = {} } = {}) {
  const record = Object.freeze({
    schema: RESIDENT_ACTION_DAMAGE_CARRY_SCHEMA,
    issue,
    snapshotFingerprint: fingerprint(snapshot),
    movementIntent,
    ts: new Date(deps.now?.() ?? Date.now()).toISOString(),
  });
  const body = renderProtectedRecord('aitm-resident-action-ledger-damage-carry', record);
  const created = await deps.createComment(issue, body);
  const id = commentId(created);
  if (commentBody(await deps.readComment(issue, id)) !== body) {
    throw new Error('ledger-damage-carry-verification-failed');
  }
  return Object.freeze({ record, commentId: id });
}

export async function collectSupersededSpillHeads({
  candidateCommentId,
  successorCommentId,
  readIssueBody,
  readComment,
  deleteComment,
} = {}) {
  const bodyHead = parseBodyLedgerHead(await readIssueBody());
  if (bodyHead?.mode === 'spill') {
    const current = parseCommentPair(bodyHead.head);
    if (current.commentId === String(candidateCommentId)) {
      return Object.freeze({ status: 'retained', reason: 'spill-head-current', warnings: [] });
    }
  }
  const candidate = await readComment?.(candidateCommentId);
  try {
    if (!candidate || !parseSpillHeadComment(commentBody(candidate))) {
      return Object.freeze({
        status: 'retained',
        reason: 'spill-candidate-unverified',
        warnings: [],
      });
    }
  } catch {
    return Object.freeze({
      status: 'retained',
      reason: 'spill-candidate-unverified',
      warnings: [],
    });
  }
  const successor = successorCommentId ? await readComment?.(successorCommentId) : null;
  try {
    if (!successor || !parseSpillHeadComment(commentBody(successor))) {
      return Object.freeze({
        status: 'retained',
        reason: 'spill-successor-unverified',
        warnings: [],
      });
    }
  } catch {
    return Object.freeze({
      status: 'retained',
      reason: 'spill-successor-unverified',
      warnings: [],
    });
  }
  try {
    await deleteComment(candidateCommentId);
    return Object.freeze({ status: 'collected', warnings: [] });
  } catch (error) {
    return Object.freeze({
      status: 'retained',
      warnings: Object.freeze([
        Object.freeze({
          code: 'orphaned-spill-snapshot',
          commentId: String(candidateCommentId),
          message: error.message,
        }),
      ]),
    });
  }
}
