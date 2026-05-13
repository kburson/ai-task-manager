// Groom-stage estimate comment poster. Fires on Backlog → Groom in promote.mjs.
//
// Symmetric to apply-reevaluate.mjs: reads the agent-authored rationale marker
// from the issue body, combines it with the project board's Size / Estimate /
// Priority values, and posts a `### 🛠 Refine estimate` audit comment. The post
// is idempotent via a hidden marker `<!-- aitm-groom-estimate: <N> -->`.
//
// Pure-ish core: all I/O is injectable for offline tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

export const GROOM_HEADER = '### 🛠 Refine estimate';
export const RATIONALE_MARKER_RE = /<!--\s*aitm-groom-rationale:\s*(\{[\s\S]*?\})\s*-->/;
export const COMMENT_MARKER_PREFIX = '<!-- aitm-groom-estimate:';

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
  return { ok: true, rationale: parsed, raw: m[0] };
}

export function stripRationaleMarker(body = '') {
  return String(body)
    .replace(RATIONALE_MARKER_RE, '')
    .replace(/\n{3,}/g, '\n\n');
}

export function buildGroomCommentBody({ issueNumber, size, estimate, priority, rationale }) {
  return [
    `<!-- aitm-groom-estimate: ${issueNumber} -->`,
    GROOM_HEADER,
    '',
    'Initial provisional sizing at Refine (refined at Plan).',
    '',
    '| Field | Value | Rationale |',
    '|---|---|---|',
    `| Size | ${size} | ${rationale.size} |`,
    `| Estimate | ${estimate}h | ${rationale.estimate} |`,
    `| Priority | ${priority} | ${rationale.priority} |`,
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

async function defaultWriteIssueBody({ issueNumber, repo, body, scratchDir }) {
  const tmpFile = path.join(scratchDir, `groom-est-${issueNumber}.md`);
  writeFileSync(tmpFile, body);
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmpFile], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

// Pre-flight gate: returns `{ ok: true, plan }` or `{ ok: false, blockers: [...] }`.
// `plan` carries the resolved values + the comment body ready to post.
export async function planGroomEstimate({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('planGroomEstimate: cfg is required');
  if (!issueNumber) throw new Error('planGroomEstimate: issueNumber is required');

  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;

  const fieldDefs = fieldDefsLoader();
  let projVals = {};
  try {
    projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
  } catch (err) {
    return {
      ok: false,
      blockers: [`groom-board-fetch-failed: ${err.message}`],
    };
  }

  const size = projVals.size;
  const estimate = typeof projVals.estimate === 'number' ? projVals.estimate : null;
  const priority = projVals.priority;

  const blockers = [];
  if (!size) blockers.push('groom-field-missing: Size is not set on the project board');
  if (estimate == null)
    blockers.push('groom-field-missing: Estimate is not set on the project board');
  if (!priority) blockers.push('groom-field-missing: Priority is not set on the project board');

  const rationaleResult = parseRationaleMarker(body);
  if (!rationaleResult.ok) {
    if (rationaleResult.reason === 'missing') {
      blockers.push(
        'groom-rationale-missing: add `<!-- aitm-groom-rationale: {"size":"...","estimate":"...","priority":"..."} -->` to the issue body before promoting'
      );
    } else if (rationaleResult.reason === 'invalid-json') {
      blockers.push(`groom-rationale-invalid: ${rationaleResult.detail}`);
    } else if (rationaleResult.reason === 'incomplete') {
      blockers.push(
        `groom-rationale-incomplete: missing field(s) ${rationaleResult.missing.join(', ')}`
      );
    }
  }

  if (blockers.length) return { ok: false, blockers };

  const commentBody = buildGroomCommentBody({
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
export async function applyGroomEstimate({ cfg, issueNumber, plan, scratchDir, deps = {} } = {}) {
  if (!cfg) throw new Error('applyGroomEstimate: cfg is required');
  if (!issueNumber) throw new Error('applyGroomEstimate: issueNumber is required');
  if (!plan?.commentBody) throw new Error('applyGroomEstimate: plan.commentBody is required');

  const postComment = deps.postComment || defaultPostComment;
  const listCommentBodies = deps.listCommentBodies || defaultListCommentBodies;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;

  const marker = `${COMMENT_MARKER_PREFIX} ${issueNumber} -->`;
  try {
    const bodies = await listCommentBodies({ issueNumber, repo: cfg.repo });
    if (bodies.some((b) => b.includes(marker))) {
      return { status: 'duplicate' };
    }
  } catch {
    // Fall through — if we can't list, attempt the post; duplicate risk is
    // limited because re-runs are rare and the marker is human-recoverable.
  }

  try {
    await postComment({ issueNumber, repo: cfg.repo, body: plan.commentBody });
  } catch (err) {
    return { status: 'post-failed', error: err.message };
  }

  if (plan.strippedBody !== undefined) {
    try {
      await writeIssueBody({
        issueNumber,
        repo: cfg.repo,
        body: plan.strippedBody,
        scratchDir: scratchDir || path.resolve('tmp'),
      });
    } catch {
      // Best-effort — comment is already on the issue.
    }
  }

  return { status: 'posted' };
}
