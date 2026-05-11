// Review-stage delta: reads Estimate + engagedTime (Actual Hours) from the
// project board, computes Δ via lib/review-delta.mjs, posts an audit comment.
// Read-only by design — never writes Size/Estimate. The hard-guard is that
// this module imports neither `writeProjectFieldValue` nor any `gh issue edit`
// path. Failures must not block the calling verb (verbClose).
//
// Note on units: `Estimate` is hours; `engagedTime` is the board's hours-
// denominated "Actual Hours" field (same field id as fieldActualHours). We
// deliberately do NOT use `sessionTime` (minutes) — units would mismatch.
//
// Deps are injectable for tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { computeReviewDelta, buildDeltaCommentBody, DELTA_HEADER } from './review-delta.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';

const pexec = promisify(execFile);

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], { timeout: 5000 });
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

  let estimate = null;
  let actual = null;
  if (cfg.projectId) {
    try {
      const projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
      if (typeof projVals.estimate === 'number') estimate = projVals.estimate;
      if (typeof projVals.engagedTime === 'number') actual = projVals.engagedTime;
    } catch {}
  }

  if (estimate == null && body) {
    const dbParsed = parseIssueFieldDb(body);
    if (dbParsed.ok && typeof dbParsed.values?.estimate === 'number') {
      estimate = dbParsed.values.estimate;
    }
  }

  const result = computeReviewDelta({ estimate, actual });
  const commentBody = buildDeltaCommentBody(result);

  try {
    await postComment({ issueNumber, repo: cfg.repo, body: commentBody });
  } catch (err) {
    process.stderr.write(`⚠ review-delta: comment post failed: ${err.message}\n`);
    return { status: 'error', result, error: err.message };
  }

  return { status: 'applied', result };
}
