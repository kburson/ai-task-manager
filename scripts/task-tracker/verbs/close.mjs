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
import { pushIssueBody } from '../lib/issue-body-push.mjs';
import { runCloseGates } from '../lib/close-gates.mjs';
import { tickLifecycleItem } from '../lib/lifecycle-dod.mjs';
import { assertLifecycleSatisfied } from '../close-gate.mjs';

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

  if (!SKIP_NETWORK && closeIssueNum) {
    const currentState = await getIssueBoardState(closeIssueNum);
    if (currentState === 'done') {
      clearActive(statePath);
      try {
        deregisterTask(projectDir, closeTarget);
      } catch {}
      console.log(`${closeTarget} is already Done — local state and fleet cleaned up.`);
      return;
    }
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

  const forceFlag = rest.includes('--force');
  const forceEnv = process.env.TASK_TRACKER_FORCE_DONE === '1';
  const force = forceFlag || forceEnv;
  if (!SKIP_NETWORK) {
    try {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      const data = JSON.parse(stdout);
      const body = data.body ?? '';
      closeBody = body;

      const _resolvedReviewGate = resolveGate('reviewToDone', {
        session: loadSession(currentSessionId()),
        projectConfig: rawProjectConfig(),
      });
      if (_resolvedReviewGate && !force) {
        const hasApprovalMarker = /<!--\s*aitm-review-approved:/i.test(body);
        if (!hasApprovalMarker) {
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
      } else if (!_resolvedReviewGate) {
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
        const gateResult = await runCloseGates({
          cfg,
          issueNumber: closeIssueNum,
          body,
          projectDir,
        });
        if (!gateResult.ok) {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          gateResult.blockers.forEach((b) => console.error(`   • ${b}`));
          console.error('');
          console.error('Legitimate-abandonment override: TASK_TRACKER_FORCE_DONE=1 /task close');
          process.exit(3);
        }
        if (gateResult.dirtyCheckSkipped) {
          console.warn(
            `[task-tracker] issue-scoped dirty check skipped (${gateResult.dirtyCheckSkipped}).`
          );
        }
      }
      if (reasons.length > 0) {
        if (force) {
          console.error(
            `[task-tracker] ⚠ ${forceEnv ? 'TASK_TRACKER_FORCE_DONE=1' : '--force'} — bypassing close gate for ${closeTarget}`
          );
          reasons.forEach((r) => console.error(`   • ${r}`));
          unchecked.forEach((u) => console.error(`   ${u}`));
          try {
            const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
            const note = `⚠ **Close gate bypassed** via \`${forceEnv ? 'TASK_TRACKER_FORCE_DONE=1' : '--force'}\` at ${ts}. Unverified: ${reasons.join(', ')}.`;
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
          console.error('Legitimate-abandonment override: TASK_TRACKER_FORCE_DONE=1 /task close');
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
            await runMoveState(child.num, 'done', { env: { AITM_CASCADE: '1' }, silent: true });
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
  clearActive(statePath);
  try {
    deregisterTask(projectDir, s.active);
  } catch {}
  await runMoveStateDone(s.active, { silent: true });
  await tickLifecycleOnClose({ cfg, issueNum: closeIssueNum, pexec });
  console.log(`Closed ${s.active}.`);
}

// Caller-side assertion that runLogIssueTime actually persisted fields to
// both the board AND the `<!-- aitm-fields -->` body marker. Guards against
// the silent-swallow class of bug that produced #180 / #165. Honors
// TASK_TRACKER_FORCE_DONE_NO_FIELDS=1 escape hatch.
async function assertFieldsPersisted({ cfg, pexec, issueNum }) {
  if (process.env.TASK_TRACKER_FORCE_DONE_NO_FIELDS === '1') return;
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
        `Set TASK_TRACKER_FORCE_DONE_NO_FIELDS=1 to override.`
    );
  }
  const m = body.match(/<!--\s*aitm-fields:\s*(\{[\s\S]*?\})\s*-->/);
  if (!m) {
    throw new Error(
      `assertFieldsPersisted: <!-- aitm-fields --> marker missing on #${issueNum} after runLogIssueTime. ` +
        `Board fields almost certainly were not written. ` +
        `Set TASK_TRACKER_FORCE_DONE_NO_FIELDS=1 to override.`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch (err) {
    throw new Error(
      `assertFieldsPersisted: malformed aitm-fields JSON on #${issueNum}: ${err.message}`
    );
  }
  const values = parsed?.values || {};
  if (values.engagedTime == null) {
    throw new Error(
      `assertFieldsPersisted: aitm-fields.engagedTime is still null on #${issueNum} after runLogIssueTime — ` +
        `field write silently failed. Set TASK_TRACKER_FORCE_DONE_NO_FIELDS=1 to override.`
    );
  }
}

// Tick the Lifecycle DoD items the close verb is responsible for. Best-effort:
// missing section or already-ticked items are no-ops; failures do not block
// the close path since the issue has already moved to Done.
async function tickLifecycleOnClose({ cfg, issueNum, pexec }) {
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const body = String(stdout || '');
    let next = tickLifecycleItem(body, 'story-closed');
    next = tickLifecycleItem(next, 'timing-flushed');
    if (next === body) return;
    const path = await import('node:path');
    const os = await import('node:os');
    const tmp = path.join(os.tmpdir(), `tt-lifecycle-${issueNum}-${Date.now()}.md`);
    await pushIssueBody({
      issueNumber: issueNum,
      repo: cfg.repo,
      body: next,
      scratchPath: tmp,
      timeout: GH_API_TIMEOUT_MS,
      deps: { pexec },
    });
  } catch (err) {
    process.stderr.write(`⚠ lifecycle-tick best-effort failed: ${err.message}\n`);
  }
}
