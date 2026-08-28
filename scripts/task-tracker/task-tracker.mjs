#!/usr/bin/env node
// /task skill CLI. Dispatches verbs to per-verb modules under ./verbs/.
// Shared runtime context lives in ./runtime.mjs.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { buildContext, handleMigrateResult } from './runtime.mjs';
import { currentSessionId, jsonlPath, countWords } from './word-counter.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import {
  enforceVerbWorktreeBinding,
  ForeignWorktreeBindingError,
  parseForeignWorktreeOverride,
} from './lib/worktree-binding-guard.mjs';
import {
  enforceIssueWorktreeLocation,
  parseWorktreeRelocationConfirmation,
  WorktreeRelocationRequiredError,
} from './lib/worktree-relocation-guard.mjs';

function parseRepoFromRemote(remoteUrl) {
  const s = remoteUrl.trim().replace(/\.git$/, '');
  const ssh = s.match(/^git@[^:]+:(.+)$/);
  if (ssh) return ssh[1];
  const https = s.match(/^https?:\/\/[^/]+\/(.+)$/);
  if (https) return https[1];
  return null;
}

function checkRepoMismatch(ctx) {
  if (!ctx.cfg.repo) return;
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: ctx.projectDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: GIT_TIMEOUT_MS,
    }).trim();
    const remoteRepo = parseRepoFromRemote(remoteUrl);
    if (remoteRepo && remoteRepo !== ctx.cfg.repo) {
      console.warn(
        `[task-tracker] WARNING: configured repo (${ctx.cfg.repo}) does not match\n` +
          `               git remote (${remoteRepo}). Run /task config init to fix.`
      );
    }
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
}

const INIT_EXEMPT = new Set(['config', 'help', '?', 'migrate', 'status', 'fleet']);

// #208 — shared preflight verbs. `target-required` parses `#N` from rest and
// enforces bind-match. `target-optional` falls back to active when no `#N` is
// in rest. `active-only` skips bind-match entirely (operates on active or is
// a switch-style verb that handles target itself).
export const PREFLIGHT_MODE = {
  approve: 'target-required',
  'plan-approve': 'target-required',
  'issue-body': 'target-required',
  comment: 'target-required',
  assign: 'target-required',
  transfer: 'target-required',
  unassign: 'target-required',
  plan: 'target-required',
  test: 'target-required',
  deliver: 'target-required',
  'incident-ledger': 'target-required',
  reconcile: 'target-required',
  check: 'target-optional',
  ensureChecked: 'target-optional',
  ensureUnchecked: 'target-optional',
  'dod-stamp': 'target-required',
  'ac-stamp': 'target-required',
  kind: 'target-required',
  'epic-reconcile': 'target-required',
  'commit-trace': 'target-required',
  'evidence-markers': 'target-required',
  block: 'target-required',
  unblock: 'target-required',
  'user-story': 'target-optional',
  story: 'target-optional',
  'inflate-estimate': 'target-required',
  'plan-estimate': 'target-required',
  'mirror-deep-dive': 'target-last-optional',
  'adopt-github-records': 'target-required',
  log: 'target-required',
  brainstorm: 'active-only',
  discover: 'active-only',
  new: 'active-only',
  'split-plan': 'target-required',
  'pull-next': 'target-required',
  promote: 'target-required',
  next: 'target-required',
  refine: 'target-required',
  demote: 'target-required',
  shelve: 'target-required',
  park: 'target-required',
  'cancel-plan': 'target-required',
  supersede: 'target-required',
  close: 'target-optional',
  end: 'target-optional',
  review: 'target-optional',
  reject: 'target-optional',
  pause: 'active-only',
  stop: 'active-only',
  update: 'active-only',
  resume: 'switch-target',
  start: 'switch-target',
};

function targetFromRest(rest) {
  for (const a of rest || []) {
    if (/^#\d+$/.test(String(a))) return String(a);
    if (/^\d+$/.test(String(a))) return `#${a}`;
  }
  return null;
}

// #845 — `active-only` mode (start/resume/pause/stop/update) discards the
// `<N>` CLI argument unconditionally, so a cold bind (no active task in
// state) never threads a target into `runPreflight`, which then early-returns
// before the assignee gate ever runs. On a WARM active-only call (an issue is
// already bound), `target` must stay `undefined` — that's what lets a
// switch-style rebind through without tripping `runPreflight`'s bind-mismatch
// check. Conditioning on `stateBefore.active` preserves that switch behavior
// exactly while closing the cold-bind gap.
export function resolvePreflightTarget({ mode, rest, stateBefore }) {
  if (mode !== 'active-only') return targetFromRest(rest);
  return stateBefore?.active == null ? targetFromRest(rest) : undefined;
}

export function resolvePreflightInvocation({ verb, mode, rest, stateBefore }) {
  if (mode === 'switch-target') {
    const explicit = /^#\d+$/.test(String(verb)) ? String(verb) : targetFromRest(rest);
    const target =
      explicit ||
      (verb === 'resume' && stateBefore?.paused ? stateBefore?.lastActive || undefined : undefined);
    if (!target) return { target: undefined, stateBefore };
    return { target, stateBefore: { ...stateBefore, active: target } };
  }
  if (mode === 'target-last-optional') {
    const target = targetFromRest([...(rest || [])].reverse());
    return { target: target || stateBefore?.active || undefined, stateBefore };
  }
  return {
    target: resolvePreflightTarget({ mode, rest, stateBefore }),
    stateBefore,
  };
}

async function runVerbPreflight(ctx) {
  const mode = PREFLIGHT_MODE[ctx.verb] || (/^#\d+$/.test(ctx.verb) ? 'switch-target' : null);
  if (!mode) return;
  const { preflightVerb } = await import('./lib/verb-preflight.mjs');
  const { loadState } = await import('./state.mjs');
  const stateBefore = loadState(ctx.statePath);
  const invocation = resolvePreflightInvocation({
    verb: ctx.verb,
    mode,
    rest: ctx.rest,
    stateBefore,
  });
  await preflightVerb({
    stateBefore: invocation.stateBefore,
    statePath: ctx.statePath,
    target: invocation.target,
    cfg: ctx.cfg,
    verb: ctx.verb,
    ownershipManagement: ['assign', 'transfer', 'unassign'].includes(ctx.verb),
    ownershipOnly: ctx.verb === 'reconcile',
  });
}

function checkInit(ctx) {
  if (INIT_EXEMPT.has(ctx.verb)) return;
  const cfgPath = path.join(ctx.projectDir, '.ai-task-manager', 'task-tracker.json');
  if (!existsSync(cfgPath)) {
    process.stderr.write(
      `task-tracker: config-not-found at ${cfgPath}\n` +
        '  `.ai-task-manager/` is git-tracked (#574), so a checkout — including a\n' +
        '  fresh `git worktree add` — carries it automatically; a missing config\n' +
        '  means this directory is not an initialized aitm project. Run `npx aitm init`\n' +
        '  (or check out the project) before booting an agent. Agents MUST report\n' +
        '  STATUS: BLOCKED and stop.\n'
    );
    process.exit(2);
  }
  if (!ctx.cfg.repo) {
    process.stderr.write(
      'task-tracker: not initialized — no repo configured.\n' +
        '  npx ai-task-manager init   (recommended — sets up repo, project, and board fields)\n' +
        '  /task config init          (from a Claude session — interactive config interview)\n'
    );
    process.exit(1);
  }
  if (!ctx.cfg.projectId || !ctx.cfg.kanbanFieldId) {
    process.stderr.write(
      '[task-tracker] Board features unavailable: project not configured (projectId missing).\n' +
        '  Run: npx ai-task-manager init   or   /task config init\n'
    );
  }
}

// #394/#1023 — recognize only canonical top-level or verb-level help positions.
// A help-shaped option value (for example `refine ... --reason help`) must reach
// the verb parser instead of short-circuiting the command.
const TASK_HELP_TOKENS = new Set(['help', '--help', '-h', '?']);

export function hasHelpFlag(argv) {
  const args = argv || [];
  if (args.length === 1) return TASK_HELP_TOKENS.has(args[0]);
  if (args.length !== 2) return false;
  return args[0] === 'help' || TASK_HELP_TOKENS.has(args[1]);
}

export function earlyHelpTarget(argv) {
  const args = argv || [];
  if (!hasHelpFlag(args)) return null;
  if (args[0] === 'help') {
    return { matched: true, target: TASK_HELP_TOKENS.has(args[1]) ? undefined : args[1] };
  }
  if (args.length === 2) return { matched: true, target: args[0] };
  return { matched: true, target: undefined };
}

// Re-export for tests that import these from task-tracker.mjs.
export { handleMigrateResult };
export async function fetchSubIssues(issueNum) {
  return buildContext().fetchSubIssues(issueNum);
}
export async function fetchParentIssue(issueNum) {
  return buildContext().fetchParentIssue(issueNum);
}
export async function getIssueBoardState(issueNum) {
  return buildContext().getIssueBoardState(issueNum);
}

const _isMain = (() => {
  try {
    if (!process.argv[1]) return false;
    // `import.meta.url` is realpath-resolved by Node's ESM loader, so realpath
    // `argv[1]` too — otherwise a symlinked invocation path (notably
    // `node_modules/ai-task-manager -> ..`) makes the two strings differ, the
    // guard returns false, and the entire CLI silently no-ops with exit 0 (#478).
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return true;
  }
})();

if (_isMain)
  (async () => {
    // #394/#1023 — intercept only canonical command-help positions before
    // buildContext() touches config/network. Help is INIT_EXEMPT and must work
    // in an unconfigured directory; this early exit mutates no state (no issue
    // create, board write, or bind switch).
    const helpRequest = earlyHelpTarget(process.argv.slice(2));
    if (helpRequest) {
      const { verbHelp } = await import('./verbs/help.mjs');
      verbHelp(helpRequest.target);
      process.exit(0);
    }
    const relocation = parseWorktreeRelocationConfirmation(process.argv.slice(2));
    const foreignWorktree = parseForeignWorktreeOverride(relocation.argv);
    const ctx = buildContext(foreignWorktree.argv);
    try {
      await enforceIssueWorktreeLocation({
        verb: ctx.verb,
        rest: ctx.rest,
        cfg: ctx.cfg,
        invokingDir: process.cwd(),
        confirmRelocation: relocation.confirmRelocation,
      });
    } catch (error) {
      if (!(error instanceof WorktreeRelocationRequiredError)) throw error;
      process.stdout.write(`${error.promptToken}\n`);
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 12;
      return;
    }
    try {
      await enforceVerbWorktreeBinding({
        verb: ctx.verb,
        rest: ctx.rest,
        cfg: ctx.cfg,
        invokingDir: process.cwd(),
        allowForeignWorktree: foreignWorktree.allowForeignWorktree,
      });
    } catch (error) {
      if (!(error instanceof ForeignWorktreeBindingError)) throw error;
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 7;
      return;
    }
    checkRepoMismatch(ctx);
    checkInit(ctx);
    await runVerbPreflight(ctx);
    try {
      switch (ctx.verb) {
        case 'status': {
          const { verbStatus } = await import('./verbs/status.mjs');
          await verbStatus(ctx);
          break;
        }
        case 'config': {
          const { verbConfig } = await import('./verbs/config.mjs');
          verbConfig(ctx);
          break;
        }
        case 'board': {
          const { verbBoard } = await import('./verbs/board.mjs');
          await verbBoard(ctx);
          break;
        }
        case 'assign': {
          const { verbAssign } = await import('./verbs/assign.mjs');
          await verbAssign(ctx.rest, ctx.cfg);
          break;
        }
        case 'transfer': {
          const { verbTransfer } = await import('./verbs/assign.mjs');
          await verbTransfer(ctx.rest, ctx.cfg);
          break;
        }
        case 'unassign': {
          const { verbUnassign } = await import('./verbs/unassign.mjs');
          await verbUnassign(ctx.rest, ctx.cfg);
          break;
        }
        case 'close':
        case 'end': {
          const { verbClose } = await import('./verbs/close.mjs');
          await verbClose(ctx);
          break;
        }
        case 'pause': {
          const { verbPause } = await import('./verbs/pause.mjs');
          await verbPause(ctx);
          break;
        }
        case 'resume': {
          const { verbResume } = await import('./verbs/resume.mjs');
          await verbResume(ctx);
          break;
        }
        case 'start': {
          const { verbStart } = await import('./verbs/start.mjs');
          await verbStart(ctx);
          break;
        }
        case 'stop': {
          const { verbStop } = await import('./verbs/stop.mjs');
          await verbStop(ctx);
          break;
        }
        case 'update': {
          const { verbUpdate } = await import('./verbs/update.mjs');
          await verbUpdate(ctx);
          break;
        }
        case 'test': {
          const { verbTest } = await import('./verbs/test.mjs');
          await verbTest(ctx);
          break;
        }
        case 'review': {
          const { verbReview } = await import('./verbs/review.mjs');
          await verbReview(ctx);
          break;
        }
        case 'deliver': {
          const { verbDeliver } = await import('./verbs/deliver.mjs');
          await verbDeliver(ctx);
          break;
        }
        case 'incident-ledger': {
          const { verbIncidentLedger } = await import('./verbs/incident-ledger.mjs');
          await verbIncidentLedger(ctx);
          break;
        }
        case 'reject': {
          const { verbReject } = await import('./verbs/reject.mjs');
          await verbReject(ctx);
          break;
        }
        case 'words-count': {
          const sid = currentSessionId();
          const count = sid ? countWords(jsonlPath(sid), 0).count : 0;
          console.log(count);
          break;
        }
        case 'log': {
          const target = ctx.rest[0];
          if (!target) {
            console.error('Usage: /task log #N');
            process.exit(1);
          }
          await ctx.runLogIssueTime(target);
          break;
        }
        case 'migrate':
          await ctx.runMigrate(ctx.rest);
          break;
        case 'brainstorm':
        case 'discover': {
          const { verbDiscover } = await import('./verbs/discover.mjs');
          await verbDiscover(ctx);
          break;
        }
        case 'plan': {
          const { verbPlan } = await import('./verbs/plan.mjs');
          await verbPlan(ctx);
          break;
        }
        case 'new': {
          const { verbNew } = await import('./verbs/new.mjs');
          await verbNew(ctx);
          break;
        }
        case 'save-plan': {
          const { verbSavePlan } = await import('./verbs/save-plan.mjs');
          await verbSavePlan(ctx);
          break;
        }
        case 'save-draft': {
          const { verbSaveDraft } = await import('./verbs/save-draft.mjs');
          await verbSaveDraft(ctx);
          break;
        }
        case 'cancel': {
          const { verbCancel } = await import('./verbs/cancel.mjs');
          await verbCancel(ctx);
          break;
        }
        case 'check': {
          // #660 — deprecated alias → ensureChecked (no longer toggles).
          const { verbCheck } = await import('./verbs/check.mjs');
          await verbCheck(ctx);
          break;
        }
        case 'ensureChecked': {
          const { verbEnsureChecked } = await import('./verbs/check.mjs');
          await verbEnsureChecked(ctx);
          break;
        }
        case 'ensureUnchecked': {
          const { verbEnsureUnchecked } = await import('./verbs/check.mjs');
          await verbEnsureUnchecked(ctx);
          break;
        }
        case 'dod-stamp': {
          const { verbDodStamp } = await import('./verbs/dod-stamp.mjs');
          await verbDodStamp(ctx);
          break;
        }
        case 'ac-stamp': {
          const { verbAcStamp } = await import('./verbs/ac-stamp.mjs');
          await verbAcStamp(ctx);
          break;
        }
        case 'kind': {
          const { verbKind } = await import('./verbs/kind.mjs');
          await verbKind(ctx);
          break;
        }
        case 'epic-reconcile': {
          const { verbEpicReconcile } = await import('./verbs/epic-reconcile.mjs');
          await verbEpicReconcile(ctx);
          break;
        }
        case 'report': {
          const { verbReport } = await import('./verbs/report.mjs');
          await verbReport(ctx);
          break;
        }
        case 'commit-trace': {
          const { verbCommitTrace } = await import('./verbs/commit-trace.mjs');
          await verbCommitTrace(ctx);
          break;
        }
        case 'evidence-markers': {
          const { verbEvidenceMarkers } = await import('./verbs/evidence-markers.mjs');
          await verbEvidenceMarkers(ctx);
          break;
        }
        case 'issue-body': {
          const { verbIssueBody } = await import('./verbs/issue-body.mjs');
          await verbIssueBody(ctx);
          break;
        }
        case 'comment': {
          const { verbComment } = await import('./verbs/comment.mjs');
          await verbComment(ctx);
          break;
        }
        case 'adopt-github-records': {
          const { verbAdoptGithubRecords } = await import('./verbs/adopt-github-records.mjs');
          await verbAdoptGithubRecords(ctx);
          break;
        }
        case 'mirror-deep-dive': {
          const { verbMirrorDeepDive } = await import('./verbs/mirror-deep-dive.mjs');
          await verbMirrorDeepDive(ctx);
          break;
        }
        case 'fleet': {
          const { verbFleet } = await import('./verbs/fleet.mjs');
          await verbFleet(ctx);
          break;
        }
        case 'occupancy': {
          const { verbOccupancy } = await import('./verbs/occupancy.mjs');
          await verbOccupancy(ctx);
          break;
        }
        case 'approve': {
          const { verbApprove } = await import('./verbs/approve.mjs');
          await verbApprove(ctx.rest, ctx.cfg);
          break;
        }
        case 'plan-approve': {
          const { verbPlanApprove } = await import('./verbs/plan-approve.mjs');
          await verbPlanApprove(ctx.rest, ctx.cfg);
          break;
        }
        case 'user-story':
        case 'story': {
          const { verbUserStory } = await import('./verbs/user-story.mjs');
          await verbUserStory(ctx);
          break;
        }
        case 'promote':
        case 'next': {
          const { verbPromote } = await import('./verbs/promote.mjs');
          await verbPromote(ctx.rest, ctx.cfg);
          break;
        }
        case 'refine': {
          const { verbRefine } = await import('./verbs/refine.mjs');
          await verbRefine(ctx.rest, ctx.cfg);
          break;
        }
        case 'pull-next': {
          const { verbPullNext } = await import('./verbs/pull-next.mjs');
          process.exitCode = await verbPullNext(ctx.rest, ctx.cfg);
          break;
        }
        case 'demote': {
          const { verbDemote } = await import('./verbs/demote.mjs');
          await verbDemote(ctx.rest, ctx.cfg);
          break;
        }
        case 'shelve': {
          const { verbShelve } = await import('./verbs/shelve.mjs');
          await verbShelve(ctx.rest, ctx.cfg);
          break;
        }
        case 'park': {
          const { verbPark } = await import('./verbs/park.mjs');
          await verbPark(ctx.rest, ctx.cfg);
          break;
        }
        case 'cancel-plan': {
          const { verbCancelPlan } = await import('./verbs/cancel-plan.mjs');
          await verbCancelPlan(ctx.rest, ctx.cfg);
          break;
        }
        case 'reconcile': {
          const { verbReconcile } = await import('./verbs/reconcile.mjs');
          await verbReconcile(ctx.rest, ctx.cfg);
          break;
        }
        case 'auto': {
          const { cli: autoCli } = await import('./verbs/auto.mjs');
          await autoCli(ctx.rest);
          break;
        }
        case 'inflate-estimate': {
          const { verbInflateEstimate } = await import('./verbs/inflate-estimate.mjs');
          await verbInflateEstimate(ctx.rest, ctx.cfg);
          break;
        }
        case 'plan-estimate': {
          const { verbPlanEstimate } = await import('./verbs/plan-estimate.mjs');
          await verbPlanEstimate(ctx);
          break;
        }
        case 'decompose-check': {
          const { verbDecomposeCheck } = await import('./verbs/decompose-check.mjs');
          await verbDecomposeCheck(ctx);
          break;
        }
        case 'split-plan': {
          const { verbSplitPlan } = await import('./verbs/split-plan.mjs');
          await verbSplitPlan(ctx);
          break;
        }
        case 'block': {
          const { verbBlock } = await import('./verbs/block.mjs');
          await verbBlock(ctx);
          break;
        }
        case 'chore-mode': {
          const { verbChoreMode } = await import('./verbs/chore-mode.mjs');
          await verbChoreMode(ctx);
          break;
        }
        case 'unblock': {
          const { verbUnblock } = await import('./verbs/unblock.mjs');
          await verbUnblock(ctx);
          break;
        }
        case 'supersede': {
          const { verbSupersede } = await import('./verbs/supersede.mjs');
          await verbSupersede(ctx);
          break;
        }
        case 'move':
          console.error('unknown verb: move — did you mean `/task promote` or `/task demote`?');
          process.exit(2);
        case 'help':
        case '?': {
          const { verbHelp } = await import('./verbs/help.mjs');
          verbHelp(ctx.rest[0]);
          break;
        }
        default:
          if (/^#\d+$/.test(ctx.verb)) {
            const { verbSwitch } = await import('./verbs/switch.mjs');
            await verbSwitch(ctx, ctx.verb);
            break;
          }
          console.error(`unknown verb: ${ctx.verb}`);
          process.exit(2);
      }
    } catch (err) {
      console.error(`task-tracker error: ${err.message}`);
      // #498 — surface a machine-readable defect-hint when the error carries one
      // (MarkerLossError, SeederMarkerMissingError) so the AI can offer a
      // pre-filled `/task report`. Additive stderr line; exit code unchanged.
      if (err && err.defectHint) console.error(err.defectHint);
      process.exit(1);
    }
  })();
