// @story #1210
// Governed, declarative issue-body mutations. Operation files describe a
// transformation; they never contain a complete body snapshot to push.

import { readFileSync } from 'node:fs';

import { parseBodyVersion } from '../lib/body-version.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { stripBodyVersion } from '../lib/versioned-issue-write.mjs';
import { loadState } from '../state.mjs';

const SCHEMA = 'aitm.issue-body-operation/v1';
const COMMON_KEYS = new Set(['schema', 'kind', 'expectedVersion']);
const KIND_KEYS = Object.freeze({
  'replace-exact': new Set([...COMMON_KEYS, 'expected', 'replacement']),
  'replace-section': new Set([...COMMON_KEYS, 'heading', 'expected', 'replacement']),
});

function fail(category, detail = '') {
  throw new Error(`issue-body:${category}${detail ? `: ${detail}` : ''}`);
}

function normalizeIssueNumber(value) {
  const match = String(value || '').match(/^#?(\d+)$/);
  const issueNumber = match ? Number(match[1]) : 0;
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) fail('issue-number');
  return issueNumber;
}

export function parseIssueBodyArgs(argv = []) {
  let issueNumber = null;
  let operationFile = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index]);
    if (/^#?\d+$/.test(arg)) {
      if (issueNumber !== null) fail('duplicate issue-number');
      issueNumber = normalizeIssueNumber(arg);
      continue;
    }
    if (arg === '--operation-file') {
      const value = argv[index + 1];
      if (!value || String(value).startsWith('--') || operationFile !== null) {
        fail('operation-file');
      }
      operationFile = String(value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--operation-file=')) {
      const value = arg.slice('--operation-file='.length);
      if (!value || operationFile !== null) fail('operation-file');
      operationFile = value;
      continue;
    }
    fail('unknown argument', arg);
  }
  if (issueNumber === null) fail('issue-number');
  if (operationFile === null) fail('operation-file');
  return { issueNumber, operationFile };
}

function assertExactKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('unknown key', key);
  }
}

export function parseIssueBodyOperation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('operation');
  if (value.schema !== SCHEMA) fail('schema', `expected ${SCHEMA}`);
  const allowed = KIND_KEYS[value.kind];
  if (!allowed) fail('kind');
  assertExactKeys(value, allowed);
  if (value.expectedVersion !== undefined) {
    if (!Number.isInteger(value.expectedVersion) || value.expectedVersion < 0) {
      fail('expectedVersion');
    }
  }
  for (const key of ['expected', 'replacement']) {
    if (typeof value[key] !== 'string') fail(key);
  }
  if (value.kind === 'replace-exact' && value.expected.length === 0) fail('expected');
  if (value.kind === 'replace-section') {
    if (typeof value.heading !== 'string' || !/^#{1,6} [^\r\n]+$/.test(value.heading)) {
      fail('heading');
    }
    if (value.expectedVersion === undefined && typeof value.expected !== 'string') {
      fail('section precondition');
    }
  }
  return Object.freeze({ ...value });
}

function countOccurrences(source, needle) {
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = source.indexOf(needle, cursor);
    if (index === -1) return count;
    count += 1;
    cursor = index + needle.length;
  }
}

function preserveAitmMarkers(base, next) {
  const markerRe = /<!--\s*aitm-[\s\S]*?-->/gi;
  const before = String(base).match(markerRe) || [];
  const after = String(next).match(markerRe) || [];
  if (before.length !== after.length || before.some((marker, index) => marker !== after[index])) {
    fail('protected AITM markers changed');
  }
  return next;
}

function sectionSpan(body, heading) {
  const lines = String(body).split('\n');
  const matches = [];
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === heading) matches.push({ index, offset });
    offset += lines[index].length + (index < lines.length - 1 ? 1 : 0);
  }
  if (matches.length === 0) fail('zero heading matches', heading);
  if (matches.length > 1) fail('ambiguous heading', heading);
  const selected = matches[0];
  const level = heading.match(/^#+/)[0].length;
  const contentStart = selected.offset + heading.length;
  let contentEnd = String(body).length;
  let nextOffset = contentStart + (lines[selected.index + 1] === undefined ? 0 : 1);
  for (let index = selected.index + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      contentEnd = nextOffset;
      break;
    }
    nextOffset += lines[index].length + (index < lines.length - 1 ? 1 : 0);
  }
  return { contentStart, contentEnd };
}

export function applyIssueBodyOperation(baseBody, operationInput, { checkVersion = true } = {}) {
  const operation = parseIssueBodyOperation(operationInput);
  const base = String(baseBody);
  if (checkVersion && operation.expectedVersion !== undefined) {
    const actualVersion = parseBodyVersion(base);
    if (actualVersion !== operation.expectedVersion) {
      fail(
        'stale version precondition',
        `expected version ${operation.expectedVersion}, found ${String(actualVersion)}`
      );
    }
  }
  if (operation.kind === 'replace-exact') {
    const matches = countOccurrences(base, operation.expected);
    if (matches === 0) fail('zero matches');
    if (matches > 1) fail('ambiguous matches', String(matches));
    return preserveAitmMarkers(base, base.replace(operation.expected, operation.replacement));
  }
  const span = sectionSpan(base, operation.heading);
  const current = base.slice(span.contentStart, span.contentEnd);
  if (current !== operation.expected) fail('stale section precondition');
  return preserveAitmMarkers(
    base,
    `${base.slice(0, span.contentStart)}${operation.replacement}${base.slice(span.contentEnd)}`
  );
}

export async function runIssueBodyOperation({ issueNumber, repo, operation, deps = {} } = {}) {
  if (!repo) fail('repository');
  const mutate = deps.mutateIssueBody || mutateIssueBody;
  let expectedReadBack = null;
  const result = await mutate({
    issueNumber: normalizeIssueNumber(issueNumber),
    repo,
    deps: deps.writeDeps || {},
    expectedVersion: operation.expectedVersion,
    mutate: (base) => {
      expectedReadBack = applyIssueBodyOperation(base, operation, { checkVersion: false });
      return expectedReadBack;
    },
  });
  const stripVersionForReadBack = (body) => stripBodyVersion(body).replace(/\s+$/, '');
  if (
    !result ||
    typeof result.body !== 'string' ||
    !Number.isInteger(result.version) ||
    parseBodyVersion(result.body) !== result.version ||
    stripVersionForReadBack(result.body) !== stripVersionForReadBack(expectedReadBack)
  ) {
    fail(
      'read-back mismatch',
      `status=${String(result?.status)} resultVersion=${String(result?.version)} ` +
        `bodyVersion=${String(parseBodyVersion(result?.body))} ` +
        `contentEqual=${String(
          stripVersionForReadBack(result?.body) === stripVersionForReadBack(expectedReadBack)
        )}`
    );
  }
  return result;
}

export function assertGovernedMutationSession(state, issueNumber) {
  const active = String(state?.active || '').replace(/^#/, '');
  const target = String(normalizeIssueNumber(issueNumber));
  if (active !== target)
    fail('session', `active issue #${active || 'none'} differs from target #${target}`);
  if (!state?.entryStartTs || state?.pausedAtTs)
    fail('session', 'an open timing session is required');
}

export async function runIssueBodyVerb(ctx, deps = {}) {
  const args = parseIssueBodyArgs(ctx?.rest || []);
  const readFile = deps.readFile || ((file) => readFileSync(file, 'utf8'));
  const load = deps.loadState || loadState;
  const state = load(ctx.statePath, ctx.state);
  assertGovernedMutationSession(state, args.issueNumber);
  let raw;
  try {
    raw = JSON.parse(readFile(args.operationFile));
  } catch (error) {
    fail('operation-file', error?.message || String(error));
  }
  return runIssueBodyOperation({
    issueNumber: args.issueNumber,
    repo: ctx.cfg?.repo,
    operation: parseIssueBodyOperation(raw),
    deps,
  });
}

export async function verbIssueBody(ctx) {
  const result = await runIssueBodyVerb(ctx);
  console.log(`issue-body: ${result.status} version=${result.version}`);
}
