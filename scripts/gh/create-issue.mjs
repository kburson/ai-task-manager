#!/usr/bin/env node
// Atomic issue creation: gh issue create + project tether + sub-issue link +
// `<this-issue-#>` placeholder substitution. Replaces the multi-step orchestration
// pattern previously inlined in skill/shared/SKILL.md.

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { loadConfig } from '../task-tracker/config.mjs';
import { GH_API_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import { verifyIssueBody } from './lib/issue-body-verifier.mjs';
import { stampEntryMarker } from '../task-tracker/lib/stage-entry-markers.mjs';
import { readParentStatus } from './lib/parent-status.mjs';
import { childCreationAllowedAtEpicState } from '../task-tracker/lib/epic-children-gate.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { ensureKindPrefix } from './lib/kind-prefix.mjs';

// Exit codes (documented contract):
//   1 — generic failure (gh error, tether failure, internal error)
//   2 — usage error (missing/invalid flag)
//   4 — issue-body verifier refusal (--body-file content failed canonical-structure check)

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TETHER_SCRIPT =
  process.env.CREATE_ISSUE_TETHER_SCRIPT || path.join(SCRIPT_DIR, 'project-tether.mjs');
const PREFLIGHT_SCRIPT = path.resolve(SCRIPT_DIR, '..', 'task-tracker', 'preflight-issue.mjs');
const ISSUE_URL_RE = /\/issues\/(\d+)/;
const PLACEHOLDER_RE = /<this-issue-#>|<parent-epic-#>/;
const VALID_SHAPES = new Set(['epic', 'sub-issue', 'solo', 'stub']);

function usage() {
  return `Usage: create-issue.mjs --title <t> (--body-file <path> | --shape epic|sub-issue|solo --scope-file <p> --ac-file <p> --plan-metadata-file <p> [--sub-issue-list-file <p>] | --shape stub [--idea-file <p>]) [--label <l> ...] [--priority p0|p1|p2] [--size XS|S|M|L|XL] [--estimate <hours>] [--rank <n>] [--parent <N>] [--assignee <a>] [--dry-run] [--no-tether] [--no-placeholder-substitution] [--internal]`;
}

function parseArgs(argv) {
  const out = { label: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (
      key === 'no-tether' ||
      key === 'no-placeholder-substitution' ||
      key === 'dry-run' ||
      key === 'internal'
    ) {
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
  // #272 — --status is no longer accepted. All issues are created in Backlog
  // and only advance via promote verbs.
  if ('status' in args) {
    die(
      `--status is no longer accepted (#272). All issues are created in Backlog; ` +
        `promote afterward via \`node scripts/task-tracker/task-tracker.mjs promote <N>\`.`,
      2
    );
  }
  const hasBody = typeof args['body-file'] === 'string';
  const hasShape = typeof args.shape === 'string';
  if (!hasBody && !hasShape) die(`missing --body-file or --shape\n${usage()}`, 2);
  if (hasBody && hasShape) die(`--body-file and --shape are mutually exclusive`, 2);
  if (hasShape) {
    if (!VALID_SHAPES.has(args.shape)) {
      die(`--shape must be one of: epic, sub-issue, solo, stub (got: ${args.shape})`, 2);
    }
    // #426 — the stub shape is a lightweight idea-capture path: only --title is
    // required (an optional --idea-file seeds Scope). Scope / AC / Plan Metadata
    // are placeholders the Refine stage fills, so the three section files are NOT
    // required at creation. The Refine→Plan gate still enforces them later.
    if (args.shape !== 'stub') {
      for (const flag of ['scope-file', 'ac-file', 'plan-metadata-file']) {
        if (typeof args[flag] !== 'string') die(`--${flag} required with --shape`, 2);
      }
    }
    if (args.shape === 'sub-issue' && typeof args.parent !== 'string') {
      die('--parent <N> required with --shape sub-issue', 2);
    }
  }
}

function renderShapeBody(args) {
  const flags = ['--shape', args.shape];
  // #426 — stub forwards only an optional --idea-file (no section files);
  // every other shape forwards the three required section files.
  if (args.shape === 'stub') {
    if (typeof args['idea-file'] === 'string') flags.push('--idea-file', args['idea-file']);
  } else {
    flags.push(
      '--scope-file',
      args['scope-file'],
      '--ac-file',
      args['ac-file'],
      '--plan-metadata-file',
      args['plan-metadata-file']
    );
  }
  if (typeof args.parent === 'string') flags.push('--parent', args.parent);
  if (typeof args['sub-issue-list-file'] === 'string') {
    flags.push('--sub-issue-list-file', args['sub-issue-list-file']);
  }
  // #298 AC3 — forward seed values so preflight emits the `aitm-fields`
  // trailer block at creation time (Refine→Plan `fields-block marker` gate).
  for (const k of ['priority', 'size', 'estimate', 'rank', 'start-time']) {
    if (typeof args[k] === 'string' && args[k]) flags.push(`--${k}`, args[k]);
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

// #545 — Resolve the `gh issue create` title for `args`: apply the label-derived
// kind prefix (`🐞 [BUG] `, `🐞 [Defect] `, `🙏 [Feature Request] `, `🤓 [Idea] `).
// Exported as the seam unit tests exercise without spawning `gh`.
export function buildIssueTitle(args) {
  return ensureKindPrefix(args.title, args.label);
}

function ghCreate(args, assignee) {
  const ghArgs = [
    'issue',
    'create',
    '--title',
    buildIssueTitle(args),
    '--body-file',
    args['body-file'],
    '--assignee',
    assignee,
  ];
  for (const lbl of args.label) ghArgs.push('--label', lbl);
  const created = run('gh', ghArgs, { timeout: GH_API_TIMEOUT_MS });
  if (created.status !== 0) {
    process.stderr.write(created.stderr);
    const partialNumber = extractIssueNumber(created.stdout);
    if (partialNumber) {
      process.stderr.write(
        `partial-success: #${partialNumber} — issue was created but gh exited ${created.status}.\n` +
          `  Tether/update #${partialNumber} before retrying rather than creating a duplicate.\n`
      );
      process.exit(6);
    }
    die(`gh issue create failed (exit ${created.status})`, created.status || 1);
  }
  const issueNumber = extractIssueNumber(created.stdout);
  if (!issueNumber) die(`could not parse issue number from gh output: ${created.stdout.trim()}`, 1);
  console.error(`✓ created issue #${issueNumber}`);
  return issueNumber;
}

function buildTetherArgs(issueNumber, args, priority) {
  // #272 — Always create new issues in Backlog. The --status flag was removed
  // from this script's surface; the project tether call hard-codes `backlog`.
  const tArgs = [TETHER_SCRIPT, '--issue', String(issueNumber), '--status', 'backlog'];
  if (priority) tArgs.push('--priority', priority);
  if (typeof args.size === 'string') tArgs.push('--size', args.size);
  if (typeof args.estimate === 'string') tArgs.push('--estimate', args.estimate);
  if (typeof args.rank === 'string') tArgs.push('--rank', args.rank);
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

function enforcePriorityGate(_args) {
  // #272 — The priority gate fired only when `--status refine` was passed.
  // With `--status` removed, every issue creates at Backlog where the gate
  // is vacuous: priority is set later when the issue moves to Refine.
}

async function main() {
  if (wantsHelp(process.argv.slice(2))) {
    emitSelfDoc('create-issue');
    process.exit(0);
  }
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

  // #247 — A Done epic must not grow new children (it would have to reopen).
  // Refuse `--shape sub-issue` creation when the parent epic is at `done`. Skip
  // for dry-runs and when no project board is configured (status is unknowable).
  // Override for legitimate internal/testing use: AITM_SKIP_PARENT_STATE_GATE=1.
  if (
    args.shape === 'sub-issue' &&
    !dryRun &&
    cfg.projectId &&
    typeof args.parent === 'string' &&
    process.env.AITM_SKIP_PARENT_STATE_GATE !== '1'
  ) {
    let parentState = null;
    let parentReadFailed = false;
    try {
      parentState = await readParentStatus({
        parentEpicNumber: Number(args.parent),
        repo: cfg.repo,
        projectId: cfg.projectId,
      });
    } catch {
      // #513 — a FAILED read must not be conflated with "state unknown / allow".
      // Treating it as null skipped the Done-parent gate (fail-OPEN), letting a
      // Done epic grow new children whenever GitHub hiccupped. Fail CLOSED below.
      parentReadFailed = true;
    }

    // #513 — refuse creation fail-closed when the parent state could not be read.
    const { decideParentStateReadFailure } =
      await import('../task-tracker/lib/parent-state-gate.mjs');
    const readDecision = decideParentStateReadFailure({
      readFailed: parentReadFailed,
      override: process.env.AITM_SKIP_PARENT_STATE_GATE === '1',
    });
    if (readDecision.failClosed) {
      die(
        `refusing to create sub-issue under epic #${args.parent}: ${readDecision.message}`,
        readDecision.exitCode
      );
    }

    if (parentState != null && !childCreationAllowedAtEpicState(parentState)) {
      die(
        `refusing to create sub-issue under epic #${args.parent}: epic is at "${parentState}". ` +
          `A Done epic must not grow new children — reopen it first, or override with ` +
          `AITM_SKIP_PARENT_STATE_GATE=1.`,
        2
      );
    }
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
    tmpDir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-create-issue-'));
    bodyFilePath = path.join(tmpDir, 'body.md');
    writeFileSync(bodyFilePath, rendered, 'utf8');
    bodyContent = rendered;
  } else {
    bodyContent = readBody(bodyFilePath);
    // Canonical issue-body verification. The `--body-file` shortcut bypasses
    // the fragment path (`--shape` + scope/ac/plan-metadata), so we re-run the
    // structural check here. Internal/testing callers may opt out with BOTH
    // `--internal` AND env `AITM_CREATE_ISSUE_INTERNAL=1` set.
    const internalFlag = args.internal === true;
    const internalEnv = process.env.AITM_CREATE_ISSUE_INTERNAL === '1';
    if (!(internalFlag && internalEnv)) {
      const verdict = verifyIssueBody(bodyContent);
      if (!verdict.ok) {
        process.stderr.write(
          `create-issue: --body-file failed canonical issue-body verifier (exit 4)\n` +
            `missing or malformed sections:\n` +
            verdict.missing.map((m) => `  - ${m}`).join('\n') +
            `\n\nTo bypass for legitimate internal/testing use, pass --internal AND set ` +
            `AITM_CREATE_ISSUE_INTERNAL=1 in the environment.\n`
        );
        process.exit(4);
      }
    }
    if (dryRun) {
      process.stdout.write(bodyContent);
      return;
    }
  }

  // #221 — stamp the initial-state entry marker so the lifecycle chain starts
  // at creation instead of at the first transition. #272 — initial state is
  // hard-coded to `backlog`: all issues are born in Backlog. stampEntryMarker
  // is idempotent — if the body already contains the marker (template-injected),
  // re-stamping with the same ts is a no-op.
  bodyContent = stampEntryMarker(bodyContent, 'backlog', new Date().toISOString());
  if (!tmpDir) {
    tmpDir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-create-issue-'));
    bodyFilePath = path.join(tmpDir, 'body.md');
  }
  writeFileSync(bodyFilePath, bodyContent, 'utf8');

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

// Only run the CLI when executed directly — importing this module (e.g. from a
// unit test exercising `buildIssueTitle`) must not spawn `gh`. (#545)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`create-issue: ${err.message}`);
    process.exit(1);
  });
}
