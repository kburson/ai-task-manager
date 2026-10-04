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
  return async (source, { through = null, scope = null, purpose = 'authorize' } = {}) => {
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
        previousAssistantId:
          events
            .slice(0, previous)
            .findLast(
              (event) =>
                event.type === 'response_item' &&
                event.payload?.type === 'message' &&
                event.payload.role === 'assistant'
            )?.payload.id ?? null,
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
    const last = messages.at(-1).index;
    const nextMessage = events
      .slice(last + 1)
      .find(
        (event) =>
          event.type === 'response_item' &&
          event.payload?.type === 'message' &&
          ['assistant', 'user'].includes(event.payload.role)
      );
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
    // Later statements can only refuse authority. Scan all observed humans,
    // but retain at most one relevant reversal; unrelated chat length cannot
    // expire a grant or conceal a reversal after an arbitrary count cutoff.
    const subsequentStatements = [];
    for (const event of observed) {
      const statement = (event.payload.content ?? [])
        .filter((b) => b.type === 'input_text' && !isInjection(b.text))
        .map((b) => b.text.trim())
        .join('\n\n');
      if (scope && contradictsWave(statement, scope, purpose, event === nextMessage)) {
        subsequentStatements.push(statement);
        break;
      }
    }
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
function permissiveProposal(statement, purpose) {
  if (!hasIntent(statement, purpose) || contradicts(statement, purpose)) return false;
  const label = /^\s*[A-Z](?:[).:]|\s*(?:—|\(Recommended\)))/i;
  const labeled = label.test(statement);
  const text = statement
    .trim()
    .replace(label, '')
    .replace(/^\s*(?:\(Recommended\))?\s*[:—]?\s*/, '')
    .replace(
      /^(?:should|may|can|could) (?:I|we)\s+|^do you want (?:me|us) to\s+|^would you like (?:me|us) to\s+/i,
      ''
    );
  if (/\b(?:later|until|after|if|unless|when|once|pending)\b/i.test(text)) return false;
  return (
    directPermission(text, purpose) ||
    (labeled &&
      purpose === 'authorize' &&
      unqualifiedPermission(text) &&
      parallelAdmissionObject(text))
  );
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
        intent: permissiveProposal(statement, purpose),
        ambiguous: (statement.match(/\?/g) ?? []).length > 1,
      },
    ];
  return labeled.map((line) => ({
    label: line.trim()[0].toUpperCase(),
    recommended: /\(Recommended\)/i.test(line),
    scope: partialScope(line),
    intent: permissiveProposal(line, purpose),
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
    /(?:\bdo not\b|\bdon['’]?t\b|\bnever\b|\bno\b|\bnot\b|n['’]t\b|\bpause\b|\bcancel\b|\bnot approved?\b|\bhold off\b|\bwait\b)/i.test(
      text
    ) ||
    (purpose === 'authorize' &&
      /\b(?:sequential(?:ly)?|one at a time|revoke|withdraw)\b/i.test(text))
  );
}

function unqualifiedPermission(text) {
  return !/\bnot\b|n['’]t\b|\b(?:later|until|after|if|unless|when|once|pending|rather than|instead of|than|versus|vs|without|except|or|individually|one by one)\b/i.test(
    text
  );
}
function withoutScopeTokens(text) {
  return text
    .replace(/\b(?:epic|parent)\s*#?\d+\b/gi, ' ')
    .replace(/\brank(?:[-\s]+(?:level|wave))?\s*[:=]?\s*#?\d+\b/gi, ' ')
    .replace(
      /\b(?:children|members|stories)\s*[:=]?\s*(\[[\d\s,#/]+\]|#?\d+(?:(?:\s*[,/]\s*|\s+and\s+)#?\d+)*)/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .replace(/\s+([.!?])/g, '$1')
    .trim();
}
function parallelAdmissionObject(text) {
  // Only scope tokens and an explicit admission/isolation phrase are allowed.
  // No wildcard or operation-name denylist can reinterpret CI/tests/merges.
  return /^(?:the )?(?:(?:parallel|concurrent(?:ly)?|rank[- ]wave)(?: (?:stories|children|members|wave|admissions?|execution))?(?: for)?(?: in parallel)?(?: in isolated worktrees)?|(?:all(?: of)? )?in parallel(?: in isolated worktrees)?)[.!?]?$/i.test(
    withoutScopeTokens(text)
  );
}
function directPermission(text, purpose) {
  text = text.trim().replace(/[.]?\s*\nUse isolated worktrees[.]?$/i, ' in isolated worktrees.');
  if (purpose === 'authorize' && !unqualifiedPermission(text)) return false;
  const verbs =
    purpose === 'revoke'
      ? 'revoke|withdraw'
      : 'enable|authorize|approve|allow|run|proceed(?: with)?';
  const directive = text
    .trim()
    .match(
      new RegExp(
        `^(?:yes[, ]+)?(?:please\\s+)?(?:(?:I|we)\\s+(?:explicitly\\s+)?(?:authorize|approve|allow)|(?:you\\s+(?:may|can)\\s+|(?:I|we)\\s+want\\s+to\\s+|let['’]s\\s+)?(?:${verbs}))\\s+(.+)$`,
        'i'
      )
    );
  return !!directive && (purpose === 'revoke' || parallelAdmissionObject(directive[1]));
}
function wholeAffirmation(text, purpose) {
  const verbs =
    purpose === 'revoke'
      ? 'revoke|withdraw'
      : 'enable|authorize|approve[d]?|allow|run|proceed|go ahead';
  const object = '(?: (?:with )?(?:it|this|them|the (?:parallel )?(?:stories|wave|proposal)))?';
  return new RegExp(
    `^(?:yes(?:[, ]+(?:please )?(?:${verbs})${object})?|(?:${verbs})${object})[.!]?$`,
    'i'
  ).test(text.trim());
}
function principalObject(text) {
  return text
    .split(
      /\b(?:until|while|before|after|because|since|so|as(?!\s+many\b)|pending|till|unless|if|once|when)\b|,(?!\s*#?\d+\b)|—|:(?!\s*[#\[\d])|\s+and\s+(?=(?:close|push|merge|review|test|check|build)\b)/i
    )[0]
    .trim();
}
function admissionTarget(text) {
  // Only the head activity is neutral. A CI/test/review reason appended to
  // an admission object cannot conceal its withdrawal.
  const object = withoutScopeTokens(principalObject(text))
    .replace(/^(?:(?:on|with|for|the|this|these|our|my|any)\s+)+/i, '')
    .replace(/^(?:(?:stories|children|members)['’]s?|['’]s)\s+/i, '')
    .replace(
      /^(?:(?:running|all|unit|integration|slow|local|cloud|automated|remaining|additional|focused|full)\s+)+/i,
      ''
    )
    .trim();
  return !/^(?:reviewing|testing|checking|building|scanning|closing|pushing|merging|CI|PRs?|pull requests?|timer|tests?|lint|checks?|builds?|reviews?|scans?|close|push|merges?)\b/i.test(
    object
  );
}
function reversalScope(text, scope) {
  const epics = [...text.matchAll(/\b(?:epic|parent)\s*#?(\d+)\b/gi)].map((m) => Number(m[1]));
  const ranks = [
    ...text.matchAll(
      /\branks?(?:[-\s]+(?:level|wave))?\s*[:=]?\s*(#?\d+(?:(?:\s*[,/]\s*|\s+and\s+)#?\d+)*)\b/gi
    ),
  ].flatMap((match) => [...match[1].matchAll(/\d+/g)].map((m) => Number(m[0])));
  const members = [
    ...text.matchAll(
      /\b(?:children|members|stories)\s*[:=]?\s*(\[[\d\s,#/]+\]|#?\d+(?:(?:\s*[,/]\s*|\s+and\s+)#?\d+)*)/gi
    ),
  ].flatMap((match) => [...match[1].matchAll(/\d+/g)].map((m) => Number(m[0])));
  if (
    (epics.length && !epics.includes(scope.epic)) ||
    (ranks.length && !ranks.includes(scope.rank)) ||
    (members.length && !members.some((member) => scope.members.includes(member)))
  )
    return { matches: false, admissionSpecific: false, specified: true };
  const scoped = epics.length > 0 || ranks.length > 0 || members.length > 0;
  const wave = /\b(?:parallel|concurrent(?:ly)?|wave|stories|children|members|admissions?)\b/i.test(
    text
  );
  return {
    matches: scoped || wave,
    specified: scoped || wave,
    admissionSpecific: ranks.length > 0 || members.length > 0 || wave,
  };
}
function contextualReversalScope(text, scope) {
  const pieces = text.split(
    /,(?!\s*#?\d+\b)|[.;!?\n]|\b(?:because|since|so|as|pending|till|unless|if|once|when)\b/i
  );
  for (const piece of pieces.reverse()) {
    const candidate = reversalScope(piece, scope);
    if (candidate.specified) return candidate;
  }
  return reversalScope('', scope);
}
function contradictsWaveClause(text, scope, purpose, precedingClauses = '') {
  const verbs = [
    ...text.matchAll(
      /\b(revoke|withdraw|enable|authorize|allow|approve|run|execute|proceed|start|cancel|stop|hold off|wait on|pause|let|want|switch(?: to)?|use|keep|go)(?![\w'’-])/gi
    ),
  ];
  for (const [index, match] of verbs.entries()) {
    const verb = match[1].toLowerCase();
    // A command-shaped noun belongs to the current object. Keep evaluating
    // its own occurrence, but do not truncate an earlier withdrawal's scope.
    const nextCommand = verbs
      .slice(index + 1)
      .find(
        (next) =>
          /^(?:revoke|withdraw|cancel|stop|hold off|wait on|pause)$/i.test(next[1]) ||
          reversalScope(
            principalObject(text.slice(match.index + match[1].length, next.index)),
            scope
          ).matches ||
          (!/(?:\b(?:the|a|an|this|that|its|my|our|your|their)\s+["“‘`(]*\s*|["“‘`(]\s*)$/i.test(
            text.slice(0, next.index)
          ) &&
            !/^["”`)/]/.test(text.slice(next.index + next[1].length)))
      );
    const object = text.slice(match.index + match[1].length, nextCommand?.index ?? text.length);
    const negated =
      /(?:do not|don['’]?t|n['’]t|never|no longer|not|cannot)\s+(?:(?:actually|really|ever|please)\s+)*$/i.test(
        text.slice(0, match.index)
      );
    const target = principalObject(object);
    const objectScope = reversalScope(target, scope);
    const relevant = objectScope.specified
      ? objectScope.matches
      : contextualReversalScope(precedingClauses + ', ' + text.slice(0, match.index), scope)
          .matches;
    if (!relevant || !admissionTarget(object)) continue;
    if (purpose === 'revoke') {
      if (negated && /^(?:revoke|withdraw)$/.test(verb)) return true;
      continue;
    }
    if (/^(?:revoke|withdraw|cancel|stop|hold off|wait on|pause)$/.test(verb)) {
      if (!negated) return true;
    } else if (negated) return true;
    if (
      !negated &&
      /^(?:run|execute|switch(?: to)?|use|keep|go)$/.test(verb) &&
      /\b(?:sequential(?:ly)?|serial(?:ly)?|one at a time|one by one)\b/i.test(object)
    )
      return true;
  }
  if (purpose === 'revoke') return false;
  for (const unapproved of text.matchAll(/(.*?)\s+(?:is|are)\s+not approved?\b/gi)) {
    const subject = unapproved[1];
    const relevant = reversalScope(subject, scope);
    if (relevant.matches && relevant.admissionSpecific && admissionTarget(subject)) return true;
  }
  return false;
}
function contradictsWave(statement, scope, purpose, immediateReply) {
  const text = humanText(statement);
  // Negation and operational objects belong to their own clause. A neutral
  // clause must never cancel a genuine reversal elsewhere in the message.
  for (const sentence of text.split(/[.;!?\n]+/)) {
    const clauses = sentence
      .split(
        /,?\s+but\s+|,\s*(?=(?:I\s+)?(?:do not|don['’]?t|never|revoke|withdraw|cancel|stop|hold off|wait on|pause|run|go)\b)|\s+and\s+(?=(?:I\s+)?(?:do not|don['’]?t|never|revoke|withdraw|cancel|stop|hold off|wait on|pause|run|go)\b)/i
      )
      .map((part) => part.trim())
      .filter(Boolean);
    for (const [index, clause] of clauses.entries()) {
      if (contradictsWaveClause(clause, scope, purpose, clauses.slice(0, index).join(', ')))
        return true;
    }
  }
  if (!immediateReply) return false;
  const reply = text.trim();
  if (
    /^(?:actually[, ]+)?(?:don['’]?t|hold off|wait|cancel(?: it)?|no(?:,? not yet)?)[.!]?$/i.test(
      reply
    )
  )
    return true;
  return (
    purpose === 'authorize' &&
    /^(?:actually[, ]+)?(?:do not (?:enable|run|approve) (?:it|this)|don['’]?t (?:enable|run|approve) (?:it|this)|(?:run|go|switch to|use|keep it) (?:sequential(?:ly)?|one at a time)(?: instead)?)[.!]?$/i.test(
      reply
    )
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
    const context = await loadContext(source, { through, scope, purpose });
    if (context.repository !== scope.repository) return blocked('source-repository-mismatch');
    for (const statement of context.subsequentStatements ?? []) {
      if (contradictsWave(statement, scope, purpose, true)) return blocked('source-contradiction');
    }
    const humanScope = {};
    let authorized = false;
    let humanIntent = false;
    let authorizedAt = null;
    let proposal = null;
    let proposalMessageId = null;
    for (const message of context.messages) {
      if (message.role === 'assistant') {
        proposal = proposals(message.statement, purpose);
        proposalMessageId = message.messageId;
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
      if (text.includes('?') && affirmative) return blocked('source-ambiguous');
      if (
        complete(humanScope) &&
        humanIntent &&
        ((complete(partial) && directPermission(text, purpose)) ||
          (wholeAffirmation(text, purpose) && hasIntent(text, purpose)))
      ) {
        authorized = true;
        authorizedAt = message.submittedAt;
      }
      const selection = text
        .trim()
        .match(
          /^([A-Z])\s*[).:]?(?:\s*(?:yes|(?:authorize|approve|allow|enable|run|proceed)(?:\s+(?:it|this))?)[.!]?)?$/i
        )?.[1]
        ?.toUpperCase();
      if (proposal && (wholeAffirmation(text, purpose) || selection) && !complete(partial)) {
        if (message.previousAssistantId !== proposalMessageId)
          return blocked('source-context-mismatch');
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
