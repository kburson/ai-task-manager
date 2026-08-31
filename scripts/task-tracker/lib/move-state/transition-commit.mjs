// @story #1117 #1461

import { createHash, randomUUID } from 'node:crypto';

import {
  canonicalJson,
  decodeCanonical,
  encodeCanonical,
  fingerprint,
} from '../resident-action-ledger-codec.mjs';

export const TRANSITION_COMMIT_SCHEMA = 'aitm.transition-commit/v1';

const COMMENT_RE = /<!--\s*aitm-transition-commit\s+id="([^"]+)"\s+data="([A-Za-z0-9_-]+)"\s*-->/i;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;

function requiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`transition-commit:${field}`);
  }
}

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('transition-commit:record');
  }
  if (record.schema !== TRANSITION_COMMIT_SCHEMA) {
    throw new TypeError('transition-commit:schema');
  }
  for (const field of [
    'transitionId',
    'repository',
    'source',
    'target',
    'visitMarker',
    'actor',
    'sentinelFingerprint',
  ]) {
    requiredString(record[field], field);
  }
  if (!Number.isInteger(record.issue) || record.issue < 1) {
    throw new TypeError('transition-commit:issue');
  }
  if (!SHA256_RE.test(record.sentinelFingerprint)) {
    throw new TypeError('transition-commit:sentinel-fingerprint');
  }
  return Object.freeze(JSON.parse(canonicalJson(record)));
}

export function createTransitionId({ randomUUIDFn = randomUUID } = {}) {
  const value = randomUUIDFn();
  requiredString(value, 'random-id');
  return `move:${value}`;
}

export function deterministicBackfillTransitionId({
  repository,
  issue,
  state,
  visit,
  occurrence,
} = {}) {
  requiredString(repository, 'repository');
  requiredString(state, 'state');
  if (!Number.isInteger(Number(issue)) || Number(issue) < 1) {
    throw new TypeError('transition-commit:issue');
  }
  for (const [field, value] of [
    ['visit', visit],
    ['occurrence', occurrence],
  ]) {
    if (!Number.isInteger(Number(value)) || Number(value) < 1) {
      throw new TypeError(`transition-commit:${field}`);
    }
  }
  const tuple = canonicalJson({
    repository,
    issue: Number(issue),
    state,
    visit: Number(visit),
    occurrence: Number(occurrence),
  });
  return `backfill:${createHash('sha256').update(tuple).digest('hex')}`;
}

export function renderTransitionCommitComment(record) {
  const valid = validateRecord(record);
  return [
    'AITM transition provenance. Do not edit or delete this comment.',
    'Use the governed movement repair path if correction is required.',
    `<!-- aitm-transition-commit id="${valid.transitionId}" data="${encodeCanonical(valid)}" -->`,
  ].join('\n');
}

export function parseTransitionCommitComment(body) {
  const match = COMMENT_RE.exec(String(body || ''));
  if (!match) throw new TypeError('transition-commit:marker');
  const record = validateRecord(decodeCanonical(match[2]));
  if (match[1] !== record.transitionId) throw new TypeError('transition-commit:id-mismatch');
  return record;
}

function commentId(created) {
  const id = created?.id ?? created?.databaseId ?? created?.commentId;
  if (id == null) throw new Error('transition-commit:comment-id-missing');
  return String(id);
}

function commentBody(comment) {
  return typeof comment === 'string' ? comment : comment?.body;
}

async function defaultCreateComment(ctx, body) {
  const { stdout } = await ctx.pexec(
    'gh',
    [
      'api',
      `repos/${ctx.cfg.repo}/issues/${ctx.issueArg}/comments`,
      '--method',
      'POST',
      '-f',
      `body=${body}`,
    ],
    { timeout: 15_000 }
  );
  return JSON.parse(stdout);
}

async function defaultReadComment(ctx, id) {
  const { stdout } = await ctx.pexec('gh', ['api', `repos/${ctx.cfg.repo}/issues/comments/${id}`], {
    timeout: 15_000,
  });
  return JSON.parse(stdout);
}

async function defaultListComments(ctx) {
  const { stdout } = await ctx.pexec(
    'gh',
    ['api', '--paginate', '--slurp', `repos/${ctx.cfg.repo}/issues/${ctx.issueArg}/comments`],
    { timeout: 30_000 }
  );
  return JSON.parse(stdout || '[]').flat();
}

function transitionRecord(ctx, evidence = {}) {
  const visitMarker = evidence.visitMarker ?? ctx.transitionEvidence?.visitMarker;
  const sentinelMarker = evidence.sentinelMarker ?? ctx.transitionEvidence?.sentinelMarker;
  return validateRecord({
    schema: TRANSITION_COMMIT_SCHEMA,
    transitionId: ctx.transitionId,
    repository: ctx.cfg.repo,
    issue: Number(ctx.issueArg),
    source: ctx.resolvedFromState || 'unknown',
    target: ctx.stateArg,
    visitMarker,
    actor: ctx.actor || process.env.GITHUB_ACTOR || process.env.USER || 'aitm',
    sentinelFingerprint: fingerprint(sentinelMarker),
  });
}

export async function writeTransitionCommit(ctx, evidence = {}) {
  if (ctx.SKIP_NETWORK) return Object.freeze({ verified: true, skipped: true });
  const record = transitionRecord(ctx, evidence);
  const body = renderTransitionCommitComment(record);
  const create = ctx.deps?.createTransitionComment || ((value) => defaultCreateComment(ctx, value));
  const read = ctx.deps?.readTransitionComment || ((id) => defaultReadComment(ctx, id));
  const created = await create(body, record);
  const id = commentId(created);
  const found = await read(id);
  const foundBody = commentBody(found);
  if (foundBody !== body || fingerprint(foundBody) !== fingerprint(body)) {
    throw new Error('transition-commit:readback-mismatch');
  }
  const verified = parseTransitionCommitComment(foundBody);
  if (verified.transitionId !== ctx.transitionId) {
    throw new Error('transition-commit:readback-identity');
  }
  return Object.freeze({ verified: true, commentId: id, record: verified, body });
}

export async function repairTransitionCommit(ctx) {
  if (ctx.SKIP_NETWORK || ctx.transitionCommit?.verified) {
    return Object.freeze({ status: 'no-op' });
  }
  if (
    !ctx.transitionId ||
    !ctx.transitionEvidence?.visitMarker ||
    !ctx.transitionEvidence?.sentinelMarker
  ) {
    return Object.freeze({ status: 'unavailable' });
  }
  const list = ctx.deps?.listTransitionComments || (() => defaultListComments(ctx));
  const comments = await list();
  for (const comment of comments || []) {
    try {
      const record = parseTransitionCommitComment(commentBody(comment));
      if (record.transitionId === ctx.transitionId) {
        return Object.freeze({ status: 'already-present', commentId: commentId(comment), record });
      }
    } catch {
      // Unrelated or malformed comments are not candidates for this repair.
    }
  }
  const written = await writeTransitionCommit(ctx, ctx.transitionEvidence);
  ctx.transitionCommit = written;
  return Object.freeze({ status: 'repaired', ...written });
}

function ordinalRelation(current, head) {
  const fields = ['occurrence', 'visit'];
  for (const field of fields) {
    if (!Number.isInteger(Number(current?.[field])) || !Number.isInteger(Number(head?.[field]))) {
      return 'unknown';
    }
  }
  if (head.occurrence >= current.occurrence) return 'contradiction';
  if (head.state === current.state && head.visit >= current.visit) return 'contradiction';
  return 'prior';
}

function verifiedCommentId(commit) {
  if (!commit || commit.verified === false) return null;
  const value = Number(commit.commentId ?? commit.id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function classifyVisitOrder({ current, head, currentCommit, headCommit } = {}) {
  if (!current || !head) return Object.freeze({ status: 'drift', diagnostics: ['visit-missing'] });
  if (current.id === head.id) return Object.freeze({ status: 'current', diagnostics: [] });
  const fallback = ordinalRelation(current, head);
  if (fallback !== 'prior') {
    return Object.freeze({ status: 'drift', diagnostics: ['visit-order-contradiction'] });
  }
  const currentCommentId = verifiedCommentId(currentCommit);
  const headCommentId = verifiedCommentId(headCommit);
  if (currentCommentId == null || headCommentId == null) {
    return Object.freeze({ status: 'prior', diagnostics: ['commit-provenance-missing'] });
  }
  if (headCommentId >= currentCommentId) {
    return Object.freeze({ status: 'drift', diagnostics: ['commit-order-contradiction'] });
  }
  return Object.freeze({ status: 'prior', diagnostics: [] });
}
