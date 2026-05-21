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

const pexec = promisify(execFile);

export const PLANNED_ESTIMATE_HEADER = '### Planned Estimate';
const REFINE_COMMENT_MARKER_RE = /<!--\s*aitm-(?:refined|groom)-estimate:\s*(\d+)\s*-->/;
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
    throw new Error(
      `${fnName}: '${name}' must be { size?, estimate? } — got ${describeBadArg(v)}`
    );
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
  const beforeSize = current.size ?? '—';
  const beforeEst = current.estimate ?? '—';
  const afterSize = planned.size ?? '—';
  const afterEst = planned.estimate ?? '—';
  const deltaSize =
    current.size && planned.size && current.size !== planned.size
      ? `${beforeSize}→${afterSize}`
      : '0';
  const deltaEst = formatDeltaEstimate(current.estimate, planned.estimate);
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
        'planned-estimate-missing-comment: `### 🛠 Refine estimate` comment not found — re-run promote backlog→refine→plan or post the comment manually',
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
