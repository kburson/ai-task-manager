#!/usr/bin/env node
// /task skill CLI. Dispatches verbs to module functions.
// Read design: .claude/skills/task-tracker/DESIGN.md

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { loadConfig, setConfigValue, formatConfig, DEFAULTS } from './config.mjs';
import { projectTmpDir } from './paths.mjs';
import { loadState, saveState, clearActive, EMPTY_STATE } from './state.mjs';

const pexec = promisify(execFile);
import { postTimingEvent } from './gh-timing-comment.mjs';
import { currentSessionId, jsonlPath, markerPathFor, loadMarker, saveMarker, countWords } from './word-counter.mjs';
import { collectEventTimestamps, computeActiveAndIdleMinutes } from './active-time.mjs';
import { enqueue, drain } from './queue.mjs';
import { registerTask, deregisterTask, setTaskStatus, currentBranch,
         findMainWorktreePath, fleetRegistryPath, readFleet } from './fleet-registry.mjs';
import { gql, splitRepo } from '../gh/lib/github-projects.mjs';
import { validateVerificationCommand } from './lib/verification-allowlist.mjs';
import { validateBody, DEFAULT_GATES } from './lib/body-gates.mjs';
import { checkDirty, formatSummary, shortAuditDescription, resolveWorkspaceForIssue, CLEANUP_GUIDANCE } from '../gh/lib/dirty-workspace.mjs';

const argv = process.argv.slice(2);
// Extract --role flag before parsing verb/rest (agent | orchestrator | solo)
const _roleIdx = argv.indexOf('--role');
const role = _roleIdx >= 0 && _roleIdx + 1 < argv.length ? argv[_roleIdx + 1] : 'solo';
const _argvClean = _roleIdx >= 0 ? argv.filter((_, i) => i !== _roleIdx && i !== _roleIdx + 1) : argv;
// Normalize bare issue numbers only for verbs that accept issue operands.
const rawVerb = _argvClean[0] || 'status';
const verb = /^\d+$/.test(rawVerb) ? `#${rawVerb}` : rawVerb;
const ISSUE_ARG_VERBS = new Set(['log', 'resume', 'start', 'check', 'close', 'review', 'analyze', 'approve', 'approve-review', 'promote', 'demote', 'next', 'reconcile']);
const rest = _argvClean.slice(1).map(a =>
  ISSUE_ARG_VERBS.has(verb) && /^\d+$/.test(a) ? `#${a}` : a
);

const projectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const cfg = loadConfig();
const statePath = path.join(projectDir, cfg.statePath);
const queuePath = path.join(projectDir, cfg.queuePath);
const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

function parseRepoFromRemote(remoteUrl) {
  // Normalize SSH (git@github.com:owner/repo.git) and HTTPS to owner/repo
  const s = remoteUrl.trim().replace(/\.git$/, '');
  const ssh = s.match(/^git@[^:]+:(.+)$/);
  if (ssh) return ssh[1];
  const https = s.match(/^https?:\/\/[^/]+\/(.+)$/);
  if (https) return https[1];
  return null;
}

function checkRepoMismatch() {
  if (!cfg.repo) return;
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'],
      { cwd: projectDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const remoteRepo = parseRepoFromRemote(remoteUrl);
    if (remoteRepo && remoteRepo !== cfg.repo) {
      console.warn(
        `[task-tracker] WARNING: configured repo (${cfg.repo}) does not match\n` +
        `               git remote (${remoteRepo}). Run /task config init to fix.`
      );
    }
  } catch { /* no remote or git not available — skip silently */ }
}

const INIT_EXEMPT = new Set(['config', 'help', '?', 'migrate', 'status', 'fleet']);

function checkInit(cfg, verb) {
  if (INIT_EXEMPT.has(verb)) return;
  // Fail-closed for agent bootstrap: when --role agent is in play, the worktree
  // MUST already have .ai-task-manager/task-tracker.json (seeded by the orchestrator
  // via scripts/task-tracker/seed-worktree.mjs). A missing config file here means
  // the worktree pipeline broke; never silently no-op.
  const cfgPath = path.join(projectDir, '.ai-task-manager', 'task-tracker.json');
  if (!existsSync(cfgPath)) {
    process.stderr.write(
      `task-tracker: config-not-found at ${cfgPath}\n` +
      '  This worktree was not seeded with .ai-task-manager/. The orchestrator must run:\n' +
      '    node scripts/task-tracker/seed-worktree.mjs <worktree-path>\n' +
      '  before booting an agent. Agents MUST report STATUS: BLOCKED and stop.\n'
    );
    process.exit(2);
  }
  if (!cfg.repo) {
    process.stderr.write(
      'task-tracker: not initialized — no repo configured.\n' +
      '  npx ai-task-manager init   (recommended — sets up repo, project, and board fields)\n' +
      '  /task config init          (from a Claude session — interactive config interview)\n'
    );
    process.exit(1);
  }
  if (!cfg.projectId || !cfg.kanbanFieldId) {
    process.stderr.write(
      '[task-tracker] Board features unavailable: project not configured (projectId missing).\n' +
      '  Run: npx ai-task-manager init   or   /task config init\n'
    );
  }
}

function nowIso() { return new Date().toISOString(); }

function minutesBetween(aIso, bIso) {
  return Math.round((new Date(bIso) - new Date(aIso)) / 60000);
}

async function safePostTiming(issue, row) {
  if (SKIP_NETWORK) return { ok: true, skipped: true };
  try {
    await postTimingEvent({
      issueNumber: issue, repo: cfg.repo, row,
      timeoutMs: cfg.hookNetworkTimeoutMs,
    });
    return { ok: true };
  } catch (err) {
    enqueue({ kind: 'timing', issue, row }, queuePath);
    return { ok: false, queued: true, err: err.message };
  }
}

async function draiQueueIfAny() {
  if (SKIP_NETWORK) return;
  await drain(async (evt) => {
    if (evt.kind === 'timing') {
      await postTimingEvent({
        issueNumber: evt.issue, repo: cfg.repo, row: evt.row,
        timeoutMs: cfg.hookNetworkTimeoutMs,
      });
    }
  }, queuePath);
}

// ---- Verbs ----

function worktreeLabel() {
  try {
    const main = findMainWorktreePath(projectDir);
    if (path.resolve(main) === path.resolve(projectDir)) return 'main';
    return `${currentBranch(projectDir)}@${projectDir}`;
  } catch {
    return 'unknown';
  }
}

async function verbStatus() {
  console.log(`worktree: ${worktreeLabel()}`);
  const s = loadState(statePath);
  if (!s.active) {
    if (s.lastActive) console.log(`No active task. Last active: ${s.lastActive}. Use "/task start" to resume.`);
    else console.log('No active task. Use "/task #N" or "/task plan" to start.');
    return;
  }
  if (s.active === 'plan') {
    console.log(`Active: planning bucket (started ${s.planBucket?.startedAt}). Use "/task new" to promote.`);
    return;
  }
  const sid = currentSessionId();
  let wordsNow = s.wordsAtEntryStart;
  if (sid) {
    const marker = loadMarker(markerPathFor(sid));
    const { count } = countWords(jsonlPath(sid), marker.line);
    wordsNow = s.wordsAtEntryStart + count;
  }
  const startMs = new Date(s.entryStartTs).getTime();
  const endMs = Date.now();
  const wallMin = Math.round((endMs - startMs) / 60000);
  let activeMin = wallMin;
  if (sid) {
    const events = collectEventTimestamps(jsonlPath(sid), startMs, endMs);
    ({ activeMin } = computeActiveAndIdleMinutes({
      startMs, endMs, events,
      idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
    }));
  }
  const wallNote = wallMin !== activeMin ? ` (wall ${wallMin})` : '';
  console.log(`Active: ${s.active} [${cfg.repo || 'repo not set'}]. Elapsed: ${activeMin} active min${wallNote}, ${wordsNow - s.wordsAtEntryStart} words since last marker.`);
}

function verbConfig() {
  if (rest.length === 0) {
    console.log(formatConfig(cfg));
    return;
  }
  if (rest[0] === 'init') {
    console.log('Run /task config init from a Claude session to start the configuration interview.');
    return;
  }
  if (rest.length === 1) {
    const [k] = rest;
    if (!(k in DEFAULTS)) { console.error(`unknown config key: ${k}`); process.exit(1); }
    console.log(`${k} = ${JSON.stringify(cfg[k])} (source: ${cfg._sources[k]})`);
    return;
  }
  const [k, ...v] = rest;
  try {
    const set = setConfigValue(k, v.join(' '));
    console.log(`${k} = ${JSON.stringify(set)} (project-local)`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

const EVENT_DESCRIPTIONS = {
  'created':    'task created',
  'pause':      'task paused',
  'close':      'task closed',
  'end':        'task closed',
  'switch-end': 'switched to next task',
};

async function flushActiveToGH(state, event, description) {
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
      startMs, endMs, events,
      idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
    }));
  }
  const wordMarker = state.wordsAtEntryStart + deltaWords;
  const row = (await import('./gh-timing-comment.mjs')).buildRow({
    ts, event, activeMin, idleMin, deltaWords,
    wordMarker, description: description ?? EVENT_DESCRIPTIONS[event] ?? event,
  });
  await safePostTiming(state.active, row);
  return { ts, deltaMin: activeMin, idleMin, deltaWallMin, deltaWords, wordMarker };
}

async function runLogIssueTime(issue) {
  if (SKIP_NETWORK) return;
  const scriptPath = new URL('../gh/log-issue-time.mjs', import.meta.url).pathname;
  try {
    const { stdout } = await pexec(process.execPath, [scriptPath, issue], { timeout: 15000 });
    if (stdout.trim()) console.log(stdout.trim());
  } catch (err) {
    console.warn(`[task-tracker] Could not update board fields: ${err.message}`);
  }
}

function handleMigrateResult(result, { stderr = process.stderr, exit = process.exit } = {}) {
  if (result.status === 0) return;
  if (result.error) stderr.write(`[task-tracker] migrate spawn error: ${result.error.message}\n`);
  if (result.signal) stderr.write(`[task-tracker] migrate killed by signal: ${result.signal}\n`);
  exit(result.status || 1);
}

async function runMigrate(args) {
  if (SKIP_NETWORK) return;
  const scriptPath = new URL('../gh/migrate-project.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectDir,
    stdio: 'inherit',
    env: process.env,
  });
  handleMigrateResult(result);
}

// Move issue to Done on the project board. /task close is the ONLY sanctioned
// path for invoking move-state.mjs done — direct invocation skips the timing
// flush and corrupts the velocity ledger.
async function runMoveStateDone(issue) {
  await runMoveState(issue, 'done');
}

async function runMoveState(issue, state, { env: envOverride } = {}) {
  if (SKIP_NETWORK) return;
  const scriptPath = fileURLToPath(new URL('../gh/move-state.mjs', import.meta.url));
  const issueNum = String(issue).replace(/^#/, '');
  try {
    // AITM_INTERNAL=1 marks this as a chokepoint-driven invocation so move-state.mjs
    // permits the call. Direct CLI invocation without this var is refused for agents.
    const mergedEnv = { ...process.env, ...(envOverride || {}), AITM_INTERNAL: '1' };
    const { stdout } = await pexec(process.execPath, [scriptPath, issueNum, state], { timeout: 15000, env: mergedEnv });
    if (stdout.trim()) console.log(stdout.trim());
  } catch (err) {
    console.warn(`[task-tracker] Could not move ${issue} to ${state}: ${err.message}`);
    console.warn(`[task-tracker] Run manually: node ${scriptPath} ${issueNum} ${state}`);
  }
}

const CLOSE_OWNED_CHECKBOXES = new Set([
  'Issue moved to Done',
  '`/task close` run (moves to Done, deregisters from fleet)',
  'If this completes the parent epic: update parent body; close parent if all siblings Done',
]);

function uncheckedPreCloseCheckboxes(body) {
  return [...body.matchAll(/^- \[ \] (.+)$/gm)]
    .map(m => m[1])
    .filter(label => !CLOSE_OWNED_CHECKBOXES.has(label))
    .map(label => `- [ ] ${label}`);
}

async function verbClose() {
  await draiQueueIfAny();
  const initialState = loadState(statePath);
  const target = rest.find(a => /^#\d+$/.test(a));
  let s = initialState;

  // closeTarget: explicit issue arg takes precedence over the active task.
  // closingDifferentIssue: true when the caller names a specific issue that is
  // not the current active session — in that case we close only the named issue
  // and leave the active session running.
  const closeTarget = target || s.active || '';
  const closeIssueNum = closeTarget.replace(/^#/, '');
  const closingDifferentIssue = !!(target && s.active && target !== s.active);

  if (!s.active && target) {
    s = {
      ...s,
      active: target,
      lastActive: target,
      entryStartTs: nowIso(),
      wordsAtEntryStart: 0,
    };
    saveState(s, statePath);
  }
  if (!closeTarget) { console.log('no active task'); return; }

  // Idempotency guard: if already Done, just clean up local state and fleet.
  if (!SKIP_NETWORK && closeIssueNum) {
    const currentState = await getIssueBoardState(closeIssueNum);
    if (currentState === 'done') {
      clearActive(statePath);
      try { deregisterTask(projectDir, closeTarget); } catch {}
      console.log(`${closeTarget} is already Done — local state and fleet cleaned up.`);
      return;
    }
  }

  if (closeTarget === 'plan') {
    console.log('Discarded planning bucket.');
    saveState({ ...s, active: null, planBucket: null }, statePath);
    return;
  }

  // Gate 2: dirty-workspace check on close. Decides BEFORE the body checkbox gate.
  // Resolution: --answer yes => refuse close, print cleanup guidance.
  //             --answer no  => proceed; append closed-with-dirty-tree audit row.
  //             --answer cancel => abort, no board change.
  // No --answer + CI=1            => refuse (exit 5).
  // No --answer + interactive     => emit PROMPT_REQUIRED marker, exit 0 (no change).
  let dirtyAuditRow = null;
  if (process.env.TT_SKIP_DIRTY_CHECK !== '1') {
    const answerIdx = rest.indexOf('--answer');
    const answerArg = answerIdx >= 0 ? String(rest[answerIdx + 1] || '').toLowerCase() : '';
    const cwd = resolveWorkspaceForIssue({ issueRef: closeTarget, projectDir });
    const dirty = await checkDirty({ cwd });
    if (dirty.dirty) {
      if (!answerArg) {
        if (process.env.CI === '1') {
          console.error(`⛔ Refusing to close ${closeTarget} — workspace is dirty (${dirty.total} path(s)) and running headless.`);
          console.error(formatSummary(dirty));
          console.error('');
          console.error('Headless mode requires --answer yes|no|cancel.');
          console.error('   yes    — refuse close, show cleanup flow (recommended)');
          console.error('   no     — close with `closed-with-dirty-tree` audit row');
          console.error('   cancel — abort, leave in Review');
          process.exit(5);
        } else {
          console.error(`⚠ Workspace is dirty (${dirty.total} path(s)) for ${closeTarget}:`);
          console.error(formatSummary(dirty));
          console.log(`PROMPT_REQUIRED: dirty-close-confirm ${closeTarget}`);
          return;
        }
      } else if (answerArg === 'yes') {
        console.error(`⛔ Refusing to close ${closeTarget} — workspace is dirty (${dirty.total} path(s)).`);
        console.error(formatSummary(dirty));
        console.error('');
        console.error(CLEANUP_GUIDANCE);
        process.exit(6);
      } else if (answerArg === 'cancel') {
        console.log(`Cancelled close of ${closeTarget}; left in Review (workspace dirty: ${dirty.total} path(s)).`);
        return;
      } else if (answerArg === 'no') {
        console.warn(`[task-tracker] Closing ${closeTarget} with dirty workspace (${dirty.total} path(s)) — appending audit row.`);
        const { buildRow: dbr } = await import('./gh-timing-comment.mjs');
        dirtyAuditRow = dbr({
          ts: nowIso(), event: 'closed-with-dirty-tree', activeMin: 0, idleMin: 0,
          deltaWords: 0, wordMarker: 0, description: shortAuditDescription(dirty),
        });
      } else {
        console.error(`Invalid --answer "${answerArg}". Expected yes|no|cancel.`);
        process.exit(1);
      }
    }
  }

  // Pre-close gate: every checkbox in the body of the issue being closed must be
  // checked. Gate always inspects closeTarget (the explicitly named issue, or the
  // active task when no issue is named). Audited override: TASK_TRACKER_FORCE_DONE=1
  // bypasses but posts an audit comment to the issue.
  const forceFlag = rest.includes('--force');
  const forceEnv = process.env.TASK_TRACKER_FORCE_DONE === '1';
  const force = forceFlag || forceEnv;
  let closeBody = '';
  if (!SKIP_NETWORK) {
    try {
      const { stdout } = await pexec('gh', [
        'issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body',
      ], { timeout: 10000 });
      const data = JSON.parse(stdout);
      const body = data.body ?? '';
      closeBody = body;

      // Human-gate: review-approval. Marker is written by `/task approve-review`.
      // `--answer yes|no` cannot satisfy this gate — only the marker or
      // `gateReviewToDone=false` does. See #58.
      if (cfg.gateReviewToDone && !force) {
        const hasApprovalMarker = /<!--\s*aitm-review-approved:/i.test(body);
        if (!hasApprovalMarker) {
          const answerIdx = rest.indexOf('--answer');
          const answerArg = answerIdx >= 0 ? String(rest[answerIdx + 1] || '').toLowerCase() : '';
          if (answerArg === 'yes' || answerArg === 'no') {
            console.error(`⛔ \`--answer ${answerArg}\` cannot satisfy a human-gate prompt (review-approval).`);
            console.error(`Run \`/task approve-review ${closeTarget}\` (human) or set \`gateReviewToDone false\` in config.`);
            process.exit(8);
          }
          console.error(`⛔ Refusing to close ${closeTarget} — no human review approval recorded.`);
          console.log(`PROMPT_REQUIRED: review-approval ${closeTarget}`);
          console.error(`Run \`/task approve-review ${closeTarget}\` (human) or set \`gateReviewToDone false\` in config.`);
          process.exit(7);
        }
      } else if (!cfg.gateReviewToDone) {
        const { buildRow: gbr } = await import('./gh-timing-comment.mjs');
        await safePostTiming(closeTarget, gbr({
          ts: nowIso(), event: 'gate-bypassed', activeMin: 0, idleMin: 0,
          deltaWords: 0, wordMarker: 0,
          description: 'gateReviewToDone=false in config — bypassing human review',
        }));
      }

      const unchecked = uncheckedPreCloseCheckboxes(body);
      const reasons = [];
      if (unchecked.length > 0) {
        reasons.push(`${unchecked.length} unchecked checkbox${unchecked.length === 1 ? '' : 'es'} in issue body`);
      }
      if (reasons.length > 0) {
        if (force) {
          console.error(`[task-tracker] ⚠ ${forceEnv ? 'TASK_TRACKER_FORCE_DONE=1' : '--force'} — bypassing close gate for ${closeTarget}`);
          reasons.forEach(r => console.error(`   • ${r}`));
          unchecked.forEach(u => console.error(`   ${u}`));
          try {
            const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
            const note = `⚠ **Close gate bypassed** via \`${forceEnv ? 'TASK_TRACKER_FORCE_DONE=1' : '--force'}\` at ${ts}. Unverified: ${reasons.join(', ')}.`;
            await pexec('gh', ['issue', 'comment', closeIssueNum, '-R', cfg.repo, '--body', note], { timeout: 10000 });
          } catch { /* audit comment is best-effort */ }
        } else {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          reasons.forEach(r => console.error(`   • ${r}`));
          unchecked.forEach(u => console.error(`   ${u}`));
          console.error('');
          console.error('See .ai-task-manager/pickup-directive.md Hard Rules.');
          console.error('Verify each item, check its box (`/task check "<label>"`), then retry.');
          console.error('Legitimate-abandonment override: TASK_TRACKER_FORCE_DONE=1 /task close');
          // Intentional: leave `active` set so the user can fix blockers and
          // retry without re-binding via /task #N. Don't "fix" by clearing.
          process.exit(3);
        }
      }
    } catch (err) {
      console.warn(`[task-tracker] Could not check issue body: ${err.message}`);
    }
  }
  // ── Cascade close (epic) ──────────────────────────────────────────────────
  // Sub-issues need no parent-state precondition — they close before the epic
  // reaches Review. The epic gate (children must be in Review) lives here on the epic side.
  if (!SKIP_NETWORK && closeIssueNum) {
    const subNums = await fetchSubIssues(closeIssueNum);
    if (subNums.length > 0) {
      // Epic: verify all children are in Review (or already Done)
      const childStates = await Promise.all(
        subNums.map(async n => ({ num: n, state: await getIssueBoardState(n) }))
      );
      const notReady = childStates.filter(c => c.state !== 'review' && c.state !== 'done');
      if (notReady.length > 0 && !force) {
        console.error(`[task-tracker] ⛔ Cannot close epic #${closeIssueNum} — ${notReady.length} child issue(s) not in Review:`);
        notReady.forEach(c => console.error(`   #${c.num}: ${c.state ?? 'unknown'}`));
        console.error('All sub-issues must reach Review before the epic can close.');
        // Intentional: leave `active` set so the user can drive children to
        // Review and retry. Don't "fix" by clearing.
        process.exit(3);
      }
      // Cascade: close each Review child
      const reviewChildren = childStates.filter(c => c.state === 'review');
      if (reviewChildren.length > 0) {
        console.log(`[task-tracker] Cascade closing ${reviewChildren.length} child issue(s)...`);
        const { buildRow: br } = await import('./gh-timing-comment.mjs');
        for (const child of reviewChildren) {
          try {
            await safePostTiming(`#${child.num}`, br({
              ts: nowIso(), event: 'done', activeMin: 0, idleMin: 0, deltaWords: 0,
              wordMarker: 0, description: 'cascade closed by epic',
            }));
            await runMoveState(child.num, 'done', { env: { AITM_CASCADE: '1' } });
            await pexec('gh', ['issue', 'close', String(child.num), '-R', cfg.repo], { timeout: 10000 });
            try { deregisterTask(projectDir, `#${child.num}`); } catch {}
            console.log(`  ✓ #${child.num} closed`);
          } catch (err) {
            console.warn(`  ⚠ Could not close #${child.num}: ${err.message}`);
          }
        }
      }
    }
  }
  // Review delta hook (#75): post the read-only Δ comment between the cascade
  // close and the final timing row. Failure must not block the close.
  if (!SKIP_NETWORK && closeIssueNum) {
    try {
      const { applyReviewDelta } = await import('./lib/apply-review-delta.mjs');
      await applyReviewDelta({ cfg, issueNumber: closeIssueNum, body: closeBody });
    } catch (err) {
      process.stderr.write(`⚠ review-delta hook failed: ${err.message}\n`);
    }
  }
  // Timing and board fields were flushed at Review (/task review). Close only moves
  // to Done, deregisters from fleet, and writes a +0 close marker row.
  if (dirtyAuditRow) {
    await safePostTiming(closeTarget, dirtyAuditRow);
  }
  const { buildRow: closeBr } = await import('./gh-timing-comment.mjs');
  if (closingDifferentIssue) {
    // Close only the named issue; leave the active session (s.active) running.
    await safePostTiming(closeTarget, closeBr({
      ts: nowIso(), event: 'done', activeMin: 0, idleMin: 0, deltaWords: 0,
      wordMarker: 0, description: 'closed',
    }));
    try { deregisterTask(projectDir, closeTarget); } catch {}
    await runMoveStateDone(closeTarget);
    console.log(`Closed ${closeTarget}.`);
  } else {
    await safePostTiming(closeTarget, closeBr({
      ts: nowIso(), event: 'done', activeMin: 0, idleMin: 0, deltaWords: 0,
      wordMarker: 0, description: 'closed — timing flushed at R4R',
    }));
    clearActive(statePath);
    try { deregisterTask(projectDir, s.active); } catch {}
    await runMoveStateDone(s.active);
    console.log(`Closed ${s.active}.`);
  }
}

async function verbSwitch(target) {
  // target is "#N"
  if (!/^#\d+$/.test(target)) {
    console.error(`invalid issue ref: ${target}`);
    process.exit(1);
  }
  await draiQueueIfAny();
  const s = loadState(statePath);
  let previousNote = '';
  if (s.active && s.active !== 'plan' && cfg.autoEndOnSwitch) {
    const previous = s.active;
    const { deltaMin, deltaWords } = await flushActiveToGH(s, 'switch-end');
    previousNote = ` Previous: ${previous} ended (+${deltaMin} min, +${deltaWords} words).`;
    await runLogIssueTime(previous);
    try { deregisterTask(projectDir, previous); } catch {}
  } else if (s.active === 'plan') {
    console.log('Discarding planning bucket (switch to concrete issue).');
  }
  // Start new
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const jp = jsonlPath(sid);
    const { totalLines, count } = countWords(jp, 0);
    saveMarker(markerPathFor(sid), totalLines, count, target);
    wordsAtStart = count;
  }
  const newState = {
    ...EMPTY_STATE,
    active: target,
    lastActive: target,
    entryStartTs: ts,
    wordsAtEntryStart: wordsAtStart,
  };
  saveState(newState, statePath);
  try { registerTask(projectDir, target, projectDir, currentBranch(projectDir)); } catch {}
  const row = (await import('./gh-timing-comment.mjs')).buildRow({
    ts, event: 'start', activeMin: 0, idleMin: 0, deltaWords: 0,
    wordMarker: wordsAtStart, description: role,
  });
  await safePostTiming(target, row);
  console.log(`Active: ${target}.${previousNote}`);
}

async function verbPause() {
  await draiQueueIfAny();
  const s = loadState(statePath);
  if (!s.active || s.active === 'plan') {
    console.log('nothing to pause');
    return;
  }
  const reason = rest.join(' ').trim() || undefined;
  const { deltaMin, deltaWallMin, deltaWords } = await flushActiveToGH(s, 'pause', reason);
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  saveState({
    ...s,
    active: null,
    entryStartTs: null,
    wordsAtEntryStart: 0,
    lastActive: s.active,
  }, statePath);
  try { setTaskStatus(projectDir, s.active, 'paused'); } catch {}
  console.log(`Paused ${s.active}: +${deltaMin} active min${wallNote}, +${deltaWords} words. Use "/task start" to resume.`);
}

function buildStateOptionMap() {
  return Object.fromEntries([
    [cfg.kanbanOptionBacklog,     'backlog'],
    [cfg.kanbanOptionGroom,       'groom'],
    [cfg.kanbanOptionAnalyze,     'analyze'],
    [cfg.kanbanOptionDevelopment, 'development'],
    [cfg.kanbanOptionValidate,    'validate'],
    [cfg.kanbanOptionReview,      'review'],
    [cfg.kanbanOptionDone,        'done'],
  ].filter(([k]) => k));
}

async function fetchSubIssues(issueNum) {
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
      { timeout: 10000 }
    );
    return data?.repository?.issue?.subIssues?.nodes?.map(n => n.number) ?? [];
  } catch { return []; }
}

async function fetchParentIssue(issueNum) {
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
      { timeout: 10000 }
    );
    return data?.repository?.issue?.parent?.number ?? null;
  } catch { return null; }
}

async function getIssueBoardState(issueNum) {
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
      { timeout: 10000 }
    );
    const nodes = data?.repository?.issue?.projectItems?.nodes ?? [];
    const node = nodes.find(n => n.project?.id === cfg.projectId);
    const optionId = node?.fieldValueByName?.optionId;
    return optionId ? (buildStateOptionMap()[optionId] ?? null) : null;
  } catch { return null; }
}

async function verbReview(args) {
  await draiQueueIfAny();
  const s = loadState(statePath);
  const target = args.find(a => /^#\d+$/.test(a)) || (s.active && s.active !== 'plan' ? s.active : null);
  if (!target) {
    console.error('Usage: /task review #N');
    process.exit(1);
  }

  // Structural body gate: refuse to move to In Review if evidence-required boxes are
  // ticked without the required supporting body content. Bypass with TASK_TRACKER_FORCE_DONE=1.
  // Skip the verification-commands rule here — verbReview's own auto-runner ticks those boxes.
  if (!SKIP_NETWORK) {
    const issueNum = String(target).replace(/^#/, '');
    let body = '';
    try {
      const { stdout } = await pexec('gh', [
        'issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body',
      ], { timeout: 10000 });
      body = (stdout || '').trim();
    } catch { /* missing body is not a gate failure */ }
    if (body) {
      const activeGates = DEFAULT_GATES.filter(g => g.name !== 'verification-commands');
      const result = validateBody(body, { gates: activeGates });
      if (!result.ok) {
        if (process.env.TASK_TRACKER_FORCE_DONE === '1') {
          process.stderr.write(`⚠ TASK_TRACKER_FORCE_DONE=1 — bypassing review gate for ${target}\n`);
          for (const r of result.refusedRules) process.stderr.write(`   • ${r.rule}: ${r.reason}\n`);
          try {
            await pexec('gh', ['issue', 'comment', issueNum, '-R', cfg.repo, '--body',
              `⚠ **review gate bypassed** via \`TASK_TRACKER_FORCE_DONE=1\` at ${new Date().toISOString()}. Unverified: ${result.refusedRules.map(r => r.rule).join(', ')}.`,
            ], { timeout: 5000 });
          } catch {}
        } else {
          try {
            const ts = new Date().toISOString();
            const row = (await import('./gh-timing-comment.mjs')).buildRow({
              ts, event: 'gate-refused', activeMin: 0, idleMin: 0, deltaWords: 0, wordMarker: 0,
              description: `→ validate: ${result.refusedRules.map(r => r.rule).join(', ')}`,
            });
            await postTimingEvent({ issueNumber: issueNum, repo: cfg.repo, row, timeoutMs: 3000 });
          } catch {}
          process.stderr.write('\n');
          process.stderr.write(`⛔ Refusing to move ${target} to Validate:\n`);
          for (const r of result.refusedRules) process.stderr.write(`   BLOCKED: ${r.rule}: ${r.reason}\n`);
          process.stderr.write('\nSee .ai-task-manager/pickup-directive.md Hard Rules.\n\n');
          process.exit(4);
        }
      }
      // Body gate passed (or bypassed). Size/Estimate re-evaluation now fires at the
      // analyze→development boundary (verbs/approve.mjs), not here. See #74.
    }
  }

  // Agent-provided timing: --duration-minutes N --words N
  const durIdx = args.indexOf('--duration-minutes');
  const wordsIdx = args.indexOf('--words');
  const parseFlag = v => Math.round(Number.parseFloat(String(v).replace(/^#/, '')) || 0);
  const agentDurationMin = durIdx >= 0 ? parseFlag(args[durIdx + 1]) : null;
  const agentWords = wordsIdx >= 0 ? parseFlag(args[wordsIdx + 1]) : null;
  const hasAgentTiming = agentDurationMin !== null || agentWords !== null;

  if (hasAgentTiming) {
    const ts = nowIso();
    const activeMin = agentDurationMin ?? 0;
    const deltaWords = agentWords ?? 0;
    const row = (await import('./gh-timing-comment.mjs')).buildRow({
      ts, event: 'review', activeMin, idleMin: 0, deltaWords,
      wordMarker: s.wordsAtEntryStart + deltaWords, description: 'agent session — starting review',
    });
    await safePostTiming(target, row);
    saveState({ ...s, active: null, entryStartTs: null, wordsAtEntryStart: 0, lastActive: target }, statePath);
    try { setTaskStatus(projectDir, target, 'paused'); } catch {}
    await runMoveState(target, 'validate');
    console.log(`Review ${target}: +${activeMin} active min (agent), +${deltaWords} words; task paused.`);
  } else if (s.active === target) {
    const { deltaMin, deltaWallMin, deltaWords } = await flushActiveToGH(s, 'review', 'starting review');
    const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
    saveState({
      ...s,
      active: null,
      entryStartTs: null,
      wordsAtEntryStart: 0,
      lastActive: target,
    }, statePath);
    try { setTaskStatus(projectDir, target, 'paused'); } catch {}
    await runMoveState(target, 'validate');
    console.log(`Review ${target}: +${deltaMin} active min${wallNote}, +${deltaWords} words; task paused.`);
  } else {
    const ts = nowIso();
    const row = (await import('./gh-timing-comment.mjs')).buildRow({
      ts, event: 'review', activeMin: 0, idleMin: 0, deltaWords: 0,
      wordMarker: 0, description: 'starting review',
    });
    await safePostTiming(target, row);
    await runMoveState(target, 'validate');
    saveState({ ...s, active: null, entryStartTs: null, wordsAtEntryStart: 0, lastActive: target }, statePath);
    console.log(`Review ${target}: task paused.`);
  }
  if (!SKIP_NETWORK) {
    const issueNum = target.replace(/^#/, '');
    const { stdout } = await pexec('gh', [
      'issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body',
    ], { timeout: 10000 });
    const rawBody = JSON.parse(stdout).body ?? '';
    const lines = rawBody.split('\n');

    // Parse checkboxes; track which are Verification Commands (backtick-wrapped, under that heading)
    let inVerifSection = false;
    const checkboxes = []; // { lineIndex, checked, label, command }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,6}\s+Verification Commands/.test(line)) { inVerifSection = true; continue; }
      if (/^#{1,6}\s/.test(line) && inVerifSection) inVerifSection = false;
      const m = line.match(/^- \[([ x])\] (.+)$/);
      if (!m) continue;
      const checked = m[1] === 'x';
      const label = m[2].trim();
      const cmdMatch = inVerifSection ? label.match(/^`(.+)`$/) : null;
      checkboxes.push({ lineIndex: i, checked, label, command: cmdMatch ? cmdMatch[1] : null });
    }

    // Run each Verification Command; auto-check on pass, flag regression on fail
    const failures = [];
    const regressions = [];
    for (const cb of checkboxes) {
      if (cb.command) {
        const validation = validateVerificationCommand(cb.command, { projectDir });
        if (!validation.ok) {
          console.log(`[task-tracker] rejected: ${validation.reason}`);
          if (cb.checked) {
            regressions.push(cb.label);
            lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
          }
          failures.push(`${cb.label} (rejected: ${validation.reason})`);
          continue;
        }
        let passed = false;
        try {
          await pexec(validation.argv[0], validation.argv.slice(1), { cwd: projectDir, timeout: 60000 });
          passed = true;
        } catch {}
        if (passed) {
          if (!cb.checked) lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [ ]', '- [x]');
        } else {
          if (cb.checked) {
            regressions.push(cb.label);
            lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
          }
          failures.push(cb.label);
        }
      } else if (!cb.checked && !CLOSE_OWNED_CHECKBOXES.has(cb.label)) {
        failures.push(`- [ ] ${cb.label}`);
      }
    }

    // Write updated body (checked/unchecked) back to GitHub
    const tmpBody = path.join(projectTmpDir(projectDir), `task-review-body-${issueNum}.md`);
    try {
      writeFileSync(tmpBody, lines.join('\n'), 'utf8');
      await pexec('gh', ['issue', 'edit', issueNum, '-R', cfg.repo, '--body-file', tmpBody],
        { timeout: 15000 });
    } finally {
      try { unlinkSync(tmpBody); } catch {}
    }

    if (failures.length > 0) {
      if (regressions.length > 0) {
        console.error(`[task-tracker] Regressions detected for ${target}:`);
        regressions.forEach(r => console.error(`   REGRESSION: ${r}`));
      }
      const { buildRow: br } = await import('./gh-timing-comment.mjs');
      await safePostTiming(target, br({
        ts: nowIso(), event: 'development', activeMin: 0, idleMin: 0, deltaWords: 0,
        wordMarker: 0, description: 'verification failed — reverted to Development',
      }));
      await runMoveState(target, 'development');
      console.error(`[task-tracker] Review failed for ${target}:`);
      failures.forEach(f => console.error(`   ${f}`));
      process.exit(3);
    }
    // ── Epic sub-issue gate: all sub-issues must be in Review ─────────────────
    const subNums = await fetchSubIssues(issueNum);
    if (subNums.length > 0) {
      const childStates = await Promise.all(
        subNums.map(async n => ({ num: n, state: await getIssueBoardState(n) }))
      );
      const notReview = childStates.filter(c => c.state !== 'review' && c.state !== 'done');
      if (notReview.length > 0) {
        // Stay in Validate — the epic's own boxes pass but children aren't ready
        console.error(`[task-tracker] ⛔ Epic ${target} cannot move to Review — ${notReview.length} child issue(s) not in Review:`);
        notReview.forEach(c => console.error(`   #${c.num}: ${c.state ?? 'unknown'}`));
        console.error('Wait for all sub-issues to reach Review, then run `/task review` again.');
        process.exit(3);
      }
    }
    // ── All gates passed: promote to Review ──────────────────────────────────
    // Agents commit their own work during development; do not sweep tracked
    // changes here — `git commit -a` would capture unrelated WIP from other
    // worktrees/agents (see #8).
    await runMoveState(target, 'review');
    const reviewTs = nowIso();
    const reviewRow = (await import('./gh-timing-comment.mjs')).buildRow({
      ts: reviewTs, event: 'review-ready', activeMin: 0, idleMin: 0, deltaWords: 0,
      wordMarker: 0, description: 'task is now in Review',
    });
    await safePostTiming(target, reviewRow);
    await runLogIssueTime(target);
    console.log(`✓ ${target} moved to Review — all verification passed.`);
    console.log(`PROMPT_REQUIRED: review-approval ${target}`);
  }
}

async function verbReject(args) {
  const target = args.find(a => /^#\d+$/.test(a)) || (loadState(statePath).lastActive ?? null);
  if (!target) {
    console.error('Usage: /task reject #N --reason "..."');
    process.exit(1);
  }
  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : null;
  if (!reason || !reason.trim()) {
    console.error('Usage: /task reject #N --reason "..."  (reason is required)');
    process.exit(1);
  }
  const issueNum = String(target).replace(/^#/, '');
  if (!SKIP_NETWORK) {
    const state = await getIssueBoardState(issueNum);
    if (state !== 'review') {
      console.error(`⛔ /task reject refused: #${issueNum} is in '${state ?? 'unknown'}', expected 'review'.`);
      process.exit(1);
    }
    const ts = nowIso();
    const commentBody = `### ❌ Review rejected\n\n${reason.trim()}\n\n— rejected at ${ts}`;
    try {
      await pexec('gh', ['issue', 'comment', issueNum, '-R', cfg.repo, '--body', commentBody],
        { timeout: 10000 });
    } catch (err) {
      console.error(`⚠ failed to post rejection comment: ${err.message}`);
      process.exit(1);
    }
  }
  await runMoveState(target, 'development');
  const { buildRow: br } = await import('./gh-timing-comment.mjs');
  const descReason = reason.trim().slice(0, 40);
  await safePostTiming(target, br({
    ts: nowIso(), event: 'development', activeMin: 0, idleMin: 0, deltaWords: 0,
    wordMarker: 0, description: `review rejected: ${descReason}`,
  }));
  console.log(`✓ ${target} rejected — moved back to Development.`);
}

async function verbStart(reasonOverride) {
  await draiQueueIfAny();
  const s = loadState(statePath);
  if (s.active) { console.log(`already active: ${s.active}`); return; }
  if (!s.lastActive) {
    console.log('no previous task. Use "/task #N" or "/task plan".');
    return;
  }
  const reason = (reasonOverride ?? rest.join(' ').trim()) || undefined;
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, s.lastActive);
    wordsAtStart = count;
  }
  saveState({
    ...s,
    active: s.lastActive,
    entryStartTs: ts,
    wordsAtEntryStart: wordsAtStart,
  }, statePath);
  try { setTaskStatus(projectDir, s.lastActive, 'active'); } catch {}
  const row = (await import('./gh-timing-comment.mjs')).buildRow({
    ts, event: 'resume', activeMin: 0, idleMin: 0, deltaWords: 0,
    wordMarker: wordsAtStart, description: reason ?? 'task resumed',
  });
  await safePostTiming(s.lastActive, row);
  console.log(`Resumed ${s.lastActive}.`);
}

async function verbPlan() {
  await draiQueueIfAny();
  const s = loadState(statePath);
  let previousNote = '';
  if (s.active && s.active !== 'plan' && cfg.autoEndOnSwitch) {
    const { deltaMin, deltaWords } = await flushActiveToGH(s, 'switch-end');
    previousNote = ` Previous: ${s.active} ended (+${deltaMin} min, +${deltaWords} words).`;
  }
  if (s.active === 'plan') {
    console.log('discarding previous plan bucket');
  }
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, 'plan');
    wordsAtStart = count;
  }
  saveState({
    ...EMPTY_STATE,
    active: 'plan',
    lastActive: s.lastActive,
    planBucket: {
      startedAt: ts,
      wordsAtStart,
      entries: [{ ts, event: 'plan-start', deltaMin: null, deltaWords: null }],
    },
  }, statePath);
  console.log(`Started planning bucket.${previousNote} Use "/task new [title]" to promote.`);
}

async function createNewIssue(title) {
  if (process.env.TT_FAKE_NEW_ISSUE) return process.env.TT_FAKE_NEW_ISSUE;
  if (SKIP_NETWORK) return '#0';
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const pe = promisify(execFile);
  const labelArgs = cfg.defaultLabels.flatMap(l => ['--label', l]);
  const { stdout } = await pe('gh', [
    'issue', 'create', '-R', cfg.repo,
    '--assignee', cfg.assignee || '@me',
    '--title', title,
    '--body', `Created via /task new. See timing log comment below.`,
    ...labelArgs,
  ], { timeout: cfg.hookNetworkTimeoutMs * 3 });
  const m = stdout.trim().match(/\/issues\/(\d+)/);
  if (!m) throw new Error(`could not parse issue number from: ${stdout}`);
  return `#${m[1]}`;
}

async function verbNew(args) {
  await draiQueueIfAny();
  const title = args.join(' ').trim() || `Task ${new Date().toISOString().slice(0,10)}`;
  const s = loadState(statePath);
  const wasPlan = s.active === 'plan' && s.planBucket;
  let previousNote = '';
  if (s.active && s.active !== 'plan' && cfg.autoEndOnSwitch) {
    const { deltaMin, deltaWords } = await flushActiveToGH(s, 'switch-end');
    previousNote = ` Previous: ${s.active} ended (+${deltaMin} min, +${deltaWords} words).`;
  }
  const issue = await createNewIssue(title);
  // Seed the timing comment immediately — ensures it's the first comment on the issue
  const createdTs = nowIso();
  const { buildRow } = await import('./gh-timing-comment.mjs');
  await safePostTiming(issue, buildRow({
    ts: createdTs, event: 'created', activeMin: 0, idleMin: 0,
    deltaWords: 0, wordMarker: 0, description: 'task created',
  }));
  if (wasPlan && !SKIP_NETWORK) {
    for (const e of s.planBucket.entries) {
      await safePostTiming(issue, buildRow({
        ts: e.ts, event: `planning: ${e.event}`,
        activeMin: e.deltaMin ?? 0, idleMin: 0, deltaWords: e.deltaWords ?? 0,
        wordMarker: s.planBucket.wordsAtStart, description: 'planning session',
      }));
    }
  }
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, issue);
    wordsAtStart = count;
  }
  saveState({
    ...EMPTY_STATE,
    active: issue,
    lastActive: issue,
    entryStartTs: ts,
    wordsAtEntryStart: wordsAtStart,
  }, statePath);
  try { registerTask(projectDir, issue, projectDir, currentBranch(projectDir)); } catch {}
  await safePostTiming(issue, buildRow({
    ts, event: 'start', activeMin: 0, idleMin: 0, deltaWords: 0,
    wordMarker: wordsAtStart, description: role,
  }));
  console.log(`Active: ${issue}.${previousNote} Created with title: "${title}".`);
}

async function verbUpdate(args) {
  await draiQueueIfAny();
  const s = loadState(statePath);
  if (!s.active || s.active === 'plan') {
    console.log('nothing to update');
    return;
  }
  const description = args.join(' ').trim() || 'checkpoint';
  const { deltaMin, idleMin, deltaWallMin, deltaWords, wordMarker, ts } =
    await flushActiveToGH(s, 'update', description);
  const totalActiveMinutes = (s.totalActiveMinutes || 0) + deltaMin;
  const sid = currentSessionId();
  let wordsAtStart = wordMarker;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, s.active);
    wordsAtStart = count;
  }
  saveState({
    ...s,
    entryStartTs: ts,
    wordsAtEntryStart: wordsAtStart,
    totalActiveMinutes,
  }, statePath);
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  console.log(
    `Update ${s.active}: +${deltaMin} active min, +${idleMin} idle min${wallNote}, +${deltaWords} words. ` +
    `Total: ${totalActiveMinutes} active min, ${wordMarker.toLocaleString('en-US')} words.`
  );
}

async function verbCheck(args) {
  const s = loadState(statePath);
  if (!s.active || s.active === 'plan') {
    console.error('no active task');
    process.exit(1);
  }
  const label = args.join(' ').trim();
  if (!label) {
    console.error('Usage: /task check "<label>"');
    process.exit(1);
  }
  const issueNum = s.active.replace(/^#/, '');
  const { stdout } = await pexec('gh', [
    'issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body',
  ], { timeout: 10000 });
  const body = stdout;

  // Special-case: "Deep dive complete" is no longer a visible checkbox — it
  // is recorded as a hidden `<!-- aitm-deep-dive-complete: <ts> -->` marker.
  // Delegate to the canonical helper in verbs/analyze.mjs so there is exactly
  // one place that writes this marker.
  if (/^deep[- ]?dive complete$/i.test(label)) {
    const { markDeepDiveComplete } = await import('./verbs/analyze.mjs');
    const res = await markDeepDiveComplete({ issueNumber: issueNum, cfg });
    if (!res.changed) {
      console.log(`[task-tracker] ✓ Already marked deep-dive-complete on ${s.active}`);
    } else {
      console.log(`[task-tracker] ✓ Marked deep-dive-complete on ${s.active} at ${res.ts}`);
    }
    return;
  }

  const uncheckedLine = `- [ ] ${label}`;
  const checkedLine   = `- [x] ${label}`;
  const alreadyChecked = body.includes(checkedLine);
  if (!alreadyChecked && !body.includes(uncheckedLine)) {
    const found = [...body.matchAll(/^- \[[ x]\] (.+)$/gm)].map(m => `  "${m[1]}"`);
    const list = found.length ? `\nCheckboxes found:\n${found.join('\n')}` : '\n(no checkboxes found in issue body)';
    console.error(`[task-tracker] checkbox "${label}" not found in ${s.active}${list}`);
    process.exit(1);
  }
  const updated = alreadyChecked
    ? body.replace(checkedLine, uncheckedLine)
    : body.replace(uncheckedLine, checkedLine);
  const tmp = path.join(projectTmpDir(projectDir), `tt-check-${Date.now()}.md`);
  try {
    writeFileSync(tmp, updated, 'utf8');
    await pexec('gh', ['issue', 'edit', issueNum, '-R', cfg.repo, '--body-file', tmp], { timeout: 10000 });
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
  const action = alreadyChecked ? 'Unchecked' : 'Checked';
  console.log(`[task-tracker] ✓ ${action} "${label}" on ${s.active}`);
}

async function verbResume() {
  const target = rest[0]; // '#N' or undefined or reason text
  if (target && /^#\d+$/.test(target)) {
    // Switching to a specific task — body reload handled by SKILL.md Step 2
    await verbSwitch(target);
  } else {
    // Resume lastActive — context still warm, no body reload.
    // Any positional args become the reason string for the timing log.
    await verbStart();
  }
}

async function verbFleet() {
  const mainPath = findMainWorktreePath(projectDir);
  const rPath = fleetRegistryPath(mainPath);
  const fleet = readFleet(rPath);
  const entries = Object.entries(fleet);
  if (entries.length === 0) { console.log('No fleet tasks registered.'); return; }
  const now = Date.now();
  console.log(`Fleet: ${entries.length} task${entries.length === 1 ? '' : 's'}`);
  for (const [ref, info] of entries) {
    const ageMin = Math.round((now - new Date(info.startedAt).getTime()) / 60000);
    const age = ageMin >= 60 ? `${Math.floor(ageMin / 60)}h ${ageMin % 60}m` : `${ageMin}m`;
    console.log(`  ${ref.padEnd(6)} ${info.status.padEnd(8)} ${info.branch.padEnd(28)} started ${age} ago`);
  }
}

function verbHelp() {
  console.log(`
Task Tracker — available commands

  /task                     Show active task, elapsed time, words since last marker
  /task #N                  Start or switch to issue #N
  /task new [title]         Create a new issue and start tracking it
  /task plan                Open an untracked planning bucket
  /task pause               Flush timing and pause the active task
  /task resume              Resume the last paused task
  /task resume #N           Switch back to a specific paused task
  /task update [msg]        Checkpoint — flush timing, reset counters, keep task active
  /task review #N           Move issue through Validate to Review, flush timing, and pause
  /task review #N --duration-minutes N --words N  Agent-reported timing (skips JSONL read)
  /task words-count         Print word count for the current session (agent use)
  /task close [#N]          Close the active or specified task (runs pre-close gate)
  /task close --force       Close even if unchecked items remain
  /task check "<label>"     Toggle a checkbox in the active issue body
  /task log #N              Re-compute and write Engaged/Session Time + Context Length
  /task migrate [--dry-run] Migrate repo issues into a selected/configured project
  /task fleet               Show all active tasks across parallel worktrees
  /task config              List all config values
  /task config <key> <val>  Set a config value (project-local)
  /task config init         Run the interactive configuration interview
  /task help | ?            Show this help message

Aliases: start = resume, end = close
`.trim());
}

// ---- Dispatch ----

// Exported for tests. Keep these after definitions; the CLI dispatch IIFE
// below only runs when the file is invoked directly, not when imported.
export { fetchSubIssues, fetchParentIssue, getIssueBoardState, handleMigrateResult };

const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch { return true; }
})();

if (_isMain) (async () => {
  checkRepoMismatch();
  checkInit(cfg, verb);
  try {
    switch (verb) {
      case 'status':  await verbStatus(); break;
      case 'config':  verbConfig(); break;
      case 'close':   await verbClose(); break;
      case 'end':     await verbClose(); break;  // alias
      case 'pause':   await verbPause(); break;
      case 'resume':  await verbResume(); break;
      case 'start':   await verbResume(); break;  // alias — route through verbResume so `/task start #N` switches
      case 'update':  await verbUpdate(rest); break;
      case 'review':  await verbReview(rest); break;
      case 'reject':  await verbReject(rest); break;
      case 'words-count': {
        const sid = currentSessionId();
        const count = sid ? countWords(jsonlPath(sid), 0).count : 0;
        console.log(count);
        break;
      }
      case 'log': {
        const target = rest[0];
        if (!target) { console.error('Usage: /task log #N'); process.exit(1); }
        await runLogIssueTime(target);
        break;
      }
      case 'migrate':
        await runMigrate(rest);
        break;
      case 'plan':    await verbPlan(); break;
      case 'new':     await verbNew(rest); break;
      case 'check':   await verbCheck(rest); break;
      case 'fleet':   await verbFleet(); break;
      case 'analyze': {
        const { verbAnalyze } = await import('./verbs/analyze.mjs');
        await verbAnalyze(rest, cfg);
        break;
      }
      case 'approve': {
        const { verbApprove } = await import('./verbs/approve.mjs');
        await verbApprove(rest, cfg);
        break;
      }
      case 'approve-review': {
        const { verbApproveReview } = await import('./verbs/approve-review.mjs');
        await verbApproveReview(rest, cfg);
        break;
      }
      case 'promote':
      case 'next': {
        const { verbPromote } = await import('./verbs/promote.mjs');
        await verbPromote(rest, cfg);
        break;
      }
      case 'demote': {
        const { verbDemote } = await import('./verbs/demote.mjs');
        await verbDemote(rest, cfg);
        break;
      }
      case 'reconcile': {
        const { verbReconcile } = await import('./verbs/reconcile.mjs');
        await verbReconcile(rest, cfg);
        break;
      }
      case 'move':
        console.error(`unknown verb: move — did you mean \`/task promote\` or \`/task demote\`?`);
        process.exit(2);
      case 'help':
      case '?':       verbHelp(); break;
      default:
        if (/^#\d+$/.test(verb)) { await verbSwitch(verb); break; }
        console.error(`unknown verb: ${verb}`);
        process.exit(2);
    }
  } catch (err) {
    console.error(`task-tracker error: ${err.message}`);
    process.exit(1);
  }
})();
