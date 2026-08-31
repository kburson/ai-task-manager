// @story #1117 #1453

import { createHash } from 'node:crypto';

export const RESIDENT_ACTION_EVENT_SCHEMA = 'aitm.resident-action-event/v1';
export const RESIDENT_ACTION_HEAD_SCHEMA = 'aitm.resident-action-head/v1';
export const EVENT_COMMENT_BYTE_LIMIT = 4 * 1024;
export const SPILL_HEAD_COMMENT_BYTE_LIMIT = 60 * 1024;

const EVENT_PHASES = new Set(['intent', 'waiting', 'resolved', 'failed']);
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const ACTION_ID_RE = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const ACTION_LIMIT = 96;
const ACTION_ENTRY_BYTE_LIMIT = 384;
const BODY_HEAD_RE = /<!--\s*aitm-resident-action-ledger-head\s+([^]*?)-->/i;
const EVENT_RE = /<!--\s*aitm-resident-action-event\s+id="([^"]+)"\s+data="([^"]+)"\s*-->/i;
const SPILL_HEAD_RE = /<!--\s*aitm-resident-action-head\s+id="([^"]+)"\s+data="([^"]+)"\s*-->/i;

export class ResidentActionLedgerCodecError extends Error {
  constructor(code, details = {}) {
    super(`resident-action-ledger-codec:${code}`);
    this.name = 'ResidentActionLedgerCodecError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, details) {
  throw new ResidentActionLedgerCodecError(code, details);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function canonicalJson(value) {
  const json = JSON.stringify(canonicalize(value));
  if (json === undefined) fail('json-value');
  return json;
}

export function fingerprint(value) {
  const bytes = typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalJson(value);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function encodeCanonical(value) {
  return Buffer.from(canonicalJson(value), 'utf8').toString('base64url');
}

export function decodeCanonical(encoded) {
  if (typeof encoded !== 'string' || !BASE64URL_RE.test(encoded)) fail('base64url');
  let parsed;
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch (error) {
    fail('base64url-json', { message: error.message });
  }
  if (encodeCanonical(parsed) !== encoded) fail('base64url-noncanonical');
  return deepFreeze(canonicalize(parsed));
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail('field', { field });
}

function assertNullableString(value, field) {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    fail('field', { field });
  }
}

function assertHash(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return;
  if (typeof value !== 'string' || !SHA256_RE.test(value)) fail('hash', { field });
}

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('event-contract');
  if (event.schema !== RESIDENT_ACTION_EVENT_SCHEMA) fail('event-schema');
  for (const field of ['eventId', 'state', 'stateVisitId', 'actionId', 'ts']) {
    assertString(event[field], field);
  }
  if (!Number.isInteger(event.issue) || event.issue < 1) fail('field', { field: 'issue' });
  if (!Number.isInteger(event.attemptId) || event.attemptId < 1) {
    fail('field', { field: 'attemptId' });
  }
  if (!EVENT_PHASES.has(event.phase)) fail('event-phase', { phase: event.phase });
  if (!event.correlation || typeof event.correlation !== 'object') {
    fail('field', { field: 'correlation' });
  }
  for (const field of ['previousCommentId', 'actionPreviousCommentId']) {
    assertNullableString(event[field], field);
  }
  assertHash(event.previousHash, 'previousHash', { nullable: true });
  assertHash(event.actionPreviousHash, 'actionPreviousHash', { nullable: true });
  if ((event.previousCommentId == null) !== (event.previousHash == null)) {
    fail('predecessor-pair', { field: 'previous' });
  }
  if ((event.actionPreviousCommentId == null) !== (event.actionPreviousHash == null)) {
    fail('predecessor-pair', { field: 'actionPrevious' });
  }
  if (event.deadline != null && Number.isNaN(Date.parse(event.deadline))) {
    fail('field', { field: 'deadline' });
  }
  if (event.attribution != null && !['correlated', 'observed'].includes(event.attribution)) {
    fail('field', { field: 'attribution' });
  }
  if (event.evidenceFingerprint != null) {
    assertHash(event.evidenceFingerprint, 'evidenceFingerprint');
  }
  return deepFreeze(canonicalize(event));
}

function validateActions(actions) {
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) {
    fail('field', { field: 'actions' });
  }
  const entries = Object.entries(actions);
  if (entries.length > ACTION_LIMIT) {
    fail('resident-action-definition-cap', { actual: entries.length, limit: ACTION_LIMIT });
  }
  for (const [actionId, entry] of entries) {
    if (!ACTION_ID_RE.test(actionId)) fail('action-id', { actionId });
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('action-entry', { actionId });
    }
    assertString(entry.commentId, `${actionId}.commentId`);
    assertHash(entry.hash, `${actionId}.hash`);
    if (!Number.isInteger(entry.attemptId) || entry.attemptId < 1) {
      fail('action-entry', { actionId, field: 'attemptId' });
    }
    if (!EVENT_PHASES.has(entry.phase)) fail('action-entry', { actionId, field: 'phase' });
    if (entry.proof != null && entry.proof !== 'unproven') {
      fail('action-entry', { actionId, field: 'proof' });
    }
    const actual = byteLength(canonicalJson({ [actionId]: entry }));
    if (actual > ACTION_ENTRY_BYTE_LIMIT) {
      fail('resident-action-ledger-budget', {
        actionId,
        actual,
        limit: ACTION_ENTRY_BYTE_LIMIT,
      });
    }
  }
  return actions;
}

function validateHead(head) {
  if (!head || typeof head !== 'object' || Array.isArray(head)) fail('head-contract');
  if (head.schema !== RESIDENT_ACTION_HEAD_SCHEMA) fail('head-schema');
  assertString(head.visit, 'visit');
  assertNullableString(head.commit, 'commit');
  assertHash(head.definition, 'definition');
  assertNullableString(head.audit, 'audit');
  validateActions(head.actions);
  return deepFreeze(canonicalize(head));
}

function renderProtectedComment({ warning, marker, id, record, byteLimit }) {
  const encoded = encodeCanonical(record);
  const body = `${warning}\n<!-- ${marker} id="${id}" data="${encoded}" -->`;
  const actual = byteLength(body);
  if (actual > byteLimit) fail('comment-budget', { actual, limit: byteLimit, marker });
  return body;
}

export function renderEventComment(event) {
  const record = validateEvent(event);
  return renderProtectedComment({
    warning:
      'AITM resident-action evidence. Do not edit or delete this comment.\n' +
      'Use `npx aitm action-ledger reconcile #N` if correction is required.',
    marker: 'aitm-resident-action-event',
    id: record.eventId,
    record,
    byteLimit: EVENT_COMMENT_BYTE_LIMIT,
  });
}

export function parseEventComment(body) {
  const match = EVENT_RE.exec(String(body || ''));
  if (!match) fail('event-marker');
  const event = validateEvent(decodeCanonical(match[2]));
  if (match[1] !== event.eventId) fail('event-id-mismatch');
  return event;
}

export function renderSpillHeadComment(head) {
  const record = validateHead(head);
  const id = fingerprint(record);
  return renderProtectedComment({
    warning: 'AITM resident-action head. Do not edit or delete this comment.',
    marker: 'aitm-resident-action-head',
    id,
    record,
    byteLimit: SPILL_HEAD_COMMENT_BYTE_LIMIT,
  });
}

export function parseSpillHeadComment(body) {
  const match = SPILL_HEAD_RE.exec(String(body || ''));
  if (!match) fail('spill-head-marker');
  const head = validateHead(decodeCanonical(match[2]));
  if (match[1] !== fingerprint(head)) fail('spill-head-id-mismatch');
  return head;
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function unescapeAttribute(value) {
  return String(value).replaceAll('&quot;', '"').replaceAll('&amp;', '&');
}

function parseAttributes(source) {
  const attributes = {};
  const re = /([a-z]+)="([^"]*)"/g;
  let match;
  while ((match = re.exec(source)) !== null) attributes[match[1]] = unescapeAttribute(match[2]);
  return attributes;
}

function assertBodyPair(value, field, { nullable = false } = {}) {
  if (nullable && (value === '' || value === null || value === undefined)) return;
  if (!/^([^:]+):sha256:[a-f0-9]{64}$/.test(value)) fail('body-pair', { field });
}

export function renderBodyLedgerHead(head) {
  if (!head || !['inline', 'spill'].includes(head.mode)) fail('body-head-mode');
  assertString(head.visit, 'visit');
  assertBodyPair(head.commit, 'commit', { nullable: true });
  assertBodyPair(head.audit, 'audit', { nullable: true });
  const attributes = [`mode="${head.mode}"`, `visit="${escapeAttribute(head.visit)}"`];
  if (head.commit) attributes.push(`commit="${escapeAttribute(head.commit)}"`);
  if (head.definition) {
    assertHash(head.definition, 'definition');
    attributes.push(`definition="${head.definition}"`);
  }
  if (head.audit) attributes.push(`audit="${escapeAttribute(head.audit)}"`);
  if (head.mode === 'inline') {
    validateActions(head.actions);
    attributes.push(`actions="${encodeCanonical(head.actions)}"`);
  } else {
    assertBodyPair(head.head, 'head');
    attributes.push(`head="${escapeAttribute(head.head)}"`);
  }
  return `<!-- aitm-resident-action-ledger-head ${attributes.join(' ')} -->`;
}

export function parseBodyLedgerHead(body) {
  const match = BODY_HEAD_RE.exec(String(body || ''));
  if (!match) return null;
  const attributes = parseAttributes(match[1]);
  if (!['inline', 'spill'].includes(attributes.mode)) fail('body-head-mode');
  assertString(attributes.visit, 'visit');
  assertBodyPair(attributes.commit, 'commit', { nullable: true });
  assertBodyPair(attributes.audit, 'audit', { nullable: true });
  if (attributes.definition) assertHash(attributes.definition, 'definition');
  if (attributes.mode === 'inline') {
    if (!attributes.actions) fail('field', { field: 'actions' });
    return deepFreeze(
      canonicalize({
        mode: 'inline',
        visit: attributes.visit,
        ...(attributes.commit ? { commit: attributes.commit } : {}),
        ...(attributes.definition ? { definition: attributes.definition } : {}),
        ...(attributes.audit ? { audit: attributes.audit } : {}),
        actions: validateActions(decodeCanonical(attributes.actions)),
      })
    );
  }
  assertBodyPair(attributes.head, 'head');
  return deepFreeze(
    canonicalize({
      mode: 'spill',
      visit: attributes.visit,
      ...(attributes.commit ? { commit: attributes.commit } : {}),
      ...(attributes.audit ? { audit: attributes.audit } : {}),
      head: attributes.head,
    })
  );
}

export function parseCommentPair(pair) {
  const match = /^([^:]+):(sha256:[a-f0-9]{64})$/.exec(String(pair || ''));
  if (!match) fail('comment-pair');
  return Object.freeze({ commentId: match[1], hash: match[2] });
}
