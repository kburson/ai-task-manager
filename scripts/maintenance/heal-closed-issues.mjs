#!/usr/bin/env node
// Heal stale audit data on closed issues that were closed before the #157
// epic fixes (D1/D2/D3/D4) shipped. Not part of the npm package — repo-local
// maintenance tool. Idempotent; safe to re-run.
//
// Heal classes (run in this order per issue):
//   D2 — Review delta re-render: if delta comment uses the legacy
//        `| Field | ... | Hours |` table, recompute from current field-DB and
//        edit the comment in place; tag with `aitm-delta-rerendered`.
//   D3 — Board field backfill: if Engaged/Session/Review Time are 0/null but
//        the timing-log spans non-zero wall-clock, shell out to
//        `scripts/gh/log-issue-time.mjs <N>` (already does the right thing
//        post-#159).
//   D1 — Drivers backfill (auto only): for issues with
//        `aitm-full-auto-approved` and no `### 📝 Review Notes` comment, run
//        `derive-drivers` and post the notes comment; re-render the delta
//        comment to include the Drivers section.
//   D4 — Full-Auto footnote: for issues with `aitm-full-auto-approved` but no
//        footnote, insert the footnote block and re-run
//        `tickLifecycleItem('passed-final-review')`.
//
// Usage:
//   node scripts/maintenance/heal-closed-issues.mjs [--dry-run] [--issue N]
//   node scripts/maintenance/heal-closed-issues.mjs --issue 138 --dry-run

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../task-tracker/lib/scratch-dir.mjs';

import { loadConfig } from '../task-tracker/config.mjs';
import {
  parseFullAutoApprovedMarker,
  hasFullAutoFootnote,
  insertFullAutoFootnote,
} from '../task-tracker/lib/markers.mjs';
import { tickLifecycleItem, LIFECYCLE_LABELS } from '../task-tracker/lib/lifecycle-dod.mjs';
import {
  findReviewNotesComment,
  buildReviewNotesComment,
} from '../task-tracker/lib/review-notes.mjs';
import { deriveDrivers } from '../task-tracker/lib/derive-drivers.mjs';
import {
  computeReviewDelta,
  buildDeltaCommentBody,
  DELTA_HEADER,
} from '../task-tracker/lib/review-delta.mjs';
import { parseIssueFieldDb } from '../task-tracker/issue-field-db.mjs';

// ---- CLI ----

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const issueArgIdx = args.indexOf('--issue');
const singleIssue =
  issueArgIdx >= 0 && args[issueArgIdx + 1] ? String(args[issueArgIdx + 1]).replace('#', '') : null;

const cfg = loadConfig();
if (!cfg.repo) {
  console.error('repo not configured. Run: /task config repo owner/repo');
  process.exit(1);
}

// ---- gh helpers ----

function gh(argv, opts = {}) {
  return execFileSync('gh', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function ghJSON(argv) {
  return JSON.parse(gh(argv));
}

function listClosedIssues() {
  // Sub-issues + epic + ad-hoc cohort. `gh issue list --state closed` is
  // capped at 30 by default; bump and filter.
  const out = ghJSON([
    'issue',
    'list',
    '-R',
    cfg.repo,
    '--state',
    'closed',
    '--limit',
    '500',
    '--json',
    'number,title',
  ]);
  return out.map((i) => String(i.number));
}

function fetchBody(n) {
  return ghJSON(['issue', 'view', n, '-R', cfg.repo, '--json', 'body']).body || '';
}

function fetchComments(n) {
  return ghJSON(['issue', 'view', n, '-R', cfg.repo, '--json', 'comments']).comments || [];
}

function writeBody(n, body) {
  const tmp = path.join(projectScratchDir('heal'), `heal-${n}-${Date.now()}.md`);
  writeFileSync(tmp, body);
  try {
    gh(['issue', 'edit', n, '-R', cfg.repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

function postComment(n, body) {
  const tmp = path.join(projectScratchDir('heal'), `heal-comment-${n}-${Date.now()}.md`);
  writeFileSync(tmp, body);
  try {
    gh(['issue', 'comment', n, '-R', cfg.repo, '--body-file', tmp]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

// ---- Heal classes ----

// Decodes `{ ts, signals }` from BOTH the legacy `<ts>:<signals>` colon payload
// and the new `ts="…" signals="…"` property grammar (#380). The dual-grammar
// logic lives in `parseFullAutoApprovedMarker` so there is one decoder.
function parseFullAutoMarker(body) {
  return parseFullAutoApprovedMarker(body);
}

function healD4Footnote(n, body) {
  const auto = parseFullAutoMarker(body);
  if (!auto) return { ran: false, reason: 'no full-auto marker' };
  if (hasFullAutoFootnote(body)) return { ran: false, reason: 'footnote already present' };
  let next = insertFullAutoFootnote(body, { ts: auto.ts, signals: auto.signals });
  // Also re-tick the lifecycle box if still unchecked.
  const tickKey = 'passed-final-review';
  if (next.includes(`- [ ] ${LIFECYCLE_LABELS[tickKey]}`)) {
    next = tickLifecycleItem(next, tickKey);
  }
  if (next === body) return { ran: false, reason: 'no-op' };
  if (dryRun) {
    console.log(`  D4 dry-run: would insert footnote (ts=${auto.ts}, signals=${auto.signals})`);
    return { ran: true, newBody: next };
  }
  writeBody(n, next);
  console.log(`  D4 healed: footnote inserted`);
  return { ran: true, newBody: next };
}

function healD1Drivers(n, body, comments) {
  const auto = parseFullAutoMarker(body);
  if (!auto) return { ran: false, reason: 'human-approved or no marker' };
  const existing = findReviewNotesComment(comments, { deltaCommentTs: null });
  if (existing) return { ran: false, reason: 'review notes already present' };
  // Derive from body + comments + parsed field-DB.
  const fieldDb = parseIssueFieldDb(body);
  const fields = fieldDb?.values || {};
  const drivers = deriveDrivers({
    body,
    comments: comments.map((c) => ({ body: c.body })),
    fields,
  });
  const commentBody = buildReviewNotesComment(drivers, { source: 'auto' });
  if (dryRun) {
    console.log(`  D1 dry-run: would post Review Notes comment with ${drivers.length} driver(s)`);
    return { ran: true };
  }
  postComment(n, commentBody);
  console.log(`  D1 healed: posted Review Notes comment with ${drivers.length} driver(s)`);
  return { ran: true };
}

function healD2DeltaRerender(n, body, comments) {
  const stale = comments.find(
    (c) =>
      c.body && c.body.includes(DELTA_HEADER) && /\|\s*Field\s*\|.*\|\s*Hours\s*\|/i.test(c.body)
  );
  if (!stale) return { ran: false, reason: 'no legacy-format delta comment' };
  const fields = parseIssueFieldDb(body)?.values || {};
  const estimateHr = typeof fields.estimate === 'number' ? fields.estimate : null;
  // engagedTime is minutes on the board; convert to seconds.
  const engagedMin = typeof fields.engagedTime === 'number' ? fields.engagedTime : null;
  const actualSec = engagedMin != null ? engagedMin * 60 : null;
  const result = computeReviewDelta({ estimateHr, actualSec });
  let newBody = buildDeltaCommentBody(result);
  newBody += `\n\n<!-- aitm-delta-rerendered: ${new Date().toISOString()} -->`;
  if (dryRun) {
    console.log(`  D2 dry-run: would re-render delta comment (id=${stale.id || stale.url || '?'})`);
    return { ran: true };
  }
  // gh CLI cannot edit issue comments directly; use GraphQL via gh api.
  if (!stale.id) {
    console.log(`  D2 skipped: comment missing GraphQL id (cannot edit)`);
    return { ran: false, reason: 'no comment id' };
  }
  const tmp = path.join(projectScratchDir('heal'), `heal-delta-${n}-${Date.now()}.md`);
  writeFileSync(tmp, newBody);
  try {
    gh([
      'api',
      'graphql',
      '-f',
      `query=mutation($id:ID!,$body:String!){updateIssueComment(input:{id:$id,body:$body}){clientMutationId}}`,
      '-f',
      `id=${stale.id}`,
      '-F',
      `body=@${tmp}`,
    ]);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
  console.log(`  D2 healed: delta comment re-rendered`);
  return { ran: true };
}

function healD3BoardFields(n, body) {
  // Quick gate: if field-DB shows engagedTime > 0, no heal needed.
  const fields = parseIssueFieldDb(body)?.values || {};
  if (typeof fields.engagedTime === 'number' && fields.engagedTime > 0) {
    return { ran: false, reason: 'engagedTime already non-zero' };
  }
  if (dryRun) {
    console.log(`  D3 dry-run: would shell out to log-issue-time.mjs ${n}`);
    return { ran: true };
  }
  try {
    const out = execFileSync('node', ['scripts/gh/log-issue-time.mjs', n], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const last = out.trim().split('\n').slice(-3).join(' | ');
    console.log(`  D3 healed: ${last}`);
    return { ran: true };
  } catch (e) {
    console.log(`  D3 skipped: log-issue-time.mjs exited non-zero (${e.message.split('\n')[0]})`);
    return { ran: false, reason: 'log-issue-time failed' };
  }
}

// ---- Main ----

(async () => {
  const targets = singleIssue ? [singleIssue] : listClosedIssues();
  console.log(
    `heal-closed-issues: ${targets.length} issue(s) | repo=${cfg.repo} | dry-run=${dryRun}`
  );

  for (const n of targets) {
    let body, comments;
    try {
      body = fetchBody(n);
      comments = fetchComments(n);
    } catch (e) {
      console.log(`#${n}: skipped (fetch error: ${e.message.split('\n')[0]})`);
      continue;
    }
    console.log(`#${n}:`);
    // Order: D2 (no mutation of body) → D3 (board only) → D1 (posts comment) → D4 (body edit)
    healD2DeltaRerender(n, body, comments);
    healD3BoardFields(n, body);
    // Re-fetch in case D2/D3 added a comment.
    comments = fetchComments(n);
    healD1Drivers(n, body, comments);
    // D4 last so the body write doesn't race other body writes.
    body = fetchBody(n);
    healD4Footnote(n, body);
  }
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
