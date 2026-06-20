import { loadState, saveState, EMPTY_STATE } from '../state.mjs';
import { registerTask, currentBranch } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';
import { loadPlanFile } from '../lib/plan-file.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

async function createNewIssue(title, ctx) {
  const { cfg, SKIP_NETWORK, pexec } = ctx;
  if (process.env.TT_FAKE_NEW_ISSUE) return process.env.TT_FAKE_NEW_ISSUE;
  if (SKIP_NETWORK) return '#0';
  const labelArgs = cfg.defaultLabels.flatMap((l) => ['--label', l]);
  const { stdout } = await pexec(
    'gh',
    [
      'issue',
      'create',
      '-R',
      cfg.repo,
      '--assignee',
      cfg.assignee || '@me',
      '--title',
      title,
      '--body',
      `Created via /task new. See timing log comment below.`,
      ...labelArgs,
    ],
    { timeout: cfg.hookNetworkTimeoutMs * 3 }
  );
  const m = stdout.trim().match(/\/issues\/(\d+)/);
  if (!m) throw new Error(`could not parse issue number from: ${stdout}`);
  return `#${m[1]}`;
}

// Resolve title + plan file path from args and current state.
// Returns { title, planFile } where planFile may be null.
function resolveTitleAndPlan(rest, s, projectDir) {
  const firstArg = (rest[0] || '').trim();
  const inDiscover = s.active === 'discover' && s.discoverBucket;

  // Branch 1: in discover state
  if (inDiscover) {
    const savedPlanFile = s.discoverBucket.savedPlanFile || null;
    if (!savedPlanFile) {
      process.stderr.write(
        'new: no saved plan in the active discover bucket.\n' +
          '  Compose your plan to a file, then run:\n' +
          '    `/task save-plan --from-file .tmp/plan/<draft>.md`\n' +
          '  Then retry `/task new`.\n'
      );
      process.exit(1);
    }
    const { title } = loadPlanFile(savedPlanFile);
    return { title, planFile: savedPlanFile };
  }

  // Branch 2: plan file path given (ends in .md and resolves to a file)
  if (firstArg.endsWith('.md')) {
    const resolved = path.resolve(projectDir, firstArg);
    if (!existsSync(resolved)) {
      process.stderr.write(`new: plan file not found: ${resolved}\n`);
      process.exit(1);
    }
    const { title } = loadPlanFile(resolved);
    return { title, planFile: resolved };
  }

  // Branch 3: not in discover state, no plan file — print guidance
  if (!firstArg) {
    process.stderr.write(
      'new: no active discovery plan and no plan file given.\n' +
        '  Start a discovery session:    `/task discover`\n' +
        '  Or provide a saved plan file: `/task new docs/plans/<file>.md`\n'
    );
    process.exit(1);
  }

  // Legacy: plain title passed directly (backwards compat for callers that pass a title string)
  return { title: rest.join(' ').trim(), planFile: null };
}

export async function verbNew(ctx) {
  const {
    cfg,
    statePath,
    projectDir,
    rest,
    role,
    SKIP_NETWORK,
    drainQueueIfAny,
    safePostTiming,
    flushActiveToGH,
    nowIso,
  } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  const { title } = resolveTitleAndPlan(rest, s, projectDir);
  const wasDiscover = s.active === 'discover' && s.discoverBucket;
  let previousNote = '';
  const previousActive = s.active;
  if (s.active && s.active !== 'discover' && cfg.autoEndOnSwitch) {
    // Outgoing-side row uses the canonical `switch-out` slug. The target
    // ref is finalized below after `createNewIssue`, so the flush is
    // deferred until we know the new issue number.
  }
  const issue = await createNewIssue(title, ctx);
  if (previousActive && previousActive !== 'discover' && cfg.autoEndOnSwitch) {
    const { deltaMin, deltaWords } = await flushActiveToGH(
      s,
      'switch-out',
      `switch-out → task ${issue}`
    );
    previousNote = ` Previous: ${previousActive} ended (+${deltaMin} min, +${deltaWords} words).`;
  }
  const createdTs = nowIso();
  const { buildRow } = await import('../gh-timing-comment.mjs');
  const { PHASE_EVENTS } = await import('../phase-events.mjs');
  await safePostTiming(
    issue,
    buildRow({
      ts: createdTs,
      event: PHASE_EVENTS.backlog.enter.event,
      // First row of a fresh issue's timing log — no prior reference point.
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      // wordMarker:0 ok — issue just created, no session yet
      wordMarker: 0,
      description: PHASE_EVENTS.backlog.enter.description,
    })
  );
  if (wasDiscover && !SKIP_NETWORK) {
    // The discovery bucket's only entry is stamped with the moment the bucket
    // opened (`startedAt`). Replaying that stale ts into a timing row trips
    // the 60s freshness guard in `buildRow` (which no flag defeats), deadlocking
    // promotion for any real (> 60s) discovery session (#234). The guard is a
    // deliberate anti-backdating invariant, so rather than weaken it we
    // reconcile the elapsed bucket time honestly: ONE fresh-stamped row that
    // records the whole window as idle. No active work is fabricated.
    const { startedAt, wordsAtStart } = s.discoverBucket;
    const startedMs = Date.parse(startedAt);
    const idleMin = Number.isFinite(startedMs)
      ? Math.max(0, Math.round((Date.parse(createdTs) - startedMs) / 60000))
      : 0;
    await safePostTiming(
      issue,
      buildRow({
        ts: createdTs,
        event: 'discovery: idle-reconciled',
        // activeSec:0 honest — discovery has no active session; the entire
        // bucket window is recorded as idle below, nothing is fabricated.
        activeSec: 0,
        idleSec: idleMin * 60,
        deltaWords: 0,
        wordMarker: wordsAtStart,
        description: `discovery session reconciled as idle (opened ${startedAt})`,
      })
    );
  }
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, issue);
    wordsAtStart = count;
  }
  saveState(
    {
      ...EMPTY_STATE,
      active: issue,
      lastActive: issue,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
    },
    statePath
  );
  try {
    registerTask(projectDir, issue, projectDir, currentBranch(projectDir));
  } catch {}
  await safePostTiming(
    issue,
    buildRow({
      ts,
      event: 'start',
      // First start row of a fresh issue's timing log — no prior reference.
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      wordMarker: wordsAtStart,
      description: role,
    })
  );
  console.log(`Active: ${issue}.${previousNote} Created with title: "${title}".`);
}
