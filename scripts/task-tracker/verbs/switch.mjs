import { saveState, loadState, EMPTY_STATE } from '../state.mjs';
import { registerTask, deregisterTask, currentBranch } from '../fleet-registry.mjs';
import { currentSessionId, jsonlPath, markerPathFor, saveMarker, countWords } from '../word-counter.mjs';
import { loadSession } from '../lib/session-store.mjs';
import { bothGatesExplicit } from '../lib/gate-resolve.mjs';
import { rawProjectConfig } from '../config.mjs';

export async function verbSwitch(ctx, target) {
  const {
    cfg, statePath, projectDir, role,
    drainQueueIfAny, safePostTiming, flushActiveToGH,
    runLogIssueTime, fetchParentIssue, nowIso,
  } = ctx;
  if (!/^#\d+$/.test(target)) {
    console.error(`invalid issue ref: ${target}`);
    process.exit(1);
  }
  await drainQueueIfAny();
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
  try {
    const { fetchLiveKanbanState } = await import('../../gh/lib/live-state.mjs');
    const live = await fetchLiveKanbanState({
      repo: cfg.repo,
      projectId: cfg.projectId,
      issueNumber: target.replace(/^#/, ''),
    });
    if (live) {
      const s2 = loadState(statePath);
      if (s2.active === target) {
        s2.state = live;
        saveState(s2, statePath);
      }
    }
  } catch { /* best-effort — bind must not fail on GraphQL */ }
  try { registerTask(projectDir, target, projectDir, currentBranch(projectDir)); } catch {}
  const { buildRow } = await import('../gh-timing-comment.mjs');
  const row = buildRow({
    ts, event: 'start', activeMin: 0, idleMin: 0, deltaWords: 0,
    wordMarker: wordsAtStart, description: role,
  });
  await safePostTiming(target, row);
  console.log(`Active: ${target}.${previousNote}`);

  try {
    const rawCfg = rawProjectConfig();
    if (!bothGatesExplicit(rawCfg)) {
      const sid2 = currentSessionId();
      if (sid2) {
        const session = loadSession(sid2);
        const issueNumOnly = target.replace(/^#/, '');
        const parentNum = await fetchParentIssue(issueNumOnly);
        const rootKey = parentNum != null ? String(parentNum) : String(issueNumOnly);
        if (session.lastPromptedParent !== rootKey) {
          console.log(`PROMPT_REQUIRED: auto-mode #${rootKey}`);
          const { saveSession } = await import('../lib/session-store.mjs');
          saveSession({ ...session, lastPromptedParent: rootKey });
        }
      }
    }
  } catch {}
}
