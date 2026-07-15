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
  // #833 — self-bind no-op. Rebinding to the already-active, never-paused issue
  // (`previous === target`, no open pause) never actually stopped work, so there
  // is nothing to resume. Emit ZERO timing rows — neither the outgoing flush nor
  // the incoming bind row — and leave the live active span (`entryStartTs`,
  // `wordsAtEntryStart`, `lastWordMarker`) untouched so accrued active time is
  // credited to the next genuine `<phase>:completed`. This supersedes the #460
  // self-bind branch below (emit `resumed`, not `switch-out`): emitting nothing
  // is strictly stronger. A legitimate resume-after-pause arrives with
  // `s.active === null` (pause.mjs clears it), never satisfies this guard, and
  // still emits its single closing `resumed` via the incoming-bind path.
  if (s.active === target && !s.paused) {
    try {
      registerTask(projectDir, target, projectDir, currentBranch(projectDir));
    } catch {
      /* best-effort: keep the fleet registry warm; never block a no-op */
    }
    console.log(`Active: ${target} (already bound; no-op).`);
    return;
  }
  let previousNote = '';
  if (s.active && s.active !== 'discover' && cfg.autoEndOnSwitch) {
    const previous = s.active;
    // #833 — self-bind can no longer reach here: the no-op guard above returns
    // for `s.active === target && !s.paused`, so `previous !== target` always
    // holds and this branch handles only genuine cross-issue switches.
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
    // #534 — a real switch records `switch-out:#<target>` on the OUTGOING issue,
    // naming the peer it is handing off to. #568 — the eventual return is the
    // sole closer `resumed` (not `switch-in:#<target>`); the departure row alone
    // carries the peer. The Description spells it out for humans.
    const eventSlug = `switch-out:${target}`;
    const eventDesc = `Switching out to task ${target}`;
    const { deltaMin, deltaWords } = await flushActiveToGH(s, eventSlug, eventDesc);
    previousNote = ` Previous: ${previous} ended (+${deltaMin} min, +${deltaWords} words).`;
    await runLogIssueTime(previous);
    try {
      deregisterTask(projectDir, previous);
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
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
  let tcBody = '';
  let readStatus = null;
  if (cfg?.repo) {
    const tcResult = await readTimingCommentBody({
      issueNumber: Number(target.replace(/^#/, '')),
      repo: cfg.repo,
    });
    tcBody = gh.bodyOf(tcResult);
    readStatus = tcResult?.status ?? null;
    hasTimingHistory = timingCommentHasRows(tcBody);
  }
  // #568 — `resumed` is the sole return verb: switching BACK into an issue with
  // any timing history yields `resumed` (never `switch-in:#prev`); a never-seen
  // issue yields `start`. The departure `switch-out:#prev` already records the
  // peer. Fails closed on an unreadable comment (readStatus drives it).
  let bindEvent = resolveBindEvent({
    hasTimingHistory,
    timingBody: cfg?.repo ? tcBody : null,
    readStatus,
  });
  // #534 AC5/AC7 — orphan-pairing guard. #568 — downgrade to `start` ONLY on a
  // positively-empty log; never on a read error or over existing rows (the
  // append guard would otherwise refuse the manufactured duplicate `start`).
  const switchGuard = assertPairedReengagement(tcBody, bindEvent);
  if (!switchGuard.ok && readStatus !== 'error' && !timingCommentHasRows(tcBody)) {
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
