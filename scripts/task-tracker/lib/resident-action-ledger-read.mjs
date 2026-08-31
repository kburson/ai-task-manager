// @story #1117 #1453

import {
  fingerprint,
  parseBodyLedgerHead,
  parseCommentPair,
  parseEventComment,
  parseSpillHeadComment,
} from './resident-action-ledger-codec.mjs';

function diagnostic(code, details = {}) {
  return Object.freeze({ code, ...details });
}

function result({
  status,
  head = null,
  events = [],
  diagnostics = [],
  truncated = false,
  visitStatus = head ? 'unclassified' : 'empty',
}) {
  return Object.freeze({
    status,
    head,
    events: Object.freeze(events),
    diagnostics: Object.freeze(diagnostics),
    truncated,
    visitStatus,
  });
}

function commentBody(comment) {
  if (typeof comment === 'string') return comment;
  return comment?.body ?? null;
}

async function readVerifiedComment(readComment, expected) {
  let comment;
  try {
    comment = await readComment(expected.commentId);
  } catch (error) {
    if (error?.status === 404 || error?.code === 'ENOENT' || error?.code === 'NOT_FOUND') {
      return { status: 'missing' };
    }
    return { status: 'error', error };
  }
  const body = commentBody(comment);
  if (body == null) return { status: 'missing' };
  if (expected.hash && fingerprint(body) !== expected.hash) {
    return { status: 'altered', actual: fingerprint(body), body };
  }
  return { status: 'ok', body, comment };
}

async function resolveSpillHead({ bodyHead, readComment, rereadBody }) {
  let selected = bodyHead;
  let expected = parseCommentPair(selected.head);
  let read = await readVerifiedComment(readComment, expected);
  if (read.status !== 'missing') return { selected, expected, read };

  if (typeof rereadBody !== 'function') return { selected, expected, read };
  const freshBody = await rereadBody();
  let fresh;
  try {
    fresh = parseBodyLedgerHead(freshBody);
  } catch (error) {
    return { selected, expected, read: { status: 'malformed-fresh-body', error } };
  }
  if (!fresh) return { selected, expected, read: { status: 'head-disappeared' } };
  if (fresh.mode === 'inline') return { selected: fresh, expected: null, read: null };
  if (fresh.head === selected.head) return { selected, expected, read };

  selected = fresh;
  expected = parseCommentPair(selected.head);
  read = await readVerifiedComment(readComment, expected);
  return { selected, expected, read };
}

function damaged(code, details = {}) {
  return result({ status: 'damaged', diagnostics: [diagnostic(code, details)] });
}

export async function readResidentActionLedger({
  body,
  readComment,
  rereadBody,
  stateVisitId,
  actionId,
  maxLinks = 3,
} = {}) {
  if (typeof readComment !== 'function') {
    throw new TypeError('readResidentActionLedger: readComment is required');
  }
  const linkLimit = Math.min(3, Math.max(0, Number(maxLinks) || 0));

  let bodyHead;
  try {
    bodyHead = parseBodyLedgerHead(body);
  } catch (error) {
    return damaged('body-head-malformed', { message: error.message });
  }
  if (!bodyHead) return result({ status: 'clean' });

  let head = bodyHead;
  if (bodyHead.mode === 'spill') {
    let resolved;
    try {
      resolved = await resolveSpillHead({ bodyHead, readComment, rereadBody });
    } catch (error) {
      return damaged('spill-head-read-failed', { message: error.message });
    }
    if (resolved.selected.mode === 'inline') {
      head = resolved.selected;
    } else if (resolved.read?.status === 'missing') {
      return damaged('spill-head-missing', { commentId: resolved.expected.commentId });
    } else if (resolved.read?.status === 'altered') {
      return damaged('spill-head-altered', { commentId: resolved.expected.commentId });
    } else if (resolved.read?.status !== 'ok') {
      return damaged('spill-head-unavailable', {
        commentId: resolved.expected?.commentId,
        reason: resolved.read?.status,
      });
    } else {
      try {
        head = parseSpillHeadComment(resolved.read.body);
      } catch (error) {
        return damaged('spill-head-malformed', {
          commentId: resolved.expected.commentId,
          message: error.message,
        });
      }
    }
  }

  const diagnostics = [];
  const visitStatus = !stateVisitId || head.visit === stateVisitId ? 'current' : 'different';
  if (stateVisitId && head.visit !== stateVisitId) {
    diagnostics.push(
      diagnostic('ledger-visit-different', { head: head.visit, current: stateVisitId })
    );
  }
  if (!actionId || !head.actions?.[actionId]) {
    return result({ status: 'clean', head, diagnostics, visitStatus });
  }

  const actionHead = head.actions[actionId];
  let expected = {
    commentId: String(actionHead.commentId || ''),
    hash: actionHead.hash || null,
  };
  if (!expected.commentId) return damaged('action-head-malformed', { actionId });

  const events = [];
  for (let index = 0; index < linkLimit && expected.commentId; index += 1) {
    const read = await readVerifiedComment(readComment, expected);
    if (read.status === 'missing') {
      return damaged('action-event-missing', { actionId, commentId: expected.commentId });
    }
    if (read.status === 'altered') {
      return damaged('action-event-altered', { actionId, commentId: expected.commentId });
    }
    if (read.status !== 'ok') {
      return damaged('action-event-read-failed', {
        actionId,
        commentId: expected.commentId,
        message: read.error?.message,
      });
    }
    let event;
    try {
      event = parseEventComment(read.body);
    } catch (error) {
      return damaged('action-event-malformed', {
        actionId,
        commentId: expected.commentId,
        message: error.message,
      });
    }
    if (
      event.actionId !== actionId ||
      event.stateVisitId !== head.visit ||
      event.attemptId !== actionHead.attemptId
    ) {
      return damaged('action-event-identity', { actionId, commentId: expected.commentId });
    }
    events.push(event);
    expected = {
      commentId: event.actionPreviousCommentId || '',
      hash: event.actionPreviousHash || null,
    };
  }

  return result({
    status: 'clean',
    head,
    events,
    diagnostics,
    truncated: Boolean(expected.commentId),
    visitStatus,
  });
}
