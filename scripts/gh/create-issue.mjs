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
import {
  evaluateDuplicateChild,
  formatDuplicateRefusal,
  defaultFetchOpenChildren,
  DUPLICATE_CHILD_EXIT_CODE,
} from './lib/duplicate-child-guard.mjs';
import { tetherIssueToProject } from './lib/project-tether.mjs';
import { gql } from './lib/github-projects.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';

// Exit codes (documented contract):
//   1 — generic failure (gh error, tether failure, internal error)
//   2 — usage error (missing/invalid flag)
//   4 — issue-body verifier refusal (--body-file content failed canonical-structure check)
//   6 — partial success (issue created but a follow-up gh step exited non-zero)
//   7 — duplicate-child refusal (#921: new sub-issue is a high-similarity match to
//       an existing open sibling under the same parent epic; override with
//       --allow-duplicate-child)

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TETHER_SCRIPT =
  process.env.CREATE_ISSUE_TETHER_SCRIPT || path.join(SCRIPT_DIR, 'project-tether.mjs');
const PREFLIGHT_SCRIPT = path.resolve(SCRIPT_DIR, '..', 'task-tracker', 'preflight-issue.mjs');
const ISSUE_URL_RE = /\/issues\/(\d+)/;
const PLACEHOLDER_RE = /<this-issue-#>|<parent-epic-#>/;
const VALID_SHAPES = new Set(['epic', 'sub-issue', 'solo', 'stub']);

function usage() {
  return `Usage: create-issue.mjs --title <t> (--body-file <path> | --shape epic|sub-issue|solo --scope-file <p> --ac-file <p> --plan-metadata-file <p> [--sub-issue-list-file <p>] | --shape stub [--idea-file <p>]) [--label <l> ...] [--priority p0|p1|p2] [--size XS|S|M|L|XL] [--estimate <hours>] [--rank <n>] [--parent <N>] [--assignee <a>] [--allow-duplicate-child] [--dry-run] [--no-tether] [--no-placeholder-substitution] [--internal]`;
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
      key === 'internal' ||
      // #921 — greppable override that bypasses the duplicate-child guard.
      key === 'allow-duplicate-child'
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

// #687 — Build the argv forwarded to `preflight-issue.mjs` for a shaped render.
// Extracted from `renderShapeBody` as a pure seam so the flag set (including the
// #687 `--kind` pass-through) is unit-testable without spawning preflight/gh.
// Mirrors the `buildIssueTitle` export pattern below.
export function buildShapeFlags(args) {
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
  // #687 — forward `--kind` so investigation work (spike/research/audit) is
  // filed as the correct kind. Only when explicitly set: absence keeps preflight
  // on its default `code` path with the body left unmarked (AC3).
  if (typeof args.kind === 'string' && args.kind) flags.push('--kind', args.kind);
  return flags;
}

function renderShapeBody(args) {
  const flags = buildShapeFlags(args);
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

function ghCreateOutcome(args, assignee, options = {}) {
  const ghArgs = [
    'issue',
    'create',
    '--title',
    buildIssueTitle(args),
    '--body-file',
    args['body-file'],
  ];
  // #793 — Assign only when a login was explicitly requested. A null/empty
  // assignee means "leave unassigned"; omit the flag so `gh` creates the issue
  // with no assignee rather than defaulting one on.
  if (typeof assignee === 'string' && assignee) ghArgs.push('--assignee', assignee);
  for (const lbl of args.label) ghArgs.push('--label', lbl);
  const runCommand = options.runCommand || run;
  const created = runCommand('gh', ghArgs, {
    timeout: GH_API_TIMEOUT_MS,
    env: options.env,
  });
  const issueNumber = extractIssueNumber(created.stdout);
  return { ...created, issueNumber };
}

function ghCreate(args, assignee, options = {}) {
  const created = ghCreateOutcome(args, assignee, options);
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
  const issueNumber = created.issueNumber;
  if (!issueNumber) die(`could not parse issue number from gh output: ${created.stdout.trim()}`, 1);
  console.error(`✓ created issue #${issueNumber}`);
  return issueNumber;
}

function throwForGovernedCreateOutcome(created) {
  const issueNumber = created.issueNumber || extractIssueNumber(created.stdout);
  if (created.status !== 0) {
    const error = new Error(
      issueNumber
        ? `partial-success: #${issueNumber} — issue was created but gh exited ${created.status}`
        : `gh issue create failed (exit ${created.status}): ${created.stderr || 'unknown error'}`
    );
    error.exitCode = issueNumber ? 6 : created.status || 1;
    error.partialIssueNumber = issueNumber || undefined;
    throw error;
  }
  if (!issueNumber) {
    const error = new Error(
      `could not parse issue number from gh output: ${String(created.stdout || '').trim()}`
    );
    error.exitCode = 1;
    throw error;
  }
  return issueNumber;
}

function ownedBodyDeps(env) {
  if (!env) return {};
  return {
    fetchBody: async (repo, issueNumber) => {
      const out = execFileSync(
        'gh',
        ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body'],
        { encoding: 'utf8', timeout: GH_API_TIMEOUT_MS, env }
      );
      return JSON.parse(out).body;
    },
    pushBody: async (repo, issueNumber, body) => {
      execFileSync('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', '-'], {
        encoding: 'utf8',
        timeout: GH_API_TIMEOUT_MS,
        env,
        input: body,
      });
    },
  };
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

// #793 — New issues default to UNASSIGNED in Backlog. Assignment is opt-in:
// return the explicitly-requested `--assignee <login>` if present, else null
// (no assignee). The config `assignee` is intentionally NOT a fallback here —
// it ships as `@me`, so honoring it would silently defeat the default-unassigned
// behavior. `cfg.assignee` is instead the self-assign target the defect-spawn
// `[Y|n]` prompt passes explicitly as `--assignee` when the human opts in.
export function resolveAssignee(args) {
  return typeof args.assignee === 'string' && args.assignee ? args.assignee : null;
}

/**
 * In-process issue creation used by controller-owned orchestration.
 *
 * The existing controller remains the authority for every transitive write:
 * issue creation, project tether/status fields, and the new issue's lifecycle
 * body markers. The newly-created issue is an output, never a substitute lease
 * holder.
 */
export async function createGovernedInternalIssue({
  title,
  bodyContent,
  cfg,
  priority,
  rank,
  finalStatus = 'develop',
  withGovernedEffect,
  authorityIssueId,
  env,
  beforeRemoteCreate,
  deps = {},
  reconcile = true,
} = {}) {
  if (!title) throw new Error('createGovernedInternalIssue: title is required');
  if (typeof bodyContent !== 'string') {
    throw new Error('createGovernedInternalIssue: bodyContent is required');
  }
  if (!cfg?.repo || !cfg?.projectId) {
    throw new Error('createGovernedInternalIssue: repo and projectId are required');
  }
  if (typeof withGovernedEffect !== 'function' || !authorityIssueId) {
    throw new Error(
      'createGovernedInternalIssue: controller withGovernedEffect and authorityIssueId are required'
    );
  }

  const controllerId = String(authorityIssueId).replace(/^#/, '');
  const governController = (operation, callback) =>
    withGovernedEffect(
      {
        issueId: controllerId,
        operation,
        heartbeat: true,
      },
      callback
    );
  const createIssue = deps.createIssue;
  const createOutcome = deps.createOutcome || ghCreateOutcome;
  const stampedBody = stampEntryMarker(bodyContent, 'backlog', new Date().toISOString());
  let tmpDir;

  try {
    let bodyFilePath;
    if (typeof createIssue !== 'function') {
      tmpDir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-create-issue-'));
      bodyFilePath = path.join(tmpDir, 'body.md');
      writeFileSync(bodyFilePath, stampedBody, 'utf8');
    }
    const invokeRemoteCreate = async () => {
      if (typeof createIssue === 'function') {
        return createIssue({ title, bodyContent: stampedBody, cfg, env });
      }
      return throwForGovernedCreateOutcome(
        createOutcome(
          {
            title,
            label: [],
            'body-file': bodyFilePath,
          },
          null,
          { env }
        )
      );
    };

    let issueNumber;
    await governController('evidence-mutation', async () => {
      if (typeof beforeRemoteCreate === 'function') {
        const recoveredIssueNumber = await beforeRemoteCreate();
        if (recoveredIssueNumber != null) {
          issueNumber = recoveredIssueNumber;
          return;
        }
      }
      issueNumber = await invokeRemoteCreate();
    });
    if (!issueNumber) {
      throw new Error('createGovernedInternalIssue: create did not return an issue number');
    }

    if (reconcile) {
      await reconcileGovernedInternalIssue({
        issueNumber,
        cfg,
        priority,
        rank,
        finalStatus,
        withGovernedEffect,
        authorityIssueId: controllerId,
        env,
        deps,
      });
    }
    return issueNumber;
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

export async function reconcileGovernedInternalIssue({
  issueNumber,
  cfg,
  priority,
  rank,
  finalStatus = 'develop',
  withGovernedEffect,
  authorityIssueId,
  env,
  deps = {},
} = {}) {
  if (!issueNumber || !cfg?.repo || !cfg?.projectId) {
    throw new Error(
      'reconcileGovernedInternalIssue: issueNumber, repo, and projectId are required'
    );
  }
  if (typeof withGovernedEffect !== 'function' || !authorityIssueId) {
    throw new Error(
      'reconcileGovernedInternalIssue: controller withGovernedEffect and authorityIssueId are required'
    );
  }
  const controllerId = String(authorityIssueId).replace(/^#/, '');
  const tetherIssue = deps.tetherIssueToProject || tetherIssueToProject;
  const mutateBody = deps.mutateIssueBody || mutateIssueBody;
  const tetherOptions = {
    cfg,
    issueNumber,
    priority,
    rank: rank === undefined ? undefined : Number(rank),
    withGovernedEffect,
    authorityIssueId: controllerId,
    ...(deps.tether || {}),
    runGql: (query, variables, options = {}) =>
      (deps.tether?.runGql || gql)(query, variables, { ...options, env }),
  };
  await tetherIssue({ ...tetherOptions, status: 'backlog' });
  if (finalStatus && finalStatus !== 'backlog') {
    await tetherIssue({ ...tetherOptions, status: finalStatus });
  }

  if (finalStatus === 'develop') {
    const baseMs = Date.now();
    const controllerBodyAuthority = (_requested, callback) =>
      withGovernedEffect(
        {
          issueId: controllerId,
          operation: 'evidence-mutation',
          heartbeat: true,
        },
        callback
      );
    await mutateBody({
      issueNumber,
      repo: cfg.repo,
      operation: 'evidence-mutation',
      mutate: (base) => {
        let next = stampEntryMarker(base, 'refine', new Date(baseMs).toISOString());
        next = stampEntryMarker(next, 'plan', new Date(baseMs + 1).toISOString());
        return stampEntryMarker(next, 'develop', new Date(baseMs + 2).toISOString());
      },
      deps: {
        ...ownedBodyDeps(env),
        ...(deps.body || {}),
        withGovernedEffect: controllerBodyAuthority,
      },
    });
  }
  return { issueNumber, status: finalStatus };
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

  // #921 — Duplicate-child guard. Before fanning out a new sub-issue, enumerate
  // the parent epic's existing OPEN children and refuse when the new title is a
  // high-similarity match to one of them (unless --allow-duplicate-child). This
  // catches the recurring failure mode where a resumed/compacted session re-runs
  // an epic's decomposition without having loaded its current sub-issue tree.
  //
  // Placed BEFORE body materialization (and the --dry-run return) so the
  // regression test can drive both branches with `--dry-run` + injected
  // siblings and no `gh` dependency. Skippable via AITM_SKIP_DUP_CHILD_GATE=1
  // (parity with AITM_SKIP_PARENT_STATE_GATE).
  if (
    args.shape === 'sub-issue' &&
    typeof args.parent === 'string' &&
    process.env.AITM_SKIP_DUP_CHILD_GATE !== '1'
  ) {
    // Sibling source. Test/CLI seam first: an injected JSON list bypasses the
    // GraphQL fetch entirely (and works under --dry-run). Otherwise fetch live,
    // but only for a real (non-dry-run) create with a repo configured — a
    // dry-run with no injected siblings performs no I/O, keeping existing
    // no-sibling dry-run tests untouched.
    let siblings = null;
    const injected = process.env.AITM_DUP_CHILD_SIBLINGS_JSON;
    if (typeof injected === 'string' && injected.trim()) {
      try {
        const parsed = JSON.parse(injected);
        siblings = Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        die(`AITM_DUP_CHILD_SIBLINGS_JSON is not valid JSON: ${err.message}`, 2);
      }
    } else if (!dryRun && cfg.repo) {
      try {
        siblings = await defaultFetchOpenChildren({
          parentEpicNumber: Number(args.parent),
          repo: cfg.repo,
        });
      } catch (err) {
        // Fail-OPEN: the recurring failure is operator-side (unloaded tree),
        // orthogonal to a transient GitHub read error. Blocking every child on
        // any API hiccup is worse than a rare missed dup caught by the next
        // human glance. The detected-duplicate path stays fully deterministic.
        console.error(
          `create-issue: WARNING — could not enumerate epic #${args.parent} children ` +
            `for the duplicate guard (${err.message}); proceeding without the check.`
        );
        siblings = null;
      }
    }

    if (Array.isArray(siblings)) {
      const { refuse, matches } = evaluateDuplicateChild({
        newTitle: args.title,
        siblings,
        overridden: args['allow-duplicate-child'] === true,
      });
      if (refuse) {
        die(formatDuplicateRefusal(args.parent, matches), DUPLICATE_CHILD_EXIT_CODE);
      }
    }
  }

  // #793 — Default unassigned. Only an explicit `--assignee <login>` assigns.
  const assignee = resolveAssignee(args);
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
