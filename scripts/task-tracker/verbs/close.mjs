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
import { runCloseGates } from '../lib/close-gates.mjs';
import { tickLifecycleItem } from '../lib/lifecycle-dod.mjs';

export async function verbClose(ctx) {
  const {
    cfg,
    statePath,
    projectDir,
    rest,
    SKIP_NETWORK,
    pexec,
    drainQueueIfAny,
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
  const closingDifferentIssue = !!(target && s.active && target !== s.active);

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
        dirtyAuditRow = dbr({
          ts: nowIso(),
          event: 'closed-with-dirty-tree',
          activeMin: 0,
          idleMin: 0,
          deltaWords: 0,
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
  let closeBody = '';
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
        await safePostTiming(
          closeTarget,
          gbr({
            ts: nowIso(),
            event: 'gate-bypassed',
            activeMin: 0,
            idleMin: 0,
            deltaWords: 0,
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
        for (const child of reviewChildren) {
          try {
            await safePostTiming(
              `#${child.num}`,
              br({
                ts: nowIso(),
                event: 'done',
                activeMin: 0,
                idleMin: 0,
                deltaWords: 0,
                wordMarker: 0,
                description: 'cascade closed by epic',
              })
            );
            await runMoveState(child.num, 'done', { env: { AITM_CASCADE: '1' }, silent: true });
            await pexec('gh', ['issue', 'close', String(child.num), '-R', cfg.repo], {
              timeout: GH_API_TIMEOUT_MS,
            });
            try {
              deregisterTask(projectDir, `#${child.num}`);
            } catch {}
            console.log(`  ✓ #${child.num} closed`);
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
  if (closingDifferentIssue) {
    await safePostTiming(
      closeTarget,
      closeBr({
        ts: nowIso(),
        event: 'done',
        activeMin: 0,
        idleMin: 0,
        deltaWords: 0,
        wordMarker: 0,
        description: 'closed',
      })
    );
    if (runLogIssueTime) await runLogIssueTime(closeTarget);
    try {
      deregisterTask(projectDir, closeTarget);
    } catch {}
    await runMoveStateDone(closeTarget, { silent: true });
    await tickLifecycleOnClose({ cfg, issueNum: closeIssueNum, pexec });
    console.log(`Closed ${closeTarget}.`);
  } else {
    await safePostTiming(
      closeTarget,
      closeBr({
        ts: nowIso(),
        event: 'done',
        activeMin: 0,
        idleMin: 0,
        deltaWords: 0,
        wordMarker: 0,
        description: 'closed — timing flushed at Review',
      })
    );
    if (runLogIssueTime) await runLogIssueTime(closeTarget);
    clearActive(statePath);
    try {
      deregisterTask(projectDir, s.active);
    } catch {}
    await runMoveStateDone(s.active, { silent: true });
    await tickLifecycleOnClose({ cfg, issueNum: closeIssueNum, pexec });
    console.log(`Closed ${s.active}.`);
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
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmp = path.join(os.tmpdir(), `tt-lifecycle-${issueNum}-${Date.now()}.md`);
    try {
      writeFileSync(tmp, next, 'utf8');
      await pexec('gh', ['issue', 'edit', issueNum, '-R', cfg.repo, '--body-file', tmp], {
        timeout: GH_API_TIMEOUT_MS,
      });
    } finally {
      try {
        unlinkSync(tmp);
      } catch {}
    }
  } catch (err) {
    process.stderr.write(`⚠ lifecycle-tick best-effort failed: ${err.message}\n`);
  }
}
