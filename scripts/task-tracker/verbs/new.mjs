import { loadState, saveState, EMPTY_STATE } from '../state.mjs';
import { registerTask, currentBranch } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';

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
  const title = rest.join(' ').trim() || `Task ${new Date().toISOString().slice(0, 10)}`;
  const s = loadState(statePath);
  const wasDiscover = s.active === 'discover' && s.discoverBucket;
  let previousNote = '';
  if (s.active && s.active !== 'discover' && cfg.autoEndOnSwitch) {
    const { deltaMin, deltaWords } = await flushActiveToGH(s, 'switch-end');
    previousNote = ` Previous: ${s.active} ended (+${deltaMin} min, +${deltaWords} words).`;
  }
  const issue = await createNewIssue(title, ctx);
  const createdTs = nowIso();
  const { buildRow } = await import('../gh-timing-comment.mjs');
  await safePostTiming(
    issue,
    buildRow({
      ts: createdTs,
      event: 'created',
      // First row of a fresh issue's timing log — no prior reference point.
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      // wordMarker:0 ok — issue just created, no session yet
      wordMarker: 0,
      description: 'task created',
    })
  );
  if (wasDiscover && !SKIP_NETWORK) {
    for (const e of s.discoverBucket.entries) {
      await safePostTiming(
        issue,
        buildRow({
          ts: e.ts,
          event: `discovery: ${e.event}`,
          activeMin: e.deltaMin ?? 0,
          idleMin: 0,
          deltaWords: e.deltaWords ?? 0,
          wordMarker: s.discoverBucket.wordsAtStart,
          description: 'discovery session',
        })
      );
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
