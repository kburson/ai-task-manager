#!/usr/bin/env node
// One-shot migration: rewrite estimation-comment headers from old vocab
// (`### 🛠 Groom estimate`, `### 🔁 Analysis re-estimate`) to the new
// 7-state Scrum vocab (`### 🛠 Refine estimate`, `### 🔁 Plan re-estimate`).
//
// Scope: comment bodies on every issue (open AND closed) in `cfg.repo`.
// Hidden markers (`aitm-groom-estimate`) are left as-is — see #99 deep-dive.
//
// Usage:
//   node scripts/maintenance/rename-estimation-headers.mjs --dry-run
//   node scripts/maintenance/rename-estimation-headers.mjs
//   node scripts/maintenance/rename-estimation-headers.mjs --repo owner/name

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { loadConfig } from '../task-tracker/config.mjs';
import { listAllIssues } from '../gh/lib/list-issues.mjs';

const pexec = promisify(execFile);

// Order matters: longer substrings that *contain* the short headers must run
// before the header-only replacements, otherwise the contained header is
// rewritten first and the longer match fails. Hidden markers
// (`aitm-groom-estimate`) are deliberately not touched — see migrations.md.
const REPLACEMENTS = [
  [
    'Provisional — Analyze will re-evaluate and post a `### 🔁 Analysis re-estimate` comment if the bucket shifts.',
    'Provisional — Plan will re-evaluate and post a `### 🔁 Plan re-estimate` comment if the bucket shifts.',
  ],
  [
    'Initial provisional sizing at Groom (refined at Analyze).',
    'Initial provisional sizing at Refine (refined at Plan).',
  ],
  ['### 🛠 Groom estimate', '### 🛠 Refine estimate'],
  ['### 🔁 Analysis re-estimate', '### 🔁 Plan re-estimate'],
];

export function rewriteCommentBody(body) {
  let out = String(body);
  for (const [from, to] of REPLACEMENTS) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

export function commentNeedsRewrite(body) {
  return REPLACEMENTS.some(([from]) => String(body).includes(from));
}

async function listIssueComments(repo, issueNumber) {
  const comments = [];
  let page = 1;
  while (true) {
    const { stdout } = await pexec(
      'gh',
      [
        'api',
        `repos/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
        '--jq',
        '[.[] | {id, body}]',
      ],
      { timeout: 30000 }
    );
    const batch = JSON.parse(stdout || '[]');
    if (batch.length === 0) break;
    comments.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return comments;
}

async function patchComment(repo, commentId, newBody) {
  const tmp = path.join(tmpdir(), `aitm-rename-${process.pid}-${commentId}.txt`);
  writeFileSync(tmp, newBody, 'utf8');
  try {
    await pexec(
      'gh',
      ['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${commentId}`, '-F', `body=@${tmp}`],
      { timeout: 15000 }
    );
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

function parseArgs(argv) {
  const args = { dryRun: false, repo: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--repo') args.repo = argv[++i];
  }
  return args;
}

async function main() {
  const { dryRun, repo: repoArg } = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  const repo = repoArg || cfg.repo;
  if (!repo) {
    process.stderr.write('error: no repo (pass --repo owner/name or set in config)\n');
    process.exit(2);
  }

  process.stdout.write(`Scanning ${repo} (${dryRun ? 'DRY-RUN' : 'APPLY'})...\n`);
  const issues = await listAllIssues(repo);
  process.stdout.write(`  found ${issues.length} issues (open + closed)\n`);

  let scanned = 0;
  let matched = 0;
  let patched = 0;
  let errors = 0;

  for (const issue of issues) {
    let comments;
    try {
      comments = await listIssueComments(repo, issue.number);
    } catch (err) {
      process.stderr.write(`  ⚠ #${issue.number}: list-comments failed: ${err.message}\n`);
      errors++;
      continue;
    }
    for (const c of comments) {
      scanned++;
      if (!commentNeedsRewrite(c.body)) continue;
      matched++;
      const newBody = rewriteCommentBody(c.body);
      if (dryRun) {
        process.stdout.write(`  [dry-run] #${issue.number} comment ${c.id}: would patch\n`);
        continue;
      }
      try {
        await patchComment(repo, c.id, newBody);
        patched++;
        process.stdout.write(`  ✓ #${issue.number} comment ${c.id}: patched\n`);
      } catch (err) {
        errors++;
        process.stderr.write(
          `  ⚠ #${issue.number} comment ${c.id}: patch failed: ${err.message}\n`
        );
      }
    }
  }

  process.stdout.write(
    `\nSummary: ${scanned} comments scanned, ${matched} matched, ${patched} patched, ${errors} errors.\n`
  );
  process.exit(errors > 0 ? 1 : 0);
}

const isDirect =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('rename-estimation-headers.mjs');
if (isDirect) {
  main().catch((err) => {
    process.stderr.write(`fatal: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
