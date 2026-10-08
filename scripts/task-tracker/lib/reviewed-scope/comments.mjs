// @story #1859
import { withRevisionConsumer } from '../criteria-revision/policy.mjs';
import { pexec } from '../../../gh/lib/gh-client.mjs';
import { validateBlocker } from '../action-decision/contract.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import {
  encodeRecord,
  parseRecordComment,
  serializePointer,
  ReviewedScopeError,
  refuse,
} from './model.mjs';

function preserveRevisionTransportRefusal(error) {
  if (
    error?.name !== 'RevisionMemoryTransportError' ||
    error.code !== 'revision-authority-unavailable' ||
    error.status !== 'indeterminate' ||
    error.blocker?.guardId !== 'revision-mutation'
  )
    return;
  try {
    validateBlocker(error.blocker, { status: error.status });
  } catch {
    return;
  }
  // This preserves a denial only; caller error data can never admit an effect.
  throw error;
}

function databaseId(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9][0-9]{0,19}$/.test(text)) refuse('reviewed-scope-id');
  return text;
}
function endpoint(repository, issue) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    refuse('reviewed-scope-repository');
  if (!Number.isSafeInteger(issue) || issue < 1) refuse('reviewed-scope-issue');
  return `repos/${repository}/issues/${issue}/comments`;
}
const stringifyIds = '.id |= tostring | .user.id |= tostring';
async function api(deps, args, input) {
  const pending = (deps.pexec ?? pexec)('gh', ['api', ...args], {
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
  });
  if (input !== undefined && pending?.child?.stdin && pending.inputHandled !== true)
    pending.child.stdin.end(input);
  const result = await pending;
  return JSON.parse(result.stdout);
}
function transport(deps) {
  return {
    read:
      deps.readComment ??
      (({ repository, commentId }) =>
        api(deps, [`repos/${repository}/issues/comments/${commentId}`, '--jq', stringifyIds])),
    list:
      deps.listComments ??
      (({ repository, issue, page, perPage }) =>
        api(deps, [
          `${endpoint(repository, issue)}?per_page=${perPage}&page=${page}`,
          '--jq',
          `map(${stringifyIds})`,
        ])),
    create:
      deps.createComment ??
      (({ repository, issue, body }) =>
        api(
          deps,
          [endpoint(repository, issue), '--method', 'POST', '--input', '-', '--jq', stringifyIds],
          JSON.stringify({ body })
        )),
  };
}
function inspectComment(comment, { repository, issue, commentId }) {
  if (databaseId(comment?.id) !== commentId) refuse('reviewed-scope-comment-id');
  let url;
  try {
    url = new URL(comment.issue_url);
  } catch {
    refuse('reviewed-scope-comment-issue');
  }
  if (url.pathname !== `/repos/${repository}/issues/${issue}` || url.search || url.hash)
    refuse('reviewed-scope-comment-issue');
  const parsed = parseRecordComment(comment.body);
  if (parsed.record.manifest.repository !== repository || parsed.record.manifest.issue !== issue)
    refuse('reviewed-scope-comment-issue');
  if (databaseId(comment.user?.id) !== parsed.record.actor.id)
    refuse('reviewed-scope-comment-author');
  return parsed;
}
export async function readCurrentRecord({ repository, issue, pointer, deps = {} }) {
  endpoint(repository, issue);
  serializePointer(pointer);
  let comment;
  try {
    comment = await transport(deps).read({ repository, commentId: pointer.commentId });
  } catch (error) {
    preserveRevisionTransportRefusal(error);
    const refusal = new ReviewedScopeError('reviewed-scope-comment-unreadable', error.message);
    refusal.cause = error;
    throw refusal;
  }
  const parsed = inspectComment(comment, { repository, issue, commentId: pointer.commentId });
  if (parsed.sha256 !== pointer.sha256) refuse('reviewed-scope-comment-digest');
  if (parsed.record.lineage !== pointer.lineage) refuse('reviewed-scope-comment-lineage');
  return parsed.record;
}
function sameCandidate(candidate, record, predecessor) {
  return (
    candidate.requestDigest === record.requestDigest &&
    candidate.lineage === record.lineage &&
    canonicalRecordJson(candidate.predecessor) === canonicalRecordJson(predecessor) &&
    candidate.actor.id === record.actor.id
  );
}
function uncertain(record, predecessor, cause) {
  preserveRevisionTransportRefusal(cause);
  const error = new ReviewedScopeError(
    'reviewed-scope-comment-uncertain',
    cause?.message ?? String(cause)
  );
  error.descriptor = {
    repository: record.manifest.repository,
    issue: record.manifest.issue,
    requestDigest: record.requestDigest,
    lineage: record.lineage,
    expectedPredecessor: predecessor,
    actorId: record.actor.id,
  };
  error.cause = cause;
  return error;
}
export async function ensureRecordComment({
  repository,
  issue,
  projectDir,
  record,
  expectedPredecessor,
  deps = {},
}) {
  return withRevisionConsumer(
    { repository, issue, projectDir, backend: deps.revisionBackend, activity: 'issue-write' },
    () => ensureRecordCommentAdmitted({ repository, issue, record, expectedPredecessor, deps })
  );
}

async function ensureRecordCommentAdmitted({
  repository,
  issue,
  record,
  expectedPredecessor,
  deps = {},
}) {
  endpoint(repository, issue);
  const encoded = encodeRecord(record);
  if (record.manifest.repository !== repository || record.manifest.issue !== issue)
    refuse('reviewed-scope-comment-issue');
  if (canonicalRecordJson(record.predecessor) !== canonicalRecordJson(expectedPredecessor))
    refuse('reviewed-scope-comment-predecessor');
  const io = transport(deps);
  // The optional current pointer always precedes the orphan scan. A deleted or
  // tampered payload can be superseded using the caller's valid predecessor.
  if (deps.currentPointer) {
    serializePointer(deps.currentPointer);
    try {
      const current = await readCurrentRecord({
        repository,
        issue,
        pointer: deps.currentPointer,
        deps,
      });
      if (sameCandidate(current, record, expectedPredecessor))
        return { ...deps.currentPointer, reused: true };
    } catch (error) {
      if (!(error instanceof ReviewedScopeError)) throw error;
      if (
        error.code === 'reviewed-scope-comment-unreadable' &&
        error.cause?.status !== 404 &&
        error.cause?.statusCode !== 404 &&
        !/\(HTTP 404\)/.test(String(error.cause?.stderr ?? ''))
      )
        throw uncertain(record, expectedPredecessor, error);
    }
  }
  try {
    const seen = new Set();
    const candidates = [];
    let complete = false;
    for (let page = 1; page <= 100; page++) {
      const comments = await io.list({ repository, issue, page, perPage: 100 });
      if (!Array.isArray(comments) || comments.length > 100)
        throw new Error('unreadable comment page');
      for (const comment of comments) {
        const commentId = databaseId(comment?.id);
        if (seen.has(commentId)) throw new Error('repeated comment ID during scan');
        seen.add(commentId);
        if (!String(comment.body).startsWith('<!-- aitm-reviewed-scope-record:')) continue;
        let decoded;
        try {
          decoded = parseRecordComment(comment.body);
        } catch (error) {
          if (!(error instanceof ReviewedScopeError)) throw error;
          // Historical payloads are audit data; only a verified matching
          // candidate or current pointer participates in this transaction.
          continue;
        }
        if (!sameCandidate(decoded.record, record, expectedPredecessor)) continue;
        const parsed = inspectComment(comment, { repository, issue, commentId });
        if (sameCandidate(parsed.record, record, expectedPredecessor))
          candidates.push({ commentId, sha256: parsed.sha256, lineage: parsed.record.lineage });
      }
      if (comments.length < 100) {
        complete = true;
        break;
      }
    }
    if (!complete || candidates.length > 1)
      throw new Error(!complete ? 'comment pagination exhausted' : 'ambiguous matching comments');
    if (candidates.length === 1) {
      const pointer = candidates[0];
      const candidate = await readCurrentRecord({ repository, issue, pointer, deps });
      if (!sameCandidate(candidate, record, expectedPredecessor))
        throw new Error('candidate changed after scan');
      return { ...pointer, reused: true };
    }
    const created = await io.create({ repository, issue, body: encoded.commentBody });
    const pointer = {
      commentId: databaseId(created?.id),
      sha256: encoded.sha256,
      lineage: record.lineage,
    };
    const candidate = await readCurrentRecord({ repository, issue, pointer, deps });
    if (canonicalRecordJson(candidate) !== encoded.json)
      throw new Error('created comment changed on readback');
    return { ...pointer, reused: false };
  } catch (error) {
    throw uncertain(record, expectedPredecessor, error);
  }
}
