import {
  readEstimateWriterAuthority,
  estimateOperationId,
} from './estimate-writer-publication.mjs';
import { estimateEffectDigest } from './decomposition-publication.mjs';
import { publishPlannedCommentRevision } from './decomposition-proposal-writer.mjs';
// Refine/Planned-Estimate comment protocol (#134).
//
// The `### 🛠 Refine estimate` comment is posted by applyRefinementEstimate
// at refine→plan. This lib lets callers locate that comment after the fact and
// append a `### Planned Estimate` section in-place (via PATCH) at plan→develop,
// recording any size/estimate drift uncovered during deep-dive.
//
// Pure-ish core: all I/O is injectable for offline tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { gh, splitRepo } from '../../gh/lib/github-projects.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { ceilEstimateHours } from './estimation/estimate-granularity.mjs';

const pexec = promisify(execFile);

export const PLANNED_ESTIMATE_HEADER = '### Planned Estimate';
const REFINE_COMMENT_MARKER_RE = /<!--\s*aitm-refined-estimate:\s*(\d+)\s*-->/;
const PLANNED_HEADER_RE = /^###\s+Planned Estimate\s*$/m;
const EMPTY_SIZE_ROW_RE = /^\|\s*Size\s*\|\s*—\s*\|\s*—\s*\|/m;
const EMPTY_ESTIMATE_ROW_RE = /^\|\s*Estimate \(h\)\s*\|\s*—\s*\|\s*—\s*\|/m;

function plannedAppendixRange(body) {
  const match = String(body).match(PLANNED_HEADER_RE);
  if (!match) return null;
  const tail = String(body).slice(match.index + match[0].length),
    next = tail.match(/^#{1,3}\s+/m);
  return {
    start: match.index,
    end: next ? match.index + match[0].length + next.index : String(body).length,
  };
}
function replacePlannedAppendix(body, appendix) {
  const range = plannedAppendixRange(body);
  const head = range ? body.slice(0, range.start).replace(/\s+$/, '') : body.replace(/\s+$/, '');
  const tail = range ? body.slice(range.end) : '';
  return `${head}${appendix}\n${tail}`;
}

export function hasPlannedAppendix(body = '') {
  return PLANNED_HEADER_RE.test(String(body));
}

export function hasEmptyPlannedAppendix(body = '') {
  const s = String(body);
  return EMPTY_SIZE_ROW_RE.test(s) && EMPTY_ESTIMATE_ROW_RE.test(s);
}

function describeBadArg(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array (${JSON.stringify(v)})`;
  return `${typeof v} (${JSON.stringify(v)})`;
}

function validateSizeEstimateArg(name, fnName, v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`${fnName}: '${name}' must be { size?, estimate? } — got ${describeBadArg(v)}`);
  }
  if (v.size === undefined && v.estimate === undefined) {
    throw new Error(
      `${fnName}: '${name}' must define at least one of 'size' or 'estimate' — got ${JSON.stringify(v)}`
    );
  }
}

function formatDeltaEstimate(currentEst, plannedEst) {
  if (typeof currentEst !== 'number' || typeof plannedEst !== 'number') return 'n/a';
  const d = plannedEst - currentEst;
  if (d === 0) return '0';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2).replace(/\.?0+$/, '')}`;
}

export function buildPlannedAppendix({ planned = {}, current = {}, rationale = '' } = {}) {
  validateSizeEstimateArg('planned', 'buildPlannedAppendix', planned);
  validateSizeEstimateArg('current', 'buildPlannedAppendix', current);
  const normalizedCurrent = {
    ...current,
    ...(typeof current.estimate === 'number'
      ? { estimate: ceilEstimateHours(current.estimate) }
      : {}),
  };
  const normalizedPlanned = {
    ...planned,
    ...(typeof planned.estimate === 'number'
      ? { estimate: ceilEstimateHours(planned.estimate) }
      : {}),
  };
  const beforeSize = normalizedCurrent.size ?? '—';
  const beforeEst = normalizedCurrent.estimate ?? '—';
  const afterSize = normalizedPlanned.size ?? '—';
  const afterEst = normalizedPlanned.estimate ?? '—';
  const deltaSize =
    normalizedCurrent.size &&
    normalizedPlanned.size &&
    normalizedCurrent.size !== normalizedPlanned.size
      ? `${beforeSize}→${afterSize}`
      : '0';
  const deltaEst = formatDeltaEstimate(normalizedCurrent.estimate, normalizedPlanned.estimate);
  const rationaleLine =
    rationale && rationale.trim() ? rationale.trim() : '_no rationale supplied_';
  return [
    '',
    '',
    PLANNED_ESTIMATE_HEADER,
    '',
    '| Field | Refine | Plan | Δ |',
    '|---|---|---|---|',
    `| Size | ${beforeSize} | ${afterSize} | ${deltaSize} |`,
    `| Estimate (h) | ${beforeEst} | ${afterEst} | ${deltaEst} |`,
    '',
    rationaleLine,
  ].join('\n');
}

async function defaultListComments({ cfg, issueNumber }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const out = await gh([
    'api',
    `repos/${owner}/${repoName}/issues/${issueNumber}/comments`,
    '--paginate',
  ]);
  try {
    return JSON.parse(out);
  } catch {
    return [];
  }
}

async function defaultPatchComment({ cfg, commentId, body }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  await pexec(
    'gh',
    [
      'api',
      '-X',
      'PATCH',
      `repos/${owner}/${repoName}/issues/comments/${commentId}`,
      '-f',
      `body=${body}`,
    ],
    { timeout: GH_API_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
  );
}

export async function findRefineEstimateComment({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('findRefineEstimateComment: cfg is required');
  if (!issueNumber) throw new Error('findRefineEstimateComment: issueNumber is required');
  const listComments = deps.listComments || defaultListComments;
  const comments = await listComments({ cfg, issueNumber });
  for (const c of comments || []) {
    const body = c?.body ?? '';
    const m = body.match(REFINE_COMMENT_MARKER_RE);
    if (m && Number(m[1]) === Number(issueNumber)) {
      return {
        id: c.id,
        nodeId: c.node_id ?? String(c.id),
        body,
        hasPlannedAppendix: hasPlannedAppendix(body),
      };
    }
  }
  return null;
}

// Wrapper for parity with the AC — locating without mutating.
export async function ensureRefineEstimateComment({ cfg, issueNumber, deps = {} } = {}) {
  return findRefineEstimateComment({ cfg, issueNumber, deps });
}

async function hasPendingPlannedPublication({ cfg, issueNumber, comment, nextBody, deps }) {
  if (!cfg.projectId || nextBody !== comment.body) return false;
  const current = await readEstimateWriterAuthority({ cfg, issueNumber, deps });
  const operationId = estimateOperationId('plan-estimate-compatibility', {
    comment: comment.nodeId ?? String(comment.id),
    body: estimateEffectDigest(nextBody),
  });
  return (
    current.publication?.operationId === operationId && current.publication.status === 'pending'
  );
}

export async function appendPlannedEstimate({
  cfg,
  issueNumber,
  planned,
  current,
  rationale,
  deps = {},
} = {}) {
  if (!cfg) throw new Error('appendPlannedEstimate: cfg is required');
  if (!issueNumber) throw new Error('appendPlannedEstimate: issueNumber is required');
  validateSizeEstimateArg('planned', 'appendPlannedEstimate', planned);
  validateSizeEstimateArg('current', 'appendPlannedEstimate', current);
  const patchComment = deps.patchComment || defaultPatchComment;

  const comment = await findRefineEstimateComment({ cfg, issueNumber, deps });
  if (!comment) {
    return { status: 'no-refine-comment' };
  }
  const appendix = buildPlannedAppendix({ planned, current, rationale });
  const nextBody = replacePlannedAppendix(comment.body, appendix);
  if (
    comment.hasPlannedAppendix &&
    !(await hasPendingPlannedPublication({ cfg, issueNumber, comment, nextBody, deps }))
  )
    return { status: 'duplicate', commentId: comment.id };
  const result = await publishPlannedCommentRevision({
    cfg,
    issueNumber,
    comment,
    nextBody,
    planned: { estimate: planned.estimate, size: planned.size ?? current.size },
    patchComment,
    findComment: () => findRefineEstimateComment({ cfg, issueNumber, deps }),
    listComments: deps.listComments ?? defaultListComments,
    deps,
  });
  return {
    ...result,
    status: result.status === 'recorded' ? 'appended' : result.status,
    commentId: comment.id,
  };
}

export async function upsertPlannedEstimate({
  cfg,
  issueNumber,
  refine,
  plan,
  rationale,
  context,
  effectId,
  deps = {},
} = {}) {
  if (!cfg) throw new Error('upsertPlannedEstimate: cfg is required');
  if (!issueNumber) throw new Error('upsertPlannedEstimate: issueNumber is required');
  validateSizeEstimateArg('refine', 'upsertPlannedEstimate', refine);
  validateSizeEstimateArg('plan', 'upsertPlannedEstimate', plan);
  const patchComment = deps.patchComment || defaultPatchComment;
  const comment = await findRefineEstimateComment({ cfg, issueNumber, deps });
  if (!comment) return { status: 'no-refine-comment' };
  const appendix = buildPlannedAppendix({ current: refine, planned: plan, rationale });
  const nextBody = replacePlannedAppendix(comment.body, appendix);
  if (
    nextBody === comment.body &&
    !context &&
    !(await hasPendingPlannedPublication({ cfg, issueNumber, comment, nextBody, deps }))
  )
    return { status: 'current', commentId: comment.id };
  const result = await publishPlannedCommentRevision({
    cfg,
    issueNumber,
    comment,
    nextBody,
    planned: { estimate: plan.estimate, size: plan.size ?? refine.size },
    patchComment,
    findComment: () => findRefineEstimateComment({ cfg, issueNumber, deps }),
    listComments: deps.listComments ?? defaultListComments,
    context,
    effectId,
    deps,
  });
  return {
    ...result,
    status: result.status === 'recorded' ? 'updated' : result.status,
    commentId: comment.id,
  };
}

// Plan cancellation returns the story to durable Ready for Planning. The
// refine-estimate comment is preserved, but its Plan-only appendix must be
// removed so a later Plan visit cannot reuse an estimate made against an older
// codebase. The returned original body is the rollback record for the caller's
// cross-resource cancellation transaction.
export { defaultListComments as listRefineEstimateComments };
export function removePlannedEstimateAppendix(body) {
  const range = plannedAppendixRange(body);
  return range
    ? body.slice(0, range.start).replace(/\s+$/, '') + '\n' + body.slice(range.end)
    : body;
}

export async function clearPlannedEstimate({
  cfg,
  issueNumber,
  context,
  effectId,
  deps = {},
} = {}) {
  if (!cfg) throw new Error('clearPlannedEstimate: cfg is required');
  if (!issueNumber) throw new Error('clearPlannedEstimate: issueNumber is required');
  const patchComment = deps.patchComment || defaultPatchComment;
  const comment = await findRefineEstimateComment({ cfg, issueNumber, deps });
  if (!comment) return { status: 'no-refine-comment' };
  const match = comment.body.match(PLANNED_HEADER_RE);
  const nextBody = removePlannedEstimateAppendix(comment.body);
  if (
    !match &&
    !(await hasPendingPlannedPublication({ cfg, issueNumber, comment, nextBody, deps }))
  )
    return { status: 'no-appendix', commentId: comment.id };
  const result = await publishPlannedCommentRevision({
    cfg,
    issueNumber,
    comment,
    nextBody,
    patchComment,
    findComment: () => findRefineEstimateComment({ cfg, issueNumber, deps }),
    listComments: deps.listComments ?? defaultListComments,
    context,
    effectId,
    deps,
  });
  return {
    ...result,
    status: result.status === 'recorded' ? 'cleared' : result.status,
    commentId: comment.id,
    originalBody: match ? comment.body : undefined,
  };
}

export async function restorePlannedEstimate({
  cfg,
  issueNumber,
  record,
  context,
  effectId,
  deps = {},
} = {}) {
  if (!cfg) throw new Error('restorePlannedEstimate: cfg is required');
  if (!issueNumber) throw new Error('restorePlannedEstimate: issueNumber is required');
  if (!record?.commentId || typeof record.originalBody !== 'string') {
    throw new Error('restorePlannedEstimate: clear record is required');
  }
  const patchComment = deps.patchComment || defaultPatchComment;
  const comment = await findRefineEstimateComment({ cfg, issueNumber, deps });
  if (comment?.id !== record.commentId)
    throw new Error('restorePlannedEstimate: comment identity mismatch');
  const result = await publishPlannedCommentRevision({
    cfg,
    issueNumber,
    comment,
    nextBody: record.originalBody,
    patchComment,
    findComment: () => findRefineEstimateComment({ cfg, issueNumber, deps }),
    listComments: deps.listComments ?? defaultListComments,
    context,
    effectId,
    deps,
  });
  return {
    ...result,
    status: result.status === 'recorded' ? 'restored' : result.status,
    commentId: record.commentId,
  };
}

// AC8 (#171) — re-populate an already-appended EMPTY Planned Estimate table.
//
// `appendPlannedEstimate` is terminal on `hasPlannedAppendix` (returns
// `{status:'duplicate'}`), so an all-em-dash appendix that slipped in before
// the #171/84743da validation can never self-heal through it. This healer
// locates the refine comment and, IF the appendix exists AND is the empty
// table, strips the stale `### Planned Estimate` block and rebuilds it in place
// with concrete planned/current values. A non-empty appendix is left untouched.
export async function repopulateEmptyPlannedAppendix({
  cfg,
  issueNumber,
  planned,
  current,
  rationale,
  context,
  effectId,
  deps = {},
} = {}) {
  if (!cfg) throw new Error('repopulateEmptyPlannedAppendix: cfg is required');
  if (!issueNumber) throw new Error('repopulateEmptyPlannedAppendix: issueNumber is required');
  validateSizeEstimateArg('planned', 'repopulateEmptyPlannedAppendix', planned);
  validateSizeEstimateArg('current', 'repopulateEmptyPlannedAppendix', current);
  const patchComment = deps.patchComment || defaultPatchComment;

  const comment = await findRefineEstimateComment({ cfg, issueNumber, deps });
  if (!comment) {
    return { status: 'no-refine-comment' };
  }
  if (!comment.hasPlannedAppendix) {
    return { status: 'no-appendix', commentId: comment.id };
  }
  const appendix = buildPlannedAppendix({ planned, current, rationale });
  const nextBody = replacePlannedAppendix(comment.body, appendix);
  if (
    !hasEmptyPlannedAppendix(comment.body) &&
    !(await hasPendingPlannedPublication({ cfg, issueNumber, comment, nextBody, deps }))
  )
    return { status: 'not-empty', commentId: comment.id };
  const result = await publishPlannedCommentRevision({
    cfg,
    issueNumber,
    comment,
    nextBody,
    planned: { estimate: planned.estimate, size: planned.size ?? current.size },
    patchComment,
    findComment: () => findRefineEstimateComment({ cfg, issueNumber, deps }),
    listComments: deps.listComments ?? defaultListComments,
    context,
    effectId,
    deps,
  });
  return {
    ...result,
    status: result.status === 'recorded' ? 'repopulated' : result.status,
    commentId: comment.id,
  };
}

// Pre-flight gate for plan → develop: refuse unless the refine-estimate
// comment exists AND has the `### Planned Estimate` appendix.
export async function planPlannedEstimateGate({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('planPlannedEstimateGate: cfg is required');
  if (!issueNumber) throw new Error('planPlannedEstimateGate: issueNumber is required');
  let comment;
  try {
    comment = await findRefineEstimateComment({ cfg, issueNumber, deps });
  } catch (err) {
    return { ok: false, blockers: [`planned-estimate-fetch-failed: ${err.message}`] };
  }
  if (!comment) {
    return {
      ok: false,
      blockers: [
        'planned-estimate-missing-comment: `### 🛠 Refine estimate` comment not found — re-run the backlog→refine→ready-for-plan workflow or post the comment manually',
      ],
    };
  }
  if (!comment.hasPlannedAppendix) {
    return {
      ok: false,
      blockers: [
        'planned-estimate-appendix-missing: append a `### Planned Estimate` section to the refine-estimate comment (use `appendPlannedEstimate` from `lib/refine-estimate-comment.mjs`)',
      ],
    };
  }
  if (hasEmptyPlannedAppendix(comment.body)) {
    return {
      ok: false,
      blockers: [
        'planned-estimate-empty-table: the `### Planned Estimate` appendix has an all-em-dash data row — re-run `appendPlannedEstimate` with concrete { size?, estimate? } objects for `planned` and `current`',
      ],
    };
  }
  return { ok: true, commentId: comment.id };
}
