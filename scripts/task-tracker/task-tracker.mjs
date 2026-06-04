#!/usr/bin/env node
// /task skill CLI. Dispatches verbs to per-verb modules under ./verbs/.
// Shared runtime context lives in ./runtime.mjs.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { buildContext, handleMigrateResult } from './runtime.mjs';
import { currentSessionId, jsonlPath, countWords } from './word-counter.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';

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
  } catch {}
}

const INIT_EXEMPT = new Set(['config', 'help', '?', 'migrate', 'status', 'fleet']);

// #208 — shared preflight verbs. `target-required` parses `#N` from rest and
// enforces bind-match. `target-optional` falls back to active when no `#N` is
// in rest. `active-only` skips bind-match entirely (operates on active or is
// a switch-style verb that handles target itself).
const PREFLIGHT_MODE = {
  approve: 'target-required',
  'plan-approve': 'target-required',
  promote: 'target-required',
  next: 'target-required',
  refine: 'target-required',
  demote: 'target-required',
  close: 'target-optional',
  end: 'target-optional',
  review: 'target-optional',
  reject: 'target-optional',
  pause: 'active-only',
  update: 'active-only',
  resume: 'active-only',
  start: 'active-only',
};

function targetFromRest(rest) {
  for (const a of rest || []) {
    if (/^#\d+$/.test(String(a))) return String(a);
    if (/^\d+$/.test(String(a))) return `#${a}`;
  }
  return null;
}

async function runVerbPreflight(ctx) {
  const mode = PREFLIGHT_MODE[ctx.verb];
  if (!mode) return;
  const { preflightVerb } = await import('./lib/verb-preflight.mjs');
  const { loadState } = await import('./state.mjs');
  const stateBefore = loadState(ctx.statePath);
  const target = mode === 'active-only' ? undefined : targetFromRest(ctx.rest);
  await preflightVerb({
    stateBefore,
    statePath: ctx.statePath,
    target,
    cfg: ctx.cfg,
    verb: ctx.verb,
  });
}

function checkInit(ctx) {
  if (INIT_EXEMPT.has(ctx.verb)) return;
  const cfgPath = path.join(ctx.projectDir, '.ai-task-manager', 'task-tracker.json');
  if (!existsSync(cfgPath)) {
    process.stderr.write(
      `task-tracker: config-not-found at ${cfgPath}\n` +
        '  This worktree was not seeded with .ai-task-manager/. The orchestrator must run:\n' +
        '    node scripts/task-tracker/seed-worktree.mjs <worktree-path>\n' +
        '  before booting an agent. Agents MUST report STATUS: BLOCKED and stop.\n'
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
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return true;
  }
})();

if (_isMain)
  (async () => {
    const ctx = buildContext();
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
        case 'resume':
        case 'start': {
          const { verbResume } = await import('./verbs/resume.mjs');
          await verbResume(ctx);
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
        case 'discover': {
          const { verbDiscover } = await import('./verbs/discover.mjs');
          await verbDiscover(ctx);
          break;
        }
        case 'plan': {
          const { verbPlan } = await import('./verbs/discover.mjs');
          await verbPlan(ctx);
          break;
        }
        case 'new': {
          const { verbNew } = await import('./verbs/new.mjs');
          await verbNew(ctx);
          break;
        }
        case 'cancel': {
          const { verbCancel } = await import('./verbs/cancel.mjs');
          await verbCancel(ctx);
          break;
        }
        case 'check': {
          const { verbCheck } = await import('./verbs/check.mjs');
          await verbCheck(ctx);
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
        case 'fleet': {
          const { verbFleet } = await import('./verbs/fleet.mjs');
          await verbFleet(ctx);
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
          await verbPullNext(ctx.rest, ctx.cfg);
          break;
        }
        case 'demote': {
          const { verbDemote } = await import('./verbs/demote.mjs');
          await verbDemote(ctx.rest, ctx.cfg);
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
        case 'block': {
          const { verbBlock } = await import('./verbs/block.mjs');
          await verbBlock(ctx);
          break;
        }
        case 'unblock': {
          const { verbUnblock } = await import('./verbs/unblock.mjs');
          await verbUnblock(ctx);
          break;
        }
        case 'move':
          console.error('unknown verb: move — did you mean `/task promote` or `/task demote`?');
          process.exit(2);
        case 'help':
        case '?': {
          const { verbHelp } = await import('./verbs/help.mjs');
          verbHelp();
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
      process.exit(1);
    }
  })();
