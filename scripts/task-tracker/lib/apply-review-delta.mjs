// Review-stage delta: reads Estimate + engagedTime from the project board,
// computes Δ via lib/review-delta.mjs, posts an audit comment. Read-only by
// design — never writes Size/Estimate. The hard-guard is that this module
// imports neither `writeProjectFieldValue` nor any `gh issue edit` path.
// Failures must not block the calling verb (verbClose).
//
// Note on units: `estimate` is HOURS (board Number field, `unit: hours`).
// `engagedTime` and `planTime` are board TEXT fields holding fixed-width
// `DDd HHh MMm SSs` duration strings whose canonical unit is integer SECONDS
// (#398/#399). We parse them with `parseDuration` at the boundary and pass the
// resulting seconds straight to computeReviewDelta, which does all math in
// seconds. No minutes→seconds multiplication remains.
//
// Deps are injectable for tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { computeReviewDelta, buildDeltaCommentBody, DELTA_HEADER } from './review-delta.mjs';
import { parseDuration } from './duration.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { findReviewNotesComment, parseDrivers } from './review-notes.mjs';
import { isGovernedAuthorityError } from './work-lease/governed-effect.mjs';

const pexec = promisify(execFile);

async function defaultPostComment({ issueNumber, repo, body, exec = pexec }) {
  await exec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultFetchComments({ issueNumber, repo, exec = pexec }) {
  try {
    const { stdout } = await exec(
      'gh',
      ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'comments'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed.comments) ? parsed.comments : [];
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
    return [];
  }
}

export async function applyReviewDelta({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('applyReviewDelta: cfg is required');
  if (!issueNumber) throw new Error('applyReviewDelta: issueNumber is required');

  // #631 — thread an injectable exec into the two default gh helpers so their
  // subprocess round-trips are unit-drivable. Production passes no `deps.exec`,
  // so the defaults bind the real `pexec` — byte-identical to prior behavior.
  const execFn = deps.exec || pexec;
  const postComment = deps.postComment || ((a) => defaultPostComment({ ...a, exec: execFn }));
  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
  const fetchComments = deps.fetchComments || ((a) => defaultFetchComments({ ...a, exec: execFn }));
  const postMutatingComment = (options) => {
    if (typeof deps.withGovernedEffect !== 'function') return postComment(options);
    return deps.withGovernedEffect(
      {
        issueId: String(issueNumber),
        operation: deps.operation || 'close',
        heartbeat: true,
      },
      () => postComment(options)
    );
  };

  const ts = new Date().toISOString();
  if (process.env.TASK_TRACKER_SKIP_DELTA === '1') {
    try {
      await postMutatingComment({
        issueNumber,
        repo: cfg.repo,
        body: `${DELTA_HEADER}\n\n_Bypassed via \`TASK_TRACKER_SKIP_DELTA=1\` at ${ts}._`,
      });
    } catch (error) {
      if (isGovernedAuthorityError(error)) throw error;
      /* best-effort: GitHub/telemetry side effect; core flow proceeds */
    }
    return { status: 'skipped' };
  }

  const fieldDefs = fieldDefsLoader();

  // The four board "actuals" fields are Text duration strings (`DDd HHh MMm SSs`,
  // integer seconds) since #398/#399. Parse to seconds at the boundary; tolerate
  // an absent/blank/malformed value by yielding null so the delta degrades
  // gracefully rather than throwing.
  const boardSeconds = (v) => {
    if (typeof v !== 'string' || v.trim() === '') return null;
    try {
      return parseDuration(v);
    } catch {
      return null;
    }
  };

  let estimateHr = null;
  let engagedSec = null;
  let planSec = null;
  if (cfg.projectId) {
    try {
      const projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
      if (typeof projVals.estimate === 'number') estimateHr = projVals.estimate;
      engagedSec = boardSeconds(projVals.engagedTime);
      planSec = boardSeconds(projVals.planTime);
    } catch (error) {
      if (isGovernedAuthorityError(error)) throw error;
      /* best-effort: failure must not abort the primary operation */
    }
  }

  if (estimateHr == null && body) {
    const dbParsed = parseIssueFieldDb(body);
    if (dbParsed.ok && typeof dbParsed.values?.estimate === 'number') {
      estimateHr = dbParsed.values.estimate;
    }
  }

  // engagedSec/planSec are already canonical integer seconds (parsed from the
  // board duration strings above); no minutes→seconds conversion needed.
  const result = computeReviewDelta({ estimateHr, actualSec: engagedSec, planSec });

  // Drivers: pull from the most-recent `### 📝 Review Notes` comment, if any.
  let drivers = [];
  try {
    const comments = await fetchComments({ issueNumber, repo: cfg.repo });
    const notes = findReviewNotesComment(comments);
    if (notes) drivers = parseDrivers(notes.body);
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
    /* best-effort: failure must not abort the primary operation */
  }

  const commentBody = buildDeltaCommentBody(result, { drivers });

  try {
    await postMutatingComment({ issueNumber, repo: cfg.repo, body: commentBody });
  } catch (err) {
    if (isGovernedAuthorityError(err)) throw err;
    process.stderr.write(`⚠ review-delta: comment post failed: ${err.message}\n`);
    return { status: 'error', result, error: err.message };
  }

  return { status: 'applied', result };
}
