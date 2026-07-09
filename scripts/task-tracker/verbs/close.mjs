import { loadState, saveState, clearActive } from '../state.mjs';
import { deregisterTask } from '../fleet-registry.mjs';
import { loadSession } from '../lib/session-store.mjs';
import { resolveGate } from '../lib/gate-resolve.mjs';
import { rawProjectConfig } from '../config.mjs';
import { currentSessionId } from '../word-counter.mjs';
import {
  checkDirty,
  formatSummary,
  shortAuditDescription,
  resolveWorkspaceForIssue,
  CLEANUP_GUIDANCE,
} from '../../gh/lib/dirty-workspace.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { hasReviewApprovedMarker } from '../lib/markers.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';
import { tickLifecycleItem } from '../lib/lifecycle-dod.mjs';
import { assertLifecycleSatisfied } from '../close-gate.mjs';
import { deriveAndStampFunctionalDod } from '../lib/functional-dod-derive.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { closeLabelRemoveArgs } from '../lib/close-labels.mjs';
import {
  decideCloseConvergence,
  decideBoardMoveFailure,
  decideGateEvalFailure,
  shouldEmitReviewApprovedRow,
  resolveBoardStateForClose,
} from '../lib/close-convergence.mjs';

// #705 — best-effort: a label-strip failure must never block or fail the
// close itself, mirroring the deregisterTask cleanup calls below.
async function stripCloseLabels({ pexec, cfg, issueNum }) {
  try {
    await pexec('gh', [...closeLabelRemoveArgs(issueNum), '-R', cfg.repo], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } catch (err) {
    console.error(
      `[task-tracker] warn: failed to strip ToDo/BLOCKED labels on #${issueNum}: ${err.message}`
    );
  }
}

export async function verbClose(ctx) {
  // #561 — verbClose reads its collaborators from the grouped capability
  // objects assembled by buildContext (the narrow dependency interface) rather
  // than from a flat 18-member destructure. Each `?? ctx` fallback keeps the
  // verb runnable against a flat ctx (back-compat) and lets a fixture supply
  // only the capabilities a given code path actually touches.
  const projectConfig = ctx.projectConfig ?? ctx;
  const timingRecorder = ctx.timingRecorder ?? ctx;
  const stateRunner = ctx.stateRunner ?? ctx;
  const githubClient = ctx.githubClient ?? ctx;
  const { cfg, statePath, projectDir, SKIP_NETWORK, pexec, uncheckedPreCloseCheckboxes, nowIso } =
    projectConfig;
  const { rest } = ctx;
  const { drainQueueIfAny, flushAndForgetQueueFor, safePostTiming } = timingRecorder;
  const { runMoveState, runMoveStateDone, runLogIssueTime } = stateRunner;
  const { fetchSubIssues, getIssueBoardState, getIssueClosedState } = githubClient;
  // #753 — the lifecycle-box reconcile is invoked from BOTH the converge/no-op
  // fast-path and the full close pipeline, through one seam so a fixture can
  // observe it and the two call sites can never drift apart. Falls back to the
  // module helper when the ctx does not inject one (production).
  const reconcileLifecycleBoxes = ctx.tickLifecycleOnClose || tickLifecycleOnClose;
  await drainQueueIfAny();
  const initialState = loadState(statePath);
  const target = rest.find((a) => /^#\d+$/.test(a));
  let s = initialState;

  const closeTarget = target || s.active || '';
  const closeIssueNum = closeTarget.replace(/^#/, '');
  // #708 — `--repair` forces the full atomic close pipeline even when the board
  // is already Done / the issue already CLOSED (e.g. a PR closing-reference
  // auto-closed it out-of-band), so the timing flush, lifecycle-box ticking, and
  // audit rows that the noop/close-issue short-circuits skip get replayed.
  const repair = rest.includes('--repair');

  // #208 — bind-mismatch check moved to shared preflight (dispatcher).
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
  if (!closeTarget) {
    console.log('no active task');
    return;
  }

  // #425 — converge board-Done ↔ issue-CLOSED instead of issuing a no-op on
  // board Status alone. The board and the GitHub open/closed state are
  // decoupled: a
  // board=Done + issue-OPEN pair (auto-close workflow missed) must re-close the
  // issue, not be treated as "already Done" and stranded forever. We gate the
  // clean no-op on the issue being verifiably CLOSED, and converge the board if
  // it has drifted behind a closed issue.
  if (!SKIP_NETWORK && closeIssueNum) {
    const [boardState, issueClosed] = await Promise.all([
      getIssueBoardState(closeIssueNum),
      getIssueClosedState ? getIssueClosedState(closeIssueNum) : Promise.resolve(null),
    ]);
    const decision = decideCloseConvergence({ boardState, issueClosed, repair });

    if (decision.action === 'close-issue') {
      // Board reads Done but the issue is still OPEN — the Projects auto-close
      // workflow did not fire. Close the primary explicitly. On failure, surface
      // it and exit non-zero WITHOUT clearing local state so a re-run recovers.
      try {
        await pexec('gh', ['issue', 'close', closeIssueNum, '-R', cfg.repo], {
          timeout: GH_API_TIMEOUT_MS,
        });
      } catch (err) {
        console.error(
          `Failed to close ${closeTarget} on GitHub (board is Done but the issue was still OPEN): ${err.message}\n` +
            `Local state left intact — re-run \`/task close ${closeTarget}\` once GitHub is reachable.`
        );
        process.exitCode = 1;
        return;
      }
      await stripCloseLabels({ pexec, cfg, issueNum: closeIssueNum });
      clearActive(statePath);
      try {
        deregisterTask(projectDir, closeTarget);
      } catch {
        /* best-effort: cleanup; failure is non-fatal */
      }
      console.log(
        `${closeTarget} board was Done but the GitHub issue was still OPEN — closed it now; local state and fleet cleaned up.`
      );
      return;
    }

    if (decision.action === 'noop') {
      // Issue is verifiably CLOSED. Converge the board if it lagged behind.
      if (decision.boardDrift) {
        const moveResult = await runMoveStateDone(closeTarget, { silent: true });
        if (!moveResult.ok && !moveResult.benign) {
          // #435 — re-read the board before surfacing. A race can leave the
          // board already at Done (auto-close/converge won out-of-band) even
          // though the move reported a non-benign failure. Only a board that is
          // NOT Done is a genuine failure.
          const postBoardState = await getIssueBoardState(closeTarget);
          if (decideBoardMoveFailure({ moveResult, boardState: postBoardState }).surface) {
            console.error(
              `${closeTarget} is closed on GitHub but the board move to Done failed: ${moveResult.stderr || moveResult.status}\n` +
                `Local state left intact — re-run \`/task close ${closeTarget}\` to retry the board move.`
            );
            process.exitCode = 1;
            return;
          }
        }
      }
      // #753 — reconcile the Lifecycle DoD boxes on the converge/no-op path too.
      // A prior close that moved the board but died before the tick (crash,
      // timeout-killed tail, #737 split-brain) left `story-closed` /
      // `timing-flushed` unchecked; every re-run then took THIS noop path and
      // skipped the reconcile. The tick is idempotent and best-effort, so it is
      // safe to run on every converge and never blocks the clean-up below.
      await reconcileLifecycleBoxes({ cfg, issueNum: closeIssueNum, pexec });
      clearActive(statePath);
      try {
        deregisterTask(projectDir, closeTarget);
      } catch {
        /* best-effort: cleanup; failure is non-fatal */
      }
      console.log(
        decision.boardDrift
          ? `${closeTarget} was already closed on GitHub — converged the board to Done; local state and fleet cleaned up.`
          : `${closeTarget} is already fully closed (issue CLOSED, board Done) — local state and fleet cleaned up.`
      );
      return;
    }
    // decision.action === 'proceed' → fall through to the full close pipeline.
  }

  if (closeTarget === 'discover') {
    console.log('Discarded discovery bucket.');
    saveState({ ...s, active: null, discoverBucket: null }, statePath);
    return;
  }

  let dirtyAuditRow = null;
  // #655 — `?? ctx.closeBody` lets a SKIP_NETWORK fixture seed the live body the
  // `!SKIP_NETWORK` block would otherwise fetch, so the review:approved emission
  // gate (which predicates on the approval marker) is exercisable in-process.
  let closeBody = ctx.closeBody ?? '';
  // #655 — hoisted out of the `!SKIP_NETWORK` gate-evaluation block (where
  // `_resolvedReviewGate` is scoped) so the later `review:approved` timing-row
  // emission can predicate on it. True iff the review→done gate was explicitly
  // disabled (session/project override), which carries its own
  // `aitm-gate-bypassed` audit row.
  let reviewGateBypassed = false;
  if (process.env.TT_SKIP_DIRTY_CHECK !== '1') {
    const answerIdx = rest.indexOf('--answer');
    const answerArg = answerIdx >= 0 ? String(rest[answerIdx + 1] || '').toLowerCase() : '';
    const cwd = resolveWorkspaceForIssue({ issueRef: closeTarget, projectDir });
    const dirty = await checkDirty({ cwd });
    if (dirty.dirty) {
      if (!answerArg) {
        if (process.env.CI === '1') {
          console.error(
            `⛔ Refusing to close ${closeTarget} — workspace is dirty (${dirty.total} path(s)) and running headless.`
          );
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
          // #710 — exit non-zero so callers (e.g. `promote`) can distinguish a
          // blocked prompt from a completed close. Every sibling PROMPT_REQUIRED
          // emitter (CI dirty branch above → exit 5, review-approval → exit 7,
          // preflightVerb prompts) exits non-zero; the bare `return` here (exit 0)
          // was the lone anomaly that let `promote` report a false `✓ promoted`.
          // The PROMPT_REQUIRED stdout line is emitted first, so the interactive
          // skill loop still surfaces the prompt and re-invokes with --answer.
          process.exit(5);
        }
      } else if (answerArg === 'yes') {
        console.error(
          `⛔ Refusing to close ${closeTarget} — workspace is dirty (${dirty.total} path(s)).`
        );
        console.error(formatSummary(dirty));
        console.error('');
        console.error(CLEANUP_GUIDANCE);
        process.exit(6);
      } else if (answerArg === 'cancel') {
        console.log(
          `Cancelled close of ${closeTarget}; left in Review (workspace dirty: ${dirty.total} path(s)).`
        );
        return;
      } else if (answerArg === 'no') {
        console.warn(
          `[task-tracker] Closing ${closeTarget} with dirty workspace (${dirty.total} path(s)) — appending audit row.`
        );
        const { buildRow: dbr } = await import('../gh-timing-comment.mjs');
        const { deriveStateMoveDelta: _dsm1 } = await import('../lib/timing-rows.mjs');
        const _ts1 = nowIso();
        const _d1 = _dsm1(closeBody, _ts1);
        dirtyAuditRow = dbr({
          ts: _ts1,
          event: 'closed-with-dirty-tree',
          activeSec: _d1.activeSec,
          idleSec: _d1.idleSec,
          deltaWords: 0,
          // #475 AC1 — carried-forward durable marker (closed-with-dirty-tree audit, no active session)
          wordMarker: s.lastWordMarker ?? 0,
          description: shortAuditDescription(dirty),
        });
      } else {
        console.error(`Invalid --answer "${answerArg}". Expected yes|no|cancel.`);
        process.exit(1);
      }
    }
  }

  const force = rest.includes('--force');
  if (!SKIP_NETWORK) {
    try {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      const data = JSON.parse(stdout);
      let body = data.body ?? '';
      closeBody = body;

      // #279 — review→done close-gates migrated into the guard registry.
      // The marker regex and runCloseGates bundle that used to live inline
      // here now run as `reviewExitReviewApprovedGuard` and
      // `reviewExitCloseGatesGuard` on `states/review.mjs`. We invoke them
      // via `runGuards('review', 'done', ctx)` below — once, after
      // derived-DoD stamping so chain-integrity sees the freshly-ticked
      // keys. The session/project `gateReviewToDone` toggle still lives in
      // close.mjs because it controls audit emission, not guard logic.
      const _resolvedReviewGate = resolveGate('reviewToDone', {
        session: loadSession(currentSessionId()),
        projectConfig: rawProjectConfig(),
      });
      reviewGateBypassed = !_resolvedReviewGate; // #655 — hoist for the row gate
      if (!_resolvedReviewGate) {
        // #516 — the review-gate bypass is recorded as a body audit marker
        // (`aitm-gate-bypassed`), not a ⏱ Timing Log row. The bypass consumes no
        // distinct wall-clock; its time is already counted inside Review. The
        // marker is written during the close transaction so the audit trail
        // survives in the issue body.
        const { appendAuditMarker } = await import('../lib/markers.mjs');
        const _ts2 = nowIso();
        await mutateIssueBody({
          issueNumber: closeIssueNum,
          repo: cfg.repo,
          mutate: (base) =>
            appendAuditMarker(base, {
              kind: 'gate-bypassed',
              ts: _ts2,
              detail: 'gateReviewToDone=false (session/project override) — bypassing human review',
            }),
        });
      }

      // #303 / #315 — Derived Functional DoD keys (`acs`, `checkboxes`) are
      // computed and stamped here, immediately before the close gate, via the
      // shared `deriveAndStampFunctionalDod` helper (also called from
      // verbs/review.mjs so review and close have identical derived-key
      // behavior). `checkboxes` is derived after `acs` inside the helper so the
      // newly-ticked `acs` box is counted. Atomic single push via mutateIssueBody.
      try {
        let derivedHeadSha = 'unknown';
        try {
          const { stdout: shaOut } = await pexec('git', ['rev-parse', '--short', 'HEAD'], {});
          derivedHeadSha = String(shaOut || '').trim() || 'unknown';
        } catch {
          // best-effort — sha=unknown is acceptable in the evidence marker
        }
        const mutated = await deriveAndStampFunctionalDod({
          issueNumber: closeIssueNum,
          repo: cfg.repo,
          sha: derivedHeadSha,
          ts: nowIso(),
          deps: { pexec },
        });
        // Re-fetch body so the rest of the close gate sees the post-derivation
        // state. Skipped on no-op.
        if (mutated?.status === 'ok') {
          const { stdout: refetched } = await pexec(
            'gh',
            ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
            { timeout: GH_API_TIMEOUT_MS }
          );
          body = String(refetched || body);
          closeBody = body;
        }
      } catch (err) {
        // Derivation is best-effort. If it fails, the existing
        // uncheckedPreCloseCheckboxes / lifecycle gate will surface the issue
        // through the normal blocker path. Log and continue.
        console.warn(`[task-tracker] Functional DoD derivation skipped: ${err.message}`);
      }

      const unchecked = uncheckedPreCloseCheckboxes(body);
      const reasons = [];
      if (unchecked.length > 0) {
        reasons.push(
          `${unchecked.length} unchecked checkbox${unchecked.length === 1 ? '' : 'es'} in issue body`
        );
      }

      // #179 — Hard Review→Done lifecycle gate. When required, blocks close unless
      // each lifecycle key is ticked, audited (Full-Auto), or per-key opt-out marker
      // present. When toggled off, downgrade to a WARN timing-log row.
      const lifecycleRequired = cfg.lifecycleCheckboxesRequired !== false;
      const lifecycleGate = assertLifecycleSatisfied({ body, required: lifecycleRequired });
      if (lifecycleGate.block) {
        reasons.push(lifecycleGate.reason);
      } else if (!lifecycleRequired && lifecycleGate.missing.length > 0) {
        try {
          const { buildRow: gbrL } = await import('../gh-timing-comment.mjs');
          const { deriveStateMoveDelta: _dsmL } = await import('../lib/timing-rows.mjs');
          const _tsL = nowIso();
          const _dL = _dsmL(body, _tsL);
          const missLabels = lifecycleGate.missing.map((m) => m.key).join(', ');
          await safePostTiming(
            closeTarget,
            gbrL({
              ts: _tsL,
              event: 'lifecycle-warn',
              activeSec: _dL.activeSec,
              idleSec: _dL.idleSec,
              deltaWords: 0,
              // #475 AC1 — carried-forward durable marker (lifecycle WARN bypass, no active session work)
              wordMarker: s.lastWordMarker ?? 0,
              description: `WARN: lifecycle-incomplete (lifecycleCheckboxesRequired=false): ${missLabels}`,
            })
          );
        } catch {
          // best-effort
        }
      }
      if (!force) {
        // #279 — single guard-registry call covers review→done exit:
        // blocked-by, review-approved marker, close-gates bundle,
        // child-cannot-lead-epic. The session/project gateReviewToDone
        // toggle filters the review-approved refusal post-hoc so the
        // existing bypass-audit row stays the only side-effect of disabling
        // human review.
        const guardResult = await runGuards('review', 'done', {
          issueNumber: Number(closeIssueNum),
          repo: cfg.repo,
          fromState: 'review',
          toState: 'done',
          body,
          cfg,
          projectDir,
        });

        const refusals = (guardResult.refusals || []).filter(
          (r) => !(r.id === 'review-exit-review-approved' && !_resolvedReviewGate)
        );

        const approvedRefusal = refusals.find((r) => r.id === 'review-exit-review-approved');
        if (approvedRefusal) {
          const answerIdx = rest.indexOf('--answer');
          const answerArg = answerIdx >= 0 ? String(rest[answerIdx + 1] || '').toLowerCase() : '';
          if (answerArg === 'yes' || answerArg === 'no') {
            console.error(
              `⛔ \`--answer ${answerArg}\` cannot satisfy a human-gate prompt (review-approval).`
            );
            console.error(
              `Run \`/task approve ${closeTarget}\` (human) or set \`gateReviewToDone false\` in config.`
            );
            process.exit(8);
          }
          console.error(`⛔ Refusing to close ${closeTarget} — no human review approval recorded.`);
          console.log(`PROMPT_REQUIRED: review-approval ${closeTarget}`);
          console.error(
            `Run \`/task approve ${closeTarget}\` (human) or set \`gateReviewToDone false\` in config.`
          );
          process.exit(7);
        }

        const closeGatesRefusal = refusals.find((r) => r.id === 'review-exit-close-gates');
        if (closeGatesRefusal) {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          (closeGatesRefusal.blockers && closeGatesRefusal.blockers.length
            ? closeGatesRefusal.blockers
            : [closeGatesRefusal.reason]
          ).forEach((b) => console.error(`   • ${b}`));
          console.error('');
          process.exit(3);
        }

        const otherRefusals = refusals.filter(
          (r) => r.id !== 'review-exit-review-approved' && r.id !== 'review-exit-close-gates'
        );
        if (otherRefusals.length > 0) {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          otherRefusals.forEach((r) => console.error(`   • ${r.reason}`));
          console.error('');
          process.exit(3);
        }

        const closeGatesWarn = (guardResult.warns || []).find(
          (w) => w.id === 'review-exit-close-gates'
        );
        if (closeGatesWarn?.warn?.dirtyCheckSkipped) {
          console.warn(
            `[task-tracker] issue-scoped dirty check skipped (${closeGatesWarn.warn.dirtyCheckSkipped}).`
          );
        }
      }
      if (reasons.length > 0) {
        if (force) {
          console.error(`[task-tracker] ⚠ --force — bypassing close gate for ${closeTarget}`);
          reasons.forEach((r) => console.error(`   • ${r}`));
          unchecked.forEach((u) => console.error(`   ${u}`));
          try {
            const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
            const note = `⚠ **Close gate bypassed** via \`--force\` at ${ts}. Unverified: ${reasons.join(', ')}.`;
            await pexec('gh', ['issue', 'comment', closeIssueNum, '-R', cfg.repo, '--body', note], {
              timeout: GH_API_TIMEOUT_MS,
            });
          } catch {
            /* best-effort: GitHub/telemetry side effect; core flow proceeds */
          }
        } else {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          reasons.forEach((r) => console.error(`   • ${r}`));
          unchecked.forEach((u) => console.error(`   ${u}`));
          console.error('');
          console.error('See .ai-task-manager/templates/pickup-directive.md Hard Rules.');
          console.error(
            'Verify each item, check its box (`/task ensureChecked "<label>"`), then retry.'
          );
          process.exit(3);
        }
      }
    } catch (err) {
      // #510 — fail CLOSED. The entire review→done close-gate evaluation ran
      // inside this try; a transient body-fetch blip, JSON.parse error, or a
      // guard exception must NOT silently skip the gates and fall through to the
      // terminal `gh issue close` below. Refuse the close (exit non-zero) before
      // any mutation, leaving local state intact so a re-run recovers. `--force`
      // remains the deliberate, audited bypass.
      const decision = decideGateEvalFailure({ error: err, force });
      if (decision.failClosed) {
        console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
        console.error(`   • ${decision.message}`);
        process.exit(decision.exitCode);
      }
      console.warn(
        `[task-tracker] ⚠ --force — close-gate evaluation failed but bypassing: ${err.message}`
      );
    }
  }

  if (!SKIP_NETWORK && closeIssueNum) {
    const subNums = await fetchSubIssues(closeIssueNum);
    if (subNums.length > 0) {
      const childStates = await Promise.all(
        subNums.map(async (n) => ({ num: n, state: await getIssueBoardState(n) }))
      );
      const notReady = childStates.filter((c) => c.state !== 'review' && c.state !== 'done');
      if (notReady.length > 0 && !force) {
        console.error(
          `[task-tracker] ⛔ Cannot close epic #${closeIssueNum} — ${notReady.length} child issue(s) not in Review:`
        );
        notReady.forEach((c) => console.error(`   #${c.num}: ${c.state ?? 'unknown'}`));
        console.error('All sub-issues must reach Review before the epic can close.');
        process.exit(3);
      }
      const reviewChildren = childStates.filter((c) => c.state === 'review');
      if (reviewChildren.length > 0) {
        console.log(`[task-tracker] Cascade closing ${reviewChildren.length} child issue(s)...`);
        const { buildRow: br } = await import('../gh-timing-comment.mjs');
        const { PHASE_EVENTS: _PEcascade } = await import('../phase-events.mjs');
        for (const child of reviewChildren) {
          try {
            // Cascade close: per-child body not fetched here; activeSec=0 is
            // honest because no per-child timing context is loaded.
            await safePostTiming(
              `#${child.num}`,
              br({
                ts: nowIso(),
                event: _PEcascade.done.enter.event,
                activeSec: 0,
                idleSec: 0,
                deltaWords: 0,
                // #475 AC1 — stamp the epic session's durable marker (the session
                // performing the cascade); the per-log monotonic-max in
                // rollupTotals protects each child's own running total.
                wordMarker: s.lastWordMarker ?? 0,
                description: `${_PEcascade.done.enter.description} (cascade closed by epic)`,
              })
            );
            // #385 — structured result; a genuine per-child board-move failure
            // is surfaced (with its real stderr) but does not abort the cascade.
            // The benign `done → done` no-op stays silent.
            const childMove = await runMoveState(child.num, 'done', {
              env: { AITM_CASCADE: '1' },
              silent: true,
            });
            // #512 — fail CLOSED: a genuine non-benign board-move failure must NOT
            // be followed by `gh issue close`, or the child is left CLOSED while
            // its board card is not Done (split-brain). The benign done→done no-op
            // still closes. One stuck child must not abort the cascade, so skip it
            // and continue with actionable recovery guidance.
            const { decideCascadeChildClose } = await import('../lib/cascade-child-close.mjs');
            const childCloseDecision = decideCascadeChildClose({ childMove });
            if (!childCloseDecision.shouldClose) {
              console.warn(
                `  ⚠ #${child.num} NOT closed — board move to "done" failed: ${childCloseDecision.detail}`
              );
              console.warn(
                `     Recovery: re-run \`/task close ${child.num}\` once the board is reachable, ` +
                  `or move the card to Done manually, then re-run the epic close.`
              );
              continue;
            }
            await pexec('gh', ['issue', 'close', String(child.num), '-R', cfg.repo], {
              timeout: GH_API_TIMEOUT_MS,
            });
            try {
              deregisterTask(projectDir, `#${child.num}`);
            } catch {
              /* best-effort: cleanup; failure is non-fatal */
            }
            const childFlush = await flushAndForgetQueueFor(`#${child.num}`);
            const childSuffix =
              childFlush.delivered || childFlush.discarded
                ? ` (queue: delivered ${childFlush.delivered}, discarded ${childFlush.discarded})`
                : '';
            console.log(`  ✓ #${child.num} closed${childSuffix}`);
          } catch (err) {
            console.warn(`  ⚠ Could not close #${child.num}: ${err.message}`);
          }
        }
      }
    }
  }
  if (!SKIP_NETWORK && closeIssueNum) {
    try {
      const { applyReviewDelta } = await import('../lib/apply-review-delta.mjs');
      await applyReviewDelta({ cfg, issueNumber: closeIssueNum, body: closeBody });
    } catch (err) {
      process.stderr.write(`⚠ review-delta hook failed: ${err.message}\n`);
    }
  }
  if (dirtyAuditRow) {
    await safePostTiming(closeTarget, dirtyAuditRow);
  }
  const { deriveStateMoveDelta: _dsm3 } = await import('../lib/timing-rows.mjs');
  const _ts3 = nowIso();
  // #692 — the prior timing ROWS live in the ⏱ comment, NOT the issue body.
  // close.mjs historically passed `closeBody` (the issue body) here, so
  // `deriveStateMoveDelta` → `lastRowTsFromBody` found no rows and collapsed to
  // {0,0}: the `review:approved` row's Active column came out blank (AC3). The
  // same comment body drives the retry-idempotency guard below (AC2). Fetch it
  // once. The real reader is gated on `!SKIP_NETWORK`; tests inject
  // `ctx.readTimingCommentBody` to exercise both paths offline.
  let _timingBody = '';
  const { readTimingCommentBody: _readTimingComment, bodyOf: _bodyOf } =
    await import('../gh-timing-comment.mjs');
  const _readTiming = ctx.readTimingCommentBody || (SKIP_NETWORK ? null : _readTimingComment);
  if (_readTiming && closeIssueNum) {
    try {
      _timingBody = _bodyOf(
        await _readTiming({
          issueNumber: closeIssueNum,
          repo: cfg.repo,
          timeoutMs: GH_API_TIMEOUT_MS,
        })
      );
    } catch (err) {
      process.stderr.write(`⚠ timing-comment read for close pair failed: ${err.message}\n`);
    }
  }
  const _d3 = _dsm3(_timingBody, _ts3);
  // #540 — emit the review→done lifecycle pair in canonical order
  // (`review:approved → issue:wrap`), both sharing `_ts3`. The approval row
  // carries the real review→close active/idle delta (`_d3`); the wrap row is
  // the zero-delta paired half. move-state.mjs (the subsequent terminal board
  // move) no longer emits `review:approved` (it suppresses `<prev>:complete`
  // on the `done` transition), so this is the sole `review:approved` row and
  // it lands ahead of `issue:wrap`. Previously only `issue:wrap` was emitted
  // here (carrying `_d3`) and `review:approved` was appended afterwards by the
  // board move, reproducing the #535 `issue:wrap → review:approved` inversion.
  const { buildReviewToDoneClosePair } = await import('../gh-timing-comment.mjs');
  const [_reviewApprovedRow, _issueWrapRow] = buildReviewToDoneClosePair({
    ts: _ts3,
    activeSec: _d3.activeSec,
    idleSec: _d3.idleSec,
    // #475 AC1 — carried-forward durable marker (timing flushed at Review; close audit row)
    wordMarker: s.lastWordMarker ?? 0,
  });
  // #655 — do NOT emit `review:approved` on faith. Emit it only when the live
  // body actually carries the `aitm-review-approved` marker, OR the review gate
  // was explicitly bypassed (which already logged its own `aitm-gate-bypassed`
  // audit row). When the gate is active and the marker never persisted (the
  // #652 half-state), suppressing the row prevents fabricating a record of an
  // approval that did not happen. `issue:wrap` stays unconditional — it records
  // the terminal close, not an approval claim.
  // #692 (AC2) — make the pair emission idempotent across retries. A `close`
  // re-invoked after a first attempt emitted the pair but aborted before the
  // terminal board move (e.g. `assertFieldsPersisted` threw) previously
  // re-emitted a fresh `review:approved → issue:wrap` pair, producing the
  // duplicate pairs seen on #687. `pendingClosePairState` inspects the timing
  // comment since the last `issue:closed` and reports which halves already
  // exist; skip re-emitting whichever half is already present.
  const { pendingClosePairState } = await import('../timing-rollup.mjs');
  const _pending = pendingClosePairState(_timingBody);
  if (
    !_pending.reviewApproved &&
    shouldEmitReviewApprovedRow({
      hasApprovalMarker: hasReviewApprovedMarker(closeBody),
      reviewGateBypassed,
    })
  ) {
    await safePostTiming(closeTarget, _reviewApprovedRow);
  }
  if (!_pending.issueWrap) {
    await safePostTiming(closeTarget, _issueWrapRow);
  }
  if (runLogIssueTime) await runLogIssueTime(closeTarget);
  // Post-close board/body agreement check (#180 defect 1 guard). After
  // runLogIssueTime, the `<!-- aitm-fields -->` body marker should have
  // non-null engagedTime. If it's still null, board fields almost certainly
  // were not written either — refuse to clear active so the user can recover.
  if (!SKIP_NETWORK && closeIssueNum) {
    await assertFieldsPersisted({ cfg, pexec, issueNum: closeIssueNum });
  }
  const flushResult = await flushAndForgetQueueFor(closeTarget);
  if (flushResult.delivered || flushResult.discarded) {
    console.log(
      `[task-tracker] queue: delivered ${flushResult.delivered}, discarded ${flushResult.discarded} for ${closeTarget}.`
    );
  }
  // #505 — atomic forced close. A `--force` close deliberately bypasses the
  // close gate (above), but the *terminal board move* used to run only AFTER
  // `gh issue close` (see ~line 580) and delegated to move-state.mjs, whose
  // one-step matrix refuses any non-`review` → `done` transition. From a
  // non-review column that left the issue CLOSED on GitHub but the board
  // stranded at the source column — a split-brain needing a manual UI drag +
  // `reconcile accept-live`. Fix: on the force path, pre-walk the board to
  // Done *before* closing the issue, using the move-state `--force` flag so the
  // matrix + guards are bypassed for this terminal move only. If the forced
  // move cannot land the board at Done, refuse here and leave the issue OPEN —
  // so the outcome is always board=Done-then-closed, or untouched, never
  // closed-but-not-Done. (The post-close move below then degrades to a benign
  // `done → done` no-op on this path; the non-force path is unchanged.)
  if (force && !SKIP_NETWORK && closeIssueNum) {
    const forcedMove = await runMoveStateDone(s.active, {
      silent: true,
      extraArgs: ['--force'],
    });
    // Same swallow-vs-surface rule as the post-close move (#435): re-read the
    // board and only refuse when the move genuinely failed AND the board is not
    // Done. A benign `done → done` (board already converged out-of-band) passes.
    const forcedBoardState =
      forcedMove && !forcedMove.ok && !forcedMove.benign
        ? await resolveBoardStateForClose({ getIssueBoardState, active: s.active })
        : 'done';
    if (decideBoardMoveFailure({ moveResult: forcedMove, boardState: forcedBoardState }).surface) {
      const detail =
        (forcedMove.stderr || '').trim() ||
        `move-state.mjs exited ${forcedMove.status ?? 'non-zero'}`;
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: forced board move to "done" failed (${detail}). ` +
          `Issue left OPEN to avoid a closed-but-not-Done split-brain — fix the board move and re-run \`/task close ${closeTarget} --force\`.`
      );
      process.exitCode = 1;
      return;
    }
  }

  // #654 — fail-closed close ordering on the NON-force path. The force path
  // (#505, above) already pre-walks the board to Done BEFORE `gh issue close`
  // so a refused terminal move can never strand the issue CLOSED-but-not-Done.
  // The non-force path used to mutate in the opposite order: `gh issue close`
  // first (below), THEN the guarded `runMoveStateDone` (#385, further down).
  // When that terminal move-state review→done was refused — board drifted off
  // `review`, or move-state's own `review-approval-missing` guard fired because
  // the `aitm-review-approved` marker never persisted (the #652 incident) — the
  // issue was already CLOSED on GitHub while the board stayed stranded at the
  // source column. The pre-close `runGuards('review','done', …)` block above
  // narrows but does not eliminate this: it filters the review-approved refusal
  // when the session review gate is off, and move-state re-evaluates its own
  // guards independently, so the two passes can legitimately disagree after the
  // close has already fired. Fix: mirror the #505 pre-walk here — land the board
  // at Done first; if it genuinely fails (and the board is not already Done),
  // refuse, leave the issue OPEN, and do NOT clear local state so a re-run
  // recovers. The post-close move (#385) then degrades to a benign `done → done`
  // no-op, exactly as on the force path.
  if (!force && !SKIP_NETWORK && closeIssueNum) {
    const preMove = await runMoveStateDone(s.active, { silent: true });
    const preBoardState =
      preMove && !preMove.ok && !preMove.benign
        ? await resolveBoardStateForClose({ getIssueBoardState, active: s.active })
        : 'done';
    if (decideBoardMoveFailure({ moveResult: preMove, boardState: preBoardState }).surface) {
      const detail =
        (preMove.stderr || '').trim() || `move-state.mjs exited ${preMove.status ?? 'non-zero'}`;
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: board move to "done" failed (${detail}). ` +
          `Issue left OPEN to avoid a closed-but-not-Done split-brain — fix the board move ` +
          `(e.g. record review approval with \`/task approve ${closeTarget}\`) and re-run \`/task close ${closeTarget}\`.`
      );
      process.exitCode = 1;
      return;
    }
  }

  // #425 — explicitly close the primary issue rather than relying on the
  // GitHub Projects auto-close workflow firing off the board move below. The
  // workflow is best-effort; when it misses, board=Done + issue-OPEN drift
  // results (see close-convergence.mjs). Closing here makes issue-close a
  // first-class, separately-recoverable step: on failure we surface it and
  // exit non-zero WITHOUT clearing local state, so a re-run finishes the job
  // (and the short-circuit above will converge the lagging side). `gh issue
  // close` is idempotent — closing an already-closed issue is a no-op.
  if (!SKIP_NETWORK && closeIssueNum) {
    try {
      await pexec('gh', ['issue', 'close', closeIssueNum, '-R', cfg.repo], {
        timeout: GH_API_TIMEOUT_MS,
      });
    } catch (err) {
      console.error(
        `[task-tracker] ✗ Failed to close ${closeTarget} on GitHub: ${err.message}\n` +
          `Local state left intact — re-run \`/task close ${closeTarget}\` once GitHub is reachable.`
      );
      process.exitCode = 1;
      return;
    }
    await stripCloseLabels({ pexec, cfg, issueNum: closeIssueNum });
  }
  clearActive(statePath);
  try {
    deregisterTask(projectDir, s.active);
  } catch {
    /* best-effort: cleanup; failure is non-fatal */
  }
  // #385 — branch on the structured result. A genuine board-move failure must
  // NOT be reported as a clean "Closed": the issue was just closed on GitHub
  // (the explicit `gh issue close` above), but if the board never reached
  // `done` the user needs to see the real reason and a non-zero exit. The
  // benign `done → done` no-op (auto-close already moved the board) is treated
  // as success and produces no warning.
  const moveResult = await runMoveStateDone(s.active, { silent: true });
  const lifecycleTickResult = await reconcileLifecycleBoxes({
    cfg,
    issueNum: closeIssueNum,
    pexec,
  });
  if (moveResult && !moveResult.ok && !moveResult.benign) {
    // #435 — the move reported a non-benign failure, but a race can leave the
    // board already at Done (the auto-close workflow or a prior converge moved
    // it out-of-band between the decision above and this move). Re-read the
    // board: swallow when it is verifiably Done (the close succeeded), surface
    // only when it is NOT Done (a genuine board-move failure).
    const postBoardState = await getIssueBoardState(s.active);
    if (decideBoardMoveFailure({ moveResult, boardState: postBoardState }).surface) {
      const detail =
        (moveResult.stderr || '').trim() ||
        `move-state.mjs exited ${moveResult.status ?? 'non-zero'}`;
      console.error(
        `[task-tracker] ✗ #${s.active.replace(/^#/, '')} closed on GitHub but the board move to "done" failed: ${detail}`
      );
      process.exitCode = 1;
      return;
    }
  }
  // #672 — a lifecycle-tick failure that exhausts its retries previously
  // only surfaced on stderr, easy to miss among the surrounding console.log
  // lines. Fold it
  // into the terminal success line so it's visible in the same output the
  // operator is already reading, without turning close itself into a failure.
  if (lifecycleTickResult && !lifecycleTickResult.ok) {
    console.log(
      `Closed ${s.active}. ⚠ Lifecycle checkboxes could not be auto-ticked — see stderr.`
    );
  } else {
    console.log(`Closed ${s.active}.`);
  }
}

// Caller-side assertion that runLogIssueTime actually persisted fields to
// both the board AND the `<!-- aitm-fields -->` body marker. Guards against
// the silent-swallow class of bug that produced #180 / #165. No env override
// exists.
//
// #300 — delegates to `parseIssueFieldDb`, which uses a line-anchored,
// last-match regex (`NEW_BLOCK_RE`). The previous inline regex (first-match,
// no line anchor) caught literal `<!-- aitm-fields: {...} -->` placeholders
// inside body prose and failed `JSON.parse` on the `{...}` capture. See #298
// for the production case that surfaced this.
async function assertFieldsPersisted({ cfg, pexec, issueNum }) {
  let body = '';
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    body = String(stdout || '');
  } catch (err) {
    throw new Error(
      `assertFieldsPersisted: could not re-read body for #${issueNum}: ${err.message}. ` +
        `Retry when GitHub is reachable.`
    );
  }
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) {
    if (parsed.reason === 'missing') {
      throw new Error(
        `assertFieldsPersisted: <!-- aitm-fields --> marker missing on #${issueNum} after runLogIssueTime. ` +
          `Board fields almost certainly were not written.`
      );
    }
    // 'invalid-json' | 'invalid-fence' — preserve the legacy "malformed" wording.
    throw new Error(
      `assertFieldsPersisted: malformed aitm-fields JSON on #${issueNum}: ${parsed.reason}`
    );
  }
  const values = parsed.values || {};
  if (values.engagedTime == null) {
    throw new Error(
      `assertFieldsPersisted: aitm-fields.engagedTime is still null on #${issueNum} after runLogIssueTime — ` +
        `field write silently failed.`
    );
  }
}

// #672 — content-integrity guard errors (marker loss, checkbox-proof, etc.)
// are deliberate refusals: re-running the same mutate against the same body
// will fail the same way, so retrying wastes attempts and delays the real
// stderr signal. Only network-class failures (timeouts, dropped connections,
// transient GraphQL 5xx) are worth retrying — those come from `fetchBody`/
// `pushBody` inside `versionedWriteBody`, which has no retry of its own for
// this failure class (see #672 deep-dive), and are not instances of the
// named guard-error classes `issue-body-mutate.mjs` exports.
const LIFECYCLE_TICK_GUARD_ERRORS = new Set([
  'MarkerLossError',
  'CheckboxProofMissingError',
  'MalformedDeclarationCmdError',
  'FabricatedProofError',
  'IncompleteProofError',
  'BodyWriteRefusalError',
]);

const LIFECYCLE_TICK_MAX_ATTEMPTS = 3;
const LIFECYCLE_TICK_RETRY_DELAY_MS = 500;

// Tick the Lifecycle DoD items the close verb is responsible for. Best-effort:
// missing section or already-ticked items are no-ops; a bounded number of
// network-class failures are retried (#672 — the underlying GraphQL calls
// have no retry of their own and this environment has observed transient TLS
// timeouts), but the close path is never blocked — on final failure the
// caller is told via the returned `{ ok: false, message }` so it can surface
// a warning in the close summary instead of only writing to stderr.
export async function tickLifecycleOnClose({ cfg, issueNum, pexec, deps = {} }) {
  const mutateBody = deps.mutateIssueBody || mutateIssueBody;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastErr = null;
  for (let attempt = 1; attempt <= LIFECYCLE_TICK_MAX_ATTEMPTS; attempt++) {
    try {
      await mutateBody({
        issueNumber: issueNum,
        repo: cfg.repo,
        mutate: (base) => {
          let next = tickLifecycleItem(base, 'story-closed');
          next = tickLifecycleItem(next, 'timing-flushed');
          return next;
        },
        // These two lifecycle checkboxes (`story-closed`, `timing-flushed`) are
        // ticked by the close verb itself — the close action is the verifier, not
        // an agent pre-tick. The #362 checkbox-proof gate would otherwise refuse
        // them for lacking an adjacent proof marker. Mirror the #363 precedent in
        // approve.mjs and bypass the gate scoped to this single call site only;
        // every other mutateIssueBody call in this file keeps the gate enforced.
        allowUnverifiedTicks: true,
        deps: { pexec },
      });
      return { ok: true };
    } catch (err) {
      lastErr = err;
      const isGuardError = LIFECYCLE_TICK_GUARD_ERRORS.has(err.name);
      if (isGuardError || attempt === LIFECYCLE_TICK_MAX_ATTEMPTS) break;
      await sleep(LIFECYCLE_TICK_RETRY_DELAY_MS * attempt);
    }
  }
  const message = `lifecycle-tick best-effort failed: ${lastErr.message}`;
  process.stderr.write(`⚠ ${message}\n`);
  return { ok: false, message };
}
