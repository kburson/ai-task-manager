#!/usr/bin/env node
// Move a GitHub issue through board states: Backlog → Groom → Analyze → Development → Validate → Review → Done
// Usage: node scripts/gh/move-state.mjs <issue#> <state> [--item-id <project-item-id>]
// States: backlog | refine | plan | develop | test | review | done

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../task-tracker/config.mjs';
import { gh, projectItemForIssue } from './lib/github-projects.mjs';
import { validateBody, DEFAULT_GATES } from '../task-tracker/lib/body-gates.mjs';
import { parseIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { backlogMoveWarning } from './lib/project-tether.mjs';
import { checkDirty, formatSummary, resolveWorkspaceForIssue } from './lib/dirty-workspace.mjs';
import { validateTransition, normalizeStateSlug } from '../task-tracker/state-machine.mjs';
import { uncheckedPreCloseCheckboxes } from '../task-tracker/close-gate.mjs';
import {
  getProjectDir,
  existingRuntimePath,
  SHARED_DIR,
  projectTmpDir,
} from '../task-tracker/paths.mjs';
import { loadState, saveState } from '../task-tracker/state.mjs';
import { GH_API_TIMEOUT_MS, LOCAL_FAST_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import { stampEntryMarker, STAGES } from '../task-tracker/lib/stage-entry-markers.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

// Verb-pipeline gate. move-state.mjs is the chokepoint script for state changes;
// agents must reach it through `/task` verbs, not by shelling out directly. Each
// verb sets `AITM_VERB_CONTEXT=<verb>` before spawning this script (legacy
// `AITM_INTERNAL=1` is treated as equivalent for back-compat). A human at a TTY
// may run the script directly. Out-of-band emergency moves pass
// `--out-of-band <reason>` to bypass the env-check while writing a visible
// audit trail. The per-install config flag `directMoveStateAllowed: true`
// permits non-verb invocation with a per-call warning.
const AITM_VERB_CONTEXT = String(process.env.AITM_VERB_CONTEXT || '').trim();
const AITM_INTERNAL = process.env.AITM_INTERNAL === '1';
const HAS_VERB_ENV = AITM_VERB_CONTEXT.length > 0 || AITM_INTERNAL;
const IS_TTY = Boolean(process.stdin.isTTY);

// --out-of-band <reason> parsing (must run before the gate decision so we can
// permit + audit). Reason is a non-empty string; empty reason refuses.
let outOfBandReason = '';
{
  const idx = process.argv.indexOf('--out-of-band');
  if (idx !== -1) {
    const raw = process.argv[idx + 1];
    if (raw === undefined || String(raw).trim() === '') {
      process.stderr.write('move-state.mjs: --out-of-band requires a non-empty <reason>\n');
      process.exit(2);
    }
    outOfBandReason = String(raw).trim();
  }
}

function refusalVerbHint(targetState) {
  const forward = new Set(['refine', 'plan', 'develop', 'test', 'review', 'done']);
  const backward = new Set(['backlog']);
  if (forward.has(targetState)) return '/task promote';
  if (backward.has(targetState)) return '/task demote';
  return '/task reconcile';
}

const STATE_TO_CONFIG_KEY = {
  backlog: 'kanbanOptionBacklog',
  refine: 'kanbanOptionGroom',
  plan: 'kanbanOptionAnalyze',
  develop: 'kanbanOptionDevelopment',
  test: 'kanbanOptionValidate',
  review: 'kanbanOptionReview',
  done: 'kanbanOptionDone',
};

function usage() {
  process.stderr.write(
    'Usage: node scripts/gh/move-state.mjs <issue#> <state> [--item-id <project-item-id>] [--from <state>]\n' +
      'States: backlog | refine | plan | develop | test | review | done\n'
  );
  process.exit(1);
}

const cliArgs = process.argv.slice(2);
const issueArg = cliArgs[0];
const stateArg = cliArgs[1];
let itemIdOverride = '';
let fromOverride = '';

for (let i = 2; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--item-id' && cliArgs[i + 1]) {
    itemIdOverride = cliArgs[i + 1];
    i++;
  } else if (cliArgs[i] === '--from' && cliArgs[i + 1]) {
    fromOverride = cliArgs[i + 1];
    i++;
  }
}

if (!issueArg || !stateArg) usage();
if (!/^\d+$/.test(issueArg)) usage();

const configKey = STATE_TO_CONFIG_KEY[stateArg];
if (!configKey) {
  process.stderr.write(
    `Unknown state: ${stateArg}\nStates: backlog | refine | plan | develop | test | review | done\n`
  );
  process.exit(1);
}

const cfg = loadConfig();

// Verb-pipeline gate decision (precedence): env → --out-of-band → cfg → TTY → refuse.
const directAllowed = cfg.directMoveStateAllowed === true;
if (!HAS_VERB_ENV && !outOfBandReason && !directAllowed && !IS_TTY) {
  const verbHint = refusalVerbHint(stateArg);
  process.stderr.write(
    `move-state.mjs is internal; agents must reach it through the verb pipeline.\n` +
      `Use ${verbHint} for ${stateArg}, or pass --out-of-band <reason> to record an emergency move.\n` +
      `For one-off manual recovery from a non-TTY shell, set AITM_VERB_CONTEXT=<verb> (or AITM_INTERNAL=1) to confirm.\n`
  );
  process.exit(3);
}
if (!HAS_VERB_ENV && !outOfBandReason && directAllowed && !IS_TTY) {
  process.stderr.write(
    `⚠ directMoveStateAllowed=true — permitting non-verb move-state invocation for #${issueArg} → ${stateArg}.\n` +
      `   Prefer routing through the /task verb pipeline.\n`
  );
}

if (!SKIP_NETWORK && (!cfg.projectId || !cfg.kanbanFieldId)) {
  process.stderr.write('Error: Kanban board not configured. Run: npx ai-task-manager init\n');
  process.exit(1);
}

const optionId = cfg[configKey];
if (!SKIP_NETWORK && !optionId) {
  process.stderr.write(
    `Error: option ID for state '${stateArg}' not configured. Run: npx ai-task-manager init\n`
  );
  process.exit(1);
}

// State-machine matrix gate. Refuse illegal transitions (sequence-skip class from
// epic #61). From-state resolution: --from flag first (chokepoint can pass the
// recorded lastKnownState and skip the GraphQL roundtrip), then live Status field
// via GraphQL. If neither source is available (e.g. TT_SKIP_NETWORK with no
// --from), the matrix check is skipped — same fall-through behaviour as the
// plan->develop approval gate.
async function resolveLiveStateName(issueNumber) {
  if (SKIP_NETWORK) return '';
  try {
    const { gql, splitRepo } = await import('./lib/github-projects.mjs');
    const { owner, repoName } = splitRepo(cfg.repo);
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            projectItems(first: 10) {
              nodes {
                project { id }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber) }
    );
    const nodes = data?.repository?.issue?.projectItems?.nodes || [];
    const node = nodes.find((n) => n?.project?.id === cfg.projectId);
    return normalizeStateSlug(String(node?.fieldValueByName?.name || '').toLowerCase()) || '';
  } catch {
    return '';
  }
}

let resolvedFromState = '';
if (fromOverride) {
  resolvedFromState = String(fromOverride).toLowerCase();
} else if (!SKIP_NETWORK) {
  resolvedFromState = await resolveLiveStateName(issueArg);
}

if (resolvedFromState) {
  const v = validateTransition(resolvedFromState, stateArg);
  if (!v.ok) {
    process.stderr.write(`\n⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
    process.stderr.write(`   BLOCKED: ${v.reason}\n`);
    process.stderr.write(
      '\nThe 7-state kanban only permits one-step forward moves plus test->develop\n'
    );
    process.stderr.write(
      'and review->develop rework. See scripts/task-tracker/state-machine.mjs.\n\n'
    );
    process.exit(5);
  }
}

// Gate 1: dirty-workspace warning on move to review. Non-blocking — move still proceeds.
if (stateArg === 'review' && process.env.TT_SKIP_DIRTY_CHECK !== '1') {
  try {
    const projectDir = getProjectDir();
    const cwd = resolveWorkspaceForIssue({ issueRef: `#${issueArg}`, projectDir });
    const result = await checkDirty({ cwd });
    if (result.dirty) {
      process.stderr.write(
        `⚠ Workspace is dirty (${result.total} path(s)) on move to Review for #${issueArg}:\n`
      );
      process.stderr.write(formatSummary(result) + '\n');
      process.stderr.write(
        'Consider running the cleanup flow (docs/guides/workflow.md → Cleanup Procedure) before close.\n'
      );
    }
  } catch {
    /* warning is best-effort */
  }
}

// Structural body gate: applies to test, review, and done.
// - For all three states: verify "evidence-required" ticked boxes have supporting body content
//   (Deep-Dive Analysis section, Dependency Map section, Verification Commands all-checked).
//   Note: verification-commands rule fires only at review/done — at test the auto-runner ticks them.
// - For done only: also enforce "no unchecked checkboxes" and "Deep dive line is checked".
const GATED_STATES = new Set(['test', 'review', 'done']);
if (GATED_STATES.has(stateArg) && !SKIP_NETWORK) {
  let body = '';
  try {
    body = await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body']);
    body = body.trim();
  } catch {
    /* ignore — missing body is not a gate failure */
  }

  if (body) {
    const reasons = [];
    const refusedRuleNames = [];

    // Structural gates (all gated states). At validate, skip verification-commands
    // because the auto-runner is what ticks those boxes.
    const activeGates =
      stateArg === 'done' || stateArg === 'review'
        ? DEFAULT_GATES
        : DEFAULT_GATES.filter((g) => g.name !== 'verification-commands');
    const gateResult = validateBody(body, { gates: activeGates });
    if (!gateResult.ok) {
      for (const r of gateResult.refusedRules) {
        reasons.push(`${r.rule}: ${r.reason}`);
        refusedRuleNames.push(r.rule);
      }
    }

    // Done-only legacy checks
    if (stateArg === 'done') {
      const unchecked = uncheckedPreCloseCheckboxes(body);
      if (unchecked.length > 0)
        reasons.push(`${unchecked.length} unchecked checkbox(es) in issue body`);
    }

    if (reasons.length > 0) {
      if (process.env.TASK_TRACKER_FORCE_DONE === '1') {
        process.stderr.write(
          `⚠ TASK_TRACKER_FORCE_DONE=1 — bypassing ${stateArg} gate for #${issueArg}\n`
        );
        reasons.forEach((r) => process.stderr.write(`   • ${r}\n`));
        const bypassMsg = `⚠ **${stateArg} gate bypassed** via \`TASK_TRACKER_FORCE_DONE=1\` at ${new Date().toISOString()}. Unverified: ${reasons.join(', ')}.`;
        try {
          await gh(['issue', 'comment', issueArg, '-R', cfg.repo, '--body', bypassMsg]);
        } catch {}
      } else {
        // Append a gate-refused row to the timing log (fire-and-forget).
        if (refusedRuleNames.length > 0) {
          try {
            const { buildRow, postTimingEvent } =
              await import('../task-tracker/gh-timing-comment.mjs');
            const { deriveStateMoveDelta } = await import('../task-tracker/lib/timing-rows.mjs');
            const _tsM1 = new Date().toISOString();
            // Body is not loaded in this branch (we never reached the body
            // fetch); 0/0 is honest — no prior reference point available.
            const _dM1 = deriveStateMoveDelta('', _tsM1);
            const row = buildRow({
              ts: _tsM1,
              event: 'gate-refused',
              activeSec: _dM1.activeSec,
              idleSec: _dM1.idleSec,
              deltaWords: 0,
              wordMarker: 0,
              description: `→ ${stateArg}: ${refusedRuleNames.join(', ')}`,
            });
            await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
          } catch {
            /* fire-and-forget */
          }
        }
        process.stderr.write('\n');
        process.stderr.write(`⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
        reasons.forEach((r) => process.stderr.write(`   BLOCKED: ${r}\n`));
        process.stderr.write('\n');
        process.stderr.write('See .ai-task-manager/pickup-directive.md Hard Rules.\n');
        const itemIdSuffix = itemIdOverride ? ` --item-id ${itemIdOverride}` : '';
        process.stderr.write(
          'Verify each item, check its box, then retry. Legitimate-abandonment override:\n'
        );
        process.stderr.write(
          `   TASK_TRACKER_FORCE_DONE=1 node scripts/gh/move-state.mjs ${issueArg} ${stateArg}${itemIdSuffix}\n\n`
        );
        process.exit(4);
      }
    }
  }
}

// Approval gate: plan -> develop requires both explicit human approval
// (`<!-- aitm-plan-approved: <ts> -->`) AND a completed deep-dive analysis
// (`<!-- aitm-deep-dive-complete: <ts> -->` + substantive ## Deep-Dive Analysis
// section). Both checks fire only when the current board state is `plan` so
// transitions back from test/review do not require fresh markers.
if (stateArg === 'develop' && !SKIP_NETWORK && cfg.gateAnalysisToDevelopment !== false) {
  let body = '';
  try {
    body = (
      await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
    ).trim();
  } catch {
    /* ignore — missing body falls through */
  }

  const approved = /<!--\s*aitm-plan-approved:\s*[^>]+-->/i.test(body);
  const deepDiveMarker = /<!--\s*aitm-deep-dive-complete:\s*[^>]+-->/i.test(body);
  const deepDiveBodyCheck = deepDiveMarker
    ? validateBody(body, { gates: DEFAULT_GATES.filter((g) => g.name === 'deep-dive-complete') })
    : { ok: false };

  // Resolve current state (single-select option name) via the project item.
  let currentStateName = '';
  try {
    const { gql, splitRepo } = await import('./lib/github-projects.mjs');
    const { owner, repoName } = splitRepo(cfg.repo);
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            projectItems(first: 10) {
              nodes {
                project { id }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueArg) }
    );
    const nodes = data?.repository?.issue?.projectItems?.nodes || [];
    const node = nodes.find((n) => n?.project?.id === cfg.projectId);
    const rawName = String(node?.fieldValueByName?.name || '').toLowerCase();
    currentStateName = normalizeStateSlug(rawName) || '';
  } catch {
    /* offline: fall back to body-only check below */
  }

  const fromAnalyze = currentStateName === '' || currentStateName === 'plan';

  const planDevelopBlockers = [];
  if (!approved)
    planDevelopBlockers.push(
      'plan -> develop requires <!-- aitm-plan-approved: <ts> --> marker in the body (run `/task plan-approve #<N>` to record human approval)'
    );
  if (!deepDiveMarker)
    planDevelopBlockers.push(
      'plan -> develop requires <!-- aitm-deep-dive-complete: <ts> --> marker — post the deep-dive analysis and run `/task check "Deep dive complete"` first'
    );
  else if (!deepDiveBodyCheck.ok)
    planDevelopBlockers.push(
      `deep-dive-complete: ${deepDiveBodyCheck.refusedRules?.[0]?.reason ?? 'section insufficient (<20 non-empty lines)'}`
    );

  if (fromAnalyze && planDevelopBlockers.length > 0) {
    if (process.env.TASK_TRACKER_FORCE_DONE === '1') {
      process.stderr.write(
        `⚠ TASK_TRACKER_FORCE_DONE=1 — bypassing plan->develop gate for #${issueArg}\n`
      );
      const bypassMsg = `⚠ **plan->develop gate bypassed** via \`TASK_TRACKER_FORCE_DONE=1\` at ${new Date().toISOString()}. Unverified: ${planDevelopBlockers.join('; ')}.`;
      try {
        await gh(['issue', 'comment', issueArg, '-R', cfg.repo, '--body', bypassMsg]);
      } catch {}
    } else {
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing to move #${issueArg} to develop:\n`);
      planDevelopBlockers.forEach((b) => process.stderr.write(`   BLOCKED: ${b}\n`));
      process.stderr.write(
        '\nResolve the blockers, then retry. Legitimate-abandonment override:\n'
      );
      process.stderr.write(
        `   TASK_TRACKER_FORCE_DONE=1 node scripts/gh/move-state.mjs ${issueArg} develop\n\n`
      );
      process.exit(4);
    }
  }
}

// Backlog warning: moving a sized + estimated issue to Backlog is suspicious.
// Backlog is for unvetted ideas; sized work belongs in the Ready column. Non-blocking.
if (stateArg === 'backlog' && !SKIP_NETWORK) {
  try {
    const body = (
      await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
    ).trim();
    if (body) {
      const parsed = parseIssueFieldDb(body);
      const warn = backlogMoveWarning({
        targetState: 'backlog',
        fieldValues: parsed.ok ? parsed.values : null,
      });
      if (warn) process.stderr.write(`${warn}\n`);
    }
  } catch {
    /* fire-and-forget */
  }
}

// Resolve project item ID
let itemId = itemIdOverride;
if (!itemId && !SKIP_NETWORK) {
  const result = await projectItemForIssue({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber: issueArg,
  });
  itemId = result.itemId;
  if (!itemId) {
    process.stderr.write(
      `Issue #${issueArg} not found in project (repo: ${cfg.repo}, projectId: ${cfg.projectId})\n`
    );
    process.exit(1);
  }
}

// Update the kanban board field
if (!SKIP_NETWORK) {
  await gh([
    'project',
    'item-edit',
    '--project-id',
    cfg.projectId,
    '--id',
    itemId,
    '--field-id',
    cfg.kanbanFieldId,
    '--single-select-option-id',
    optionId,
  ]);
}

console.log(`✓ Issue #${issueArg} moved to: ${stateArg}`);

// Centralized stage-entry + recorded-state marker stamping. Every successful
// Status write stamps `<!-- aitm-entered-<stage>: <ts> -->` AND updates
// `<!-- aitm-last-known-state -->` in the issue body. Both markers are
// written in a single body update so drift detection cannot fire phantom
// `external-mutation` rows on legitimate non-promote transitions
// (#170). This is the single source of truth for the audit-trail chain —
// verbs must NOT stamp these markers themselves. Failures surface via
// `writeIssueBodyWithRetry`'s audit-comment path (#168).
if (!SKIP_NETWORK && STAGES.includes(stateArg)) {
  try {
    const [{ writeIssueBodyWithRetry }, { writeLastKnownState }] = await Promise.all([
      import('../task-tracker/lib/state-recording.mjs'),
      import('../task-tracker/gh-timing-comment.mjs'),
    ]);
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const beforeBody = JSON.parse(stdout).body ?? '';
    let nextBody = stampEntryMarker(beforeBody, stateArg, new Date().toISOString());
    nextBody = writeLastKnownState(nextBody, stateArg);
    if (nextBody !== beforeBody) {
      const tmp = path.join(
        projectTmpDir(getProjectDir()),
        `aitm-entry-${issueArg}-${Date.now()}.md`
      );
      await writeIssueBodyWithRetry({
        issueNumber: issueArg,
        repo: cfg.repo,
        body: nextBody,
        bodyBefore: beforeBody,
        target: stateArg,
        writeIssueBody: async ({ body }) => {
          try {
            writeFileSync(tmp, body, 'utf8');
            await gh(['issue', 'edit', issueArg, '-R', cfg.repo, '--body-file', tmp]);
          } finally {
            try {
              unlinkSync(tmp);
            } catch {
              /* best-effort */
            }
          }
        },
      });
    }
  } catch (err) {
    process.stderr.write(`[move-state] #${issueArg}: marker stamp failed: ${err.message}\n`);
  }
}

// #169 — Full-Auto review-gate audit. When the move lands at `done` and
// `TASK_TRACKER_HUMAN_REVIEWER` is unset, post a structured audit comment
// so the close is observable as auto-approved. When set, stamp an
// `aitm-human-reviewer` body marker. Idempotent on both paths.
if (stateArg === 'done' && !SKIP_NETWORK && process.env.AITM_CASCADE !== '1') {
  try {
    const { enforceFullAutoAudit } = await import('../task-tracker/lib/human-reviewer-audit.mjs');
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const currentBody = JSON.parse(stdout).body ?? '';
    const tmpForMarker = path.join(
      projectTmpDir(getProjectDir()),
      `aitm-human-reviewer-${issueArg}-${Date.now()}.md`
    );
    const result = await enforceFullAutoAudit({
      issueNumber: issueArg,
      repo: cfg.repo,
      body: currentBody,
      env: process.env,
      writeIssueBody: async ({ body }) => {
        writeFileSync(tmpForMarker, body, 'utf8');
        try {
          await gh(['issue', 'edit', issueArg, '-R', cfg.repo, '--body-file', tmpForMarker]);
        } finally {
          try {
            unlinkSync(tmpForMarker);
          } catch {
            /* best-effort */
          }
        }
      },
    });
    if (result.mode === 'full-auto' && result.auditPosted) {
      process.stderr.write(
        `[human-reviewer-audit] #${issueArg}: posted full-auto audit comment (no human reviewer)\n`
      );
    } else if (result.mode === 'human-reviewer' && result.stamped) {
      process.stderr.write(
        `[human-reviewer-audit] #${issueArg}: stamped human-reviewer marker (${result.handle})\n`
      );
    }
  } catch (err) {
    // surface, do not block — board move is committed
    process.stderr.write(
      `[human-reviewer-audit] #${issueArg}: enforcement failed: ${err.message}\n`
    );
  }
}

// Out-of-band audit trail: visible comment + timing-log row. Best-effort —
// failures do not roll back the board move.
if (outOfBandReason && !SKIP_NETWORK) {
  const ts = new Date().toISOString();
  const fromLabel = resolvedFromState || '?';
  const auditMarker = `<!-- aitm-out-of-band-move: ${fromLabel}→${stateArg}:${outOfBandReason}:${ts} -->`;
  const auditBody = `⚠ **Out-of-band move-state** ${fromLabel} → ${stateArg} at ${ts}.\nReason: ${outOfBandReason}\n\n${auditMarker}`;
  try {
    await gh(['issue', 'comment', issueArg, '-R', cfg.repo, '--body', auditBody]);
  } catch {
    /* best-effort */
  }
  try {
    const { buildRow, postTimingEvent, readTimingCommentBody } =
      await import('../task-tracker/gh-timing-comment.mjs');
    const { deriveStateMoveDelta } = await import('../task-tracker/lib/timing-rows.mjs');
    // Best-effort fetch of the timing-log comment body (where prior rows live).
    // The issue body never contains timing rows. If the fetch fails the delta
    // is honest 0/0.
    const _timingBodyM2 = await readTimingCommentBody({
      issueNumber: issueArg,
      repo: cfg.repo,
      timeoutMs: GH_API_TIMEOUT_MS,
    });
    const _dM2 = deriveStateMoveDelta(_timingBodyM2, ts);
    const row = buildRow({
      ts,
      event: 'out-of-band-move',
      activeSec: _dM2.activeSec,
      idleSec: _dM2.idleSec,
      deltaWords: 0,
      wordMarker: 0,
      description: `${fromLabel}→${stateArg}: ${outOfBandReason}`,
    });
    await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
  } catch {
    /* best-effort */
  }
}

// Persist new kanban state to tracker-state if this issue is the active task.
// activity-guard reads `state` to gate write activity classes; without this,
// every bound issue falls through to the no-active-task policy.
try {
  const projectDir = getProjectDir();
  const sp = existingRuntimePath(projectDir, `${SHARED_DIR}/task-tracker-state.json`);
  const s = loadState(sp);
  if (s.active === `#${issueArg}`) {
    s.state = stateArg;
    saveState(s, sp);
  }
} catch {
  /* best-effort */
}

// Update event fields (awaited — failure is a visible warning, not a silent drop)
if (!SKIP_NETWORK) {
  const repoRoot = getProjectDir();
  const eventScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/gh/update-event-fields.mjs'),
    path.resolve(__dir, 'update-event-fields.mjs'),
  ];
  const eventScript = eventScriptCandidates.find((s) => existsSync(s));
  if (eventScript) {
    const args = [eventScript, issueArg, stateArg];
    if (itemId) args.push('--item-id', itemId);
    try {
      await pexec(process.execPath, args, { timeout: GH_API_TIMEOUT_MS * 2 });
    } catch (e) {
      const msg = e.stderr?.trim() || e.message?.split('\n')[0] || 'unknown error';
      process.stderr.write(
        `warning: Start Time field sync failed: ${msg}\n` +
          `  To repair: node scripts/gh/update-event-fields.mjs ${issueArg} ${stateArg} --item-id ${itemId}\n`
      );
    }
  }
}

// End task tracking when moving to done (unless during cascade close)
if (stateArg === 'done' && process.env.AITM_CASCADE !== '1' && !SKIP_NETWORK) {
  const repoRoot = getProjectDir();
  const ttScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs'),
    path.resolve(__dir, '../task-tracker/task-tracker.mjs'),
  ];
  const ttScript = ttScriptCandidates.find((s) => existsSync(s));
  // Fire-and-forget local task-tracker end. Local-fast budget; ignore failures.
  if (ttScript)
    pexec(process.execPath, [ttScript, 'end'], { timeout: LOCAL_FAST_TIMEOUT_MS }).catch(() => {});
}
