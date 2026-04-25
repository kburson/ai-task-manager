#!/usr/bin/env node
// /task skill CLI. Dispatches verbs to module functions.
// Read design: .claude/skills/task-tracker/DESIGN.md

import path from 'node:path';
import { loadConfig, setConfigValue, formatConfig, DEFAULTS } from './config.mjs';
import { loadState, saveState, clearActive, EMPTY_STATE } from './state.mjs';
import { postTimingEvent } from './gh-timing-comment.mjs';
import { currentSessionId, jsonlPath, markerPathFor, loadMarker, saveMarker, countWords } from './word-counter.mjs';
import { collectEventTimestamps, computeActiveMinutes } from './active-time.mjs';
import { enqueue, drain } from './queue.mjs';

const argv = process.argv.slice(2);
const verb = argv[0] || 'status';
const rest = argv.slice(1);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const cfg = loadConfig();
const statePath = path.join(projectDir, cfg.statePath);
const queuePath = path.join(projectDir, cfg.queuePath);
const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

function nowIso() { return new Date().toISOString(); }

function minutesBetween(aIso, bIso) {
  return Math.round((new Date(bIso) - new Date(aIso)) / 60000);
}

async function safePostTiming(issue, row, cumMin, cumWords) {
  if (SKIP_NETWORK) return { ok: true, skipped: true };
  try {
    await postTimingEvent({
      issueNumber: issue, repo: cfg.repo, row, cumMin, cumWords,
      timeoutMs: cfg.hookNetworkTimeoutMs,
    });
    return { ok: true };
  } catch (err) {
    enqueue({ kind: 'timing', issue, row, cumMin, cumWords }, queuePath);
    return { ok: false, queued: true, err: err.message };
  }
}

async function draiQueueIfAny() {
  if (SKIP_NETWORK) return;
  await drain(async (evt) => {
    if (evt.kind === 'timing') {
      await postTimingEvent({
        issueNumber: evt.issue, repo: cfg.repo, row: evt.row,
        cumMin: evt.cumMin, cumWords: evt.cumWords,
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
    activeMin = computeActiveMinutes({
      startMs, endMs, events,
      idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
    });
  }
  const wallNote = wallMin !== activeMin ? ` (wall ${wallMin})` : '';
  console.log(`Active: ${s.active}. Elapsed: ${activeMin} active min${wallNote}, ${wordsNow - s.wordsAtEntryStart} words since last marker.`);
}

function verbConfig() {
  if (rest.length === 0) {
    console.log(formatConfig(cfg));
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

async function flushActiveToGH(state, event) {
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
  let deltaMin = deltaWallMin;
  if (sid) {
    const events = collectEventTimestamps(jsonlPath(sid), startMs, endMs);
    deltaMin = computeActiveMinutes({
      startMs, endMs, events,
      idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
    });
  }
  const cumWords = state.wordsAtEntryStart + deltaWords;
  const cumMin = deltaMin;  // cumulative tracked in issue comment — each event is a single-session delta here
  const row = (await import('./gh-timing-comment.mjs')).buildRow({
    ts, event, deltaMin, deltaWords, cumMin, cumWords,
  });
  await safePostTiming(state.active, row, cumMin, cumWords);
  return { ts, deltaMin, deltaWallMin, deltaWords, cumWords };
}

async function verbEnd() {
  await draiQueueIfAny();
  const s = loadState(statePath);
  if (!s.active) { console.log('no active task'); return; }
  if (s.active === 'plan') {
    console.log('Discarded planning bucket.');
    saveState({ ...s, active: null, planBucket: null }, statePath);
    return;
  }
  const { deltaMin, deltaWallMin, deltaWords } = await flushActiveToGH(s, 'end');
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  console.log(`Ended ${s.active}: +${deltaMin} active min${wallNote}, +${deltaWords} words logged.`);
  clearActive(statePath);
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
    const { deltaMin, deltaWords } = await flushActiveToGH(s, 'switch-end');
    previousNote = ` Previous: ${s.active} ended (+${deltaMin} min, +${deltaWords} words).`;
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
  const row = (await import('./gh-timing-comment.mjs')).buildRow({
    ts, event: 'start', deltaMin: null, deltaWords: null, cumMin: 0, cumWords: wordsAtStart,
  });
  await safePostTiming(target, row, 0, wordsAtStart);
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
  const row = (await import('./gh-timing-comment.mjs')).buildRow({
    ts, event: 'resume', deltaMin: null, deltaWords: null, cumMin: 0, cumWords: wordsAtStart,
  });
  await safePostTiming(s.lastActive, row, 0, wordsAtStart);
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
  if (wasPlan && !SKIP_NETWORK) {
    for (const e of s.planBucket.entries) {
      const row = (await import('./gh-timing-comment.mjs')).buildRow({
        ts: e.ts, event: `planning: ${e.event}`,
        deltaMin: e.deltaMin, deltaWords: e.deltaWords,
        cumMin: 0, cumWords: s.planBucket.wordsAtStart,
      });
      await safePostTiming(issue, row, 0, s.planBucket.wordsAtStart);
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
  const row = (await import('./gh-timing-comment.mjs')).buildRow({
    ts, event: 'start', deltaMin: null, deltaWords: null,
    cumMin: 0, cumWords: wordsAtStart,
  });
  await safePostTiming(issue, row, 0, wordsAtStart);
  console.log(`Active: ${issue}.${previousNote} Created with title: "${title}".`);
}

// ---- Dispatch ----

(async () => {
  try {
    switch (verb) {
      case 'status':  await verbStatus(); break;
      case 'config':  verbConfig(); break;
      case 'end':     await verbEnd(); break;
      case 'pause':   await verbPause(); break;
      case 'start':   await verbStart(); break;
      case 'plan':    await verbPlan(); break;
      case 'new':     await verbNew(rest); break;
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
