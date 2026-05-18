// `approve` verb — Review -> Done human gate.
//
// Records human review approval on an issue by appending a hidden marker to
// the issue body. `verbClose` reads the marker; without it (and with
// `gateReviewToDone=true`), close refuses.
//
// Idempotent: re-invocation with the marker already present is a no-op.
// Refuses if the issue is not in `review` state.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import {
  buildReviewApprovedMarker,
  hasReviewApprovedMarker,
  insertReviewApprovedMarker,
  insertFullAutoApprovedMarker,
  insertFullAutoFootnote,
} from '../lib/markers.mjs';
import { tickLifecycleItem } from '../lib/lifecycle-dod.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { buildReviewNotesComment } from '../lib/review-notes.mjs';
import { deriveDrivers } from '../lib/derive-drivers.mjs';

const pexec = promisify(execFile);

// Re-exports for back-compat with existing tests/callers that imported the
// helpers from this module before the centralization in lib/markers.mjs.
export const buildMarker = buildReviewApprovedMarker;
export const hasApprovalMarker = hasReviewApprovedMarker;
export const insertApprovalMarker = insertReviewApprovedMarker;

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.body ?? '';
}

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(tmpdir(), `aitm-approve-${process.pid}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

async function defaultGetBoardState({ issueNumber, projectDir: _projectDir }) {
  const mod = await import('../task-tracker.mjs');
  return mod.getIssueBoardState(String(issueNumber).replace(/^#/, ''));
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultFetchComments({ issueNumber, repo }) {
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'comments'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed.comments) ? parsed.comments : [];
  } catch {
    return [];
  }
}

async function defaultProjectValues({ cfg, issueNumber }) {
  if (!cfg?.projectId) return {};
  try {
    const { projectValuesForIssue } = await import('../../gh/lib/github-projects.mjs');
    const { loadProjectFieldDefs } = await import('../project-fields.mjs');
    const fieldDefs = loadProjectFieldDefs();
    return await projectValuesForIssue({ cfg, fieldDefs, issueNumber });
  } catch {
    return {};
  }
}

// Prompt the reviewer for driver bullets via stdin. One bullet per line; blank
// line ends input. Returns string[]. Empty input is allowed.
async function defaultPromptDrivers() {
  return new Promise((resolve) => {
    if (!process.stdin || process.stdin.isTTY !== true) {
      resolve([]);
      return;
    }
    process.stderr.write(
      'Enter Review Notes drivers, one bullet per line. Blank line to finish:\n'
    );
    const out = [];
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.trim() === '') {
          process.stdin.off('data', onData);
          process.stdin.pause();
          resolve(out);
          return;
        }
        out.push(line.trim());
      }
    };
    process.stdin.on('data', onData);
    process.stdin.resume();
  });
}

// #156 — Detect "no human in the loop" so the approve verb can stamp an
// audit marker that flags machine-generated approvals. There is no
// Claude-Code-native signal; the wrapper has to declare it. We accept any of:
//   - `TT_FULL_AUTO=1` (explicit, set by fleet/orchestrator)
//   - `process.stdin.isTTY === false` (headless inference)
//   - `CI=1` (generic CI flag)
// If any fires, we record which ones via the signals string so the audit
// trail explains its own confidence later. `env` defaults to process.env;
// `tty` defaults to process.stdin.isTTY so tests can stub.
export function detectFullAuto({ env = process.env, tty = process.stdin?.isTTY } = {}) {
  const envOn = env.TT_FULL_AUTO === '1';
  const ttyOff = tty === false;
  const ciOn = env.CI === '1' || env.CI === 'true';
  const fired = envOn || ttyOff || ciOn;
  if (!fired) return { fired: false, signals: '' };
  const parts = [`env=${envOn ? 1 : 0}`, `tty=${ttyOff ? 0 : 1}`, `ci=${ciOn ? 1 : 0}`];
  return { fired: true, signals: parts.join(',') };
}

export async function runApprove({ issueNumber, cfg, projectDir, deps = {} } = {}) {
  if (!issueNumber) throw new Error('approve: issueNumber is required');
  if (!cfg) throw new Error('approve: cfg is required');

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const getBoardState = deps.getBoardState || defaultGetBoardState;
  const nowIso = deps.nowIso || (() => new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
  const detect = deps.detectFullAuto || detectFullAuto;
  const postComment = deps.postComment || defaultPostComment;
  const fetchComments = deps.fetchComments || defaultFetchComments;
  const fetchProjectValues = deps.fetchProjectValues || defaultProjectValues;
  const promptDrivers = deps.promptDrivers || defaultPromptDrivers;
  const derive = deps.deriveDrivers || deriveDrivers;

  const state = await getBoardState({ issueNumber, projectDir });
  if (state !== 'review') {
    return {
      status: 'wrong-state',
      message: `#${issueNumber} is in '${state ?? 'unknown'}', expected 'review' — approve only applies to issues in Review.`,
    };
  }

  const body = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  if (hasApprovalMarker(body)) {
    return { status: 'already-approved' };
  }
  const ts = nowIso();
  const auto = detect();

  // D1 — post `### 📝 Review Notes` comment BEFORE the approval marker so the
  // delta-comment in `close` can consume it. Human mode prompts stdin; full-
  // auto mode derives from observable signals. Either may yield zero drivers;
  // that's fine — the renderer omits the Drivers section when empty.
  let drivers = [];
  let notesSource = null;
  try {
    if (auto.fired) {
      const [comments, fields] = await Promise.all([
        fetchComments({ issueNumber, repo: cfg.repo }),
        fetchProjectValues({ cfg, issueNumber }),
      ]);
      drivers = derive({ body, comments, fields });
      notesSource = 'auto';
    } else {
      drivers = await promptDrivers();
      notesSource = 'human';
    }
    if (drivers.length > 0 || notesSource === 'auto') {
      const noteBody = buildReviewNotesComment(drivers, { source: notesSource });
      await postComment({ issueNumber, repo: cfg.repo, body: noteBody });
    }
  } catch (err) {
    process.stderr.write(`⚠ approve: review-notes post failed: ${err.message}\n`);
  }

  let updated = insertApprovalMarker(body, ts);
  // #156 — Stamp full-auto marker BEFORE ticking the "Passed final human
  // review" lifecycle item, so the audit trail records that the tick was
  // machine-generated, not human-evaluated. The tick still happens because
  // close-gates depend on it; the marker preserves truth alongside.
  if (auto.fired) {
    updated = insertFullAutoApprovedMarker(updated, ts, auto.signals);
    updated = insertFullAutoFootnote(updated, { ts, signals: auto.signals });
  }
  const beforeTick = updated;
  updated = tickLifecycleItem(updated, 'passed-final-review');
  if (updated === beforeTick && /-\s*\[ \]\s+Passed final human review/i.test(beforeTick)) {
    process.stderr.write(
      `approve: lifecycle-tick-noop: 'passed-final-review' label not matched — body may use legacy heading\n`
    );
  }
  await writeIssueBody({ issueNumber, repo: cfg.repo, body: updated });
  return {
    status: 'approved',
    ts,
    fullAuto: auto.fired,
    signals: auto.signals,
    drivers,
    notesSource,
  };
}

function parseArgs(rest) {
  const out = { issueNumber: null };
  for (const a of rest) {
    const m = String(a).match(/^#?(\d+)$/);
    if (m && out.issueNumber === null) out.issueNumber = Number(m[1]);
  }
  return out;
}

export async function verbApprove(rest, cfg) {
  const { issueNumber } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: /task approve #N\n');
    process.exit(1);
  }
  if (process.env.TT_SKIP_NETWORK === '1') {
    process.stderr.write('approve: TT_SKIP_NETWORK set — refusing to run gate offline\n');
    process.exit(1);
  }
  const projectDir = getProjectDir();
  let result;
  try {
    result = await runApprove({ issueNumber, cfg, projectDir });
  } catch (err) {
    process.stderr.write(`approve: ${err.message}\n`);
    process.exit(1);
  }
  switch (result.status) {
    case 'approved':
      process.stdout.write(
        `✓ Review approved for #${issueNumber} at ${result.ts}. \`/task close #${issueNumber}\` may now proceed.\n`
      );
      return;
    case 'already-approved':
      process.stdout.write(`#${issueNumber} already has a review-approval marker — no change.\n`);
      return;
    case 'wrong-state':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(3);
    default:
      process.stderr.write(`approve: unknown result: ${result.status}\n`);
      process.exit(1);
  }
}

const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (_isMain) {
  const { loadConfig } = await import('../config.mjs');
  const cfg = loadConfig();
  await verbApprove(process.argv.slice(2), cfg);
}
