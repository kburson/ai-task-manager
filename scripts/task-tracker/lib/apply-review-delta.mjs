// Review-stage delta: reads Estimate + engagedTime from the project board,
// computes Δ via lib/review-delta.mjs, posts an audit comment. Read-only by
// design — never writes Size/Estimate. The hard-guard is that this module
// imports neither `writeProjectFieldValue` nor any `gh issue edit` path.
// Failures must not block the calling verb (verbClose).
//
// Note on units: `estimate` is HOURS (board field, `unit: hours`).
// `engagedTime` is MINUTES (board field, `unit: minutes` — see
// config/project-fields.default.json). We convert minutes → seconds here
// (`* 60`) before passing to computeReviewDelta, which does all math in
// seconds. When D3 ships second-precision rollup, this multiplication
// stays correct as a no-op (rollup already integers) until we change the
// board field's stored unit; the renderer is the source of truth.
//
// Deps are injectable for tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { computeReviewDelta, buildDeltaCommentBody, DELTA_HEADER } from './review-delta.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

export async function applyReviewDelta({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('applyReviewDelta: cfg is required');
  if (!issueNumber) throw new Error('applyReviewDelta: issueNumber is required');

  const postComment = deps.postComment || defaultPostComment;
  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;

  const ts = new Date().toISOString();
  if (process.env.TASK_TRACKER_SKIP_DELTA === '1') {
    try {
      await postComment({
        issueNumber,
        repo: cfg.repo,
        body: `${DELTA_HEADER}\n\n_Bypassed via \`TASK_TRACKER_SKIP_DELTA=1\` at ${ts}._`,
      });
    } catch {}
    return { status: 'skipped' };
  }

  const fieldDefs = fieldDefsLoader();

  let estimateHr = null;
  let engagedMin = null;
  if (cfg.projectId) {
    try {
      const projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
      if (typeof projVals.estimate === 'number') estimateHr = projVals.estimate;
      if (typeof projVals.engagedTime === 'number') engagedMin = projVals.engagedTime;
    } catch {}
  }

  if (estimateHr == null && body) {
    const dbParsed = parseIssueFieldDb(body);
    if (dbParsed.ok && typeof dbParsed.values?.estimate === 'number') {
      estimateHr = dbParsed.values.estimate;
    }
  }

  // Convert engaged minutes → seconds at the boundary. D3 will eventually
  // surface seconds directly; until then, this is a faithful conversion at
  // minute granularity.
  const actualSec = engagedMin === null ? null : engagedMin * 60;
  const result = computeReviewDelta({ estimateHr, actualSec });
  const commentBody = buildDeltaCommentBody(result);

  try {
    await postComment({ issueNumber, repo: cfg.repo, body: commentBody });
  } catch (err) {
    process.stderr.write(`⚠ review-delta: comment post failed: ${err.message}\n`);
    return { status: 'error', result, error: err.message };
  }

  return { status: 'applied', result };
}
