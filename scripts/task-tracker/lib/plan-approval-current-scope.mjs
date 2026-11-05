// @story #2153
// Present approval uses history only for admission, never as its approval basis.
import { parsePlanTransitionAuthorityComment } from './plan-transition-authority.mjs';
import { parseTransitionCommitComment } from './move-state/transition-commit.mjs';
import { parseEntryMarker } from './stage-entry-grammar.mjs';
import { canonicalJson, fingerprint } from './resident-action-ledger-codec.mjs';
import { stripFencedCodeBlocks } from './markers.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX256 = /^[a-f0-9]{64}$/;
const HEAD = /^[a-f0-9]{40}$/;
const MOVE = /^move:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const denied = (code) => Object.freeze({ status: 'unavailable', blockers: Object.freeze([code]) });
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function interval(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))
    return null;
  const start = Date.parse(value);
  if (!Number.isFinite(start)) return null;
  const canonical = new Date(start).toISOString();
  if (canonical !== value && canonical.replace('.000Z', 'Z') !== value) return null;
  return { start, end: start + (value.includes('.') ? 0 : 999) };
}
function provenance(comment) {
  const id = comment?.id ?? comment?.databaseId ?? comment?.commentId;
  const author = comment?.authorLogin ?? comment?.author?.login ?? comment?.user?.login;
  const association =
    comment?.authorAssociation ?? comment?.author_association ?? comment?.author?.association;
  const created = interval(comment?.createdAt ?? comment?.created_at);
  const updated = interval(comment?.updatedAt ?? comment?.updated_at);
  if (
    !id ||
    !author ||
    !TRUSTED.has(association) ||
    !created ||
    !updated ||
    created.start !== updated.start
  )
    return null;
  return { id: String(id), author, created };
}
function wrappers(body, name) {
  return [...String(body).matchAll(new RegExp(`<!--\\s*aitm-${name}\\b[^]*?-->`, 'gi'))];
}

export function evaluateCurrentScopeAdmission({ body = '', comments, repository, issue } = {}) {
  if (!Array.isArray(comments)) return denied('current-scope-comments-unavailable');
  const authorities = [];
  for (const comment of comments) {
    const source = String(comment?.body ?? '');
    const found = wrappers(source, 'plan-transition-authority');
    if (!found.length) {
      if (/<!--\s*aitm-plan-transition-authority\b/i.test(source))
        return denied('current-scope-authority-malformed');
      continue;
    }
    if (
      found.length !== 1 ||
      (source.match(/<!--\s*aitm-plan-transition-authority\b/gi) || []).length !== 1
    )
      return denied('current-scope-authority-duplicate');
    let record;
    try {
      record = parsePlanTransitionAuthorityComment(found[0][0]);
    } catch {
      return denied('current-scope-authority-malformed');
    }
    authorities.push({ comment, record });
  }
  const candidates = authorities.filter((x) => x.record.outcome === 'not-required');
  if (candidates.length !== 1) return denied('current-scope-authority-ambiguous');
  const { comment, record } = candidates[0];
  if (authorities.filter((x) => x.record.transitionId === record.transitionId).length !== 1)
    return denied('current-scope-authority-duplicate');
  if (
    record.repository.toLowerCase() !== String(repository).toLowerCase() ||
    record.issue !== Number(issue)
  )
    return denied('current-scope-authority-target');
  const auth = provenance(comment);
  if (!auth) return denied('current-scope-authority-provenance');
  const source = stripFencedCodeBlocks(body);
  const entries = [...source.matchAll(/<!--\s*aitm-entered-develop(?:-\d+)?\b[^]*?-->/gi)]
    .filter((x) => x[0].includes(record.transitionId))
    .map((x) => ({ raw: x[0], entry: parseEntryMarker(x[0]) }));
  if (
    entries.length !== 1 ||
    entries[0].entry?.state !== 'develop' ||
    entries[0].entry?.move !== record.transitionId
  )
    return denied('current-scope-entry-ambiguous');
  const commits = [];
  for (const observation of comments) {
    const text = String(observation?.body ?? '');
    const found = wrappers(text, 'transition-commit');
    const matching = found.filter((x) => x[0].includes(record.transitionId));
    if (!matching.length) {
      if (text.includes(record.transitionId) && /<!--\s*aitm-transition-commit\b/i.test(text))
        return denied('current-scope-completion-malformed');
      continue;
    }
    if (matching.length !== 1 || found.length !== 1)
      return denied('current-scope-completion-duplicate');
    let parsed;
    try {
      parsed = parseTransitionCommitComment(matching[0][0]);
    } catch {
      return denied('current-scope-completion-malformed');
    }
    if (
      Object.keys(parsed).sort().join('|') !==
      [
        'schema',
        'transitionId',
        'repository',
        'issue',
        'source',
        'target',
        'visitMarker',
        'actor',
        'sentinelFingerprint',
      ]
        .sort()
        .join('|')
    )
      return denied('current-scope-completion-malformed');
    if ((text.match(/<!--\s*aitm-transition-commit\b/gi) || []).length !== 1)
      return denied('current-scope-completion-duplicate');
    if (parsed.transitionId === record.transitionId) commits.push({ observation, record: parsed });
  }
  if (commits.length !== 1) return denied('current-scope-completion-ambiguous');
  const completion = commits[0];
  const done = provenance(completion.observation);
  const visit = entries[0];
  if (!done || done.id === auth.id || done.author !== auth.author)
    return denied('current-scope-completion-provenance');
  const c = completion.record;
  if (
    c.repository.toLowerCase() !== String(repository).toLowerCase() ||
    c.issue !== Number(issue) ||
    c.source !== 'plan' ||
    c.target !== 'develop' ||
    c.visitMarker !== visit.raw ||
    !SHA256.test(c.sentinelFingerprint) ||
    !c.actor?.trim()
  )
    return denied('current-scope-completion-target');
  const at = interval(record.recordedAt);
  const entered = interval(visit.entry.ts);
  if (
    !at ||
    !entered ||
    at.start > entered.end ||
    auth.created.start > entered.end ||
    done.created.end < entered.start ||
    done.created.end < auth.created.start
  )
    return denied('current-scope-temporal');
  return frozen({
    status: 'available',
    admission: {
      transitionId: record.transitionId,
      authorityCommentId: auth.id,
      commitCommentId: done.id,
      historicalScopeIdentity: record.scopeIdentity,
      authorityFingerprint: fingerprint(record),
      commitFingerprint: fingerprint(c),
    },
  });
}

const INPUT_KEYS = [
  'repository',
  'issue',
  'scopeIdentity',
  'sourceHead',
  'trunkSha',
  'planPath',
  'planContentSha256',
  'storyBinding',
  'forecastRecordId',
  'admission',
];
const ADMISSION_KEYS = [
  'transitionId',
  'authorityCommentId',
  'commitCommentId',
  'historicalScopeIdentity',
  'authorityFingerprint',
  'commitFingerprint',
];
const STORY_KEYS = ['storyDigest', 'storyIntentDigest', 'storyIntentSource'];
function fail(field) {
  throw new TypeError(`current-plan-approval:${field}`);
}
function exact(value, keys, field) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...keys].sort().join('|')
  )
    fail(field);
}
export function createCurrentPlanApprovalEvidence(input) {
  exact(input, INPUT_KEYS, 'keys');
  const {
    repository,
    issue,
    scopeIdentity,
    sourceHead,
    trunkSha,
    planPath,
    planContentSha256,
    storyBinding,
    forecastRecordId,
    admission,
  } = input;
  if (
    typeof repository !== 'string' ||
    !/^[^/\s]+\/[^/\s]+$/.test(repository) ||
    !Number.isSafeInteger(issue) ||
    issue < 1
  )
    fail('target');
  if (
    [scopeIdentity, sourceHead, trunkSha, planContentSha256].some(
      (value) => typeof value !== 'string'
    )
  )
    fail('source');
  if (
    !SHA256.test(scopeIdentity) ||
    !HEAD.test(sourceHead) ||
    !HEAD.test(trunkSha) ||
    !HEX256.test(planContentSha256)
  )
    fail('source');
  if (
    typeof planPath !== 'string' ||
    !planPath ||
    planPath.startsWith('/') ||
    planPath.includes('\\') ||
    planPath.split('/').some((x) => !x || x === '.' || x === '..') ||
    !planPath.endsWith('.md')
  )
    fail('plan');
  exact(storyBinding, STORY_KEYS, 'story-binding');
  if (Object.values(storyBinding).some((value) => typeof value !== 'string')) fail('story-binding');
  if (
    !HEX256.test(storyBinding.storyDigest) ||
    !HEX256.test(storyBinding.storyIntentDigest) ||
    !['linked-plan', 'linked-plan-task'].includes(storyBinding.storyIntentSource)
  )
    fail('story-binding');
  if (
    forecastRecordId !== null &&
    (typeof forecastRecordId !== 'string' ||
      !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(forecastRecordId))
  )
    fail('forecast');
  exact(admission, ADMISSION_KEYS, 'admission');
  if (
    Object.values(admission).some(
      (value) => typeof value !== 'string' || !value.trim() || value.trim() !== value
    )
  )
    fail('admission');
  if (
    !MOVE.test(admission.transitionId) ||
    !SHA256.test(admission.historicalScopeIdentity) ||
    !SHA256.test(admission.authorityFingerprint) ||
    !SHA256.test(admission.commitFingerprint) ||
    !admission.authorityCommentId ||
    !admission.commitCommentId
  )
    fail('admission');
  return frozen(
    JSON.parse(
      canonicalJson({
        schema: 'aitm.current-plan-approval/v1',
        ...input,
        repository: repository.toLowerCase(),
      })
    )
  );
}
export function validateCurrentPlanApprovalEvidence(record) {
  exact(record, ['schema', ...INPUT_KEYS], 'record-keys');
  if (record.schema !== 'aitm.current-plan-approval/v1') fail('schema');
  const { schema: _, ...input } = record;
  return createCurrentPlanApprovalEvidence(input);
}
export function currentPlanApprovalDigest(record) {
  return fingerprint(validateCurrentPlanApprovalEvidence(record));
}
