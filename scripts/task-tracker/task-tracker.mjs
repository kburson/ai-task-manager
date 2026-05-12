#!/usr/bin/env node
// /task skill CLI. Dispatches verbs to per-verb modules under ./verbs/.
// Shared runtime context lives in ./runtime.mjs.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { buildContext, handleMigrateResult } from './runtime.mjs';
import { currentSessionId, jsonlPath, countWords } from './word-counter.mjs';

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
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'],
      { cwd: ctx.projectDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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
  } catch { return true; }
})();

if (_isMain) (async () => {
  const ctx = buildContext();
  checkRepoMismatch(ctx);
  checkInit(ctx);
  try {
    switch (ctx.verb) {
      case 'status': {
        const { verbStatus } = await import('./verbs/status.mjs');
        await verbStatus(ctx); break;
      }
      case 'config': {
        const { verbConfig } = await import('./verbs/config.mjs');
        verbConfig(ctx); break;
      }
      case 'close':
      case 'end': {
        const { verbClose } = await import('./verbs/close.mjs');
        await verbClose(ctx); break;
      }
      case 'pause': {
        const { verbPause } = await import('./verbs/pause.mjs');
        await verbPause(ctx); break;
      }
      case 'resume':
      case 'start': {
        const { verbResume } = await import('./verbs/resume.mjs');
        await verbResume(ctx); break;
      }
      case 'update': {
        const { verbUpdate } = await import('./verbs/update.mjs');
        await verbUpdate(ctx); break;
      }
      case 'review': {
        const { verbReview } = await import('./verbs/review.mjs');
        await verbReview(ctx); break;
      }
      case 'reject': {
        const { verbReject } = await import('./verbs/reject.mjs');
        await verbReject(ctx); break;
      }
      case 'words-count': {
        const sid = currentSessionId();
        const count = sid ? countWords(jsonlPath(sid), 0).count : 0;
        console.log(count);
        break;
      }
      case 'log': {
        const target = ctx.rest[0];
        if (!target) { console.error('Usage: /task log #N'); process.exit(1); }
        await ctx.runLogIssueTime(target);
        break;
      }
      case 'migrate':
        await ctx.runMigrate(ctx.rest);
        break;
      case 'plan': {
        const { verbPlan } = await import('./verbs/plan.mjs');
        await verbPlan(ctx); break;
      }
      case 'new': {
        const { verbNew } = await import('./verbs/new.mjs');
        await verbNew(ctx); break;
      }
      case 'check': {
        const { verbCheck } = await import('./verbs/check.mjs');
        await verbCheck(ctx); break;
      }
      case 'fleet': {
        const { verbFleet } = await import('./verbs/fleet.mjs');
        await verbFleet(ctx); break;
      }
      case 'analyze': {
        const { verbAnalyze } = await import('./verbs/analyze.mjs');
        await verbAnalyze(ctx.rest, ctx.cfg);
        break;
      }
      case 'approve': {
        const { verbApprove } = await import('./verbs/approve.mjs');
        await verbApprove(ctx.rest, ctx.cfg);
        break;
      }
      case 'approve-review': {
        const { verbApproveReview } = await import('./verbs/approve-review.mjs');
        await verbApproveReview(ctx.rest, ctx.cfg);
        break;
      }
      case 'promote':
      case 'next': {
        const { verbPromote } = await import('./verbs/promote.mjs');
        await verbPromote(ctx.rest, ctx.cfg);
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
      case 'move':
        console.error('unknown verb: move — did you mean `/task promote` or `/task demote`?');
        process.exit(2);
      case 'help':
      case '?': {
        const { verbHelp } = await import('./verbs/help.mjs');
        verbHelp(); break;
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
