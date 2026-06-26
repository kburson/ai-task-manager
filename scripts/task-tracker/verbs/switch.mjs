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
import {
  resolveBindEvent,
  timingCommentHasRows,
  assertPairedReengagement,
} from '../lib/bind-event.mjs';

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
    // #534 — a real switch records `switch-out:#<target>` on the OUTGOING issue,
    // naming the peer it is handing off to, so the eventual return is a
    // pair-able `switch-in:#<target>`. The Description spells it out for humans.
    const eventSlug = isSelfBind ? 'resumed' : `switch-out:${target}`;
    const eventDesc = isSelfBind ? `resumed ${target}` : `Switching out to task ${target}`;
    const { deltaMin, deltaWords } = await flushActiveToGH(s, eventSlug, eventDesc);
    previousNote = isSelfBind
      ? ` Resumed: ${previous} (+${deltaMin} min, +${deltaWords} words).`
      : ` Previous: ${previous} ended (+${deltaMin} min, +${deltaWords} words).`;
    await runLogIssueTime(previous);
    if (!isSelfBind) {
      try {
        deregisterTask(projectDir, previous);
      } catch {
        /* best-effort: cleanup; failure is non-fatal */
      }
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
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
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
  // #535 — the incoming row must record `start` ONLY for a genuine first-ever
  // bind. Switching back into an issue that already carries timing history is a
  // resume, so it must emit `resumed`, not a second `start` (duplicate-start
  // defect observed on #526). Mirror the #482 discrimination from verbResume:
  // read the incoming issue's timing comment and resolve the event slug.
  const gh = await import('../gh-timing-comment.mjs');
  const { buildRow } = gh;
  const readTimingCommentBody = ctx.readTimingCommentBody ?? gh.readTimingCommentBody;
  let hasTimingHistory = false;
  let tcBody = null;
  if (cfg?.repo) {
    tcBody = await readTimingCommentBody({
      issueNumber: Number(target.replace(/^#/, '')),
      repo: cfg.repo,
    });
    hasTimingHistory = timingCommentHasRows(tcBody);
  }
  // #534 — resolve the incoming row against the target's own open interruption.
  // Switching BACK into an issue that earlier recorded `switch-out:#prev` yields
  // a paired `switch-in:#prev`; a never-seen issue yields `start`; an issue with
  // history but no open interruption yields the benign `resumed`.
  let bindEvent = resolveBindEvent({ hasTimingHistory, timingBody: tcBody });
  // #534 AC5/AC7 — orphan-pairing guard: never emit `switch-in*`/`resume*`
  // without an opener or prior `start`; downgrade to `start` (never block).
  const switchGuard = assertPairedReengagement(tcBody, bindEvent);
  if (!switchGuard.ok) {
    process.stderr.write(`[switch] ${target}: ${switchGuard.reason}; downgrading to start\n`);
    bindEvent = 'start';
  }
  const row = buildRow({
    ts,
    event: bindEvent,
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
      const { formatDiscussStartBanner } = await import('../lib/discuss-marker.mjs');
      const issueNumber = Number(target.replace(/^#/, ''));
      const { pending } = await reconcileDiscuss({ issueNumber, repo: cfg.repo, cfg });
      if (pending) {
        // #495 — colorful 💬 start delimiter via the shared formatter.
        console.log(formatDiscussStartBanner(target));
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
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
}
