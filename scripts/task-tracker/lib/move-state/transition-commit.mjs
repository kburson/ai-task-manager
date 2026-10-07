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

const stageCensusContexts = new WeakMap();
const stageCensusResults = new WeakMap();
function freezeCensus(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeCensus); Object.freeze(value);
  }
  return value;
}
function parseCommentPages(response) {
  const pages = JSON.parse(response.stdout || '[]');
  return { pages, result: pages.flat() };
}
function qualifyStageCommentCensus({ pages, result }, input, retained, refuse) {
  if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) refuse();
  const ids = new Set(), nodes = new Map();
  for (const comment of result) {
    if (!comment || !Number.isSafeInteger(comment.id) || comment.id < 1 || ids.has(comment.id) ||
        typeof comment.node_id !== 'string' || !comment.node_id || nodes.has(comment.node_id) ||
        typeof comment.body !== 'string' || comment.issue_url !==
          `https://api.github.com/repos/${input.repository}/issues/${input.issue}`) refuse();
    ids.add(comment.id); nodes.set(comment.node_id, comment.body);
  }
  if (retained.some(comment => !nodes.has(comment.id) || nodes.get(comment.id) !== comment.body)) refuse();
  return result;
}
async function defaultListComments(ctx) {
  const native = stageCensusContexts.get(ctx);
  let response;
  if (native) response = native.read.response;
  else response = await ctx.pexec(
    'gh',
    ['api', '--paginate', '--slurp', `repos/${ctx.cfg.repo}/issues/${ctx.issueArg}/comments`],
    { timeout: 30_000 }
  );
  const { pages, result } = parseCommentPages(response); // ONE ordinary native page parser/order.
  if (native) stageCensusResults.set(result, { ...native, pages });
  return result;
}

// Original default invocation DATA only. The private context has no caller
// pexec/list helper, and neither it nor a read port is returned.
export async function readNativeStageCommentCensus(input) {
  const { readNativeStageCommentRead, RevisionPolicyError } = await import('../criteria-revision/policy.mjs');
  const refuse = () => { throw new RevisionPolicyError({ status: 'indeterminate', code: 'revision-authority-unavailable',
    noAutomaticRemediation: { reason: 'authority-investigation-required' } }); };
  const native = readNativeStageCommentRead(input);
  if (!native) return null;
  if (native.read.response.exitCode !== 0 || native.read.response.stderr !== '') refuse();
  const ctx = { cfg: { repo: input.repository }, issueArg: input.issue };
  stageCensusContexts.set(ctx, native);
  try {
    let result;
    try { result = await defaultListComments(ctx); } catch { refuse(); }
    const captured = stageCensusResults.get(result);
    if (!captured || canonicalJson(readNativeStageCommentRead(input)) !== canonicalJson(native) ||
        !Array.isArray(captured.pages) || captured.pages.some(page => !Array.isArray(page))) refuse();
    qualifyStageCommentCensus({ pages: captured.pages, result }, input, native.retained, refuse);
    return freezeCensus(result);
  } finally { stageCensusContexts.delete(ctx); }
}
export function readNativeStageCommentCensusData(result) {
  const captured = stageCensusResults.get(result);
  return captured && Object.isFrozen(result) ? freezeCensus(structuredClone(captured.read)) : null;
}

// Retained raw DATA cannot acquire current read membership or authorize writes.
export async function deriveRecordedStageCommentCensus(value) {
  const { exactKeys, revisionError } = await import('../criteria-revision/schema.mjs');
  try {
    canonicalJson(value);
    exactKeys(value, ['observation', 'lifecycleSources', 'retained']);
    const { assertNativeLifecycleSourceData } = await import('../criteria-revision/store.mjs');
    assertNativeLifecycleSourceData({ source: value.lifecycleSources, observation: value.observation });
    if (!Array.isArray(value.retained)) throw new TypeError();
    for (const comment of value.retained) {
      exactKeys(comment, ['id', 'body']);
      if (typeof comment.id !== 'string' || !comment.id || typeof comment.body !== 'string') throw new TypeError();
    }
    const pair = value.lifecycleSources.remote.stageComments;
    if (!pair || pair.response.exitCode !== 0 || pair.response.stderr !== '') throw new TypeError();
    const refuse = () => { throw new TypeError(); };
    return freezeCensus(qualifyStageCommentCensus(parseCommentPages(pair.response),
      value.observation, value.retained, refuse));
  } catch { revisionError('native-stage-comment-data'); }
}

// Native record DATA shared by current publication and original stage replay.
// This does not authenticate the supplied actor, markers, or execution.
export function deriveTransitionCommitRecord({ transitionId, repository, issue,
  source, target, visitMarker, actor, sentinelMarker }) {
  return validateRecord({ schema: TRANSITION_COMMIT_SCHEMA, transitionId, repository,
    issue, source, target, visitMarker, actor, sentinelFingerprint: fingerprint(sentinelMarker) });
}

function selectTransitionActor(actor, githubActor, user) {
  return actor || githubActor || user || 'aitm';
}
// Retained environment DATA only; original/current identity requires separate
// native capture. Empty and absent values preserve the ordinary fallback.
export function deriveRecordedTransitionActor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'githubActor,user' ||
      Object.values(input).some(value => value !== null && typeof value !== 'string'))
    throw new TypeError('recorded-transition-actor');
  return selectTransitionActor(undefined, input.githubActor, input.user);
}

function transitionRecord(ctx, evidence = {}) {
  const visitMarker = evidence.visitMarker ?? ctx.transitionEvidence?.visitMarker;
  const sentinelMarker = evidence.sentinelMarker ?? ctx.transitionEvidence?.sentinelMarker;
  return deriveTransitionCommitRecord({
    transitionId: ctx.transitionId,
    repository: ctx.cfg.repo,
    issue: Number(ctx.issueArg),
    source: ctx.resolvedFromState || 'unknown',
    target: ctx.stateArg,
    visitMarker,
    actor: selectTransitionActor(ctx.actor, process.env.GITHUB_ACTOR, process.env.USER),
    sentinelMarker,
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
