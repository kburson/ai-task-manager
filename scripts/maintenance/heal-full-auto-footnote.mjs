#!/usr/bin/env node
// #177 — Heal closed issues that were auto-approved before the unified
// Full-Auto trigger landed: they have `aitm-review-approved` but neither
// `aitm-full-auto-approved` nor `aitm-human-reviewer`. The in-body audit
// trail is silently missing.
//
// Strategy: for each matching issue, insert the Full-Auto footnote block and
// stamp `aitm-full-auto-approved` with a synthetic `heal` signal. Post an
// audit-style comment naming this script + the run timestamp so the heal is
// observable in the timeline. Idempotent — re-running is a no-op.
//
// Usage:
//   node scripts/maintenance/heal-full-auto-footnote.mjs            # dry-run
//   node scripts/maintenance/heal-full-auto-footnote.mjs --apply    # mutate
//   node scripts/maintenance/heal-full-auto-footnote.mjs --issue 168 --apply

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../task-tracker/lib/scratch-dir.mjs';

import { loadConfig } from '../task-tracker/config.mjs';
import {
  REVIEW_APPROVED_RE,
  FULL_AUTO_APPROVED_RE,
  insertFullAutoFootnote,
  buildFullAutoApprovedMarker,
} from '../task-tracker/lib/markers.mjs';
import { HUMAN_REVIEWER_MARKER_RE } from '../task-tracker/lib/human-reviewer-audit.mjs';
import { assertKnownArgv, reportStrictArgvError } from '../task-tracker/lib/argv-strict.mjs';
import { confirmBlastRadius } from '../task-tracker/lib/blast-radius-guard.mjs';

export const USAGE =
  'Usage: heal-full-auto-footnote.mjs [--apply] [--issue <n>] [--yes]\n' +
  '  (default)   audit only, no writes\n' +
  '  --apply     write the healed full-auto footnote\n' +
  '  --issue <n> restrict to a single issue\n' +
  '  --yes       skip the blast-radius confirmation prompt on a multi-issue --apply\n' +
  '  --help, -h  print this usage and exit; never writes\n';

const HEAL_SIGNALS = 'reviewer-unset=1,env=0,tty=1,ci=0,heal=1';
const HEAL_AUDIT_RE = /<!--\s*aitm-full-auto-footnote-heal\s*-->/i;

function parseArgs(argv) {
  const args = { apply: false, issue: null, yes: false };

  // #878 — refuse unknown flags before any gh call.
  if (assertKnownArgv(argv, { flags: ['--apply', '--yes'], options: ['--issue'], usage: USAGE })) {
    args.help = true;
    return args;
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--issue' && argv[i + 1]) {
      args.issue = String(argv[i + 1]).replace(/^#/, '');
      i++;
    }
  }
  return args;
}

function sh(cmd, ...rest) {
  return execFileSync(cmd, rest, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function listClosedIssues(repo, singleIssue) {
  if (singleIssue) {
    const json = sh(
      'gh',
      'issue',
      'view',
      singleIssue,
      '-R',
      repo,
      '--json',
      'number,state,body,closedAt'
    );
    const parsed = JSON.parse(json);
    return [parsed];
  }
  const json = sh(
    'gh',
    'issue',
    'list',
    '-R',
    repo,
    '--state',
    'closed',
    '--limit',
    '500',
    '--json',
    'number,state,body,closedAt'
  );
  return JSON.parse(json);
}

function isHealCandidate(body = '') {
  if (!REVIEW_APPROVED_RE.test(body)) return false;
  if (FULL_AUTO_APPROVED_RE.test(body)) return false;
  if (HUMAN_REVIEWER_MARKER_RE.test(body)) return false;
  return true;
}

function writeBody(repo, issueNumber, body) {
  const tmp = path.join(projectScratchDir('heal'), `heal-footnote-${issueNumber}-${Date.now()}.md`);
  writeFileSync(tmp, body);
  try {
    sh('gh', 'issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // best-effort
    }
  }
}

function postHealComment(repo, issueNumber, ts) {
  const body = [
    '> 🔧 heal: stamped missing Full-Auto footnote retroactively (#177)',
    '',
    `Run timestamp: ${ts}`,
    'Script: scripts/maintenance/heal-full-auto-footnote.mjs',
    '',
    'Before this fix, `approve` skipped the footnote when running under Claude Code (no TTY/CI/TT_FULL_AUTO signal), even though the audit comment fired correctly via `enforceFullAutoAudit`. This heal restores parity.',
    '',
    '<!-- aitm-full-auto-footnote-heal -->',
  ].join('\n');
  sh('gh', 'issue', 'comment', String(issueNumber), '-R', repo, '--body', body);
}

async function main(deps = {}) {
  const confirm = deps.confirmBlastRadius || confirmBlastRadius;
  const { apply, issue, yes, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return;
  }
  const cfg = loadConfig();
  if (!cfg.repo) {
    console.error('repo not configured. Run: /task config repo owner/repo');
    process.exit(1);
  }
  const issues = listClosedIssues(cfg.repo, issue);
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const closedIssues = issues.filter((it) => it.state === 'CLOSED' || it.state === 'closed');
  const candidateIssues = closedIssues.filter((it) => isHealCandidate(it.body || ''));
  const skipped = closedIssues.length - candidateIssues.length;

  if (apply) {
    const decision = await confirm({
      issueNumbers: candidateIssues.map((it) => it.number),
      yes,
      log: (s) => process.stdout.write(s),
      warn: (s) => process.stderr.write(s),
    });
    if (!decision.proceed) {
      process.exit(2);
      return;
    }
  }

  let healed = 0;
  for (const it of candidateIssues) {
    console.log(
      `#${it.number} closed=${it.closedAt} — would stamp footnote + aitm-full-auto-approved`
    );
    if (!apply) continue;
    const marker = buildFullAutoApprovedMarker(ts, HEAL_SIGNALS);
    // Insert the footnote first; then add the FULL_AUTO_APPROVED marker.
    let nextBody = insertFullAutoFootnote(it.body, { ts, signals: HEAL_SIGNALS });
    if (!FULL_AUTO_APPROVED_RE.test(nextBody)) {
      nextBody = `${nextBody.replace(/\s+$/, '')}\n\n${marker}\n`;
    }
    writeBody(cfg.repo, it.number, nextBody);
    if (!HEAL_AUDIT_RE.test(it.body || '')) {
      postHealComment(cfg.repo, it.number, ts);
    }
    healed++;
  }
  console.log(
    `\nheal-full-auto-footnote: candidates=${candidateIssues.length} healed=${healed} skipped=${skipped} apply=${apply}`
  );
}

main().catch((err) => {
  if (reportStrictArgvError(err, { usage: USAGE })) process.exit(2);
  console.error(err.stack || err.message);
  process.exit(1);
});
