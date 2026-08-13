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
  if (comment.hasPlannedAppendix) {
    return { status: 'duplicate', commentId: comment.id };
  }
  const appendix = buildPlannedAppendix({ planned, current, rationale });
  const nextBody = `${comment.body.replace(/\s+$/, '')}${appendix}\n`;
  try {
    await patchComment({ cfg, commentId: comment.id, body: nextBody });
  } catch (err) {
    return { status: 'patch-failed', error: err.message, commentId: comment.id };
  }
  return { status: 'appended', commentId: comment.id };
}

export async function upsertPlannedEstimate({
  cfg,
  issueNumber,
  refine,
  plan,
  rationale,
  deps = {},
} = {}) {
  if (!cfg) throw new Error('upsertPlannedEstimate: cfg is required');
  if (!issueNumber) throw new Error('upsertPlannedEstimate: issueNumber is required');
  validateSizeEstimateArg('refine', 'upsertPlannedEstimate', refine);
  validateSizeEstimateArg('plan', 'upsertPlannedEstimate', plan);
  const patchComment = deps.patchComment || defaultPatchComment;
  const comment = await findRefineEstimateComment({ cfg, issueNumber, deps });
  if (!comment) return { status: 'no-refine-comment' };
  const match = comment.body.match(PLANNED_HEADER_RE);
  const head = match
    ? comment.body.slice(0, match.index).replace(/\s+$/, '')
    : comment.body.replace(/\s+$/, '');
  const appendix = buildPlannedAppendix({
    current: refine,
    planned: plan,
    rationale,
  });
  const nextBody = `${head}${appendix}\n`;
  if (nextBody === comment.body) return { status: 'current', commentId: comment.id };
  await patchComment({ cfg, commentId: comment.id, body: nextBody });
  return { status: 'updated', commentId: comment.id };
}

// Plan cancellation returns the story to durable Ready for Planning. The
// refine-estimate comment is preserved, but its Plan-only appendix must be
// removed so a later Plan visit cannot reuse an estimate made against an older
// codebase. The returned original body is the rollback record for the caller's
// cross-resource cancellation transaction.
export async function clearPlannedEstimate({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('clearPlannedEstimate: cfg is required');
  if (!issueNumber) throw new Error('clearPlannedEstimate: issueNumber is required');
  const patchComment = deps.patchComment || defaultPatchComment;
  const comment = await findRefineEstimateComment({ cfg, issueNumber, deps });
  if (!comment) return { status: 'no-refine-comment' };
  const match = comment.body.match(PLANNED_HEADER_RE);
  if (!match) return { status: 'no-appendix', commentId: comment.id };
  const nextBody = `${comment.body.slice(0, match.index).replace(/\s+$/, '')}\n`;
  try {
    await patchComment({ cfg, commentId: comment.id, body: nextBody });
  } catch (error) {
    return { status: 'patch-failed', commentId: comment.id, error: error.message };
  }
  try {
    const readBack = await findRefineEstimateComment({ cfg, issueNumber, deps });
    if (readBack?.id === comment.id && readBack.body === nextBody) {
      return {
        status: 'cleared',
        commentId: comment.id,
        originalBody: comment.body,
      };
    }
  } catch {
    // Fall through to the recovery write below. A failed read-back is not
    // sufficient evidence that the Plan appendix was invalidated.
  }
  let restored = false;
  try {
    await patchComment({ cfg, commentId: comment.id, body: comment.body });
    const readBack = await findRefineEstimateComment({ cfg, issueNumber, deps });
    restored = readBack?.id === comment.id && readBack.body === comment.body;
  } catch {
    restored = false;
  }
  return {
    status: restored ? 'verification-failed-restored' : 'verification-failed-recovery-uncertain',
    commentId: comment.id,
  };
}

export async function restorePlannedEstimate({ cfg, issueNumber, record, deps = {} } = {}) {
  if (!cfg) throw new Error('restorePlannedEstimate: cfg is required');
  if (!issueNumber) throw new Error('restorePlannedEstimate: issueNumber is required');
  if (!record?.commentId || typeof record.originalBody !== 'string') {
    throw new Error('restorePlannedEstimate: clear record is required');
  }
  const patchComment = deps.patchComment || defaultPatchComment;
  await patchComment({
    cfg,
    commentId: record.commentId,
    body: record.originalBody,
  });
  const readBack = await findRefineEstimateComment({ cfg, issueNumber, deps });
  if (readBack?.id !== record.commentId || readBack.body !== record.originalBody) {
    throw new Error('restorePlannedEstimate: exact read-back mismatch');
  }
  return { status: 'restored', commentId: record.commentId };
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
  if (!hasEmptyPlannedAppendix(comment.body)) {
    return { status: 'not-empty', commentId: comment.id };
  }
  // Strip everything from the `### Planned Estimate` header onward, then
  // re-append a freshly-built (non-empty) appendix.
  const headerMatch = comment.body.match(PLANNED_HEADER_RE);
  const head = comment.body.slice(0, headerMatch.index).replace(/\s+$/, '');
  const appendix = buildPlannedAppendix({ planned, current, rationale });
  const nextBody = `${head}${appendix}\n`;
  try {
    await patchComment({ cfg, commentId: comment.id, body: nextBody });
  } catch (err) {
    return { status: 'patch-failed', error: err.message, commentId: comment.id };
  }
  return { status: 'repopulated', commentId: comment.id };
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
