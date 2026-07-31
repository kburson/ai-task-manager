// Refine-stage estimate comment poster. Fires on On Deck → Refine in promote.mjs.
//
// Symmetric to apply-reevaluate.mjs: reads the agent-authored rationale marker
// from the issue body, combines it with the project board's Size / Estimate /
// Priority values, and posts a `### 🛠 Refine estimate` audit comment. The post
// is idempotent via a hidden marker `<!-- aitm-refined-estimate: <N> -->`.
//
// Markers: reads/writes use `aitm-refinement-rationale` and
// `aitm-refined-estimate:` exclusively. Issues authored under the retired
// `aitm-groom-*` marker scheme must be migrated before consumption.
//
// Pure-ish core: all I/O is injectable for offline tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import { isGovernedAuthorityError } from './work-lease/governed-effect.mjs';

const pexec = promisify(execFile);

export const REFINEMENT_HEADER = '### 🛠 Refine estimate';

export const RATIONALE_MARKER_RE = /<!--\s*aitm-refinement-rationale:\s*(\{[\s\S]*?\})\s*-->/;
export const COMMENT_MARKER_PREFIX = '<!-- aitm-refined-estimate:';
const COMMENT_MARKER_RE = /<!--\s*aitm-refined-estimate:\s*(\d+)\s*-->/;

export function parseRationaleMarker(body = '') {
  const m = String(body).match(RATIONALE_MARKER_RE);
  if (!m) return { ok: false, reason: 'missing' };
  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch (err) {
    return { ok: false, reason: 'invalid-json', detail: err.message };
  }
  const required = ['size', 'estimate', 'priority'];
  const missing = required.filter((k) => typeof parsed[k] !== 'string' || parsed[k].trim() === '');
  if (missing.length) return { ok: false, reason: 'incomplete', missing };
  // #220: canonical shape carries reason text in `rationale`. Buggy markers
  // may have repeated the reason into all three bucket slots — synthesize
  // `rationale` from `size` so downstream consumers always read a single
  // field regardless of shape.
  const normalized =
    typeof parsed.rationale === 'string' && parsed.rationale.trim() !== ''
      ? parsed
      : { ...parsed, rationale: parsed.size };
  return { ok: true, rationale: normalized, raw: m[0] };
}

export function stripRationaleMarker(body = '') {
  return String(body)
    .replace(RATIONALE_MARKER_RE, '')
    .replace(/\n{3,}/g, '\n\n');
}

export function buildRefinementCommentBody({ issueNumber, size, estimate, priority, rationale }) {
  // #220: the rationale prose lives in `rationale.rationale` under the new
  // canonical shape. Legacy markers without that field have it synthesized by
  // `parseRationaleMarker`, so this read is uniform.
  const reasonText = rationale.rationale;
  return [
    `<!-- aitm-refined-estimate: ${issueNumber} -->`,
    REFINEMENT_HEADER,
    '',
    'Initial provisional sizing at Refine (refined at Plan).',
    '',
    '| Field | Value | Rationale |',
    '|---|---|---|',
    `| Size | ${size} | ${reasonText} |`,
    `| Estimate | ${estimate}h | ${reasonText} |`,
    `| Priority | ${priority} | ${reasonText} |`,
    '',
    'Provisional — Plan will re-evaluate and post a `### 🔁 Plan re-estimate` comment if the bucket shifts.',
  ].join('\n');
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultListCommentBodies({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    [
      'issue',
      'view',
      String(issueNumber),
      '-R',
      repo,
      '--json',
      'comments',
      '--jq',
      '.comments[].body',
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '').split('\n');
}

async function defaultMutateIssueBody({ issueNumber, repo, mutate, withGovernedEffect }) {
  await mutateIssueBody({
    issueNumber,
    repo,
    mutate,
    deps: { pexec, withGovernedEffect },
  });
}

// On Deck → Refine gate (#133, relocated from Backlog → Refine in #433):
// require only Priority on the board. Sizing and rationale are produced during
// Refine and verified at Refine → Plan.
export async function planPriorityGate({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('planPriorityGate: cfg is required');
  if (!issueNumber) throw new Error('planPriorityGate: issueNumber is required');

  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;

  const fieldDefs = fieldDefsLoader();
  let projVals = {};
  try {
    projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
  } catch (err) {
    return { ok: false, blockers: [`refine-board-fetch-failed: ${err.message}`] };
  }
  if (!projVals.priority) {
    return {
      ok: false,
      blockers: [
        'refine-field-missing: Priority is not set on the project board — run `scripts/gh/set-priority.mjs <#> p0|p1|p2` or set it in the kanban UI',
      ],
    };
  }
  return { ok: true };
}

// Count `## Acceptance Criteria` items (checked or unchecked) — refuse the
// Refine → Plan move when the section is empty (#133 AC).
function countAcceptanceCriteriaItems(body = '') {
  const src = String(body);
  const headRe = /^##\s+Acceptance Criteria\s*$/im;
  const m = src.match(headRe);
  if (!m) return 0;
  const start = m.index + m[0].length;
  const after = src.slice(start);
  const nextHead = after.search(/^##\s+/m);
  const section = nextHead >= 0 ? after.slice(0, nextHead) : after;
  const items = section.match(/^\s*-\s*\[[ xX]\]/gm);
  return items ? items.length : 0;
}

// Pre-flight gate: returns `{ ok: true, plan }` or `{ ok: false, blockers: [...] }`.
// `plan` carries the resolved values + the comment body ready to post.
export async function planRefinementEstimate({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('planRefinementEstimate: cfg is required');
  if (!issueNumber) throw new Error('planRefinementEstimate: issueNumber is required');

  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;

  const fieldDefs = fieldDefsLoader();
  let projVals = {};
  try {
    projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
  } catch (err) {
    return {
      ok: false,
      blockers: [`refine-board-fetch-failed: ${err.message}`],
    };
  }

  const size = projVals.size;
  const estimate = typeof projVals.estimate === 'number' ? projVals.estimate : null;
  const priority = projVals.priority;

  const blockers = [];
  if (!size) blockers.push('refine-field-missing: Size is not set on the project board');
  if (estimate == null)
    blockers.push('refine-field-missing: Estimate is not set on the project board');
  if (!priority) blockers.push('refine-field-missing: Priority is not set on the project board');
  if (countAcceptanceCriteriaItems(body) === 0) {
    blockers.push(
      'refine-ac-section-empty: `## Acceptance Criteria` has no items — add `- [ ] ...` lines before promoting to Plan'
    );
  }

  const rationaleResult = parseRationaleMarker(body);
  if (!rationaleResult.ok) {
    if (rationaleResult.reason === 'missing') {
      blockers.push(
        'refine-rationale-missing: add `<!-- aitm-refinement-rationale: {"size":"...","estimate":"...","priority":"..."} -->` to the issue body before promoting'
      );
    } else if (rationaleResult.reason === 'invalid-json') {
      blockers.push(`refine-rationale-invalid: ${rationaleResult.detail}`);
    } else if (rationaleResult.reason === 'incomplete') {
      blockers.push(
        `refine-rationale-incomplete: missing field(s) ${rationaleResult.missing.join(', ')}`
      );
    }
  }

  if (blockers.length) return { ok: false, blockers };

  const commentBody = buildRefinementCommentBody({
    issueNumber,
    size,
    estimate,
    priority,
    rationale: rationaleResult.rationale,
  });
  const strippedBody = stripRationaleMarker(body);

  return {
    ok: true,
    plan: {
      size,
      estimate,
      priority,
      rationale: rationaleResult.rationale,
      commentBody,
      strippedBody,
    },
  };
}

// Post-success hook: posts the comment (idempotent) and strips the rationale
// marker from the body. Returns one of:
//   { status: 'posted' }
//   { status: 'duplicate' }   — marker already present in a comment
//   { status: 'post-failed', error }
export async function applyRefinementEstimate({ cfg, issueNumber, plan, deps = {} } = {}) {
  if (!cfg) throw new Error('applyRefinementEstimate: cfg is required');
  if (!issueNumber) throw new Error('applyRefinementEstimate: issueNumber is required');
  if (!plan?.commentBody) throw new Error('applyRefinementEstimate: plan.commentBody is required');

  const postComment = deps.postComment || defaultPostComment;
  const listCommentBodies = deps.listCommentBodies || defaultListCommentBodies;
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const governWrite = (callback) =>
    typeof deps.withGovernedEffect === 'function'
      ? deps.withGovernedEffect(
          {
            issueId: String(issueNumber),
            operation: 'evidence-mutation',
            heartbeat: true,
          },
          callback
        )
      : callback();

  try {
    const bodies = await listCommentBodies({ issueNumber, repo: cfg.repo });
    const hit = bodies.some((b) => {
      const m = String(b).match(COMMENT_MARKER_RE);
      return m && Number(m[1]) === Number(issueNumber);
    });
    if (hit) {
      return { status: 'duplicate' };
    }
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
    // Fall through — if we can't list, attempt the post; duplicate risk is
    // limited because re-runs are rare and the marker is human-recoverable.
  }

  try {
    await governWrite(() => postComment({ issueNumber, repo: cfg.repo, body: plan.commentBody }));
  } catch (err) {
    if (isGovernedAuthorityError(err)) throw err;
    return { status: 'post-failed', error: err.message };
  }

  // #210 / #295 — strip the rationale marker from the FRESH base inside the
  // mutate closure. The closure does its own read; if a concurrent writer
  // landed between move-state and now (e.g. the `aitm-last-known-state`
  // stamp from the refine→plan transition), the closure sees their work and
  // preserves it. Idempotent: if the rationale marker isn't present, the
  // mutate returns base unchanged and mutateIssueBody no-ops.
  try {
    await governWrite(() =>
      mutateBody({
        issueNumber,
        repo: cfg.repo,
        mutate: (base) => stripRationaleMarker(base),
        withGovernedEffect: deps.withGovernedEffect,
      })
    );
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
    // Best-effort — comment is already on the issue.
  }

  return { status: 'posted' };
}
