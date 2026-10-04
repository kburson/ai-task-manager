// @story #1872
import { readFile } from 'node:fs/promises';
import { isInjection } from '../word-counter.mjs';
import { exactRankWaveKeys } from './epic-rank-wave-authority.mjs';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import {
  createCodexSessionSourceLoader,
  hashAuthorizationStatement,
  resolveWorkflowExceptionAuthority,
  validateAuthorizationSource,
} from './workflow-policy/authority-resolver.mjs';

function blocked(code) {
  return { status: 'blocked', code: `rank-wave-${code}` };
}
export function validateRankWaveSource(source) {
  exactRankWaveKeys(source, ['schema', 'sessionId', 'messages']);
  if (
    source.schema !== 'aitm.rank-wave-source/v1' ||
    !Array.isArray(source.messages) ||
    source.messages.length < 1 ||
    source.messages.length > 8
  )
    throw new TypeError('rank-wave: source context bound');
  const ids = new Set();
  for (const message of source.messages) {
    exactRankWaveKeys(message, ['messageId', 'statementHash']);
    validateAuthorizationSource({
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId: source.sessionId,
      ...message,
    });
    if (ids.has(message.messageId)) throw new TypeError('rank-wave: duplicate source reference');
    ids.add(message.messageId);
  }
  return source;
}

export function createRankWaveSourceLoader({ resolveTranscriptPath, resolveRepository } = {}) {
  return async (source, { through = null } = {}) => {
    validateRankWaveSource(source);
    const transcriptPath = await resolveTranscriptPath(source.sessionId);
    if (!transcriptPath) throw new Error('rank-wave: source host unavailable');
    const events = (await readFile(transcriptPath, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const metadata = events.filter((e) => e.type === 'session_meta');
    if (
      metadata.length !== 1 ||
      metadata[0].payload?.id !== source.sessionId ||
      typeof metadata[0].payload.cwd !== 'string'
    )
      throw new Error('rank-wave: source session identity');
    const repository = await resolveRepository(metadata[0].payload.cwd);
    const userLoader = createCodexSessionSourceLoader({
      transcriptPath,
      expectedSessionId: source.sessionId,
    });
    let previous = -1;
    const messages = [];
    for (const reference of source.messages) {
      const matches = events
        .map((event, index) => ({ event, index }))
        .filter(
          ({ event }) =>
            event.type === 'response_item' &&
            event.payload?.type === 'message' &&
            event.payload.id === reference.messageId
        );
      if (matches.length !== 1 || matches[0].index <= previous)
        throw new Error('rank-wave: source chronology or ambiguity');
      previous = matches[0].index;
      const payload = matches[0].event.payload;
      if (!['user', 'assistant'].includes(payload.role)) throw new Error('rank-wave: source role');
      const type = payload.role === 'user' ? 'input_text' : 'output_text';
      const statement = (payload.content ?? [])
        .filter((b) => b.type === type && !isInjection(b.text))
        .map((b) => b.text.trim())
        .join('\n\n');
      if (
        !statement ||
        hashAuthorizationStatement(statement) !== reference.statementHash ||
        statement.split('\n').every((line) => /^\s*>/.test(line))
      )
        throw new Error('rank-wave: exact source hash or quoted injection');
      if (payload.role === 'user') {
        const resolved = await resolveWorkflowExceptionAuthority({
          source: {
            schema: 'aitm.authorization-source/v1',
            adapter: 'codex-session/v1',
            sessionId: source.sessionId,
            ...reference,
          },
          recordingActor: 'rank-wave/source-loader',
          loadSource: userLoader,
        });
        if (resolved.status !== 'verified') throw new Error(resolved.code);
      }
      messages.push({
        ...reference,
        role: payload.role,
        statement,
        index: previous,
        submittedAt: matches[0].event.timestamp,
      });
    }
    if (through !== null && !Number.isFinite(Date.parse(through)))
      throw new Error('rank-wave: source observation cutoff');
    if (
      through !== null &&
      messages.some(
        (m) =>
          !Number.isFinite(Date.parse(m.submittedAt)) ||
          Date.parse(m.submittedAt) > Date.parse(through)
      )
    )
      throw new Error('rank-wave: source newer than observation cutoff');
    const first = messages[0].index;
    const ids = new Set(source.messages.map((m) => m.messageId));
    const laterHumans = events
      .slice(first + 1)
      .filter(
        (e) =>
          e.type === 'response_item' &&
          e.payload?.type === 'message' &&
          e.payload.role === 'user' &&
          !ids.has(e.payload.id)
      );
    const observed = laterHumans.filter((e) => {
      if (through === null) return true;
      if (!Number.isFinite(Date.parse(e.timestamp)))
        throw new Error('rank-wave: source chronology unavailable');
      return Date.parse(e.timestamp) <= Date.parse(through);
    });
    if (observed.length > 64)
      throw new Error('rank-wave: subsequent human context bound; reference a current instruction');
    const subsequentStatements = observed.map((e) =>
      (e.payload.content ?? [])
        .filter((b) => b.type === 'input_text' && !isInjection(b.text))
        .map((b) => b.text.trim())
        .join('\n\n')
    );
    return { repository, messages, subsequentStatements };
  };
}

function partialScope(text) {
  const epic = [...text.matchAll(/\b(?:epic|parent)\s*#?(\d+)\b/gi)].map((m) => Number(m[1]));
  const ranks = [...text.matchAll(/\brank(?:[-\s]+(?:level|wave))?\s*[:=]?\s*#?(\d+)\b/gi)].map(
    (m) => Number(m[1])
  );
  const memberMatches = [
    ...text.matchAll(
      /\b(?:children|members|stories)\s*[:=]?\s*(\[[\d\s,#/]+\]|#?\d+(?:(?:\s*[,/]\s*|\s+and\s+)#?\d+)*)/gi
    ),
  ];
  const memberships = memberMatches.map((m) =>
    [...m[1].matchAll(/\d+/g)].map((n) => Number(n[0])).sort((a, b) => a - b)
  );
  if (
    new Set(epic).size > 1 ||
    new Set(ranks).size > 1 ||
    new Set(memberships.map(canonicalRecordJson)).size > 1
  )
    throw new Error('ambiguous scope');
  const result = {};
  if (epic.length) result.epic = epic[0];
  if (ranks.length) result.rank = ranks[0];
  if (memberships.length) {
    const members = memberships[0];
    if (
      !members.length ||
      members.some((n) => !Number.isSafeInteger(n) || n <= 0) ||
      new Set(members).size !== members.length
    )
      throw new Error('invalid members');
    result.members = members;
  }
  return result;
}
function complete(scope) {
  return (
    Number.isSafeInteger(scope.epic) && Number.isFinite(scope.rank) && Array.isArray(scope.members)
  );
}
function matchesScope(value, scope) {
  return (
    value.epic === scope.epic &&
    value.rank === scope.rank &&
    canonicalRecordJson(value.members) === canonicalRecordJson(scope.members)
  );
}
function hasIntent(statement, purpose) {
  return purpose === 'revoke'
    ? /\b(?:revoke|withdraw)\b/i.test(statement)
    : /\b(?:parallel|concurrent(?:ly)?|rank[- ]wave)\b/i.test(statement);
}
function proposals(statement, purpose) {
  const lines = statement.split('\n');
  const labeled = lines.filter((line) =>
    /^\s*[A-Z][).:]|^\s*[A-Z]\s*(?:—|\(Recommended\))/i.test(line)
  );
  if (!labeled.length)
    return [
      {
        label: null,
        recommended: false,
        scope: partialScope(statement),
        intent: hasIntent(statement, purpose),
        ambiguous: (statement.match(/\?/g) ?? []).length > 1,
      },
    ];
  return labeled.map((line) => ({
    label: line.trim()[0].toUpperCase(),
    recommended: /\(Recommended\)/i.test(line),
    scope: partialScope(line),
    intent: hasIntent(line, purpose),
    ambiguous: (statement.match(/\?/g) ?? []).length > 1,
  }));
}

function humanText(statement) {
  let fenced = false;
  return statement
    .split('\n')
    .filter((line) => {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        return false;
      }
      return !fenced && !/^\s*[>"']/.test(line);
    })
    .join('\n');
}
function contradicts(text, purpose) {
  return (
    /(?:\bdo not\b|\bdon't\b|\bcancel\b|\bnot approved?\b|\bhold off\b|\bwait\b)/i.test(text) ||
    (purpose === 'authorize' &&
      /\b(?:sequential(?:ly)?|one at a time|revoke|withdraw)\b/i.test(text))
  );
}

export async function verifyRankWaveSource({
  source,
  scope,
  recordingActor,
  loadContext,
  purpose = 'authorize',
  notBefore = null,
  through = null,
} = {}) {
  try {
    validateRankWaveSource(source);
    if (!['authorize', 'revoke'].includes(purpose)) return blocked('source-purpose');
    if (!recordingActor || typeof loadContext !== 'function')
      return blocked('source-adapter-unavailable');
    const context = await loadContext(source, { through });
    if (context.repository !== scope.repository) return blocked('source-repository-mismatch');
    for (const statement of context.subsequentStatements ?? []) {
      const text = humanText(statement);
      const partial = partialScope(text);
      // Explicitly unrelated epic instructions cannot reverse this wave.
      if (partial.epic !== undefined && partial.epic !== scope.epic) continue;
      if (contradicts(text, purpose)) return blocked('source-contradiction');
      if (
        hasIntent(text, purpose) &&
        Object.entries(partial).some(
          ([key, value]) => canonicalRecordJson(value) !== canonicalRecordJson(scope[key])
        )
      )
        return blocked('source-contradiction');
    }
    const humanScope = {};
    let authorized = false;
    let humanIntent = false;
    let authorizedAt = null;
    let proposal = null;
    for (const message of context.messages) {
      if (message.role === 'assistant') {
        proposal = proposals(message.statement, purpose);
        continue;
      }
      if (message.role !== 'user') return blocked('source-not-human');
      const text = humanText(message.statement);
      if (/\b(?:forwarded message|the (?:human|user) (?:said|approved))\b/i.test(text))
        return blocked('source-relay');
      humanIntent ||= hasIntent(text, purpose);
      if (contradicts(text, purpose)) return blocked('source-contradiction');
      const partial = partialScope(text);
      for (const [key, value] of Object.entries(partial)) {
        if (
          Object.hasOwn(humanScope, key) &&
          canonicalRecordJson(humanScope[key]) !== canonicalRecordJson(value)
        )
          return blocked('source-contradiction');
        humanScope[key] = value;
      }
      const affirmative =
        purpose === 'revoke'
          ? /\b(?:revoke|withdraw)\b/i.test(text)
          : /\b(?:enable|authorize|approve|allow|run|proceed|yes)\b/i.test(text);
      if (complete(humanScope) && affirmative && humanIntent) {
        authorized = true;
        authorizedAt = message.submittedAt;
      }
      const selection = text
        .trim()
        .match(
          /^([A-Z])\s*[).:]?(?:\s*(?:yes|(?:authorize|approve|allow|enable|run|proceed)(?:\s+(?:it|this))?)[.!]?)?$/i
        )?.[1]
        ?.toUpperCase();
      if (proposal && (affirmative || selection) && !complete(partial)) {
        if (text.includes('?')) return blocked('source-ambiguous');
        const choices = proposal.filter((p) => complete(p.scope) && p.intent);
        if (!selection && (choices.length !== proposal.length || proposal.some((p) => p.ambiguous)))
          return blocked('source-ambiguous');
        const chosen = selection
          ? choices.filter((p) => p.label === selection)
          : choices.length === 1
            ? choices
            : choices.filter((p) => p.recommended);
        if (chosen.length !== 1 || !matchesScope(chosen[0].scope, scope))
          return blocked('source-ambiguous');
        for (const [key, value] of Object.entries(chosen[0].scope)) {
          if (
            Object.hasOwn(humanScope, key) &&
            canonicalRecordJson(humanScope[key]) !== canonicalRecordJson(value)
          )
            return blocked('source-contradiction');
          humanScope[key] = value;
        }
        authorized = true;
        authorizedAt = message.submittedAt;
      }
    }
    if (
      notBefore !== null &&
      (!Number.isFinite(Date.parse(notBefore)) ||
        !Number.isFinite(Date.parse(authorizedAt)) ||
        Date.parse(authorizedAt) <= Date.parse(notBefore))
    )
      return blocked('source-predates-current-revision');
    if (!authorized || !complete(humanScope) || !matchesScope(humanScope, scope))
      return blocked('source-scope-mismatch');
    return {
      status: 'verified',
      authority: {
        source: structuredClone(source),
        recordingActor,
        repository: context.repository,
        scope: structuredClone(scope),
        origin: 'codex-session-transcript',
        verificationLevel: 'host-verified-user-message',
      },
    };
  } catch (error) {
    return { ...blocked('source-invalid'), detail: error.message };
  }
}
