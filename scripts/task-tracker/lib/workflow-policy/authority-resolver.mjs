// @story #1626
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { isInjection } from '../../word-counter.mjs';

const SOURCE_KEYS = ['adapter', 'messageId', 'schema', 'sessionId', 'statementHash'];
const HASH_RE = /^sha256:[0-9a-f]{64}$/;

function exact(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function blocker(code) {
  return Object.freeze({
    status: 'blocked',
    code,
    remediation:
      'Supply an exact user-message reference through a supported host authorization adapter.',
  });
}

export function hashAuthorizationStatement(statement) {
  return `sha256:${createHash('sha256').update(String(statement), 'utf8').digest('hex')}`;
}

export function validateAuthorizationSource(source) {
  if (
    !exact(source, SOURCE_KEYS) ||
    source.schema !== 'aitm.authorization-source/v1' ||
    source.adapter !== 'codex-session/v1' ||
    typeof source.sessionId !== 'string' ||
    !/^[-a-zA-Z0-9]+$/.test(source.sessionId) ||
    typeof source.messageId !== 'string' ||
    !/^[-_a-zA-Z0-9]+$/.test(source.messageId) ||
    !HASH_RE.test(source.statementHash ?? '')
  ) {
    throw new TypeError('workflow-exception-authority:source');
  }
  return source;
}

export async function resolveWorkflowExceptionAuthority({
  source,
  recordingActor,
  loadSource,
} = {}) {
  try {
    validateAuthorizationSource(source);
  } catch {
    return blocker('authorization-source-invalid');
  }
  if (typeof recordingActor !== 'string' || recordingActor.trim() === '') {
    return blocker('recording-actor-unavailable');
  }
  if (typeof loadSource !== 'function') return blocker('authorization-adapter-unavailable');
  let observed;
  try {
    observed = await loadSource(source);
  } catch {
    return blocker('authorization-source-unavailable');
  }
  if (observed?.role !== 'user') return blocker('authorization-source-not-human');
  if (
    typeof observed.statement !== 'string' ||
    observed.statement.trim() === '' ||
    observed.statementHash !== source.statementHash
  ) {
    return blocker('authorization-source-mismatch');
  }
  if (observed.principal !== null && typeof observed.principal !== 'string') {
    return blocker('authorization-principal-invalid');
  }
  return Object.freeze({
    status: 'verified',
    authority: Object.freeze({
      reference: `codex://sessions/${source.sessionId}/messages/${source.messageId}`,
      statement: observed.statement,
      principal: observed.principal,
      recordingActor,
      origin: 'codex-session-transcript',
      verificationLevel: 'host-verified-user-message',
    }),
  });
}

export function createCodexSessionSourceLoader({ transcriptPath, expectedSessionId } = {}) {
  if (typeof transcriptPath !== 'string' || transcriptPath === '') {
    throw new TypeError('workflow-exception-authority:transcript-path');
  }
  return async (source) => {
    validateAuthorizationSource(source);
    if (source.sessionId !== expectedSessionId) {
      throw new TypeError('workflow-exception-authority:foreign-session');
    }
    const lines = (await readFile(transcriptPath, 'utf8')).split(/\r?\n/).filter(Boolean);
    const matches = [];
    for (const line of lines) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        throw new TypeError('workflow-exception-authority:transcript-json');
      }
      if (
        event?.type !== 'response_item' ||
        event.payload?.type !== 'message' ||
        event.payload?.id !== source.messageId
      ) {
        continue;
      }
      const blocks = Array.isArray(event.payload.content) ? event.payload.content : [];
      const statements = blocks
        .filter((block) => block?.type === 'input_text' && !isInjection(block.text))
        .map((block) => block.text.trim());
      matches.push({
        role: event.payload.role,
        statement: statements.join('\n\n'),
        principal: null,
      });
    }
    if (matches.length !== 1) throw new TypeError('workflow-exception-authority:message-ambiguity');
    const observed = matches[0];
    return { ...observed, statementHash: hashAuthorizationStatement(observed.statement) };
  };
}
