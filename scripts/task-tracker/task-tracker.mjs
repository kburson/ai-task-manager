#!/usr/bin/env node
// /task skill CLI. Dispatches verbs to module functions.
// Read design: .claude/skills/task-tracker/DESIGN.md

import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { loadConfig, setConfigValue, formatConfig, DEFAULTS } from './config.mjs';
import { loadState, saveState, clearActive, EMPTY_STATE } from './state.mjs';

const pexec = promisify(execFile);
import { postTimingEvent } from './gh-timing-comment.mjs';
import { currentSessionId, jsonlPath, markerPathFor, loadMarker, saveMarker, countWords } from './word-counter.mjs';
import { collectEventTimestamps, computeActiveAndIdleMinutes } from './active-time.mjs';
import { enqueue, drain } from './queue.mjs';
import { registerTask, deregisterTask, setTaskStatus, currentBranch,
         findMainWorktreePath, fleetRegistryPath, readFleet } from './fleet-registry.mjs';

const argv = process.argv.slice(2);
// Extract --role flag before parsing verb/rest (agent | orchestrator | solo)
const _roleIdx = argv.indexOf('--role');
const role = _roleIdx >= 0 && _roleIdx + 1 < argv.length ? argv[_roleIdx + 1] : 'solo';
const _argvClean = _roleIdx >= 0 ? argv.filter((_, i) => i !== _roleIdx && i !== _roleIdx + 1) : argv;
// Normalize bare issue numbers only for verbs that accept issue operands.
const rawVerb = _argvClean[0] || 'status';
const verb = /^\d+$/.test(rawVerb) ? `#${rawVerb}` : rawVerb;
const ISSUE_ARG_VERBS = new Set(['log', 'resume', 'start', 'check']);
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

async function verbStatus() {
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

// Move issue to Done on the project board. /task close is the ONLY sanctioned
// path for invoking move-state.sh done — direct invocation skips the timing
// flush and corrupts the velocity ledger.
async function runMoveStateDone(issue) {
  if (SKIP_NETWORK) return;
  const scriptPath = new URL('../gh/move-state.sh', import.meta.url).pathname;
  const issueNum = String(issue).replace(/^#/, '');
  try {
    const { stdout } = await pexec(scriptPath, [issueNum, 'done'], { timeout: 15000 });
    if (stdout.trim()) console.log(stdout.trim());
  } catch (err) {
    console.warn(`[task-tracker] Could not move ${issue} to Done: ${err.message}`);
    console.warn(`[task-tracker] Run manually: ${scriptPath} ${issueNum} done`);
  }
}

async function verbClose() {
  await draiQueueIfAny();
  const s = loadState(statePath);
  if (!s.active) { console.log('no active task'); return; }
  if (s.active === 'plan') {
    console.log('Discarded planning bucket.');
    saveState({ ...s, active: null, planBucket: null }, statePath);
    return;
  }
  // Pre-close gate: every checkbox in the body must be checked, AND if the body
  // contains the Pickup Directive's "Deep dive complete" line, it must be ticked.
  // Audited override: env var TASK_TRACKER_FORCE_DONE=1 bypasses but posts an
  // audit comment to the issue. The legacy `--force` flag still works (maps to
  // the same audited override path).
  const forceFlag = rest.includes('--force');
  const forceEnv = process.env.TASK_TRACKER_FORCE_DONE === '1';
  const force = forceFlag || forceEnv;
  if (!SKIP_NETWORK) {
    const issueNum = s.active.replace(/^#/, '');
    try {
      const { stdout } = await pexec('gh', [
        'issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body',
      ], { timeout: 10000 });
      const data = JSON.parse(stdout);
      const body = data.body ?? '';
      const unchecked = [...body.matchAll(/^- \[ \] .+$/gm)].map(m => m[0]);
      const hasDeepDiveLine = /Deep dive complete/.test(body);
      const hasDeepDiveDone = /^- \[x\] Deep dive complete/m.test(body);
      const reasons = [];
      if (unchecked.length > 0) {
        reasons.push(`${unchecked.length} unchecked checkbox${unchecked.length === 1 ? '' : 'es'} in issue body`);
      }
      if (hasDeepDiveLine && !hasDeepDiveDone) {
        reasons.push('Deep dive checkpoint is not checked off');
      }
      if (reasons.length > 0) {
        if (force) {
          console.error(`[task-tracker] ⚠ ${forceEnv ? 'TASK_TRACKER_FORCE_DONE=1' : '--force'} — bypassing close gate for ${s.active}`);
          reasons.forEach(r => console.error(`   • ${r}`));
          unchecked.forEach(u => console.error(`   ${u}`));
          try {
            const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
            const note = `⚠ **Close gate bypassed** via \`${forceEnv ? 'TASK_TRACKER_FORCE_DONE=1' : '--force'}\` at ${ts}. Unverified: ${reasons.join(', ')}.`;
            await pexec('gh', ['issue', 'comment', issueNum, '-R', cfg.repo, '--body', note], { timeout: 10000 });
          } catch { /* audit comment is best-effort */ }
        } else {
          console.error(`[task-tracker] ⛔ Refusing to close ${s.active}:`);
          reasons.forEach(r => console.error(`   • ${r}`));
          unchecked.forEach(u => console.error(`   ${u}`));
          console.error('');
          console.error('See .ai-task-manager/pickup-directive.md Hard Rules.');
          console.error('Verify each item, check its box (`/task check "<label>"`), then retry.');
          console.error('Legitimate-abandonment override: TASK_TRACKER_FORCE_DONE=1 /task close');
          process.exit(3);
        }
      }
    } catch (err) {
      console.warn(`[task-tracker] Could not check issue body: ${err.message}`);
    }
  }
  const { deltaMin, deltaWallMin, deltaWords } = await flushActiveToGH(s, 'close');
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  console.log(`Closed ${s.active}: +${deltaMin} active min${wallNote}, +${deltaWords} words logged.`);
  clearActive(statePath);
  try { deregisterTask(projectDir, s.active); } catch {}
  await runLogIssueTime(s.active);
  await runMoveStateDone(s.active);
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
  const { deltaMin, deltaWallMin, deltaWords } = await flushActiveToGH(s, 'pause');
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

async function verbStart() {
  await draiQueueIfAny();
  const s = loadState(statePath);
  if (s.active) { console.log(`already active: ${s.active}`); return; }
  if (!s.lastActive) {
    console.log('no previous task. Use "/task #N" or "/task plan".');
    return;
  }
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
    wordMarker: wordsAtStart, description: 'task resumed',
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
  const tmp = path.join(os.tmpdir(), `tt-check-${Date.now()}.md`);
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
  const target = rest[0]; // '#N' or undefined
  if (target) {
    if (!/^#\d+$/.test(target)) {
      console.error(`invalid issue ref: ${target}`);
      process.exit(1);
    }
    // Switching to a specific task — body reload handled by SKILL.md Step 2
    await verbSwitch(target);
  } else {
    // Resume lastActive — context still warm, no body reload
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
  /task close               Close the active task (runs pre-close gate)
  /task close --force       Close even if unchecked items remain
  /task check "<label>"     Toggle a checkbox in the active issue body
  /task log #N              Re-compute and write Actual Session Time + Context Length
  /task fleet               Show all active tasks across parallel worktrees
  /task config              List all config values
  /task config <key> <val>  Set a config value (project-local)
  /task config init         Run the interactive configuration interview
  /task help | ?            Show this help message

Aliases: start = resume, end = close
`.trim());
}

// ---- Dispatch ----

(async () => {
  checkRepoMismatch();
  try {
    switch (verb) {
      case 'status':  await verbStatus(); break;
      case 'config':  verbConfig(); break;
      case 'close':   await verbClose(); break;
      case 'end':     await verbClose(); break;  // alias
      case 'pause':   await verbPause(); break;
      case 'resume':  await verbResume(); break;
      case 'start':   await verbStart(); break;  // alias
      case 'update':  await verbUpdate(rest); break;
      case 'log': {
        const target = rest[0];
        if (!target) { console.error('Usage: /task log #N'); process.exit(1); }
        await runLogIssueTime(target);
        break;
      }
      case 'plan':    await verbPlan(); break;
      case 'new':     await verbNew(rest); break;
      case 'check':   await verbCheck(rest); break;
      case 'fleet':   await verbFleet(); break;
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
