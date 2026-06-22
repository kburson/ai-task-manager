import { saveState, loadState, EMPTY_STATE, advanceWordMarker } from '../state.mjs';
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
    const isSelfBind = previous === target;
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
    // #460 — self-bind (rebinding to the already-active issue) is a resume,
    // not a switch-out. Guard prevents self-referential timing log entries.
    const eventSlug = isSelfBind ? 'resumed' : 'switch-out';
    const eventDesc = isSelfBind ? `resumed ${target}` : `switch-out → task ${target}`;
    const { deltaMin, deltaWords } = await flushActiveToGH(s, eventSlug, eventDesc);
    previousNote = isSelfBind
      ? ` Resumed: ${previous} (+${deltaMin} min, +${deltaWords} words).`
      : ` Previous: ${previous} ended (+${deltaMin} min, +${deltaWords} words).`;
    await runLogIssueTime(previous);
    if (!isSelfBind) {
      try {
        deregisterTask(projectDir, previous);
      } catch {}
    }
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
    // #475 AC1 — carry the durable session-global marker across the switch
    // (…EMPTY_STATE would otherwise reset it to 0).
    lastWordMarker: advanceWordMarker(s.lastWordMarker, wordsAtStart),
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
    // #475 AC1 — monotonic carry-forward of the durable marker
    wordMarker: advanceWordMarker(s.lastWordMarker, wordsAtStart),
    description: role,
  });
  await safePostTiming(target, row);
  console.log(`Active: ${target}.${previousNote}`);

  // #486 — discuss reconcile + banner. On first reference (bind), converge any
  // entry affordance to the canonical resting state — strip the visible
  // `{discuss}` token, ensure exactly one hidden `aitm-discuss-requested`
  // marker — and sync the configured "Discuss" label to the pending state, in a
  // single pass (`reconcileDiscuss`). Then surface a non-blocking advisory
  // directing the agent to run a brainstorming dialog before deep-dive/refine
  // (see rules/bind.md). The banner keys on `isDiscussPending` of the converged
  // body, which survives token-strip via the durable marker, so the signal is
  // never lost. Advisory-only: never blocks the bind.
  if (cfg?.repo) {
    try {
      const { reconcileDiscuss } = await import('../lib/discuss-label.mjs');
      const issueNumber = Number(target.replace(/^#/, ''));
      const { pending } = await reconcileDiscuss({ issueNumber, repo: cfg.repo, cfg });
      if (pending) {
        console.log(
          `\nDISCUSS REQUESTED — ${target}\n` +
            `   This issue requests a brainstorming session before refine.\n` +
            `   Run the dialog, then call finalizeDiscussion. See rules/bind.md.`
        );
      }
    } catch {
      /* advisory only — never block the bind on a reconcile/banner failure */
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
