// @story #1720

import {
  canonicalJson,
  decodeCanonical,
  encodeCanonical,
  fingerprint,
} from './resident-action-ledger-codec.mjs';
import { PLAN_APPROVED_RE, parsePlanApprovedMarker, stripFencedCodeBlocks } from './markers.mjs';
import { resolveGate } from './gate-resolve.mjs';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import { parseEntryMarkers } from './stage-entry-grammar.mjs';
import { readMoveCompleteMarker } from './move-state/sentinel.mjs';

export const PLAN_TRANSITION_AUTHORITY_SCHEMA = 'aitm.plan-transition-authority/v1';
export const PLAN_TRANSITION_AUTHORITY_EXIT = 9;

const COMMENT_RE =
  /<!--\s*aitm-plan-transition-authority\s+id="([^"]+)"\s+data="([A-Za-z0-9_-]+)"\s*-->/i;
const WRAPPER_ID_RE = /<!--\s*aitm-plan-transition-authority\b[^>]*\bid="([^"]+)"[^>]*-->/i;
const TRANSITION_ID_RE = /^move:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY_RE = /^[^/\s]+\/[^/\s]+$/;
const OUTCOMES = new Set(['satisfied', 'waived', 'not-required']);

function fail(field) {
  throw new TypeError(`plan-transition-authority:${field}`);
}

function exactKeys(value, keys, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(field);
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) fail(field);
}

function canonicalInstant(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(Date.parse(value)).toISOString() === value
  );
}

function validateEvidence(outcome, evidence) {
  if (outcome === 'satisfied') {
    exactKeys(
      evidence,
      ['kind', 'markerFingerprint', 'mode', 'trunkSha', 'ts'],
      'satisfied-evidence'
    );
    if (evidence.kind !== 'plan-approved-marker') fail('satisfied-kind');
    if (!SHA256_RE.test(evidence.markerFingerprint)) fail('marker-fingerprint');
    if (!['human', 'full-auto', 'unknown'].includes(evidence.mode)) fail('approval-mode');
    requiredString(evidence.ts, 'approval-ts');
    if (evidence.trunkSha !== null && !/^[0-9a-f]{40}$/.test(evidence.trunkSha)) {
      fail('approval-trunk-sha');
    }
    return;
  }
  if (outcome === 'waived') {
    exactKeys(
      evidence,
      ['kind', 'recordId', 'reference', 'revision', 'verificationLevel'],
      'waived-evidence'
    );
    if (evidence.kind !== 'workflow-exception') fail('waived-kind');
    if (!RECORD_ID_RE.test(evidence.recordId)) fail('waiver-record-id');
    if (!Number.isSafeInteger(evidence.revision) || evidence.revision <= 0) fail('waiver-revision');
    requiredString(evidence.reference, 'waiver-reference');
    requiredString(evidence.verificationLevel, 'waiver-verification-level');
    return;
  }
  exactKeys(evidence, ['gate', 'kind', 'required'], 'not-required-evidence');
  if (
    evidence.kind !== 'gate-policy' ||
    evidence.gate !== 'analysisToDevelopment' ||
    evidence.required !== false
  ) {
    fail('not-required-policy');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateRecord(record) {
  exactKeys(
    record,
    [
      'evidence',
      'issue',
      'outcome',
      'recordedAt',
      'repository',
      'requirementId',
      'schema',
      'scopeIdentity',
      'source',
      'target',
      'transitionId',
    ],
    'record'
  );
  if (record.schema !== PLAN_TRANSITION_AUTHORITY_SCHEMA) fail('schema');
  if (!TRANSITION_ID_RE.test(record.transitionId)) fail('transition-id');
  if (!REPOSITORY_RE.test(record.repository)) fail('repository');
  if (!Number.isSafeInteger(record.issue) || record.issue <= 0) fail('issue');
  if (record.source !== 'plan' || record.target !== 'develop') fail('edge');
  if (record.requirementId !== 'approval.plan') fail('requirement');
  if (!OUTCOMES.has(record.outcome)) fail('outcome');
  if (!SHA256_RE.test(record.scopeIdentity)) fail('scope-identity');
  if (!canonicalInstant(record.recordedAt)) fail('recorded-at');
  validateEvidence(record.outcome, record.evidence);
  return deepFreeze(JSON.parse(canonicalJson(record)));
}

function resolvedScopeIdentity({ repository, issue, body, workflowPolicy, scopeIdentity }) {
  const candidate = workflowPolicy?.scopeIdentity ?? scopeIdentity;
  return candidate ?? computeScopeIdentity({ repository, issue, body });
}

export function resolvePlanTransitionAuthority({
  repository,
  issue,
  transitionId,
  body = '',
  workflowPolicy = null,
  sessionPolicy = null,
  cfg = {},
  scopeIdentity = null,
  recordedAt = new Date().toISOString(),
} = {}) {
  const common = {
    schema: PLAN_TRANSITION_AUTHORITY_SCHEMA,
    transitionId,
    repository,
    issue: Number(issue),
    source: 'plan',
    target: 'develop',
    requirementId: 'approval.plan',
    scopeIdentity: resolvedScopeIdentity({
      repository,
      issue,
      body,
      workflowPolicy,
      scopeIdentity,
    }),
    recordedAt,
  };
  const decision = workflowPolicy?.decision?.('approval.plan');
  if (decision?.outcome === 'waived') {
    return validateRecord({
      ...common,
      outcome: 'waived',
      evidence: {
        kind: 'workflow-exception',
        recordId: decision.authority?.recordId,
        revision: decision.authority?.revision,
        reference: decision.authority?.reference,
        verificationLevel: decision.authority?.verificationLevel,
      },
    });
  }

  const required = resolveGate('analysisToDevelopment', {
    session: sessionPolicy,
    projectConfig: cfg,
  });
  if (!required) {
    return validateRecord({
      ...common,
      outcome: 'not-required',
      evidence: {
        kind: 'gate-policy',
        gate: 'analysisToDevelopment',
        required: false,
      },
    });
  }

  const approved = parsePlanApprovedMarker(body);
  const marker = stripFencedCodeBlocks(body).match(PLAN_APPROVED_RE)?.[0] ?? null;
  if (!approved || !marker) fail('approval-missing');
  return validateRecord({
    ...common,
    outcome: 'satisfied',
    evidence: {
      kind: 'plan-approved-marker',
      markerFingerprint: fingerprint(marker),
      mode: approved.mode,
      trunkSha: approved.trunkSha,
      ts: approved.ts,
    },
  });
}

export function renderPlanTransitionAuthorityComment(record) {
  const valid = validateRecord(record);
  return [
    'AITM Plan transition authority. Do not edit or delete this comment.',
    'This record is historical; current workflow policy is evaluated separately.',
    `<!-- aitm-plan-transition-authority id="${valid.transitionId}" data="${encodeCanonical(valid)}" -->`,
  ].join('\n');
}

export function parsePlanTransitionAuthorityComment(body) {
  const match = COMMENT_RE.exec(String(body || ''));
  if (!match) fail('marker');
  const record = validateRecord(decodeCanonical(match[2]));
  if (match[1] !== record.transitionId) fail('id-mismatch');
  return record;
}

export function readPlanTransitionAuthorityWrapperId(body) {
  return WRAPPER_ID_RE.exec(String(body || ''))?.[1] ?? null;
}

export function classifyCompletedPlanTransitionAuthority({ record, issueBody = '' } = {}) {
  const valid = validateRecord(record);
  const developEntries = parseEntryMarkers(issueBody).filter((entry) => entry.state === 'develop');
  const sentinel = readMoveCompleteMarker(issueBody);
  const matchingEntry = developEntries.some((entry) => entry.move === valid.transitionId);
  const matchingSentinel = sentinel?.state === 'develop' && sentinel?.move === valid.transitionId;
  if (matchingEntry && matchingSentinel) {
    return Object.freeze({ status: 'completed', record: valid, diagnostics: Object.freeze([]) });
  }
  if (developEntries.length === 0 && sentinel === null) {
    return Object.freeze({
      status: 'pending',
      record: valid,
      diagnostics: Object.freeze(['completion-evidence-missing']),
    });
  }
  return Object.freeze({
    status: 'mismatch',
    record: valid,
    diagnostics: Object.freeze([
      ...(matchingEntry ? [] : ['develop-entry-transition-mismatch']),
      ...(matchingSentinel ? [] : ['move-complete-transition-mismatch']),
    ]),
  });
}

function commentId(comment) {
  const id = comment?.id ?? comment?.databaseId ?? comment?.commentId;
  if (id == null) throw new Error('plan-transition-authority:comment-id-missing');
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

async function defaultFetchScopeBody(ctx) {
  const { stdout } = await ctx.pexec(
    'gh',
    ['issue', 'view', String(ctx.issueArg), '-R', ctx.cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: 15_000 }
  );
  return String(stdout);
}

export async function verifyPlanTransitionAuthorityScope(ctx) {
  const record = ctx.planTransitionAuthority?.record;
  if (!record) throw new Error('plan-transition-authority:verified-record-missing');
  if (ctx.SKIP_NETWORK) return Object.freeze({ verified: true, skipped: true });
  const fetchBody =
    ctx.deps?.fetchPlanTransitionAuthorityScopeBody || (() => defaultFetchScopeBody(ctx));
  const body = await fetchBody();
  const observed = computeScopeIdentity({
    repository: ctx.cfg?.repo,
    issue: Number(ctx.issueArg),
    body,
  });
  if (observed !== record.scopeIdentity) {
    throw new Error('plan-transition-authority:scope-drift');
  }
  return Object.freeze({ verified: true, scopeIdentity: observed });
}

function verifiedResult({ comment, body, record, reconciled = false }) {
  const id = commentId(comment);
  const foundBody = commentBody(comment);
  if (foundBody !== body || fingerprint(foundBody) !== fingerprint(body)) {
    throw new Error('plan-transition-authority:readback-mismatch');
  }
  const verified = parsePlanTransitionAuthorityComment(foundBody);
  if (verified.transitionId !== record.transitionId) {
    throw new Error('plan-transition-authority:readback-identity');
  }
  return Object.freeze({ verified: true, reconciled, commentId: id, record: verified, body });
}

export async function writePlanTransitionAuthority(ctx) {
  const input = ctx.planTransitionAuthorityInput;
  if (!input) throw new Error('plan-transition-authority:input-missing');
  const record = resolvePlanTransitionAuthority({
    repository: ctx.cfg?.repo,
    issue: Number(ctx.issueArg),
    transitionId: ctx.transitionId,
    cfg: ctx.cfg,
    ...input,
  });
  if (ctx.SKIP_NETWORK) {
    return Object.freeze({ verified: true, skipped: true, record, body: null, commentId: null });
  }
  const body = renderPlanTransitionAuthorityComment(record);
  const create =
    ctx.deps?.createPlanTransitionAuthorityComment || ((value) => defaultCreateComment(ctx, value));
  const read =
    ctx.deps?.readPlanTransitionAuthorityComment || ((id) => defaultReadComment(ctx, id));
  const list = ctx.deps?.listPlanTransitionAuthorityComments || (() => defaultListComments(ctx));
  try {
    const created = await create(body, record);
    const found = await read(commentId(created));
    return verifiedResult({ comment: found, body, record });
  } catch (cause) {
    let comments;
    try {
      comments = await list();
    } catch (listError) {
      throw new Error('plan-transition-authority:reconciliation-failed', {
        cause: new AggregateError([cause, listError]),
      });
    }
    const exact = (comments || []).filter((comment) => {
      if (commentBody(comment) !== body) return false;
      try {
        return (
          parsePlanTransitionAuthorityComment(commentBody(comment)).transitionId ===
          record.transitionId
        );
      } catch {
        return false;
      }
    });
    if (exact.length === 0) {
      throw new Error('plan-transition-authority:reconciliation-missing', { cause });
    }
    if (exact.length > 1) {
      throw new Error('plan-transition-authority:reconciliation-ambiguous', { cause });
    }
    return verifiedResult({ comment: exact[0], body, record, reconciled: true });
  }
}
