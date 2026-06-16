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
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';
import { tickLifecycleItem } from '../lib/lifecycle-dod.mjs';
import { assertLifecycleSatisfied } from '../close-gate.mjs';
import { deriveAndStampFunctionalDod } from '../lib/functional-dod-derive.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { decideCloseConvergence } from '../lib/close-convergence.mjs';

export async function verbClose(ctx) {
  const {
    cfg,
    statePath,
    projectDir,
    rest,
    SKIP_NETWORK,
    pexec,
    drainQueueIfAny,
    flushAndForgetQueueFor,
    safePostTiming,
    runMoveState,
    runMoveStateDone,
    runLogIssueTime,
    fetchSubIssues,
    getIssueBoardState,
    getIssueClosedState,
    uncheckedPreCloseCheckboxes,
    nowIso,
  } = ctx;
  await drainQueueIfAny();
  const initialState = loadState(statePath);
  const target = rest.find((a) => /^#\d+$/.test(a));
  let s = initialState;

  const closeTarget = target || s.active || '';
  const closeIssueNum = closeTarget.replace(/^#/, '');

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
    const decision = decideCloseConvergence({ boardState, issueClosed });

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
      clearActive(statePath);
      try {
        deregisterTask(projectDir, closeTarget);
      } catch {}
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
          console.error(
            `${closeTarget} is closed on GitHub but the board move to Done failed: ${moveResult.stderr || moveResult.status}\n` +
              `Local state left intact — re-run \`/task close ${closeTarget}\` to retry the board move.`
          );
          process.exitCode = 1;
          return;
        }
      }
      clearActive(statePath);
      try {
        deregisterTask(projectDir, closeTarget);
      } catch {}
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
  let closeBody = '';
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
          return;
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
          // wordMarker:0 audit row — closed-with-dirty-tree audit, no active session
          wordMarker: 0,
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
      if (!_resolvedReviewGate) {
        const { buildRow: gbr } = await import('../gh-timing-comment.mjs');
        const { deriveStateMoveDelta: _dsm2 } = await import('../lib/timing-rows.mjs');
        const _ts2 = nowIso();
        const _d2 = _dsm2(closeBody, _ts2);
        await safePostTiming(
          closeTarget,
          gbr({
            ts: _ts2,
            event: 'gate-bypassed',
            activeSec: _d2.activeSec,
            idleSec: _d2.idleSec,
            deltaWords: 0,
            // wordMarker:0 audit row — gate-bypass audit, no active session
            wordMarker: 0,
            description:
              'gateReviewToDone=false (session/project override) — bypassing human review',
          })
        );
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
              // wordMarker:0 audit row — lifecycle WARN bypass, no active session work
              wordMarker: 0,
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
          } catch {}
        } else {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          reasons.forEach((r) => console.error(`   • ${r}`));
          unchecked.forEach((u) => console.error(`   ${u}`));
          console.error('');
          console.error('See .ai-task-manager/pickup-directive.md Hard Rules.');
          console.error('Verify each item, check its box (`/task check "<label>"`), then retry.');
          process.exit(3);
        }
      }
    } catch (err) {
      console.warn(`[task-tracker] Could not check issue body: ${err.message}`);
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
                // wordMarker:0 audit row — cascade close, no per-child session
                wordMarker: 0,
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
            if (childMove && !childMove.ok && !childMove.benign) {
              const detail =
                (childMove.stderr || '').trim() ||
                `move-state.mjs exited ${childMove.status ?? 'non-zero'}`;
              console.warn(`  ⚠ #${child.num} board move to "done" failed: ${detail}`);
            }
            await pexec('gh', ['issue', 'close', String(child.num), '-R', cfg.repo], {
              timeout: GH_API_TIMEOUT_MS,
            });
            try {
              deregisterTask(projectDir, `#${child.num}`);
            } catch {}
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
  const { buildRow: closeBr } = await import('../gh-timing-comment.mjs');
  const { PHASE_EVENTS: _PE3 } = await import('../phase-events.mjs');
  const { deriveStateMoveDelta: _dsm3 } = await import('../lib/timing-rows.mjs');
  const _ts3 = nowIso();
  const _d3 = _dsm3(closeBody, _ts3);
  await safePostTiming(
    closeTarget,
    closeBr({
      ts: _ts3,
      event: _PE3.done.enter.event,
      activeSec: _d3.activeSec,
      idleSec: _d3.idleSec,
      deltaWords: 0,
      // wordMarker:0 ok — timing already flushed at Review, this is the close audit row
      wordMarker: 0,
      description: _PE3.done.enter.description,
    })
  );
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
  }
  clearActive(statePath);
  try {
    deregisterTask(projectDir, s.active);
  } catch {}
  // #385 — branch on the structured result. A genuine board-move failure must
  // NOT be reported as a clean "Closed": the issue was just closed on GitHub
  // (the explicit `gh issue close` above), but if the board never reached
  // `done` the user needs to see the real reason and a non-zero exit. The
  // benign `done → done` no-op (auto-close already moved the board) is treated
  // as success and produces no warning.
  const moveResult = await runMoveStateDone(s.active, { silent: true });
  await tickLifecycleOnClose({ cfg, issueNum: closeIssueNum, pexec });
  if (moveResult && !moveResult.ok && !moveResult.benign) {
    const detail =
      (moveResult.stderr || '').trim() ||
      `move-state.mjs exited ${moveResult.status ?? 'non-zero'}`;
    console.error(
      `[task-tracker] ✗ #${s.active.replace(/^#/, '')} closed on GitHub but the board move to "done" failed: ${detail}`
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Closed ${s.active}.`);
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

// Tick the Lifecycle DoD items the close verb is responsible for. Best-effort:
// missing section or already-ticked items are no-ops; failures do not block
// the close path since the issue has already moved to Done.
export async function tickLifecycleOnClose({ cfg, issueNum, pexec, deps = {} }) {
  const mutateBody = deps.mutateIssueBody || mutateIssueBody;
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
  } catch (err) {
    process.stderr.write(`⚠ lifecycle-tick best-effort failed: ${err.message}\n`);
  }
}
