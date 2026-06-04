#!/usr/bin/env node
// Move a GitHub issue through board states: Backlog → Refine → Plan → Develop → Test → Review → Done
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
import {
  uncheckedPreCloseCheckboxes,
  assertLifecycleSatisfied,
} from '../task-tracker/close-gate.mjs';
import {
  getProjectDir,
  existingRuntimePath,
  SHARED_DIR,
  projectTmpDir,
} from '../task-tracker/paths.mjs';
import { loadState, saveState } from '../task-tracker/state.mjs';
import { GH_API_TIMEOUT_MS, LOCAL_FAST_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import {
  stampEntryMarker,
  getStageVisitCount,
  postReentryAuditComment,
  evaluateContiguity,
  STAGES,
} from '../task-tracker/lib/stage-entry-markers.mjs';
import {
  withIssueLock,
  IssueLockError,
  ISSUE_LOCK_HELD_ENV,
} from '../task-tracker/issue-mutator-lock.mjs';
// Bootstrap registers universal exit-guards (e.g. blocked-by-not-done) into
// the guard registry on import. Keep this side-effect import alongside
// runGuards so the two are read together.
import { runGuards } from '../task-tracker/lib/guard-registry.mjs';
import '../task-tracker/lib/guard-bootstrap.mjs';

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
  refine: 'kanbanOptionRefine',
  plan: 'kanbanOptionPlan',
  develop: 'kanbanOptionDevelop',
  test: 'kanbanOptionTest',
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
let demoteFlag = false;

for (let i = 2; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--item-id' && cliArgs[i + 1]) {
    itemIdOverride = cliArgs[i + 1];
    i++;
  } else if (cliArgs[i] === '--from' && cliArgs[i + 1]) {
    fromOverride = cliArgs[i + 1];
    i++;
  } else if (cliArgs[i] === '--demote') {
    demoteFlag = true;
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

      // #179 — Hard Review→Done lifecycle gate (parallel to close.mjs).
      const lifecycleRequired = cfg.lifecycleCheckboxesRequired !== false;
      const lifecycleGate = assertLifecycleSatisfied({ body, required: lifecycleRequired });
      if (lifecycleGate.block) {
        reasons.push(lifecycleGate.reason);
        refusedRuleNames.push('lifecycle-incomplete');
      } else if (!lifecycleRequired && lifecycleGate.missing.length > 0) {
        try {
          const { buildRow: _br, postTimingEvent: _pe } =
            await import('../task-tracker/gh-timing-comment.mjs');
          const { deriveStateMoveDelta: _dsm } =
            await import('../task-tracker/lib/timing-rows.mjs');
          const _ts = new Date().toISOString();
          const _d = _dsm(body, _ts);
          const missLabels = lifecycleGate.missing.map((m) => m.key).join(', ');
          await _pe({
            issueNumber: issueArg,
            repo: cfg.repo,
            timeoutMs: 3000,
            row: _br({
              ts: _ts,
              event: 'lifecycle-warn',
              activeSec: _d.activeSec,
              idleSec: _d.idleSec,
              deltaWords: 0,
              wordMarker: 0,
              description: `WARN: lifecycle-incomplete (lifecycleCheckboxesRequired=false): ${missLabels}`,
            }),
          });
        } catch {
          /* fire-and-forget */
        }
      }
    }

    if (reasons.length > 0) {
      // No env override exists. Legitimate abandonment requires a human to
      // move the card directly in the GitHub Projects UI (intentionally not
      // gated).
      //
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
      process.stderr.write(
        'Verify each item, check its box, then retry. For legitimate abandonment, move the card in the GitHub Projects UI.\n\n'
      );
      process.exit(4);
    }
  }
}

// Universal exit-guard pipeline (#286). Runs on every transition once the
// from-state is known. The blocked-by-not-done guard parses the active
// issue's body for `aitm-blocked-by: #M, #P` and refuses if any blocker is
// not in `done`. Refusals are aggregated into the same `BLOCKED:` stderr
// format the structural gate uses. Skipped when SKIP_NETWORK is set or the
// from-state could not be resolved (same fall-through as other gates).
if (!SKIP_NETWORK && resolvedFromState) {
  let guardBody = '';
  try {
    guardBody = (
      await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
    ).trim();
  } catch {
    /* ignore — empty body means no marker means guard passes */
  }

  async function fetchBlockerState(blockerNumber) {
    return await resolveLiveStateName(String(blockerNumber));
  }

  // ctx.cfg + ctx.deps feed the entry-field guard adapters
  // (refine-entry-fields-priority, plan-entry-fields-body, plan-entry-fields-board)
  // registered in guard-bootstrap. The adapters wrap planPriorityGate /
  // planRefinementEstimate / gateRefineToPlan, which all accept `deps = {}`
  // and fall back to real `gh` implementations when callers omit them — so
  // `deps` is left undefined here and the gates self-default. `cfg` MUST be
  // present (the adapters short-circuit on `!ctx.cfg`). The body adapter
  // side-channels its resolved `refinementPlan` onto ctx; that field is
  // consumed today only by promote.mjs's inline pre-flight (which still runs
  // ahead of move-state spawn), so the in-registry assignment is harmless.
  const guardResult = await runGuards(resolvedFromState, stateArg, {
    issueNumber: Number(issueArg),
    repo: cfg.repo,
    fromState: resolvedFromState,
    toState: stateArg,
    body: guardBody,
    fetchBlockerState,
    cfg,
  });

  if (!guardResult.ok) {
    process.stderr.write('\n');
    process.stderr.write(`⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
    for (const r of guardResult.refusals) {
      process.stderr.write(`   BLOCKED: #${issueArg} is in ${resolvedFromState}; ${r.reason}\n`);
    }
    process.stderr.write('\n');
    process.stderr.write(
      'Use `/task unblock` (or close the blockers) before retrying this move.\n\n'
    );
    process.exit(4);
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
    process.stderr.write('\n');
    process.stderr.write(`⛔ Refusing to move #${issueArg} to develop:\n`);
    planDevelopBlockers.forEach((b) => process.stderr.write(`   BLOCKED: ${b}\n`));
    process.stderr.write(
      '\nResolve the blockers, then retry. For legitimate abandonment, move the card in the GitHub Projects UI.\n\n'
    );
    process.exit(4);
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

// Forward-transition contiguity guard (#252). On a forward move, every
// canonical prior forward stage must already carry its `aitm-entered-*` marker
// in the body. Catches a board that advanced while the marker chain has a hole
// (clobbered/skipped marker — the #251 class) at the point of the skip, rather
// than deferring the discovery to the close-time chain check. Forward-only:
// backward/rework arcs and re-entry (toIdx <= fromIdx) resolve to 'skip' and
// are never blocked; an empty `resolvedFromState` (offline) is skipped too.
// Runs BEFORE __mutationBlock so refusal precedes any board write or marker
// stamp (no partial transition). No env override exists.
if (!SKIP_NETWORK && resolvedFromState && STAGES.includes(stateArg)) {
  let contigBody = '';
  let contigFetched = false;
  try {
    contigBody = (
      await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
    ).trim();
    contigFetched = true;
  } catch {
    /* body fetch failed — skip (offline-tolerant, like the sibling gates) */
  }
  if (contigFetched) {
    const verdict = evaluateContiguity({
      fromState: resolvedFromState,
      toState: stateArg,
      body: contigBody,
      force: false,
    });
    if (verdict.action === 'refuse') {
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
      process.stderr.write(`   BLOCKED: ${verdict.message}\n`);
      process.stderr.write(
        '\nA forward move may not enter a new stage while an earlier stage in the chain is unrecorded.\n'
      );
      process.stderr.write('Recovery:\n');
      process.stderr.write(
        '   • Backfill the marker(s) if the stage(s) genuinely ran, then retry, or\n'
      );
      process.stderr.write(
        `   • Run \`/task reconcile accept-live ${issueArg}\` if the board and body have drifted.\n\n`
      );
      process.exit(6);
    }
  }
}

// --- mutation block (per-issue advisory lock — EPIC #207 / #214) ---
// Wrap every write that touches the issue (board status field, body markers,
// timing-log comment, audit comments, local state file) so two parallel
// sessions on the same issue serialize cleanly. The verb pipeline
// (promote/approve/reconcile) may have already acquired this lock and signal
// via `AITM_ISSUE_LOCK_HELD=1`; in that case skip re-acquisition.
const __mutationBlock = async () => {
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
      const stampTs = new Date().toISOString();
      const priorVisitCount = getStageVisitCount(beforeBody, stateArg);
      let nextBody = stampEntryMarker(beforeBody, stateArg, stampTs);
      nextBody = writeLastKnownState(nextBody, stateArg);
      // Visit number this stamp produced. If stampEntryMarker treated the call
      // as a no-op (same ts re-stamp), the count is unchanged and we should
      // not post an audit comment.
      const nextVisitCount = getStageVisitCount(nextBody, stateArg);
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
      // #184 — When the body stamp produced a visit-numbered re-entry marker
      // (visit >= 2), post a backfill audit comment so the body change is
      // observable in the issue timeline. Idempotent on the (stage, visit)
      // tuple; failure does not undo the body stamp (degrades to stderr).
      if (nextVisitCount >= 2 && nextVisitCount > priorVisitCount) {
        await postReentryAuditComment({
          issueNumber: issueArg,
          repo: cfg.repo,
          stage: stateArg,
          visit: nextVisitCount,
          ts: stampTs,
        });
      }
    } catch (err) {
      process.stderr.write(`[move-state] #${issueArg}: marker stamp failed: ${err.message}\n`);
    }
  }

  // #292 — fire each `STATES[to].onEnter` action after a successful Status
  // write + marker stamp. Actions are short, idempotent setup hooks (see
  // `states/index.mjs` Action contract). Empty today; populated by future
  // migration sub-issues. Failures degrade to stderr — the transition stands.
  if (!SKIP_NETWORK) {
    try {
      const { STATES: STATE_OBJS } = await import('../task-tracker/states/index.mjs');
      const target = STATE_OBJS[stateArg];
      if (target) {
        for (const action of target.onEnter) {
          try {
            await action.run({
              issueNumber: Number(issueArg),
              repo: cfg.repo,
              fromState: resolvedFromState,
              toState: stateArg,
              cfg,
            });
          } catch (err) {
            process.stderr.write(
              `[move-state] #${issueArg}: onEnter action "${action.id}" failed: ${err.message}\n`
            );
          }
        }
      }
    } catch (err) {
      process.stderr.write(`[move-state] #${issueArg}: onEnter dispatch failed: ${err.message}\n`);
    }
  }

  // #218 follow-up — refresh the per-session `kanbanState` derived cache that
  // the activity-guard hook reads synchronously. The body marker remains the
  // source of truth; this only updates the read-cache for the current
  // session's bound issue so the hook isn't deadlocked between two stale
  // sources. Best-effort: failures must never block the board move.
  if (STAGES.includes(stateArg)) {
    try {
      const [{ setSessionKanbanState, getActiveTask }, { currentSessionId }] = await Promise.all([
        import('../task-tracker/session-state.mjs'),
        import('../task-tracker/word-counter.mjs'),
      ]);
      const sid = currentSessionId();
      if (sid) {
        const active = getActiveTask(sid, getProjectDir());
        if (active && active.issue === `#${issueArg}`) {
          setSessionKanbanState(sid, stateArg, getProjectDir());
        }
      }
    } catch (err) {
      process.stderr.write(
        `[move-state] #${issueArg}: kanbanState cache refresh failed: ${err.message}\n`
      );
    }
  }

  // #128 — Paired lifecycle row emission. The chokepoint for all kanban
  // transitions emits `<prev>:complete` + `<next>:enter` rows (both share
  // the same wall-clock `ts`) from the canonical PHASE_EVENTS table. Demote
  // substitutes a `demoted` row (no completion event) before the
  // `<next>:enter`. Skip when SKIP_NETWORK is set or when both halves are
  // absent (e.g. transitions with no completion event for the previous
  // state and no entry event for the target). Best-effort — failures here
  // do not roll back the committed board move.
  if (!SKIP_NETWORK) {
    try {
      const { buildRow, postTimingEvent, readTimingCommentBody } =
        await import('../task-tracker/gh-timing-comment.mjs');
      const { deriveStateMoveDelta } = await import('../task-tracker/lib/timing-rows.mjs');
      const { PHASE_EVENTS } = await import('../task-tracker/phase-events.mjs');

      const ts = new Date().toISOString();
      const prev = resolvedFromState || '';
      const timingBody = await readTimingCommentBody({
        issueNumber: issueArg,
        repo: cfg.repo,
        timeoutMs: GH_API_TIMEOUT_MS,
      });
      const { activeSec, idleSec } = deriveStateMoveDelta(timingBody, ts);

      // First row: completion of the previous state (or `demoted` for demote).
      if (demoteFlag) {
        const row = buildRow({
          ts,
          event: 'demoted',
          activeSec,
          idleSec,
          deltaWords: 0,
          wordMarker: 0,
          description: prev ? `demoted from ${prev}` : 'demoted',
        });
        await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
      } else if (prev && PHASE_EVENTS[prev]?.complete) {
        const row = buildRow({
          ts,
          phase: { state: prev, phase: 'complete' },
          activeSec,
          idleSec,
          deltaWords: 0,
          wordMarker: 0,
        });
        await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
      }

      // Second row: entry into the new state. Share the same `ts` so the
      // pair is co-located in the table.
      if (PHASE_EVENTS[stateArg]?.enter) {
        // `<next>:enter` derives from PHASE_EVENTS; honest 0/0 because the
        // paired emission shares ts with the completion row above — no
        // elapsed delta is possible between the two halves.
        const row = buildRow({
          ts,
          phase: { state: stateArg, phase: 'enter' },
          activeSec: 0,
          idleSec: 0,
          deltaWords: 0,
          wordMarker: 0,
        });
        await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
      }
    } catch (err) {
      process.stderr.write(
        `[move-state] #${issueArg}: phase-pair emission failed: ${err.message}\n`
      );
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

  // #249 — Auto-unpark dependents. When the move lands at `done`, release any
  // sibling whose `aitm-blocked-by` marker references this issue: strip the ref
  // (and, on a full clear, drop the BLOCKED label) via child (b)'s marker API.
  // Best-effort — failures are surfaced, never block the committed board move.
  if (stateArg === 'done' && !SKIP_NETWORK && process.env.AITM_CASCADE !== '1') {
    try {
      const { unparkDependents } = await import('../task-tracker/lib/unpark-dependents.mjs');
      const released = await unparkDependents({ doneIssueNumber: Number(issueArg), cfg });
      const cleared = released.filter((r) => r.cleared);
      const errored = released.filter((r) => r.error);
      if (cleared.length) {
        const summary = cleared.map((r) => `#${r.issue}(${r.cleared})`).join(', ');
        process.stderr.write(`[unpark] #${issueArg}: released ${summary}\n`);
      }
      for (const r of errored) {
        process.stderr.write(`[unpark] #${issueArg}: ${r.issue ?? '?'} failed: ${r.error}\n`);
      }
    } catch (err) {
      // surface, do not block — board move is committed
      process.stderr.write(`[unpark] #${issueArg}: enforcement failed: ${err.message}\n`);
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

  // Persist new kanban state to tracker-state. move-state.mjs is the single
  // state-mutator, so every successful transition must sync the local cache —
  // regardless of whether the caller bound via `/task #N` first. Orchestrator
  // flows and sub-agent fan-outs run with `s.active === null`; gating on
  // active here left the cache permanently stale and the next verb's preflight
  // flagged it as a human-move (#210).
  try {
    const projectDir = getProjectDir();
    const sp = existingRuntimePath(projectDir, `${SHARED_DIR}/task-tracker-state.json`);
    const s = loadState(sp);
    s.state = stateArg;
    saveState(s, sp);
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
      pexec(process.execPath, [ttScript, 'end'], { timeout: LOCAL_FAST_TIMEOUT_MS }).catch(
        () => {}
      );
  }
}; // end __mutationBlock

if (process.env[ISSUE_LOCK_HELD_ENV] === '1') {
  await __mutationBlock();
} else {
  try {
    await withIssueLock(
      {
        issue: issueArg,
        verb: AITM_VERB_CONTEXT || 'move-state',
        projDir: getProjectDir(),
      },
      __mutationBlock
    );
  } catch (err) {
    if (err instanceof IssueLockError) {
      process.stderr.write(`⛔ ${err.message}\n`);
      process.exit(7);
    }
    throw err;
  }
}
