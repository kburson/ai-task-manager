#!/usr/bin/env node
// Atomic issue creation: gh issue create + project tether + sub-issue link +
// `<this-issue-#>` placeholder substitution. Replaces the multi-step orchestration
// pattern previously inlined in skill/shared/SKILL.md.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from '../task-tracker/config.mjs';
import { GH_API_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TETHER_SCRIPT =
  process.env.CREATE_ISSUE_TETHER_SCRIPT || path.join(SCRIPT_DIR, 'project-tether.mjs');
const ISSUE_URL_RE = /\/issues\/(\d+)/;
const PLACEHOLDER_RE = /<this-issue-#>|<parent-epic-#>/;

function usage() {
  return `Usage: create-issue.mjs --title <t> --body-file <path> [--label <l> ...] [--priority p0|p1|p2] [--size XS|S|M|L|XL] [--estimate <hours>] [--sequence <n>] [--parent <N>] [--status backlog|groom|analyze|development|validate|review|done] [--assignee <a>] [--no-tether] [--no-placeholder-substitution]`;
}

function parseArgs(argv) {
  const out = { label: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'no-tether' || key === 'no-placeholder-substitution') {
      out[key] = true;
      continue;
    }
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      out[key] = true;
    } else {
      if (key === 'label') out.label.push(val);
      else out[key] = val;
      i += 1;
    }
  }
  return out;
}

function die(msg, code = 1) {
  console.error(`create-issue: ${msg}`);
  process.exit(code);
}

function run(cmd, args, opts = {}) {
  // execFileSync throws on non-zero exit; capture err.status/stdout/stderr to
  // preserve the non-throwing {status,stdout,stderr} contract this helper exposes.
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', ...opts });
    return { status: 0, stdout: stdout ?? '', stderr: '' };
  } catch (err) {
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : (err.message ?? ''),
    };
  }
}

function extractIssueNumber(urlOrText) {
  const m = ISSUE_URL_RE.exec(String(urlOrText));
  if (m) return Number(m[1]);
  const trimmed = String(urlOrText).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return null;
}

function validateArgs(args) {
  if (!args.title || args.title === true) die(`missing --title\n${usage()}`, 2);
  if (!args['body-file'] || args['body-file'] === true) die(`missing --body-file\n${usage()}`, 2);
}

function readBody(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (err) {
    die(`cannot read --body-file ${file}: ${err.message}`, 2);
    return '';
  }
}

function ghCreate(args, assignee) {
  const ghArgs = [
    'issue',
    'create',
    '--title',
    args.title,
    '--body-file',
    args['body-file'],
    '--assignee',
    assignee,
  ];
  for (const lbl of args.label) ghArgs.push('--label', lbl);
  const created = run('gh', ghArgs, { timeout: GH_API_TIMEOUT_MS });
  if (created.status !== 0) {
    process.stderr.write(created.stderr);
    die(`gh issue create failed (exit ${created.status})`, created.status || 1);
  }
  const issueNumber = extractIssueNumber(created.stdout);
  if (!issueNumber) die(`could not parse issue number from gh output: ${created.stdout.trim()}`, 1);
  console.error(`✓ created issue #${issueNumber}`);
  return issueNumber;
}

function buildTetherArgs(issueNumber, args, priority) {
  const status = typeof args.status === 'string' ? args.status : 'backlog';
  const tArgs = [TETHER_SCRIPT, '--issue', String(issueNumber), '--status', status];
  if (priority) tArgs.push('--priority', priority);
  if (typeof args.size === 'string') tArgs.push('--size', args.size);
  if (typeof args.estimate === 'string') tArgs.push('--estimate', args.estimate);
  if (typeof args.sequence === 'string') tArgs.push('--sequence', args.sequence);
  if (typeof args.parent === 'string') tArgs.push('--parent', args.parent);
  return tArgs;
}

function tether(issueNumber, args, priority) {
  const tArgs = buildTetherArgs(issueNumber, args, priority);
  // tether script makes its own gh calls; allow gh-class budget plus headroom.
  const result = run('node', tArgs, { timeout: GH_API_TIMEOUT_MS * 2 });
  process.stderr.write(result.stderr);
  if (result.stdout) console.error(result.stdout.trim());
  if (result.status !== 0) {
    const recovery = `node ${tArgs.join(' ')}`;
    console.error(`✗ issue #${issueNumber} created but tether failed; rerun: ${recovery}`);
    process.exit(result.status || 1);
  }
}

function substitutePlaceholders(issueNumber, bodyContent, args, repo) {
  const parentLabel =
    typeof args.parent === 'string' ? `#${args.parent}` : 'none — this is the epic';
  const newBody = bodyContent
    .replaceAll('<this-issue-#>', `#${issueNumber}`)
    .replaceAll('<parent-epic-#>', parentLabel);

  try {
    execFileSync(
      'gh',
      ['api', '-X', 'PATCH', `/repos/${repo}/issues/${issueNumber}`, '--input', '-'],
      {
        input: JSON.stringify({ body: newBody }),
        encoding: 'utf8',
        timeout: GH_API_TIMEOUT_MS,
      }
    );
  } catch (err) {
    if (err.stderr) process.stderr.write(String(err.stderr));
    console.error(
      `✗ placeholder substitution PATCH failed for #${issueNumber} (issue exists, body not substituted)`
    );
    process.exit(typeof err.status === 'number' && err.status ? err.status : 1);
  }
  console.error(`✓ placeholders substituted in #${issueNumber}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  const bodyContent = readBody(args['body-file']);

  const cfg = loadConfig();
  const skipTether = args['no-tether'] === true;
  if (!skipTether && !cfg.projectId) {
    die(
      'no projectId in task-tracker.json — run /task init, or pass --no-tether for an untethered issue',
      2
    );
  }
  if (!cfg.repo) die('no repo in task-tracker.json — run /task init', 2);

  const assignee = (typeof args.assignee === 'string' && args.assignee) || cfg.assignee || '@me';
  const priority = (typeof args.priority === 'string' && args.priority) || undefined;

  const issueNumber = ghCreate(args, assignee);

  if (!skipTether) tether(issueNumber, args, priority);

  const skipSub = args['no-placeholder-substitution'] === true;
  if (!skipSub && PLACEHOLDER_RE.test(bodyContent)) {
    substitutePlaceholders(issueNumber, bodyContent, args, cfg.repo);
  }

  console.log(`https://github.com/${cfg.repo}/issues/${issueNumber}`);
}

try {
  main();
} catch (err) {
  console.error(`create-issue: ${err.message}`);
  process.exit(1);
}
