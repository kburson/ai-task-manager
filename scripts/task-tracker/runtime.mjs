// Runtime context shared by the dispatcher and all lifecycle verb modules.
//
// `buildContext()` parses argv, loads config, and bundles the cross-verb helpers
// (timing flush, queue drain, board moves, GraphQL sub-issue lookups) into a
// single object passed to each verb. Extracted from task-tracker.mjs as part of
// issue #10 so each lifecycle verb can live in its own file under verbs/.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from './config.mjs';
import { postTimingEvent } from './gh-timing-comment.mjs';
import { enqueue, drain } from './queue.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  loadMarker,
  countWords,
} from './word-counter.mjs';
import { collectEventTimestamps, computeActiveAndIdleMinutes } from './active-time.mjs';
import { findMainWorktreePath, currentBranch } from './fleet-registry.mjs';
import { gql, splitRepo } from '../gh/lib/github-projects.mjs';
import { getProjectDir } from './paths.mjs';
import { GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';

const pexec = promisify(execFile);

export function nowIso() {
  return new Date().toISOString();
}

export function minutesBetween(aIso, bIso) {
  return Math.round((new Date(bIso) - new Date(aIso)) / 60000);
}

import { CLOSE_OWNED_CHECKBOXES, uncheckedPreCloseCheckboxes } from './close-gate.mjs';
export { CLOSE_OWNED_CHECKBOXES, uncheckedPreCloseCheckboxes };

export function handleMigrateResult(result, { stderr = process.stderr, exit = process.exit } = {}) {
  if (result.status === 0) return;
  if (result.error) stderr.write(`[task-tracker] migrate spawn error: ${result.error.message}\n`);
  if (result.signal) stderr.write(`[task-tracker] migrate killed by signal: ${result.signal}\n`);
  exit(result.status || 1);
}

const EVENT_DESCRIPTIONS = {
  created: 'task created',
  pause: 'task paused',
  close: 'task closed',
  end: 'task closed',
  'switch-end': 'switched to next task',
};

export function buildContext(rawArgv = process.argv.slice(2)) {
  const _roleIdx = rawArgv.indexOf('--role');
  const role = _roleIdx >= 0 && _roleIdx + 1 < rawArgv.length ? rawArgv[_roleIdx + 1] : 'solo';
  const _argvClean =
    _roleIdx >= 0 ? rawArgv.filter((_, i) => i !== _roleIdx && i !== _roleIdx + 1) : rawArgv;
  const rawVerb = _argvClean[0] || 'status';
  const verb = /^\d+$/.test(rawVerb) ? `#${rawVerb}` : rawVerb;
  const ISSUE_ARG_VERBS = new Set([
    'log',
    'resume',
    'start',
    'check',
    'close',
    'review',
    'approve',
    'promote',
    'demote',
    'next',
    'reconcile',
  ]);
  const rest = _argvClean
    .slice(1)
    .map((a) => (ISSUE_ARG_VERBS.has(verb) && /^\d+$/.test(a) ? `#${a}` : a));

  const projectDir = getProjectDir();
  const cfg = loadConfig();
  const statePath = path.join(projectDir, cfg.statePath);
  const queuePath = path.join(projectDir, cfg.queuePath);
  const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

  const ctx = {
    cfg,
    projectDir,
    statePath,
    queuePath,
    SKIP_NETWORK,
    role,
    rest,
    verb,
    pexec,
    nowIso,
    minutesBetween,
    CLOSE_OWNED_CHECKBOXES,
    uncheckedPreCloseCheckboxes,
  };

  ctx.safePostTiming = async (issue, row) => {
    if (SKIP_NETWORK) return { ok: true, skipped: true };
    try {
      await postTimingEvent({
        issueNumber: issue,
        repo: cfg.repo,
        row,
        timeoutMs: cfg.hookNetworkTimeoutMs,
      });
      return { ok: true };
    } catch (err) {
      enqueue({ kind: 'timing', issue, row }, queuePath);
      return { ok: false, queued: true, err: err.message };
    }
  };

  ctx.drainQueueIfAny = async () => {
    if (SKIP_NETWORK) return;
    await drain(async (evt) => {
      if (evt.kind === 'timing') {
        await postTimingEvent({
          issueNumber: evt.issue,
          repo: cfg.repo,
          row: evt.row,
          timeoutMs: cfg.hookNetworkTimeoutMs,
        });
      }
    }, queuePath);
  };

  ctx.flushActiveToGH = async (state, event, description) => {
    const ts = nowIso();
    const sid = currentSessionId();
    let deltaWords = 0;
    if (sid) {
      const marker = loadMarker(markerPathFor(sid));
      deltaWords = countWords(jsonlPath(sid), marker.line).count;
    }
    const startMs = new Date(state.entryStartTs).getTime();
    const endMs = new Date(ts).getTime();
    const deltaWallMin = Math.round((endMs - startMs) / 60000);
    let activeMin = deltaWallMin;
    let idleMin = 0;
    if (sid) {
      const events = collectEventTimestamps(jsonlPath(sid), startMs, endMs);
      ({ activeMin, idleMin } = computeActiveAndIdleMinutes({
        startMs,
        endMs,
        events,
        idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
      }));
    }
    const wordMarker = state.wordsAtEntryStart + deltaWords;
    const { buildRow } = await import('./gh-timing-comment.mjs');
    const row = buildRow({
      ts,
      event,
      activeMin,
      idleMin,
      deltaWords,
      wordMarker,
      description: description ?? EVENT_DESCRIPTIONS[event] ?? event,
    });
    await ctx.safePostTiming(state.active, row);
    return { ts, deltaMin: activeMin, idleMin, deltaWallMin, deltaWords, wordMarker };
  };

  ctx.runLogIssueTime = async (issue) => {
    if (SKIP_NETWORK) return;
    const scriptPath = new URL('../gh/log-issue-time.mjs', import.meta.url).pathname;
    try {
      const { stdout } = await pexec(process.execPath, [scriptPath, issue], {
        timeout: GH_API_TIMEOUT_MS,
      });
      if (stdout.trim()) console.log(stdout.trim());
    } catch (err) {
      console.warn(`[task-tracker] Could not update board fields: ${err.message}`);
    }
  };

  ctx.runMigrate = async (args) => {
    if (SKIP_NETWORK) return;
    const scriptPath = new URL('../gh/migrate-project.mjs', import.meta.url).pathname;
    // No `timeout:` here: migrate-project.mjs proxies an interactive bash
    // setup wizard via inherited stdio. A fixed budget would kill a slow human
    // mid-prompt. Child gh calls inside the wizard each carry their own
    // GH_API_TIMEOUT_MS budgets.
    // execFileSync throws on non-zero exit; reconstruct the {status,error,signal}
    // shape handleMigrateResult expects so error reporting stays consistent.
    let result;
    try {
      execFileSync(process.execPath, [scriptPath, ...args], {
        cwd: projectDir,
        stdio: 'inherit',
        env: process.env,
      });
      result = { status: 0 };
    } catch (err) {
      result = {
        status: typeof err.status === 'number' ? err.status : 1,
        error: err.code && err.code !== 'ENOENT' ? null : err,
        signal: err.signal || null,
      };
    }
    handleMigrateResult(result);
  };

  ctx.runMoveState = async (issue, state, { env: envOverride } = {}) => {
    if (SKIP_NETWORK) return;
    const scriptPath = fileURLToPath(new URL('../gh/move-state.mjs', import.meta.url));
    const issueNum = String(issue).replace(/^#/, '');
    try {
      const mergedEnv = { ...process.env, ...(envOverride || {}), AITM_INTERNAL: '1' };
      const { stdout } = await pexec(process.execPath, [scriptPath, issueNum, state], {
        timeout: GH_API_TIMEOUT_MS,
        env: mergedEnv,
      });
      if (stdout.trim()) console.log(stdout.trim());
    } catch (err) {
      console.warn(`[task-tracker] Could not move ${issue} to ${state}: ${err.message}`);
      console.warn(`[task-tracker] Run manually: node ${scriptPath} ${issueNum} ${state}`);
    }
  };

  ctx.runMoveStateDone = (issue) => ctx.runMoveState(issue, 'done');

  ctx.worktreeLabel = () => {
    try {
      const main = findMainWorktreePath(projectDir);
      if (path.resolve(main) === path.resolve(projectDir)) return 'main';
      return `${currentBranch(projectDir)}@${projectDir}`;
    } catch {
      return 'unknown';
    }
  };

  ctx.buildStateOptionMap = () =>
    Object.fromEntries(
      [
        [cfg.kanbanOptionBacklog, 'backlog'],
        [cfg.kanbanOptionGroom, 'refine'],
        [cfg.kanbanOptionAnalyze, 'plan'],
        [cfg.kanbanOptionDevelopment, 'develop'],
        [cfg.kanbanOptionValidate, 'test'],
        [cfg.kanbanOptionReview, 'review'],
        [cfg.kanbanOptionDone, 'done'],
      ].filter(([k]) => k)
    );

  ctx.fetchSubIssues = async (issueNum) => {
    if (SKIP_NETWORK) return [];
    try {
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) {
              subIssues(first: 100) { nodes { number } }
            }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNum) },
        { timeout: GH_API_TIMEOUT_MS }
      );
      return data?.repository?.issue?.subIssues?.nodes?.map((n) => n.number) ?? [];
    } catch {
      return [];
    }
  };

  ctx.fetchParentIssue = async (issueNum) => {
    if (SKIP_NETWORK) return null;
    try {
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) { parent { number } }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNum) },
        { timeout: GH_API_TIMEOUT_MS }
      );
      return data?.repository?.issue?.parent?.number ?? null;
    } catch {
      return null;
    }
  };

  ctx.getIssueBoardState = async (issueNum) => {
    if (SKIP_NETWORK) return null;
    try {
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) {
              projectItems(first: 10) {
                nodes {
                  project { id }
                  fieldValueByName(name: "Status") {
                    ... on ProjectV2ItemFieldSingleSelectValue { optionId }
                  }
                }
              }
            }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNum) },
        { timeout: GH_API_TIMEOUT_MS }
      );
      const nodes = data?.repository?.issue?.projectItems?.nodes ?? [];
      const node = nodes.find((n) => n.project?.id === cfg.projectId);
      const optionId = node?.fieldValueByName?.optionId;
      return optionId ? (ctx.buildStateOptionMap()[optionId] ?? null) : null;
    } catch {
      return null;
    }
  };

  return ctx;
}
