import { saveState, loadState, EMPTY_STATE } from '../state.mjs';
import { registerTask, deregisterTask, currentBranch } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';
import { loadSession } from '../lib/session-store.mjs';
import { bothGatesExplicit } from '../lib/gate-resolve.mjs';
import { rawProjectConfig } from '../config.mjs';
import { finalizePauseForSwitch } from '../orphan-finalize.mjs';
import { seedSessionKanbanFromBody } from '../lib/seed-kanban-cache.mjs';

export async function verbSwitch(ctx, target) {
  const {
    cfg,
    statePath,
    projectDir,
    role,
    drainQueueIfAny,
    safePostTiming,
    flushActiveToGH,
    runLogIssueTime,
    fetchParentIssue,
    nowIso,
  } = ctx;
  if (!/^#\d+$/.test(target)) {
    console.error(`invalid issue ref: ${target}`);
    process.exit(1);
  }
  await drainQueueIfAny();
  const s = loadState(statePath);
  let previousNote = '';
  if (s.active && s.active !== 'discover' && cfg.autoEndOnSwitch) {
    const previous = s.active;
    // #215 — a switch IS a pause: force-finalize any pending-pause row
    // against the OUTGOING issue regardless of sub-threshold gap. This must
    // happen BEFORE flushActiveToGH so the row lands on the old binding.
    try {
      const sidSwitch = currentSessionId();
      if (sidSwitch) {
        await finalizePauseForSwitch({
          sid: sidSwitch,
          oldIssue: previous,
          projDir: projectDir,
        });
      }
    } catch {
      /* never block switch on finalize failure */
    }
    const { deltaMin, deltaWords } = await flushActiveToGH(
      s,
      'switch-out',
      `switch-out → task ${target}`
    );
    previousNote = ` Previous: ${previous} ended (+${deltaMin} min, +${deltaWords} words).`;
    await runLogIssueTime(previous);
    try {
      deregisterTask(projectDir, previous);
    } catch {}
  } else if (s.active === 'discover') {
    console.log('Discarding discovery bucket (switch to concrete issue).');
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
  // #218: state hydration removed — the issue body's `aitm-last-known-state`
  // marker is the source of truth; preflight reads it on demand.
  try {
    registerTask(projectDir, target, projectDir, currentBranch(projectDir));
  } catch {}
  // #218 follow-up — seed the per-session `kanbanState` derived cache so the
  // activity-guard hook can read state synchronously without a network call.
  // #273: tagged seeder errors are reported, not swallowed.
  if (sid && cfg?.repo) {
    try {
      await seedSessionKanbanFromBody({
        sid,
        issue: target,
        projDir: projectDir,
        repo: cfg.repo,
      });
    } catch (err) {
      process.stderr.write(
        `[switch] ${target}: kanbanState seed failed (${err.name || 'Error'}): ${err.message}\n`
      );
      process.stderr.write(
        `  Repair: node scripts/task-tracker/task-tracker.mjs reconcile accept-live ${target.replace(/^#/, '')}\n`
      );
    }
  }
  const { buildRow } = await import('../gh-timing-comment.mjs');
  const row = buildRow({
    ts,
    event: 'start',
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: wordsAtStart,
    description: role,
  });
  await safePostTiming(target, row);
  console.log(`Active: ${target}.${previousNote}`);

  // #405 — `{discuss}` banner. If the bound issue's body carries the visible
  // `{discuss}` token, surface a non-blocking advisory directing the agent to
  // run a brainstorming dialog before deep-dive/refine (see rules/bind.md).
  // Detection keys on the live token, not the `aitm-discussed` audit marker, so
  // a deliberately re-added token re-fires. Never blocks the bind.
  if (cfg?.repo) {
    try {
      const { gql, splitRepo } = await import('../../gh/lib/github-projects.mjs');
      const { hasDiscussMarker } = await import('../lib/discuss-marker.mjs');
      const { owner, repoName } = splitRepo(cfg.repo);
      const issueNumber = Number(target.replace(/^#/, ''));
      const data = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) { issue(number: $issue) { body } }
        }`,
        { owner, repo: repoName, issue: issueNumber }
      );
      const body = data?.repository?.issue?.body ?? '';
      if (hasDiscussMarker(body)) {
        console.log(
          `\nDISCUSS REQUESTED — ${target}\n` +
            `   This issue requests a brainstorming session before refine.\n` +
            `   Run the dialog, then call finalizeDiscussion. See rules/bind.md.`
        );
      }
    } catch {
      /* advisory only — never block the bind on a banner-fetch failure */
    }
  }

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
