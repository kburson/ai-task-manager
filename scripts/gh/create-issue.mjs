#!/usr/bin/env node
// Atomic issue creation: gh issue create + project tether + sub-issue link +
// `<this-issue-#>` placeholder substitution. Replaces the multi-step orchestration
// pattern previously inlined in skill/shared/SKILL.md.

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../task-tracker/config.mjs';
import { GH_API_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TETHER_SCRIPT =
  process.env.CREATE_ISSUE_TETHER_SCRIPT || path.join(SCRIPT_DIR, 'project-tether.mjs');
const PREFLIGHT_SCRIPT = path.resolve(SCRIPT_DIR, '..', 'task-tracker', 'preflight-issue.mjs');
const ISSUE_URL_RE = /\/issues\/(\d+)/;
const PLACEHOLDER_RE = /<this-issue-#>|<parent-epic-#>/;
const GROOM_LIKE_STATUSES = new Set(['groom', 'refine', 'ready']);
const VALID_SHAPES = new Set(['epic', 'sub-issue', 'solo']);

function usage() {
  return `Usage: create-issue.mjs --title <t> (--body-file <path> | --shape epic|sub-issue|solo --scope-file <p> --ac-file <p> --plan-metadata-file <p> [--sub-issue-list-file <p>]) [--label <l> ...] [--priority p0|p1|p2] [--size XS|S|M|L|XL] [--estimate <hours>] [--sequence <n>] [--parent <N>] [--status backlog|groom|analyze|development|validate|review|done] [--assignee <a>] [--dry-run] [--no-tether] [--no-placeholder-substitution]`;
}

function parseArgs(argv) {
  const out = { label: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'no-tether' || key === 'no-placeholder-substitution' || key === 'dry-run') {
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
  const hasBody = typeof args['body-file'] === 'string';
  const hasShape = typeof args.shape === 'string';
  if (!hasBody && !hasShape) die(`missing --body-file or --shape\n${usage()}`, 2);
  if (hasBody && hasShape) die(`--body-file and --shape are mutually exclusive`, 2);
  if (hasShape) {
    if (!VALID_SHAPES.has(args.shape)) {
      die(`--shape must be one of: epic, sub-issue, solo (got: ${args.shape})`, 2);
    }
    for (const flag of ['scope-file', 'ac-file', 'plan-metadata-file']) {
      if (typeof args[flag] !== 'string') die(`--${flag} required with --shape`, 2);
    }
    if (args.shape === 'sub-issue' && typeof args.parent !== 'string') {
      die('--parent <N> required with --shape sub-issue', 2);
    }
  }
}

function renderShapeBody(args) {
  const flags = [
    '--shape',
    args.shape,
    '--scope-file',
    args['scope-file'],
    '--ac-file',
    args['ac-file'],
    '--plan-metadata-file',
    args['plan-metadata-file'],
  ];
  if (typeof args.parent === 'string') flags.push('--parent', args.parent);
  if (typeof args['sub-issue-list-file'] === 'string') {
    flags.push('--sub-issue-list-file', args['sub-issue-list-file']);
  }
  const result = run('node', [PREFLIGHT_SCRIPT, ...flags], { timeout: GH_API_TIMEOUT_MS });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0)
    die(`preflight-issue --shape failed (exit ${result.status})`, result.status || 1);
  return result.stdout;
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

function resolveAssignee(args, cfg) {
  const explicit = typeof args.assignee === 'string' && args.assignee ? args.assignee : null;
  if (explicit) return explicit;
  if (cfg.assignee) return cfg.assignee;
  die(
    'assignee-required: no --assignee and no `assignee` in .ai-task-manager/task-tracker.json. ' +
      'Pass --assignee <login|@me> or run /task init.',
    2
  );
  return null;
}

function enforcePriorityGate(args) {
  const status = typeof args.status === 'string' ? args.status : null;
  if (!status) return;
  if (!GROOM_LIKE_STATUSES.has(status)) return;
  if (typeof args.priority !== 'string' || !args.priority) {
    die(
      `priority-required-at-groom: --priority is required when --status=${status} ` +
        '(set p0|p1|p2 alongside size + estimate at Groom)',
      2
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  const cfg = loadConfig();
  const skipTether = args['no-tether'] === true;
  const dryRun = args['dry-run'] === true;
  if (!dryRun) {
    if (!skipTether && !cfg.projectId) {
      die(
        'no projectId in task-tracker.json — run /task init, or pass --no-tether for an untethered issue',
        2
      );
    }
    if (!cfg.repo) die('no repo in task-tracker.json — run /task init', 2);
  }

  const assignee = dryRun
    ? (typeof args.assignee === 'string' && args.assignee) || cfg.assignee || '@me'
    : resolveAssignee(args, cfg);
  const priority = (typeof args.priority === 'string' && args.priority) || undefined;
  enforcePriorityGate(args);

  // Materialize body: either provided --body-file, or render via preflight --shape.
  let bodyFilePath = args['body-file'];
  let tmpDir = null;
  let bodyContent;
  if (typeof args.shape === 'string') {
    const rendered = renderShapeBody(args);
    if (dryRun) {
      process.stdout.write(rendered);
      return;
    }
    tmpDir = mkdtempSync(path.join(tmpdir(), 'aitm-create-issue-'));
    bodyFilePath = path.join(tmpDir, 'body.md');
    writeFileSync(bodyFilePath, rendered, 'utf8');
    bodyContent = rendered;
  } else {
    bodyContent = readBody(bodyFilePath);
    if (dryRun) {
      process.stdout.write(bodyContent);
      return;
    }
  }

  try {
    const ghArgs = { ...args, 'body-file': bodyFilePath };
    const issueNumber = ghCreate(ghArgs, assignee);

    if (!skipTether) tether(issueNumber, args, priority);

    const skipSub = args['no-placeholder-substitution'] === true;
    if (!skipSub && PLACEHOLDER_RE.test(bodyContent)) {
      substitutePlaceholders(issueNumber, bodyContent, args, cfg.repo);
    }

    console.log(`https://github.com/${cfg.repo}/issues/${issueNumber}`);
  } finally {
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}

try {
  main();
} catch (err) {
  console.error(`create-issue: ${err.message}`);
  process.exit(1);
}
